import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { cards, crewActions, crewMembers, questions, type Db } from "@ferri/db";
import {
  CARD_PROMPT,
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  answerQuestion,
  cardTitle,
  cardsAnsweredBy,
  crewSourceTitle,
  findCrewMember,
  ladderTimes,
  listOpenCards,
  loadCrew,
  loadLiveKnowledge,
  mention,
  newCrewNoteKey,
  parseSender,
  prepareCard,
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
import type { ApprovalView, SwitchAgent } from "@ferri/switch";
import { config } from "./config.js";

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
  /** Refresh the Switch library mirror soon (debounced by the caller). */
  mirrorSoon: () => void;
  log: (msg: string) => void;
}

type CardRow = typeof cards.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;

export interface ResolveResult {
  /** False when the card was not open any more: someone answered first. */
  resolved: boolean;
  delivered: { name: string; roomName: string }[];
  saved: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const minutesSince = (d: Date) => Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));

/** `@username` for a platform sender id, the way a reply names the person it answers. */
export function askerMention(askerId: string, askerName: string): string {
  return `@${parseSender(askerId, askerName).username}`;
}

/**
 * The learning loop (spec 03): unknown questions become Switch question cards
 * in the crew room; an answer from the crew reaches everyone who waited and is
 * saved; the ladder nudges, escalates and expires cards nobody answers.
 */
