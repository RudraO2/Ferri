import { eq } from "drizzle-orm";
import { communities, crewActions, questions, spaces, type Db } from "@ferri/db";
import {
  answerQuestion,
  checkDecision,
  crewIntent,
  formatWhen,
  localNow,
  parseWhen,
  recentAnnouncements,
  worthAnnouncing,
  decideAction,
  findCommunity,
  findCrewMember,
  isMuted,
  listOpenCards,
  loadCrew,
  loadLiveKnowledge,
  looksLikeCardAnswer,
  mayPost,
  parseSender,
  recordSpace,
  resolveSpace,
  triageMessage,
  worthAnswering,
  type AnswerResult,
  type CrewIntent,
  type CrewMember,
  type RecentAnnouncement,
  type LiveKnowledge,
  type Posting,
  type ResolvedSpace,
  type Triage,
} from "@ferri/knowledge";
import type { MessageEvent, SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { Launch } from "./launch.ts";
import { askerMention, type Loop, type RoomInfo } from "./loop.ts";
import { mentionRegex } from "./mentions.ts";
import type { RoomHistory, RoomLine } from "./rooms.ts";

type Outcome = "answered" | "chat" | "unknown" | "skipped" | "declined" | "error" | "listened" | "held";

export interface FlowDeps {
  db: Db;
  agent: SwitchAgent;
  rooms: RoomHistory;
  loop: Loop;
  launch: Launch;
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
  space: ResolvedSpace;
  /** The live event the space is attached to (null: Off, or community-level). */
  eventId: string | null;
  crew: CrewMember[];
  paused: boolean;
}

/**
 * The message flow, per space (spec 04):
 * - Off (not attached), muted people, archived spaces: ignored;
 * - the master pause: nothing is posted anywhere, questions are only logged;
 * - Listen: never posts, logs the questions it hears;
 * - Approve: replies wait on a reply card in the crew room;
 * - Auto: answers with a source; unknown gets a holding reply and a question card;
 * - the crew room: crew members answer cards, teach facts and ask; no
 *   unprompted answers, no cards for the crew's own questions.
 * Every handled question is one row in `questions` and every crew action one
 * row in `crew_actions`; inserting the row claims the message, so a replay
 * never acts twice.
 */
export function createFlow(deps: FlowDeps) {
  const { db, agent, rooms, loop, launch, log } = deps;
  // Same rule as Switch's mention_regex: `@name` at a full-token boundary.
  const mentionRe = mentionRegex(config.agentName);

  function isOwn(ev: MessageEvent): boolean {
    const p = ev.payload;
    return p.sender === agent.agentId || p.sender_name?.toLowerCase() === "ferri" || p.sender_kind === "platform";
  }

  /** The space a room is (recorded as Discovered and Off the first time), its event and settings. */
  async function context(roomId: string, at: Date): Promise<Context | null> {
    const community = await findCommunity(db, config.community);
    if (!community) return null;
    let space = await resolveSpace(db, roomId);
    if (!space) {
      const info = await deps.room(roomId);
      await recordSpace(db, community.id, { roomId, name: info.name, platform: info.platform }, at);
      log(`new space discovered: ${info.name} (Off until an organizer attaches it)`);
      space = await resolveSpace(db, roomId);
      if (!space) return null;
    } else {
      await db.update(spaces).set({ lastMessageAt: at, lastSeenAt: new Date() }).where(eq(spaces.id, space.spaceId));
    }
    const kb = await loadLiveKnowledge(db, config.community, { eventId: space.eventId });
    if (!kb) return null;
    const [c] = await db.select({ paused: communities.paused }).from(communities).where(eq(communities.id, community.id));
    return { kb, space, eventId: space.eventId, crew: await loadCrew(db, community.id, space.eventId), paused: c?.paused ?? false };
  }

  /** Claim the message. Null when another run already handled it. */
  async function claim(ev: MessageEvent, ctx: Context, triage: Triage | null, direct: boolean) {
    const p = ev.payload;
    const rows = await db
      .insert(questions)
      .values({
        communityId: ctx.kb.community.id,
        eventId: ctx.eventId,
        roomId: ev.room_id,
        spaceId: ctx.space.spaceId,
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

  /** The question text without the @mention, for cards. */
  function stripMention(body: string): string {
    return body.replace(new RegExp(mentionRe.source, "gi"), "").replace(/^[\s,:;-]+/, "").trim() || body;
  }

  /**
   * Answer one question under the space's posting rule.
   * `direct`: the person is talking to Ferri (a mention, a direct chat, or a
   * Switch follow-up). Otherwise it was said to the room.
   */
  async function handleQuestion(
    ev: MessageEvent,
    ctx: Context,
    triage: Triage | null,
    direct: boolean,
    posting: Posting,
    crewRoom: boolean,
  ): Promise<void> {
    const p = ev.payload;
    const id = await claim(ev, ctx, triage, direct);
    if (!id) {
      log(`already handled ${p.message_id}; skipping`);
      return;
    }
    if (posting === "paused") {
      await finish(id, { outcome: "skipped", error: "master pause" });
      log(`paused: question ${p.message_id} logged, not answered`);
      return;
    }
    if (posting === "listen") {
      await finish(id, { outcome: "listened" });
      log(`listen: question ${p.message_id} in ${ctx.space.name} logged`);
      return;
    }
    const room = await deps.room(ev.room_id);
    const approve = posting === "approve";

    if (direct && !approve) await agent.setTyping(ev.room_id, true).catch(() => {});
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

      const crewRoomId = crewRoom ? null : await loop.crewRoomFor(ctx.eventId);
      const asked = stripMention(p.body);
      // What the crew is asked: the whole question, or the part the answer could not cover.
      const ask = r.kind === "unknown" ? asked : r.kind === "answer" && r.missing && direct ? r.missing : null;
      const mentionPrefix = direct ? "" : `${askerMention(p.sender, p.sender_name)} `;

      let text: string | null = null;
      let outcome: Outcome = OUTCOME[r.kind];
      if (approve) {
        // Nothing is posted in an Approve space; a sourced answer waits on a reply card.
        if (r.kind === "answer") {
          const card = await loop.openReplyCard({
            questionId: id,
            kb: ctx.kb,
            eventId: ctx.eventId,
            targetRoomId: ev.room_id,
            roomName: room.name,
            askerName: p.sender_name,
            asked,
            draft: `${mentionPrefix}${r.text}`,
          });
          outcome = card ? "held" : "skipped";
        }
      } else if (r.kind === "unknown" && crewRoom) {
        text = direct ? CREW_UNKNOWN(config.agentName) : null;
      } else if (r.kind === "unknown") {
        // A holding reply only when a card can actually follow (or the person asked Ferri directly).
        text = direct ? r.text : crewRoomId ? `${mentionPrefix}${r.text}` : null;
      } else if (r.kind === "answer") {
        text = `${mentionPrefix}${r.text}`;
      } else if (r.kind === "chat") {
        text = direct ? r.text : null;
      }

      const replyEventId = text ? await loop.post(ctx.kb.community.id, ev.room_id, text) : null;
      await finish(id, {
        outcome,
        entryIds: r.sources.map((s) => s.id),
        missing: r.missing,
        replyText: text,
        replyEventId,
        model: r.model,
        latencyMs: r.latencyMs,
        error: r.downgraded ? "answer without a valid citation; held back" : null,
      });
      log(
        `${direct ? "direct" : "room"} question ${p.message_id} (${posting}): ${r.kind}${r.downgraded ? " (downgraded)" : ""}` +
          `, ${r.sources.length} source(s), ${r.latencyMs} ms, cache_read ${r.usage.cacheRead}${text ? ", replied" : approve && outcome === "held" ? ", held for approval" : ", no post"}`,
      );

      if (ask && crewRoomId) {
        await loop.openOrJoin({ questionId: id, kb: ctx.kb, eventId: ctx.eventId, roomName: room.name, askerName: p.sender_name, asked: ask });
      }
    } catch (err) {
      await finish(id, { outcome: "error", error: (err as Error).message.slice(0, 1000) });
      throw err;
    } finally {
      if (direct && !approve) await agent.setTyping(ev.room_id, false).catch(() => {});
    }
  }

  /** A crew member talking to Ferri: answer a card, teach a fact, or ask something. */
  async function onCrewMessage(
    ev: MessageEvent,
    ctx: Context,
    member: CrewMember,
    mentioned: boolean,
    posting: Posting,
    crewRoom: boolean,
  ): Promise<void> {
    const p = ev.payload;
    const open = (await listOpenCards(db, ctx.kb.community.id)).filter((c) => c.eventId === ctx.eventId);
    const { intent, card, revises } = await crewIntent({
      choice: config.modelFast,
      sender: member.name,
      message: p.body,
      open,
      history: chat(rooms.before(ev.room_id, p.message_id, 6)),
      announcements: await recentAnnouncements(db, ctx.kb.community.id, ctx.eventId),
      now: localNow(ctx.kb.community.timezone),
    });
    // Replies to the crew member in this room obey this room's posting rule.
    const say = async (text: string) => (mayPost(posting) ? loop.post(ctx.kb.community.id, ev.room_id, text) : null);

    // Launch (spec 09): announcements, crew reminders, team rooms.
    if (intent && (intent.intent === "announce" || intent.intent === "remind" || intent.intent === "team_rooms")) {
      const actionId = await loop.claimCrewAction({
        communityId: ctx.kb.community.id,
        messageId: p.message_id,
        roomId: ev.room_id,
        crewMemberId: member.id,
        crewName: member.name,
        intent: intent.intent,
        cardId: null,
        text: p.body,
      });
      if (!actionId) return;
      const reply = await launchIntent(ev, ctx, member, intent, revises, crewRoom);
      if (reply) await say(reply);
      return;
    }

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
        else if (r.held) replies.push(`Saved, ${member.name}. The pause is on, so I'll send it once it is lifted.`);
        else if (!crewRoom) replies.push(`Got it, ${member.name}. I sent it to ${r.delivered.length} ${r.delivered.length === 1 ? "person" : "people"}.`);
      }
      for (const fact of facts) {
        const r = await loop.remember({ communityId: ctx.kb.community.id, eventId: ctx.eventId, heading: fact.heading, fact: fact.text, by: member.name });
        await loop.updateCrewAction(actionId, { entryId: r.entryId });
        const also = r.answered.length ? ` It also answered ${r.answered.map((a) => `“${a.question}” (sent to ${a.delivered})`).join(", ")}.` : "";
        replies.push(`Saved, ${member.name}: “${fact.heading || fact.text}”. I'll use it from now on.${also}`);
        log(`crew note from ${member.name} saved; ${r.answered.length} card(s) answered by it`);
      }
      if (replies.length) await say(replies.join("\n"));
      return;
    }

    // A Switch follow-up without a mention ("ok, I'll set up the chairs"): only answers and facts count.
    if (!mentioned) {
      log(`crew follow-up from ${member.name} is ${intent?.intent ?? "unclear"}; staying quiet`);
      return;
    }
    // A question or anything else: the normal answer path (no cards from the crew room).
    await handleQuestion(ev, ctx, null, true, posting, crewRoom);
  }

  /** What a crew member asked for: an announcement (or a change to one), a reminder, team rooms. */
  async function launchIntent(
    ev: MessageEvent,
    ctx: Context,
    member: CrewMember,
    intent: CrewIntent,
    revises: RecentAnnouncement | null,
    crewRoom: boolean,
  ): Promise<string | null> {
    const p = ev.payload;
    const communityId = ctx.kb.community.id;
    const tz = ctx.kb.community.timezone;
    if (intent.intent === "announce") {
      const what = intent.announce?.what.trim() || stripMention(p.body);
      if (revises) {
        log(`crew ${member.name} wants announcement ${revises.id} changed`);
        return launch.revise({ announcementId: revises.id, what, by: member.name, origin: "chat" });
      }
      const when = parseWhen(intent.announce?.when);
      const unclear = intent.announce?.when && !when;
      log(`crew ${member.name} asked for an announcement${when ? ` at ${when.toISOString()}` : ""}`);
      const r = await launch.request({ communityId, eventId: ctx.eventId, what, when, by: member.name, origin: "chat", sourceMessageId: p.message_id });
      return r ?? (unclear ? "I could not tell when to post it, so the card says it goes out as soon as it is approved." : null);
    }
    if (intent.intent === "remind") {
      const r = intent.remind;
      const dueAt = parseWhen(r?.when);
      if (!r || !dueAt) return `I could not tell when, ${member.name}. Say a time, like “remind me at 5 PM to order the pizza”.`;
      const crewRoomId = crewRoom ? ev.room_id : await loop.crewRoomFor(ctx.eventId);
      if (!crewRoomId) return "This event has no crew room, so I have nowhere to remind you.";
      await launch.remind({
        communityId,
        eventId: ctx.eventId,
        crewRoomId,
        memberIds: r.who === "me" ? [member.id] : [],
        text: r.text.trim(),
        dueAt,
        by: member.name,
        sourceMessageId: p.message_id,
      });
      return `Okay ${member.name}, I will remind ${r.who === "me" ? "you" : "the crew"} at ${formatWhen(dueAt, tz)}: ${r.text.trim()}`;
    }
    const teams = intent.teams.filter((t) => t.name.trim());
    if (!teams.length) return "Tell me the team names (and who is in each), like “make team rooms for Team Alpha with meera and arjun”.";
    const crewRoomId = crewRoom ? ev.room_id : await loop.crewRoomFor(ctx.eventId);
    if (!crewRoomId) return "This event has no crew room, so I do not know which app to make the rooms on.";
    log(`crew ${member.name} asked for team rooms: ${teams.map((t) => t.name).join(", ")}`);
    return launch.makeTeamRooms({ communityId, eventId: ctx.eventId, crewRoomId, teams, by: member.name });
  }

  /** Decision checks run one at a time per room, so a decision said twice is offered once. */
  const decisionQueue = new Map<string, Promise<void>>();

  /**
   * The crew talking among themselves in the crew room. Ferri never answers
   * here; it watches for a decision the members should hear about and offers
   * an announcement on a card. After a short grace, so a correction in the
   * next message ("actually 1:45") is part of what it offers.
   */
  async function onCrewChatter(ev: MessageEvent, ctx: Context, member: CrewMember, posting: Posting): Promise<void> {
    const p = ev.payload;
    if (posting === "paused" || !ctx.eventId || p.body.trim().length < 6) return;
    await sleep(config.decisionGraceMs);
    const prev = decisionQueue.get(ev.room_id) ?? Promise.resolve();
    const run = prev.then(async () => {
      const after = rooms.after(ev.room_id, p.message_id).filter((l) => !l.fromFerri);
      const recent = await recentAnnouncements(db, ctx.kb.community.id, ctx.eventId);
      const r = await checkDecision({
        choice: config.modelFast,
        sender: member.name,
        message: p.body,
        before: chat(rooms.before(ev.room_id, p.message_id, 8)),
        after: chat(after),
        announcements: recent,
      });
      if (!worthAnnouncing(r.decision)) return;
      if (r.duplicate) {
        log(`crew decision from ${member.name} is already announcement ${r.duplicate.id}; nothing new to offer`);
        return;
      }
      const actionId = await loop.claimCrewAction({
        communityId: ctx.kb.community.id,
        messageId: p.message_id,
        roomId: ev.room_id,
        crewMemberId: member.id,
        crewName: member.name,
        intent: "decision",
        cardId: null,
        text: r.decision.what,
      });
      if (!actionId) return;
      log(`crew decision spotted (${member.name}): ${r.decision.what}${r.changes ? ` (changes ${r.changes.id})` : ""}`);
      const reply = r.changes
        ? await launch.revise({ announcementId: r.changes.id, what: r.decision.what, by: member.name, origin: "decision" })
        : await launch.request({
            communityId: ctx.kb.community.id,
            eventId: ctx.eventId,
            what: r.decision.what,
            when: null,
            by: member.name,
            origin: "decision",
            sourceMessageId: p.message_id,
          });
      if (reply) log(`decision not offered: ${reply}`);
    });
    const settled = run.catch((err) => log(`decision check failed: ${(err as Error).message}`));
    decisionQueue.set(ev.room_id, settled);
    await settled;
  }

  async function onRoomMessage(ev: MessageEvent, ctx: Context, posting: Posting, crewRoom: boolean): Promise<void> {
    const p = ev.payload;
    if (p.body.trim().length < 4 || posting === "paused") return;
    const roomName = (await deps.room(ev.room_id)).name;
    const first = await triageMessage({
      choice: config.modelFast,
      roomName,
      sender: p.sender_name,
      message: p.body,
      before: chat(rooms.before(ev.room_id, p.message_id, 8)),
    });
    if (!first.triage || !worthAnswering(first.triage)) return;
    // Listen: log it now; there is nobody to wait for, since Ferri never answers there.
    if (posting === "listen") return handleQuestion(ev, ctx, first.triage, false, posting, crewRoom);
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
    // The posting rule is read again: the space or the pause may have changed during the wait.
    const now = await context(ev.room_id, new Date(p.timestamp));
    if (!now) return;
    const again = decideAction({
      attached: now.space.setting,
      archived: now.space.archived,
      muted: false,
      paused: now.paused,
      fromCrew: false,
      addressed: false,
      mentioned: false,
    });
    if (again.act === "ignore") return;
    await handleQuestion(ev, now, triage, false, again.posting, again.crewRoom);
  }

  /**
   * Switch marks a message `addressed` without an @mention when it continues
   * an exchange (a follow-up within 5 minutes of Ferri answering the sender,
   * or a reply in Ferri's thread). Ferri answers it like a direct question
   * only when triage says it is a question for the organizers.
   */
  async function onFollowUp(ev: MessageEvent, ctx: Context, posting: Posting, crewRoom: boolean): Promise<void> {
    const p = ev.payload;
    if (posting === "paused") return;
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
    await handleQuestion(ev, ctx, t.triage, true, posting, crewRoom);
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

    const ctx = await context(ev.room_id, new Date(p.timestamp));
    if (!ctx) {
      log("no community in the database; run `pnpm kb seed`");
      return;
    }
    const mentioned = mentionRe.test(p.body) || ev.channel_type === "direct";
    const who = parseSender(p.sender, p.sender_name);
    const member = findCrewMember(ctx.crew, p.sender, p.sender_name);
    const decision = decideAction({
      attached: ctx.space.setting,
      archived: ctx.space.archived,
      muted: await isMuted(db, ctx.kb.community.id, who.platform, who.username),
      paused: ctx.paused,
      fromCrew: member !== null,
      addressed: p.addressed,
      mentioned,
    });

    if (decision.act === "ignore") {
      if (p.addressed && mentioned) log(`ignored a mention from ${p.sender_name} in ${ctx.space.name}: ${decision.reason}`);
      return;
    }
    if (decision.act === "crew_chatter") {
      await onCrewChatter(ev, ctx, member!, decision.posting);
    } else if (decision.act === "crew") {
      log(`crew ${member!.name} in ${ctx.space.name}: ${p.body.slice(0, 120)}`);
      await onCrewMessage(ev, ctx, member!, mentioned, decision.posting, decision.crewRoom);
    } else if (decision.act === "direct") {
      log(`addressed by ${p.sender_name} in ${ctx.space.name} (${decision.posting}): ${p.body.slice(0, 120)}`);
      await handleQuestion(ev, ctx, null, true, decision.posting, decision.crewRoom);
    } else if (decision.act === "follow_up") {
      await onFollowUp(ev, ctx, decision.posting, decision.crewRoom);
    } else {
      await onRoomMessage(ev, ctx, decision.posting, decision.crewRoom);
    }
  };
}
