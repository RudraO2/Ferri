import { eq } from "drizzle-orm";
import { crewActions, questions, type Db } from "@ferri/db";
import {
  answerQuestion,
  crewIntent,
  findCrewMember,
  listOpenCards,
  loadCrew,
  loadLiveKnowledge,
  looksLikeCardAnswer,
  triageMessage,
  worthAnswering,
  type AnswerResult,
  type CrewMember,
  type LiveKnowledge,
  type Triage,
} from "@ferri/knowledge";
import type { MessageEvent, SwitchAgent } from "@ferri/switch";
import { config } from "./config.js";
import { askerMention, type Loop, type RoomInfo } from "./loop.js";
import { mentionRegex } from "./mentions.js";
import type { RoomHistory, RoomLine } from "./rooms.js";

type Outcome = "answered" | "chat" | "unknown" | "skipped" | "declined" | "error";

export interface FlowDeps {
  db: Db;
  agent: SwitchAgent;
  rooms: RoomHistory;
  loop: Loop;
  skills: () => string;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chat = (lines: RoomLine[]) => lines.map((l) => ({ sender: l.sender, body: l.body }));

const OUTCOME: Record<AnswerResult["kind"], Outcome> = {
  answer: "answered",
  chat: "chat",
  unknown: "unknown",
  declined: "declined",
  invalid: "error",
};

/** In the crew room an unknown question becomes a nudge to teach Ferri, not a card. */
const CREW_UNKNOWN = (agentName: string) =>
  `I don't have that in the knowledge yet. If you know it, teach me with "@${agentName} remember ..." and I'll keep it for everyone.`;

interface Context {
  kb: LiveKnowledge;
  /** The event a question belongs to: the only live one, for now (spaces map rooms to events in spec 04). */
  eventId: string | null;
  crew: CrewMember[];
}

/**
 * The message flow:
 * - a crew member talking to Ferri: answering a card, teaching a fact, or asking;
 * - anyone else addressing Ferri: answer from the knowledge base; when it does
 *   not know, a holding reply and a question card for the crew (spec 03);
 * - a question to the room: Haiku triage, a grace period so a person can
 *   answer first, then a sourced answer, or the holding reply and a card;
 * - the crew room: no unprompted answers and no cards for the crew's own questions.
 * Every handled question is one row in `questions` and every crew action one
 * row in `crew_actions`; inserting the row claims the message, so a replay
 * never acts twice.
 */
export function createFlow(deps: FlowDeps) {
  const { db, agent, rooms, loop, log } = deps;
  // Same rule as Switch's mention_regex: `@name` at a full-token boundary.
  const mentionRe = mentionRegex(config.agentName);

  function isOwn(ev: MessageEvent): boolean {
    const p = ev.payload;
    return p.sender === agent.agentId || p.sender_name?.toLowerCase() === "ferri" || p.sender_kind === "platform";
  }

  async function context(): Promise<Context | null> {
    const kb = await loadLiveKnowledge(db, config.community);
    if (!kb) return null;
    const eventId = kb.events.length === 1 ? kb.events[0]!.id : null;
    return { kb, eventId, crew: await loadCrew(db, kb.community.id, eventId) };
  }

  function isCrewRoom(ctx: Context, roomId: string): boolean {
    return roomId === loop.crewRoomFor(ctx.kb, ctx.eventId) || ctx.kb.events.some((e) => e.crewRoomId === roomId);
  }

  /** Claim the message. Null when another run already handled it. */
  async function claim(ev: MessageEvent, ctx: Context | null, triage: Triage | null, direct: boolean) {
    const p = ev.payload;
    const rows = await db
      .insert(questions)
      .values({
        communityId: ctx?.kb.community.id ?? null,
        eventId: ctx?.eventId ?? null,
        roomId: ev.room_id,
        messageId: p.message_id,
        threadId: p.thread_id,
        askerId: p.sender,
        askerName: p.sender_name,
        text: p.body,
        addressed: direct,
        triage,
        askedAt: new Date(p.timestamp),
      })
      .onConflictDoNothing({ target: questions.messageId })
      .returning({ id: questions.id });
    return rows[0]?.id ?? null;
  }

  async function finish(id: string, set: Partial<typeof questions.$inferInsert>) {
    await db.update(questions).set({ ...set, updatedAt: new Date() }).where(eq(questions.id, id));
  }

  /**
   * `direct`: the person is talking to Ferri (an @mention, a direct chat, or a
   * Switch follow-up to Ferri's last answer). Ferri then always replies, with
   * a holding reply when it does not know. Otherwise it steps in only with a
   * sourced answer, or, when it does not know and a crew room exists, with the
   * holding reply and a card.
   */
  async function handleQuestion(ev: MessageEvent, ctx: Context | null, triage: Triage | null, direct: boolean): Promise<void> {
    const p = ev.payload;
    const id = await claim(ev, ctx, triage, direct);
    if (!id) {
      log(`already handled ${p.message_id}; skipping`);
      return;
    }
    if (!ctx) {
      log("no community in the database; run `pnpm kb seed`");
      await finish(id, { outcome: "error", error: "no community" });
      return;
    }
    const inCrewRoom = isCrewRoom(ctx, ev.room_id);
    const room = await deps.room(ev.room_id);

    if (direct) await agent.setTyping(ev.room_id, true).catch(() => {});
    try {
      const r = await answerQuestion({
        db,
        kb: ctx.kb,
        choice: config.modelMain,
        skills: deps.skills(),
        roomName: room.name,
        sender: p.sender_name,
        question: p.body,
        history: chat(rooms.before(ev.room_id, p.message_id)),
        addressed: direct,
        searchTerms: triage?.search_terms,
      });

      const cards = !inCrewRoom && loop.canOpenCards(ctx.kb, ctx.eventId);
      // What the crew is asked: the whole question, or the part the answer could not cover.
      const asked = p.body.replace(new RegExp(mentionRe.source, "gi"), "").replace(/^[\s,:;-]+/, "").trim() || p.body;
      const ask = r.kind === "unknown" ? asked : r.kind === "answer" && r.missing && direct ? r.missing : null;

      let text: string | null = null;
      if (r.kind === "unknown" && inCrewRoom) text = direct ? CREW_UNKNOWN(config.agentName) : null;
      else if (r.kind === "unknown") text = direct ? r.text : cards ? `${askerMention(p.sender, p.sender_name)} ${r.text}` : null;
      else if (r.kind === "answer") text = r.text;
      else if (r.kind === "chat") text = direct ? r.text : null;

      const replyEventId = text ? await agent.sendMessage(ev.room_id, text) : null;
      await finish(id, {
        outcome: OUTCOME[r.kind],
        entryIds: r.sources.map((s) => s.id),
        missing: r.missing,
        replyText: text,
        replyEventId,
        model: r.model,
        latencyMs: r.latencyMs,
        error: r.downgraded ? "answer without a valid citation; held back" : null,
      });
      log(
        `${direct ? "direct" : "room"} question ${p.message_id}: ${r.kind}${r.downgraded ? " (downgraded)" : ""}` +
          `, ${r.sources.length} source(s), ${r.latencyMs} ms, cache_read ${r.usage.cacheRead}${text ? ", replied" : ", no post"}`,
      );

      if (ask && cards) {
        await loop.openOrJoin({ questionId: id, kb: ctx.kb, eventId: ctx.eventId, roomName: room.name, askerName: p.sender_name, asked: ask });
      }
    } catch (err) {
      await finish(id, { outcome: "error", error: (err as Error).message.slice(0, 1000) });
      throw err;
    } finally {
      if (direct) await agent.setTyping(ev.room_id, false).catch(() => {});
    }
  }

  /** A crew member talking to Ferri: answer a card, teach a fact, or ask something. */
  async function onCrewMessage(ev: MessageEvent, ctx: Context, member: CrewMember, mentioned: boolean): Promise<void> {
    const p = ev.payload;
    const open = await listOpenCards(db, ctx.kb.community.id);
    const { intent, card } = await crewIntent({
      choice: config.modelFast,
      sender: member.name,
      message: p.body,
      open,
      history: chat(rooms.before(ev.room_id, p.message_id, 6)),
    });
    const inCrewRoom = isCrewRoom(ctx, ev.room_id);

    const facts = (intent?.facts ?? []).filter((f) => f.text.trim());
    const acts = intent?.intent === "answer_card" && card && intent.answer.trim();
    if (acts || (intent?.intent === "remember" && facts.length)) {
      const actionId = await loop.claimCrewAction({
        communityId: ctx.kb.community.id,
        messageId: p.message_id,
        roomId: ev.room_id,
        crewMemberId: member.id,
        crewName: member.name,
        intent: acts ? "answer_card" : "remember",
        cardId: acts ? card!.id : null,
        text: acts ? intent!.answer : facts.map((f) => f.text).join("\n"),
      });
      if (!actionId) return;

      const replies: string[] = [];
      if (acts) {
        log(`crew answer from ${member.name} for card ${card!.id}`);
        const r = await loop.resolveCard(card!.id, { text: intent!.answer, by: member.name, via: "chat" });
        if (!r.resolved) replies.push(`Someone already answered “${card!.question}”, so I kept that answer.`);
        else if (!inCrewRoom) replies.push(`Got it, ${member.name}. I sent it to ${r.delivered.length} ${r.delivered.length === 1 ? "person" : "people"}.`);
      }
      for (const fact of facts) {
        const r = await loop.remember({
          communityId: ctx.kb.community.id,
          eventId: ctx.eventId,
          heading: fact.heading,
          fact: fact.text,
          by: member.name,
        });
        await loop.updateCrewAction(actionId, { entryId: r.entryId });
        const also = r.answered.length
          ? ` It also answered ${r.answered.map((a) => `“${a.question}” (sent to ${a.delivered})`).join(", ")}.`
          : "";
        replies.push(`Saved, ${member.name}: “${fact.heading || fact.text}”. I'll use it from now on.${also}`);
        log(`crew note from ${member.name} saved; ${r.answered.length} card(s) answered by it`);
      }
      if (replies.length) await agent.sendMessage(ev.room_id, replies.join("\n"));
      return;
    }

    // A Switch follow-up without a mention ("ok, I'll set up the chairs"): only answers and facts count.
    if (!mentioned) {
      log(`crew follow-up from ${member.name} is ${intent?.intent ?? "unclear"}; staying quiet`);
      return;
    }
    // A question or anything else: the normal answer path (no cards from the crew room).
    await handleQuestion(ev, ctx, null, true);
  }

  async function onRoomMessage(ev: MessageEvent, ctx: Context | null): Promise<void> {
    const p = ev.payload;
    if (p.body.trim().length < 4) return;
    const roomName = (await deps.room(ev.room_id)).name;
    const first = await triageMessage({
      choice: config.modelFast,
      roomName,
      sender: p.sender_name,
      message: p.body,
      before: chat(rooms.before(ev.room_id, p.message_id, 8)),
    });
    if (!first.triage || !worthAnswering(first.triage)) return;
    log(`room question ${p.message_id} (${first.triage.topic}); waiting ${config.roomGraceMs / 1000}s for a person to answer`);

    await sleep(config.roomGraceMs);
    let triage = first.triage;
    const after = rooms.after(ev.room_id, p.message_id).filter((l) => !l.fromFerri);
    if (after.length) {
      const again = await triageMessage({
        choice: config.modelFast,
        roomName,
        sender: p.sender_name,
        message: p.body,
        before: chat(rooms.before(ev.room_id, p.message_id, 8)),
        after: chat(after),
      });
      if (again.triage) triage = again.triage;
    }
    if (!worthAnswering(triage)) {
      const id = await claim(ev, ctx, triage, false);
      if (id) await finish(id, { outcome: "skipped", error: "answered in the room by a person" });
      log(`room question ${p.message_id}: a person answered; Ferri stays quiet`);
      return;
    }
    await handleQuestion(ev, ctx, triage, false);
  }

  /**
   * Switch marks a message `addressed` without an @mention when it continues
   * an exchange: the sender's next top-level message within 5 minutes of
   * Ferri answering them ("channel follow-up"), or a reply in Ferri's thread.
   * Ferri answers it like a direct question only when triage says it is a
   * question for the organizers; "anyone want chai?" right after an answer
   * gets no reply.
   */
  async function onFollowUp(ev: MessageEvent, ctx: Context | null): Promise<void> {
    const p = ev.payload;
    const t = await triageMessage({
      choice: config.modelFast,
      roomName: (await deps.room(ev.room_id)).name,
      sender: p.sender_name,
      message: p.body,
      before: chat(rooms.before(ev.room_id, p.message_id, 8)),
    });
    if (!t.triage || !t.triage.is_question || !t.triage.for_organizers) {
      log(`follow-up ${p.message_id} is not a question for Ferri; staying quiet`);
      return;
    }
    await handleQuestion(ev, ctx, t.triage, true);
  }

  return async function onMessage(ev: MessageEvent): Promise<void> {
    const p = ev.payload;
    await rooms.ensure(ev.room_id);
    const own = isOwn(ev);
    rooms.push(ev.room_id, {
      id: p.message_id,
      senderId: p.sender,
      sender: own ? "Ferri" : p.sender_name,
      body: p.body,
      timestamp: p.timestamp,
      fromFerri: own,
    });
    if (own) return;
    if (Date.now() - p.timestamp > config.maxReplyAgeMs) {
      log(`skip stale message ${p.message_id} in ${ev.room_id}`);
      return;
    }
    // A typed answer to a Switch card ("A1 ..."): Switch records it; it is not a question.
    if (looksLikeCardAnswer(p.body)) return;
    // A replay after a restart: skip before spending a model call on it.
    const [seenQuestion] = await db.select({ id: questions.id }).from(questions).where(eq(questions.messageId, p.message_id)).limit(1);
    const [seenAction] = await db.select({ id: crewActions.id }).from(crewActions).where(eq(crewActions.messageId, p.message_id)).limit(1);
    if (seenQuestion || seenAction) return;

    const ctx = await context();
    const mentioned = mentionRe.test(p.body) || ev.channel_type === "direct";
    const member = ctx ? findCrewMember(ctx.crew, p.sender, p.sender_name) : null;
    const crewRoom = ctx ? isCrewRoom(ctx, ev.room_id) : false;

    if (ctx && member && p.addressed && (mentioned || crewRoom)) {
      log(`crew ${member.name} in ${ev.room_id}: ${p.body.slice(0, 120)}`);
      await onCrewMessage(ev, ctx, member, mentioned);
    } else if (p.addressed && mentioned) {
      log(`addressed by ${p.sender_name} in ${ev.room_id}: ${p.body.slice(0, 120)}`);
      await handleQuestion(ev, ctx, null, true);
    } else if (crewRoom) {
      // The crew talking among themselves: Ferri listens (spec 08 plans from it) but does not step in.
      return;
    } else if (p.addressed) {
      await onFollowUp(ev, ctx);
    } else {
      await onRoomMessage(ev, ctx);
    }
  };
}