export function createLoop(deps: LoopDeps) {
  const { db, agent, log } = deps;

  async function post(roomId: string, text: string): Promise<string | null> {
    try {
      return await agent.sendMessage(roomId, text);
    } catch (err) {
      log(`post to ${roomId} failed: ${(err as Error).message}`);
      return null;
    }
  }

  function crewRoomFor(kb: LiveKnowledge, eventId: string | null): string | null {
    const event = eventId ? kb.events.find((e) => e.id === eventId) : undefined;
    return event?.crewRoomId ?? config.crewRoomId ?? null;
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

  /** Whether cards can be opened at all for this question (a crew room exists). */
  function canOpenCards(kb: LiveKnowledge, eventId: string | null): boolean {
    return crewRoomFor(kb, eventId) !== null;
  }

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
    const crewRoomId = crewRoomFor(kb, input.eventId);
    if (!crewRoomId) {
      log("no crew room (set FERRI_CREW_ROOM_ID or crew_room_id in event.yaml); the question stays unknown");
      return null;
    }
    const open = await listOpenCards(db, kb.community.id);
    const { prep, joins } = await prepareCard({
      choice: config.modelFast,
      question: input.asked,
      asker: input.askerName,
      open,
    });
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
    const times = ladderTimes({
      now: new Date(),
      stage: event?.stage ?? null,
      eventEndsAt: event?.endsAt ?? null,
      nudgeSeconds: config.nudgeSeconds,
      ttlSeconds: config.cardTtlSeconds,
    });
    const id = randomUUID();
    await db.insert(cards).values({
      id,
      communityId: kb.community.id,
      eventId: input.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
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
        title: cardTitle({
          mentions: [],
          topic: prep.topic,
          asker: input.askerName,
          roomName: input.roomName,
          asked: input.asked,
        }),
        detail:
          `Ferri could not find this in the knowledge base. ${prep.personal ? "It is about one person, so the answer goes to them only." : "The answer goes to everyone who asked and is saved for next time."}`,
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
    const why = route.reason === "owner" ? `a ${prep.topic} question for you` : route.reason === "on_duty" ? "you're on duty, a question for you" : "a question for the crew";
    await post(crewRoomId, `${who.join(" ") || "Crew"}, ${why}: “${prep.question}” (${input.askerName} in ${input.roomName}). It's on the card above.`);
    log(`card ${id} opened in ${crewRoomId} for ${route.owners.map((o) => o.name).join(", ") || "the crew"} (${route.reason}): "${prep.question}"`);
    return { cardId: id, joined: false };
  }

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
   * The crew answered: save it (unless it is personal), then send each waiting
   * person the answer in their own room and language, with a source line.
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
    if (!card) return { resolved: false, delivered: [], saved: false };
    if (answer.via !== "card") {
      await agent.closeCard(card.switchSessionId, card.id).catch((err) => log(`closing card ${card.id}: ${(err as Error).message}`));
    }

    let kb = await loadLiveKnowledge(db, config.community);
    if (!kb) throw new Error("no community");
    const eventName = card.eventId ? (kb.events.find((e) => e.id === card.eventId)?.name ?? null) : null;

    let entryId = answer.entryId ?? null;
    if (!card.personal && !entryId) {
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
      deps.mirrorSoon();
      kb = (await loadLiveKnowledge(db, config.community))!;
    }
    if (entryId) await db.update(cards).set({ entryId }).where(eq(cards.id, card.id));

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
              sourceTitle: `Answer from ${answer.by} (crew)`,
              heading: "Overview",
              body: `Q: ${card.question}\nA: ${answer.text}`,
              version: 1,
              updatedAt: new Date(),
            } satisfies KnowledgeItem,
          ],
        }
      : null;

    const delivered: ResolveResult["delivered"] = [];
    for (const { first, all } of perPerson(await waitingQuestions(db, card.id))) {
      const room = await deps.room(first.roomId);
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
        text = r.kind === "answer" ? r.text : fallbackReply(answer.text, answer.by);
      } catch (err) {
        log(`follow-up answer failed, sending the crew's words: ${(err as Error).message}`);
        text = fallbackReply(answer.text, answer.by);
      }
      const reply = `${askerMention(first.askerId, first.askerName)} ${text}`;
      const eventId = await post(first.roomId, reply);
      await db
        .update(questions)
        .set({ resolvedAt: new Date(), resolution: "answered", resolutionText: reply, resolutionEventId: eventId, updatedAt: new Date() })
        .where(inArray(questions.id, all.map((q) => q.id)));
      delivered.push({ name: first.askerName, roomName: room.name });
    }

    const where = card.personal
      ? "It was about one person's own situation, so I did not save it."
      : `Saved in ${crewSourceTitle(eventName, kb.community.name)} as “${card.question}”.`;
    const to = delivered.length
      ? `I sent it to ${plural(delivered.length, "person", "people")} (${delivered.map((d) => `${d.name} in ${d.roomName}`).join(", ")}).`
      : "Nobody was still waiting.";
    await post(card.crewRoomId, `Thanks ${answer.by}. ${to} ${where}`);
    log(`card ${card.id} answered by ${answer.by} via ${answer.via}; ${delivered.length} delivered${card.personal ? "" : ", saved"}`);
    return { resolved: true, delivered, saved: !card.personal };
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

  /** "Don't answer this one": nobody is told anything new. */
  async function dismissCard(cardId: string, by: string): Promise<boolean> {
    const card = await claim(cardId, { status: "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
    if (!card) return false;
    const n = await settleQuestions(card.id, "dismissed");
    await post(card.crewRoomId, `Okay ${by}, I won't answer “${card.question}”. ${plural(n, "person", "people")} asked; nobody was sent anything new.`);
    log(`card ${card.id} dismissed by ${by}`);
    return true;
  }

  /** Expired without an answer: marked unanswered, members get nothing new. */
  async function expireCard(cardId: string, fromSwitch: boolean): Promise<boolean> {
    const card = await claim(cardId, { status: "expired" });
    if (!card) return false;
    if (!fromSwitch) await agent.closeCard(card.switchSessionId, card.id).catch(() => {});
    const n = await settleQuestions(card.id, "expired");
    await post(
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
    const kb = (await loadLiveKnowledge(db, config.community))!;
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
    deps.mirrorSoon();
    const covered = await cardsAnsweredBy({ choice: config.modelFast, fact: input.fact, open: await listOpenCards(db, input.communityId) });
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
      const kb = await loadLiveKnowledge(db, config.community);
      const crew = kb ? await loadCrew(db, kb.community.id, card.eventId) : [];
      const member = o.answeredBy ? findCrewMember(crew, o.answeredBy) : null;
      const by = member?.name ?? (o.answeredBy ? parseSender(o.answeredBy).username : "the crew");
      const a = o.answers?.find((x) => x.question_id === CARD_QUESTION_ID) ?? o.answers?.[0];
      const written = a?.custom_text?.trim();
      if (written) await resolveCard(card.id, { text: written, by, via: "card" });
      else if (a?.selected_option_ids.includes(CARD_SKIP_OPTION)) await dismissCard(card.id, by);
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
    } catch (err) {
      if (!failing.has("poll")) log(`polling card outcomes failed: ${(err as Error).message}`);
      failing.add("poll");
      return;
    } finally {
      polling = false;
    }
    failing.delete("poll");
  }

  // ── The ladder ─────────────────────────────────────────────────────────

  let ticking = false;

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      const now = new Date();
      const nudges = await db
        .update(cards)
        .set({ nudgedAt: now, updatedAt: now })
        .where(and(eq(cards.status, "open"), isNull(cards.nudgedAt), lte(cards.nudgeAt, now)))
        .returning();
      for (const card of nudges) {
        const n = await waitingCount(db, card.id);
        const { platform } = await deps.room(card.crewRoomId);
        const owners = (await crewByIds(card.ownerIds)).map((o) => mention(o, platform));
        await post(
          card.crewRoomId,
          `${owners.join(" ") || "Crew"}, still open after ${minutesSince(card.createdAt)} min: “${card.question}”. ` +
            `${plural(n, "person is", "people are")} waiting. Answer on the card, or tell me with @${config.agentName} and the answer.`,
        );
        log(`card ${card.id}: nudged ${owners.join(" ")}`);
      }

      const escalations = await db
        .update(cards)
        .set({ escalatedAt: now, updatedAt: now })
        .where(and(eq(cards.status, "open"), isNull(cards.escalatedAt), lte(cards.escalateAt, now)))
        .returning();
      for (const card of escalations) {
        const n = await waitingCount(db, card.id);
        const { platform } = await deps.room(card.crewRoomId);
        const crew = await loadCrew(db, card.communityId, card.eventId);
        const everyone = crew.map((c) => mention(c, platform));
        await post(
          card.crewRoomId,
          `${everyone.join(" ") || "Everyone"}: nobody has answered “${card.question}” for ${minutesSince(card.createdAt)} min, ` +
            `and ${plural(n, "person is", "people are")} waiting. Whoever knows, please answer.`,
        );
        log(`card ${card.id}: escalated to the whole crew`);
      }

      // Ferri expires its cards itself (and closes them in Switch) before Switch would.
      const overdue = await db
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.status, "open"), lte(cards.expiresAt, now)));
      for (const c of overdue) await expireCard(c.id, false);
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
    canOpenCards,
    crewRoomFor,
    openOrJoin,
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
