import { eq } from "drizzle-orm";
import { questions, type Db } from "@ferri/db";
import {
  answerQuestion,
  loadLiveKnowledge,
  triageMessage,
  worthAnswering,
  type AnswerResult,
  type Triage,
} from "@ferri/knowledge";
import type { MessageEvent, SwitchAgent } from "@ferri/switch";
import { config } from "./config.js";
import { mentionRegex } from "./mentions.js";
import type { RoomHistory, RoomLine } from "./rooms.js";

type Outcome = "answered" | "chat" | "unknown" | "skipped" | "declined" | "error";

export interface FlowDeps {
  db: Db;
  agent: SwitchAgent;
  rooms: RoomHistory;
  skills: () => string;
  roomName: (roomId: string) => Promise<string>;
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

/**
 * The spec 02 message flow:
 * - addressed to Ferri: answer from the knowledge base (or say it is checking);
 * - not addressed: Haiku triage; a question for the organizers waits a short
 *   grace period so a person can answer first, then Ferri answers only when
 *   the knowledge base has it.
 * Every handled question is one row in `questions`; inserting it claims the
 * message, so nothing is ever answered twice.
 */
export function createFlow(deps: FlowDeps) {
  const { db, agent, rooms, log } = deps;
  // Same rule as Switch's mention_regex: `@name` at a full-token boundary.
  const mentionRe = mentionRegex(config.agentName);

  function isOwn(ev: MessageEvent): boolean {
    const p = ev.payload;
    return p.sender === agent.agentId || p.sender_name?.toLowerCase() === "ferri" || p.sender_kind === "platform";
  }

  /** Claim the message. False when another run already handled it. */
  async function claim(
    ev: MessageEvent,
    communityId: string | null,
    eventId: string | null,
    triage: Triage | null,
    direct: boolean,
  ) {
    const p = ev.payload;
    const rows = await db
      .insert(questions)
      .values({
        communityId,
        eventId,
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
   * a holding reply when it does not know. Otherwise it only steps in with a
   * sourced answer.
   */
  async function handleQuestion(ev: MessageEvent, triage: Triage | null, direct: boolean): Promise<void> {
    const p = ev.payload;
    const kb = await loadLiveKnowledge(db, config.community);
    const eventId = kb && kb.events.length === 1 ? kb.events[0]!.id : null;
    const id = await claim(ev, kb?.community.id ?? null, eventId, triage, direct);
    if (!id) {
      log(`already handled ${p.message_id}; skipping`);
      return;
    }
    if (!kb) {
      log("no community in the database; run `pnpm kb seed`");
      await finish(id, { outcome: "error", error: "no community" });
      return;
    }

    if (direct) await agent.setTyping(ev.room_id, true).catch(() => {});
    try {
      const r = await answerQuestion({
        db,
        kb,
        choice: config.modelMain,
        skills: deps.skills(),
        roomName: await deps.roomName(ev.room_id),
        sender: p.sender_name,
        question: p.body,
        history: chat(rooms.before(ev.room_id, p.message_id)),
        addressed: direct,
        searchTerms: triage?.search_terms,
      });

      // Unaddressed: step in only with a sourced answer.
      const post = r.text && (direct ? r.kind !== "declined" && r.kind !== "invalid" : r.kind === "answer");
      const replyEventId = post ? await agent.sendMessage(ev.room_id, r.text) : null;
      await finish(id, {
        outcome: OUTCOME[r.kind],
        entryIds: r.sources.map((s) => s.id),
        missing: r.missing,
        replyText: post ? r.text : null,
        replyEventId,
        model: r.model,
        latencyMs: r.latencyMs,
        error: r.downgraded ? "answer without a valid citation; held back" : null,
      });
      log(
        `${direct ? "direct" : "room"} question ${p.message_id}: ${r.kind}${r.downgraded ? " (downgraded)" : ""}` +
          `, ${r.sources.length} source(s), ${r.latencyMs} ms, cache_read ${r.usage.cacheRead}${post ? ", replied" : ", no post"}`,
      );
    } catch (err) {
      await finish(id, { outcome: "error", error: (err as Error).message.slice(0, 1000) });
      throw err;
    } finally {
      if (direct) await agent.setTyping(ev.room_id, false).catch(() => {});
    }
  }

  async function onRoomMessage(ev: MessageEvent): Promise<void> {
    const p = ev.payload;
    if (p.body.trim().length < 4) return;
    const roomName = await deps.roomName(ev.room_id);
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
      const kb = await loadLiveKnowledge(db, config.community);
      const id = await claim(
        ev,
        kb?.community.id ?? null,
        kb && kb.events.length === 1 ? kb.events[0]!.id : null,
        triage,
        false,
      );
      if (id) await finish(id, { outcome: "skipped", error: "answered in the room by a person" });
      log(`room question ${p.message_id}: a person answered; Ferri stays quiet`);
      return;
    }
    await handleQuestion(ev, triage, false);
  }

  /**
   * Switch marks a message `addressed` without an @mention when it continues
   * an exchange: the sender's next top-level message within 5 minutes of
   * Ferri answering them ("channel follow-up"), or a reply in Ferri's thread.
   * Ferri answers it like a direct question only when triage says it is a
   * question for the organizers; "anyone want chai?" right after an answer
   * gets no reply.
   */
  async function onFollowUp(ev: MessageEvent): Promise<void> {
    const p = ev.payload;
    const t = await triageMessage({
      choice: config.modelFast,
      roomName: await deps.roomName(ev.room_id),
      sender: p.sender_name,
      message: p.body,
      before: chat(rooms.before(ev.room_id, p.message_id, 8)),
    });
    if (!t.triage || !t.triage.is_question || !t.triage.for_organizers) {
      log(`follow-up ${p.message_id} is not a question for Ferri; staying quiet`);
      return;
    }
    await handleQuestion(ev, t.triage, true);
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
    // A replay after a restart: skip before spending a triage call on it.
    const seen = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.messageId, p.message_id))
      .limit(1);
    if (seen.length) return;
    const mentioned = mentionRe.test(p.body) || ev.channel_type === "direct";
    if (p.addressed && mentioned) {
      log(`addressed by ${p.sender_name} in ${ev.room_id}: ${p.body.slice(0, 120)}`);
      await handleQuestion(ev, null, true);
    } else if (p.addressed) {
      await onFollowUp(ev);
    } else {
      await onRoomMessage(ev);
    }
  };
}
