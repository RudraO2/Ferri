import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { cards, crewActions, crewMembers, deskUsers, questions, type Db } from "@ferri/db";
import {
  CARD_PROMPT,
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  answerQuestion,
  cardTitle,
  cardsAnsweredBy,
  crewRoomForEvent,
  crewSourceTitle,
  findCrewMember,
  isPaused,
  ladderTimes,
  listOpenCards,
  loadCrew,
  loadLiveKnowledge,
  mention,
  newCrewNoteKey,
  parseSender,
  prepareCard,
  resolveSpace,
  routeCard,
  saveCrewEntry,
  switchExpiry,
  waitingCount,
  waitingQuestions,
  type CrewMember,
  type KnowledgeItem,
  type LiveKnowledge,
  type OpenCard,
} from "@ferri/knowledge";
import { cardNotice, pushToUsers, pushedAboutCard, settledNotice, switchUsersForCrew, type PushKind } from "@ferri/push";
import type { ApprovalView, SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";

export interface RoomInfo {
  name: string;
  /** "mattermost", "slack", ... (lowercase bridge name), for writing @mentions. */
  platform: string | null;
}

export interface LoopDeps {
  db: Db;
  agent: SwitchAgent;
  skills: () => string;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

type CardRow = typeof cards.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;

/** Reply-card option (Approve spaces). A written answer sends the organizer's own version. */
export const REPLY_SEND_OPTION = "send";

export interface ResolveResult {
  /** False when the card was not open any more: someone answered first. */
  resolved: boolean;
  delivered: { name: string; roomName: string }[];
  /** True when the master pause held the delivery; it goes out after the pause. */
  held: boolean;
  saved: boolean;
}

/** Announce cards (spec 09) are settled by the launch module; the loop hands their outcomes over. */
export interface AnnounceHooks {
  outcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void>;
  expired(card: CardRow): Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const minutesSince = (d: Date) => Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));

/** `@username` for a platform sender id, the way a reply names the person it answers. */
export function askerMention(askerId: string, askerName: string): string {
  return `@${parseSender(askerId, askerName).username}`;
}

/**
 * The learning loop (spec 03) on top of spaces (spec 04): unknown questions
 * become question cards in the event's crew room; replies in Approve spaces
 * become reply cards; answers reach everyone who waited; the ladder nudges,
 * escalates and expires; the master pause holds every post.
 */
export function createLoop(deps: LoopDeps) {
  const { db, agent, log } = deps;
  let announceHooks: AnnounceHooks | null = null;
  let planHooks: AnnounceHooks | null = null;
  let outreachHooks: AnnounceHooks | null = null;

  /**
   * Every post goes through here. While the master pause is on, nothing is
   * posted and null is returned; callers keep what must go out later.
   */
  async function post(communityId: string, roomId: string, text: string): Promise<string | null> {
    if (await isPaused(db, communityId)) {
      log(`paused: not posting to ${roomId}`);
      return null;
    }
    try {
      return await agent.sendMessage(roomId, text);
    } catch (err) {
      log(`post to ${roomId} failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** A post with files (a poster): the same pause rule as `post`. */
  async function postMedia(
    communityId: string,
    roomId: string,
    files: { filename: string; bytes: Uint8Array; mimetype: string }[],
    caption: string,
  ): Promise<string | null> {
    if (await isPaused(db, communityId)) {
      log(`paused: not posting files to ${roomId}`);
      return null;
    }
    try {
      return await agent.sendMedia(roomId, files, caption);
    } catch (err) {
      log(`post with files to ${roomId} failed: ${(err as Error).message}`);
      return null;
    }
  }

  const crewRoomFor = (eventId: string | null) => crewRoomForEvent(db, eventId);

  // ── Ferri Pocket pushes (spec 06): next to the crew-room post, never instead of it ──

  function pocketNotify(
    kind: Exclude<PushKind, "settled" | "test" | "reminder" | "shield" | "builder" | "email">,
    card: CardRow,
    crewIds: string[],
    extra: { waiting?: number; askerName?: string; roomName?: string } = {},
  ): void {
    void (async () => {
      const facts = {
        id: card.id,
        kind: card.kind,
        question: card.question,
        topic: card.topic,
        waiting: extra.waiting ?? 1,
        askerName: extra.askerName,
        roomName: extra.roomName,
        minutesOpen: minutesSince(card.createdAt),
      };
      // An expiry also reaches whoever was pushed about the card before.
      const users = new Set(await switchUsersForCrew(db, crewIds));
      if (kind === "expire") for (const u of await pushedAboutCard(db, card.id)) users.add(u);
      const r = await pushToUsers(db, [...users], cardNotice(kind, facts));
      if (r.sent || r.failed || r.gone) log(`card ${card.id}: ${kind} push to ${r.users} people (${r.sent} sent, ${r.gone} gone, ${r.failed} failed)`);
    })().catch((err) => log(`card ${card.id}: ${kind} push failed: ${(err as Error).message}`));
  }

  /** Replace every notification a settled card caused, quietly. */
  function pocketSettled(card: CardRow, how: "answered" | "dismissed", by: string, reached?: number): void {
    void (async () => {
      const users = await pushedAboutCard(db, card.id);
      if (!users.length) return;
      const r = await pushToUsers(db, users, settledNotice(card, how, by, reached));
      log(`card ${card.id}: settled push to ${r.users} people (${r.sent} sent)`);
    })().catch((err) => log(`card ${card.id}: settled push failed: ${(err as Error).message}`));
  }

  async function crewByIds(ids: string[]): Promise<CrewMember[]> {
    if (!ids.length) return [];
    const rows = await db.select().from(crewMembers).where(inArray(crewMembers.id, ids));
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      name: r.name,
      handles: r.handles,
      topics: r.topics,
      lead: r.lead,
      onDuty: r.onDuty,
    }));
  }

  /** Who answered a card: a crew member's name, a Desk user's name, or the platform username. */
  async function nameForAnswerer(answeredBy: string | null, communityId: string, eventId: string | null): Promise<string> {
    if (!answeredBy) return "the crew";
    const crew = await loadCrew(db, communityId, eventId);
    if (answeredBy.startsWith("user:")) {
      const [u] = await db.select().from(deskUsers).where(eq(deskUsers.switchUserId, answeredBy.slice(5))).limit(1);
      if (!u) return "an organizer";
      const member = crew.find((c) => c.handles.switch?.toLowerCase() === u.email.toLowerCase());
      return member?.name ?? u.name;
    }
    return findCrewMember(crew, answeredBy)?.name ?? parseSender(answeredBy).username;
  }

  function ladder(stage: string | null, endsAt: Date | null) {
    return ladderTimes({
      now: new Date(),
      stage,
      eventEndsAt: endsAt,
      nudgeSeconds: config.nudgeSeconds,
      ttlSeconds: config.cardTtlSeconds,
    });
  }

  // ── Question cards ────────────────────────────────────────────────────

  /**
   * Put a question the knowledge could not answer in front of the crew: join
   * an open card that needs the same answer, or open a new one routed to the
   * topic owners. Returns null when no card could be opened.
   */
  async function openOrJoin(input: {
    questionId: string;
    kb: LiveKnowledge;
    eventId: string | null;
    roomName: string;
    askerName: string;
    /** What the crew should answer (the question, or the missing part of it). */
    asked: string;
  }): Promise<{ cardId: string; joined: boolean } | null> {
    const { kb } = input;
    const crewRoomId = await crewRoomFor(input.eventId);
    if (!crewRoomId) {
      log("this event has no crew room (attach one in Desk); the question stays unknown");
      return null;
    }
    if (await isPaused(db, kb.community.id)) {
      log(`paused: no card for question ${input.questionId}`);
      return null;
    }
    const open = (await listOpenCards(db, kb.community.id)).filter((c) => c.eventId === input.eventId);
    const { prep, joins } = await prepareCard({ choice: config.modelFast, question: input.asked, asker: input.askerName, open });
    if (!prep) {
      log(`card prep failed for question ${input.questionId}`);
      return null;
    }
    if (joins) {
      await db.update(questions).set({ cardId: joins.id, updatedAt: new Date() }).where(eq(questions.id, input.questionId));
      log(`question ${input.questionId} joined card ${joins.id} ("${joins.question}")`);
      return { cardId: joins.id, joined: true };
    }

    const event = input.eventId ? kb.events.find((e) => e.id === input.eventId) : undefined;
    const crew = await loadCrew(db, kb.community.id, input.eventId);
    const route = routeCard(crew, prep.topic);
    const { platform } = await deps.room(crewRoomId);
    const times = ladder(event?.stage ?? null, event?.endsAt ?? null);
    const id = randomUUID();
    await db.insert(cards).values({
      id,
      communityId: kb.community.id,
      eventId: input.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "question",
      topic: prep.topic,
      question: prep.question,
      personal: prep.personal,
      ownerIds: route.owners.map((o) => o.id),
      ...times,
    });
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        // Switch escapes @mentions inside a card, so the owners are pinged by a message of Ferri's below.
        title: cardTitle({ mentions: [], topic: prep.topic, asker: input.askerName, roomName: input.roomName, asked: input.asked }),
        detail: `Ferri could not find this in the knowledge base. ${prep.personal ? "It is about one person, so the answer goes to them only." : "The answer goes to everyone who asked and is saved for next time."}`,
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: "Your answer",
            prompt: CARD_PROMPT,
            options: [{ id: CARD_SKIP_OPTION, label: "Don't answer this one", description: null }],
            multi_select: false,
            allow_custom_answer: true,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      log(`opening the Switch card failed: ${(err as Error).message}`);
      return null;
    }
    await db.update(questions).set({ cardId: id, updatedAt: new Date() }).where(eq(questions.id, input.questionId));
    const who = route.owners.map((o) => mention(o, platform));
    const why =
      route.reason === "owner"
        ? `a ${prep.topic} question for you`
        : route.reason === "on_duty"
          ? "you're on duty, a question for you"
          : "a question for the crew";
    await post(kb.community.id, crewRoomId, `${who.join(" ") || "Crew"}, ${why}: “${prep.question}” (${input.askerName} in ${input.roomName}). It's on the card above.`);
    const [opened] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (opened) pocketNotify("open", opened, route.owners.map((o) => o.id), { waiting: 1, askerName: input.askerName, roomName: input.roomName });
    log(`card ${id} opened in ${crewRoomId} for ${route.owners.map((o) => o.name).join(", ") || "the crew"} (${route.reason}): "${prep.question}"`);
    return { cardId: id, joined: false };
  }

  // ── Reply cards (Approve spaces) ──────────────────────────────────────

  /** An Approve-space reply waits on a card in the crew room until an organizer sends it. */
  async function openReplyCard(input: {
    questionId: string;
    kb: LiveKnowledge;
    eventId: string | null;
    targetRoomId: string;
    roomName: string;
    askerName: string;
    asked: string;
    draft: string;
  }): Promise<string | null> {
    const crewRoomId = await crewRoomFor(input.eventId);
    if (!crewRoomId) {
      log("Approve space without a crew room: the reply cannot be approved, so it is not sent");
      return null;
    }
    if (await isPaused(db, input.kb.community.id)) return null;
    const event = input.eventId ? input.kb.events.find((e) => e.id === input.eventId) : undefined;
    const crew = await loadCrew(db, input.kb.community.id, input.eventId);
    const route = routeCard(crew, "__reply__");
    const { platform } = await deps.room(crewRoomId);
    const times = ladder(event?.stage ?? null, event?.endsAt ?? null);
    const id = randomUUID();
    const asked = input.asked.replace(/\s+/g, " ").trim();
    await db.insert(cards).values({
      id,
      communityId: input.kb.community.id,
      eventId: input.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "reply",
      topic: "reply",
      question: asked.length > 300 ? `${asked.slice(0, 299)}…` : asked,
      ownerIds: route.owners.map((o) => o.id),
      draftText: input.draft,
      targetRoomId: input.targetRoomId,
      targetQuestionId: input.questionId,
      ...times,
    });
    const head = `Reply waiting · ${input.askerName} asked in ${input.roomName}: `;
    const room = 500 - head.length - 2;
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: `${head}“${asked.length > room ? `${asked.slice(0, room - 1)}…` : asked}”`,
        detail: "This space is in Approve mode: nothing is posted until an organizer sends it.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: "Send this reply?",
            prompt:
              `Ferri's draft:\n\n${input.draft.slice(0, 3200)}\n\n` +
              "Pick Send as is or Don't send, or write your own version in quotes after the card code to send that instead.",
            options: [
              { id: REPLY_SEND_OPTION, label: "Send as is", description: null },
              { id: CARD_SKIP_OPTION, label: "Don't send", description: null },
            ],
            multi_select: false,
            allow_custom_answer: true,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      log(`opening the reply card failed: ${(err as Error).message}`);
      return null;
    }
    const who = route.owners.map((o) => mention(o, platform));
    await post(input.kb.community.id, crewRoomId, `${who.join(" ") || "Crew"}, a reply in ${input.roomName} is waiting for your OK. It's on the card above.`);
    const [opened] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (opened) pocketNotify("open", opened, route.owners.map((o) => o.id), { askerName: input.askerName, roomName: input.roomName });
    log(`reply card ${id} opened for question ${input.questionId}`);
    return id;
  }

  /** An organizer approved (or rewrote) a held reply: post it where it was asked. */
  async function sendReply(card: CardRow, text: string, by: string, edited: boolean): Promise<void> {
    const target = card.targetRoomId ? await resolveSpace(db, card.targetRoomId) : null;
    const room = card.targetRoomId ? await deps.room(card.targetRoomId) : { name: "?", platform: null };
    // The space may have been switched to Listen or Off since; then nothing goes out.
    if (!target?.setting || target.setting.mode === "listen" || target.archived) {
      await post(card.communityId, card.crewRoomId, `Not sent: ${room.name} is no longer a space Ferri may post in.`);
      log(`reply card ${card.id}: target space no longer allows posting`);
      return;
    }
    const sentEventId = await post(card.communityId, card.targetRoomId!, text);
    await db.update(cards).set({ sentText: text, sentEventId }).where(eq(cards.id, card.id));
    if (card.targetQuestionId) {
      await db
        .update(questions)
        .set({ outcome: "answered", replyText: text, replyEventId: sentEventId, updatedAt: new Date() })
        .where(eq(questions.id, card.targetQuestionId));
    }
    await post(card.communityId, card.crewRoomId, `Thanks ${by}. ${edited ? "I sent your version" : "I sent the reply"} in ${room.name}.`);
    log(`reply card ${card.id}: sent (${edited ? "edited" : "as drafted"}) by ${by}`);
  }

  // ── Settling cards ────────────────────────────────────────────────────

  /** Claim an open card for settling. Null when it is already settled. */
  async function claim(cardId: string, set: Partial<typeof cards.$inferInsert>): Promise<CardRow | null> {
    const rows = await db
      .update(cards)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(cards.id, cardId), eq(cards.status, "open")))
      .returning();
    return rows[0] ?? null;
  }

  /** The waiting questions, one per person per room (asking twice gets one reply). */
  function perPerson(rows: QuestionRow[]): { first: QuestionRow; all: QuestionRow[] }[] {
    const groups = new Map<string, { first: QuestionRow; all: QuestionRow[] }>();
    for (const q of rows) {
      const key = `${q.roomId}|${q.askerId}`;
      const g = groups.get(key);
      if (g) g.all.push(q);
      else groups.set(key, { first: q, all: [q] });
    }
    return [...groups.values()];
  }

  /**
   * The crew answered a question card: save it (unless it is personal), then
   * deliver it to everyone waiting. During the master pause the delivery is
   * held and goes out after the pause.
   */
  async function resolveCard(
    cardId: string,
    answer: { text: string; by: string; via: "card" | "chat" | "remember"; entryId?: string },
  ): Promise<ResolveResult> {
    const card = await claim(cardId, {
      status: "answered",
      answeredAt: new Date(),
      answeredBy: answer.by,
      answeredVia: answer.via,
      answerText: answer.text,
    });
    if (!card) return { resolved: false, delivered: [], held: false, saved: false };
    if (answer.via !== "card") {
      await agent.closeCard(card.switchSessionId, card.id).catch((err) => log(`closing card ${card.id}: ${(err as Error).message}`));
    }

    let entryId = answer.entryId ?? null;
    if (!card.personal && !entryId) {
      const kb = await loadLiveKnowledge(db, config.community, { eventId: card.eventId });
      if (!kb) throw new Error("no community");
      const eventName = card.eventId ? (kb.events.find((e) => e.id === card.eventId)?.name ?? null) : null;
      entryId = await saveCrewEntry(db, {
        communityId: card.communityId,
        eventId: card.eventId,
        key: `crew-answers/${card.id}`,
        sourceRef: card.id,
        sourceTitle: crewSourceTitle(eventName, kb.community.name),
        heading: card.question,
        body: `Q: ${card.question}\nA: ${answer.text}`,
        by: answer.by,
      });
    }
    if (entryId) await db.update(cards).set({ entryId }).where(eq(cards.id, card.id));
    const updated = { ...card, entryId };

    if (await isPaused(db, card.communityId)) {
      log(`card ${card.id} answered by ${answer.by} during the pause; delivery held`);
      pocketSettled(card, "answered", answer.by);
      return { resolved: true, delivered: [], held: true, saved: !card.personal };
    }
    const delivered = await deliver(updated, false);
    pocketSettled(card, "answered", answer.by, delivered.length);
    return { resolved: true, delivered, held: false, saved: !card.personal };
  }

  /** Cards being delivered right now, so the held-delivery sweep never runs one twice. */
  const delivering = new Set<string>();

  /** Send an answered card to everyone still waiting on it, then confirm in the crew room. */
  async function deliver(card: CardRow, afterPause: boolean): Promise<ResolveResult["delivered"]> {
    if (delivering.has(card.id)) return [];
    delivering.add(card.id);
    try {
      return await deliverNow(card, afterPause);
    } finally {
      delivering.delete(card.id);
    }
  }

  /**
   * Claim waiting questions before posting to them: only one run ever gets a
   * question, so nobody is answered twice, even across processes.
   */
  async function claimQuestions(ids: string[]): Promise<string[]> {
    const rows = await db
      .update(questions)
      .set({ resolvedAt: new Date(), resolution: "answered", updatedAt: new Date() })
      .where(and(inArray(questions.id, ids), isNull(questions.resolvedAt)))
      .returning({ id: questions.id });
    return rows.map((r) => r.id);
  }

  async function deliverNow(card: CardRow, afterPause: boolean): Promise<ResolveResult["delivered"]> {
    const by = card.answeredBy ?? "the crew";
    const answerText = card.answerText ?? "";
    const kb = await loadLiveKnowledge(db, config.community, { eventId: card.eventId });
    if (!kb) throw new Error("no community");
    const eventName = card.eventId ? (kb.events.find((e) => e.id === card.eventId)?.name ?? null) : null;

    // A personal answer is not in the knowledge: answer from it alone.
    const personalKb: LiveKnowledge | null = card.personal
      ? {
          ...kb,
          entries: [
            {
              id: card.id,
              key: `personal/${card.id}`,
              eventId: card.eventId,
              eventName,
              sourceKind: "crew_answer",
              sourceTitle: `Answer from ${by} (crew)`,
              heading: "Overview",
              body: `Q: ${card.question}\nA: ${answerText}`,
              version: 1,
              updatedAt: new Date(),
            } satisfies KnowledgeItem,
          ],
        }
      : null;

    const delivered: ResolveResult["delivered"] = [];
    let skipped = 0;
    for (const { first, all } of perPerson(await waitingQuestions(db, card.id))) {
      const claimed = await claimQuestions(all.map((q) => q.id));
      if (!claimed.length) continue; // another run has them
      const room = await deps.room(first.roomId);
      const space = await resolveSpace(db, first.roomId);
      // The crew's answer is the approval in an Approve space; Listen, Off and archived spaces get nothing.
      if (!space?.setting || space.setting.mode === "listen" || space.archived) {
        skipped++;
        continue;
      }
      let text: string;
      try {
        const r = await answerQuestion({
          db,
          kb: personalKb ?? kb,
          choice: config.modelMain,
          skills: deps.skills(),
          roomName: room.name,
          sender: first.askerName,
          question: first.text,
          history: [],
          addressed: true,
          followUp: true,
        });
        text = r.kind === "answer" ? r.text : fallbackReply(answerText, by);
      } catch (err) {
        log(`follow-up answer failed, sending the crew's words: ${(err as Error).message}`);
        text = fallbackReply(answerText, by);
      }
      const reply = `${askerMention(first.askerId, first.askerName)} ${text}`;
      const eventId = await post(card.communityId, first.roomId, reply);
      if (!eventId && (await isPaused(db, card.communityId))) {
        // Paused mid-way: give these back; they and the rest go out after the pause.
        await db.update(questions).set({ resolvedAt: null, resolution: null, updatedAt: new Date() }).where(inArray(questions.id, claimed));
        return delivered;
      }
      await db
        .update(questions)
        .set({ resolutionText: reply, resolutionEventId: eventId, updatedAt: new Date() })
        .where(inArray(questions.id, claimed));
      delivered.push({ name: first.askerName, roomName: room.name });
    }
    // A sweep that found nothing left to send says nothing.
    if (afterPause && !delivered.length && !skipped) return delivered;

    const where = card.personal
      ? "It was about one person's own situation, so I did not save it."
      : `Saved in ${crewSourceTitle(eventName, kb.community.name)} as “${card.question}”.`;
    const to = delivered.length
      ? `I sent it to ${plural(delivered.length, "person", "people")} (${delivered.map((d) => `${d.name} in ${d.roomName}`).join(", ")}).`
      : "Nobody was still waiting.";
    const quiet = skipped
      ? ` ${plural(skipped, "person", "people")} asked in a space that is now Listen or Off, so I did not message them.`
      : "";
    await post(card.communityId, card.crewRoomId, `${afterPause ? "The pause is over. " : ""}Thanks ${by}. ${to}${quiet} ${where}`);
    log(`card ${card.id} delivered${afterPause ? " after the pause" : ""}: ${delivered.length} sent, ${skipped} not sent (space not posting)`);
    return delivered;
  }

  function fallbackReply(answerText: string, by: string): string {
    return `The team says: “${answerText}”\n\nSource: answer from ${by} (crew)`;
  }

  async function settleQuestions(cardId: string, resolution: "dismissed" | "expired"): Promise<number> {
    const rows = await db
      .update(questions)
      .set({ resolvedAt: new Date(), resolution, updatedAt: new Date() })
      .where(and(eq(questions.cardId, cardId), isNull(questions.resolvedAt)))
      .returning({ id: questions.id });
    return rows.length;
  }

  /** "Don't answer" / "Don't send": nobody is told anything new. */
  async function dismissCard(cardId: string, by: string): Promise<boolean> {
    const card = await claim(cardId, { status: "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
    if (!card) return false;
    pocketSettled(card, "dismissed", by);
    if (card.kind === "reply") {
      if (card.targetQuestionId) {
        await db
          .update(questions)
          .set({ outcome: "skipped", error: `not sent: ${by} said don't send`, updatedAt: new Date() })
          .where(eq(questions.id, card.targetQuestionId));
      }
      await post(card.communityId, card.crewRoomId, `Okay ${by}, I won't send that reply.`);
      log(`reply card ${card.id}: ${by} said don't send`);
      return true;
    }
    const n = await settleQuestions(card.id, "dismissed");
    await post(card.communityId, card.crewRoomId, `Okay ${by}, I won't answer “${card.question}”. ${plural(n, "person", "people")} asked; nobody was sent anything new.`);
    log(`card ${card.id} dismissed by ${by}`);
    return true;
  }

  /** Expired without an answer: marked unanswered (or not sent), members get nothing new. */
  async function expireCard(cardId: string, fromSwitch: boolean): Promise<boolean> {
    const card = await claim(cardId, { status: "expired" });
    if (!card) return false;
    pocketNotify("expire", card, card.ownerIds, { waiting: card.kind === "question" ? await waitingCount(db, card.id) : 1 });
    if (!fromSwitch) await agent.closeCard(card.switchSessionId, card.id).catch(() => {});
    if (card.kind === "announce") {
      await announceHooks?.expired(card);
      return true;
    }
    if (card.kind === "plan") {
      await planHooks?.expired(card);
      return true;
    }
    if (card.kind === "outreach") {
      await outreachHooks?.expired(card);
      return true;
    }
    if (card.kind === "reply") {
      if (card.targetQuestionId) {
        await db
          .update(questions)
          .set({ outcome: "skipped", error: "reply not approved in time", updatedAt: new Date() })
          .where(eq(questions.id, card.targetQuestionId));
      }
      await post(card.communityId, card.crewRoomId, `Nobody approved the reply to “${card.question}” in time, so it was not sent.`);
      log(`reply card ${card.id} expired; not sent`);
      return true;
    }
    const n = await settleQuestions(card.id, "expired");
    await post(
      card.communityId,
      card.crewRoomId,
      `Nobody answered “${card.question}” in time, so the card expired. ${plural(n, "person was", "people were")} waiting; ` +
        "they were not sent anything new, and the question stays on the unanswered list.",
    );
    log(`card ${card.id} expired (${n} waiting)`);
    return true;
  }

  /** A crew member taught Ferri a fact: save it, then answer every open card it covers. */
  async function remember(input: {
    communityId: string;
    eventId: string | null;
    heading: string;
    fact: string;
    by: string;
  }): Promise<{ entryId: string; answered: { question: string; delivered: number }[] }> {
    const kb = (await loadLiveKnowledge(db, config.community, { eventId: input.eventId }))!;
    const eventName = input.eventId ? (kb.events.find((e) => e.id === input.eventId)?.name ?? null) : null;
    const key = newCrewNoteKey();
    const entryId = await saveCrewEntry(db, {
      communityId: input.communityId,
      eventId: input.eventId,
      key,
      sourceRef: key,
      sourceTitle: crewSourceTitle(eventName, kb.community.name),
      heading: input.heading || input.fact.slice(0, 60),
      body: input.fact,
      by: input.by,
    });
    const open = (await listOpenCards(db, input.communityId)).filter((c) => c.eventId === input.eventId);
    const covered = await cardsAnsweredBy({ choice: config.modelFast, fact: input.fact, open });
    const answered: { question: string; delivered: number }[] = [];
    for (const card of covered) {
      const r = await resolveCard(card.id, { text: input.fact, by: input.by, via: "remember", entryId });
      if (r.resolved) answered.push({ question: card.question, delivered: r.delivered.length });
    }
    return { entryId, answered };
  }

  // ── Card outcomes from Switch ──────────────────────────────────────────

  let polling = false;
  const failing = new Set<string>();

  async function handleOutcome(o: ApprovalView): Promise<void> {
    if (o.sessionId !== CARD_SESSION) {
      await agent.markCardDelivered(o.sessionId, o.requestId);
      return;
    }
    const [card] = await db.select().from(cards).where(eq(cards.id, o.requestId)).limit(1);
    if (card && o.state === "answered") {
      const by = await nameForAnswerer(o.answeredBy, card.communityId, card.eventId);
      const a = o.answers?.find((x) => x.question_id === CARD_QUESTION_ID) ?? o.answers?.[0];
      const written = a?.custom_text?.trim();
      if (card.kind === "announce") {
        if (!announceHooks) throw new Error("announcements are not running yet");
        await announceHooks.outcome(card, { written: written || null, selected: a?.selected_option_ids ?? [] }, by);
      } else if (card.kind === "plan") {
        if (!planHooks) throw new Error("the plan is not running yet");
        await planHooks.outcome(card, { written: written || null, selected: a?.selected_option_ids ?? [] }, by);
      } else if (card.kind === "outreach") {
        if (!outreachHooks) throw new Error("outreach is not running yet");
        await outreachHooks.outcome(card, { written: written || null, selected: a?.selected_option_ids ?? [] }, by);
      } else if (card.kind === "reply") {
        if (written) {
          const claimed = await claim(card.id, { status: "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: written });
          // Keep the asker's mention when the organizer's version does not name anyone.
          const mentionPrefix = /^@\S+\s/.exec(card.draftText ?? "")?.[0] ?? "";
          if (claimed) {
            await sendReply(claimed, written.startsWith("@") ? written : `${mentionPrefix}${written}`, by, true);
            pocketSettled(claimed, "answered", by);
          }
        } else if (a?.selected_option_ids.includes(REPLY_SEND_OPTION)) {
          const claimed = await claim(card.id, { status: "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
          if (claimed) {
            await sendReply(claimed, card.draftText ?? "", by, false);
            pocketSettled(claimed, "answered", by);
          }
        } else if (a?.selected_option_ids.includes(CARD_SKIP_OPTION)) {
          await dismissCard(card.id, by);
        }
      } else if (written) {
        await resolveCard(card.id, { text: written, by, via: "card" });
      } else if (a?.selected_option_ids.includes(CARD_SKIP_OPTION)) {
        await dismissCard(card.id, by);
      }
    } else if (card && o.state === "expired") {
      await expireCard(card.id, true);
    }
    await agent.markCardDelivered(o.sessionId, o.requestId);
  }

  async function pollOutcomes(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      for (const o of await agent.cardOutcomes()) {
        try {
          await handleOutcome(o);
          failing.delete(o.requestId);
        } catch (err) {
          if (!failing.has(o.requestId)) log(`card outcome ${o.requestId} failed (will retry): ${(err as Error).message}`);
          failing.add(o.requestId);
        }
      }
      failing.delete("poll");
    } catch (err) {
      if (!failing.has("poll")) log(`polling card outcomes failed: ${(err as Error).message}`);
      failing.add("poll");
    } finally {
      polling = false;
    }
  }

  // ── The ladder, and deliveries held by the pause ──────────────────────

  let ticking = false;

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      const now = new Date();
      const pausedCache = new Map<string, boolean>();
      const paused = async (communityId: string) => {
        if (!pausedCache.has(communityId)) pausedCache.set(communityId, await isPaused(db, communityId));
        return pausedCache.get(communityId)!;
      };

      // Nudges and escalations wait while paused (they are posts); they fire after it.
      const dueNudges = await db.select().from(cards).where(and(eq(cards.status, "open"), isNull(cards.nudgedAt), lte(cards.nudgeAt, now)));
      for (const due of dueNudges) {
        if (await paused(due.communityId)) continue;
        const [card] = await db
          .update(cards)
          .set({ nudgedAt: now, updatedAt: now })
          .where(and(eq(cards.id, due.id), isNull(cards.nudgedAt)))
          .returning();
        if (!card) continue;
        const n = card.kind === "question" ? await waitingCount(db, card.id) : 1;
        const { platform } = await deps.room(card.crewRoomId);
        const owners = (await crewByIds(card.ownerIds)).map((o) => mention(o, platform));
        const what =
          card.kind === "announce"
            ? `the announcement “${card.question}” is still waiting for your OK after ${minutesSince(card.createdAt)} min. It's on the card above.`
            : card.kind === "plan"
            ? `the plan decision “${card.question}” is still waiting for your OK after ${minutesSince(card.createdAt)} min. It's on the card above.`
            : card.kind === "outreach"
            ? `the email “${card.question}” is still waiting for your OK after ${minutesSince(card.createdAt)} min. It's on the card above.`
            : card.kind === "reply"
            ? `the reply to “${card.question}” is still waiting for your OK after ${minutesSince(card.createdAt)} min.`
            : `still open after ${minutesSince(card.createdAt)} min: “${card.question}”. ${plural(n, "person is", "people are")} waiting. ` +
              `Answer on the card, or tell me with @${config.agentName} and the answer.`;
        await post(card.communityId, card.crewRoomId, `${owners.join(" ") || "Crew"}, ${what}`);
        pocketNotify("nudge", card, card.ownerIds, { waiting: n });
        log(`card ${card.id}: nudged ${owners.join(" ")}`);
      }

      const dueEscalations = await db
        .select()
        .from(cards)
        .where(and(eq(cards.status, "open"), isNull(cards.escalatedAt), lte(cards.escalateAt, now)));
      for (const due of dueEscalations) {
        if (await paused(due.communityId)) continue;
        const [card] = await db
          .update(cards)
          .set({ escalatedAt: now, updatedAt: now })
          .where(and(eq(cards.id, due.id), isNull(cards.escalatedAt)))
          .returning();
        if (!card) continue;
        const n = card.kind === "question" ? await waitingCount(db, card.id) : 1;
        const { platform } = await deps.room(card.crewRoomId);
        const crew = await loadCrew(db, card.communityId, card.eventId);
        const everyone = crew.map((c) => mention(c, platform));
        const what =
          card.kind === "announce"
            ? `nobody has approved the announcement “${card.question}” for ${minutesSince(card.createdAt)} min. Whoever can, please post it or say don't post.`
            : card.kind === "plan"
            ? `nobody has confirmed the plan decision “${card.question}” for ${minutesSince(card.createdAt)} min. Whoever can, please confirm or drop it.`
            : card.kind === "outreach"
            ? `nobody has approved the email “${card.question}” for ${minutesSince(card.createdAt)} min. Whoever can, please send it or say don't send.`
            : card.kind === "reply"
            ? `nobody has approved the reply to “${card.question}” for ${minutesSince(card.createdAt)} min. Whoever can, please send it or say don't send.`
            : `nobody has answered “${card.question}” for ${minutesSince(card.createdAt)} min, and ${plural(n, "person is", "people are")} waiting. Whoever knows, please answer.`;
        await post(card.communityId, card.crewRoomId, `${everyone.join(" ") || "Everyone"}: ${what}`);
        pocketNotify("escalate", card, crew.map((c) => c.id), { waiting: n });
        log(`card ${card.id}: escalated to the whole crew`);
      }

      // Ferri expires its cards itself (and closes them in Switch) before Switch would.
      const overdue = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.status, "open"), lte(cards.expiresAt, now)));
      for (const c of overdue) await expireCard(c.id, false);

      // Answers held by the pause (or a delivery that failed): deliver once posting is allowed again.
      const held = await db
        .select()
        .from(cards)
        .where(
          and(
            eq(cards.status, "answered"),
            eq(cards.kind, "question"),
            sql`exists (select 1 from questions q where q.card_id = ${cards.id} and q.resolved_at is null)`,
          ),
        );
      for (const card of held) {
        if (await paused(card.communityId)) continue;
        await deliver(card, true);
      }
    } catch (err) {
      log(`ladder tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  function start(): () => void {
    const a = setInterval(() => void pollOutcomes(), config.outcomePollMs);
    const b = setInterval(() => void tick(), config.ladderTickMs);
    void pollOutcomes();
    void tick();
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }

  /** Claim a crew message before acting on it, so a replay never acts twice. */
  async function claimCrewAction(input: typeof crewActions.$inferInsert): Promise<string | null> {
    const rows = await db.insert(crewActions).values(input).onConflictDoNothing({ target: crewActions.messageId }).returning({ id: crewActions.id });
    return rows[0]?.id ?? null;
  }

  async function updateCrewAction(id: string, set: Partial<typeof crewActions.$inferInsert>): Promise<void> {
    await db.update(crewActions).set(set).where(eq(crewActions.id, id));
  }

  return {
    post,
    postMedia,
    crewRoomFor,
    ladder,
    claim,
    crewByIds,
    pocketNotify,
    pocketSettled,
    setAnnounceHooks: (h: AnnounceHooks) => {
      announceHooks = h;
    },
    setPlanHooks: (h: AnnounceHooks) => {
      planHooks = h;
    },
    setOutreachHooks: (h: AnnounceHooks) => {
      outreachHooks = h;
    },
    openOrJoin,
    openReplyCard,
    resolveCard,
    dismissCard,
    expireCard,
    remember,
    pollOutcomes,
    tick,
    start,
    claimCrewAction,
    updateCrewAction,
  };
}

export type Loop = ReturnType<typeof createLoop>;
export type { OpenCard };
