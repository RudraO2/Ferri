import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { cards, knowledgeEntries, knowledgeRevisions, questions, type Db } from "@ferri/db";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import { TOPICS } from "./triage.ts";

/** The Switch session id all of Ferri's question cards live under. */
export const CARD_SESSION = "ferri-cards";
/** The one question on a card, and its option for "don't answer". */
export const CARD_QUESTION_ID = "answer";
export const CARD_SKIP_OPTION = "skip";

export interface OpenCard {
  id: string;
  eventId: string | null;
  topic: string;
  question: string;
  personal: boolean;
  crewRoomId: string;
}

export async function listOpenCards(db: Db, communityId: string): Promise<OpenCard[]> {
  return db
    .select({
      id: cards.id,
      eventId: cards.eventId,
      topic: cards.topic,
      question: cards.question,
      personal: cards.personal,
      crewRoomId: cards.crewRoomId,
    })
    .from(cards)
    .where(and(eq(cards.communityId, communityId), eq(cards.status, "open"), eq(cards.kind, "question")))
    .orderBy(asc(cards.createdAt));
}

/** Short ids (C1, C2, ...) for showing open cards to a model, and the way back. */
export function shortCardIds(open: OpenCard[]): { text: string; byShort: Map<string, OpenCard> } {
  const byShort = new Map<string, OpenCard>();
  const lines = open.map((c, i) => {
    const id = `C${i + 1}`;
    byShort.set(id, c);
    return `${id} [${c.topic}${c.personal ? ", personal" : ""}]: ${c.question}`;
  });
  return { text: lines.join("\n") || "(none)", byShort };
}

export function resolveShortCard(id: string | null | undefined, byShort: Map<string, OpenCard>): OpenCard | null {
  return id ? (byShort.get(id.trim().toUpperCase()) ?? null) : null;
}

// ── Card prep: does this unknown question join an open card, or start one? ──

export const CardPrepSchema = z.strictObject({
  same_as: z.string().nullable(),
  question: z.string(),
  topic: z.enum(TOPICS),
  personal: z.boolean(),
});
export type CardPrep = z.infer<typeof CardPrepSchema>;

const PREP_SYSTEM = `You help Ferri, the AI teammate of a community that runs events, pass questions it could not answer to the organizing crew. One answer from the crew reaches everyone who asked the same thing, so questions that need the same answer share one card.

Given a new question and the cards already open:
- same_as: the id of an open card whose answer would also fully answer the new question, else null. "Where can I park my scooter?" and "is there bike parking?" share an answer; "is there bike parking?" and "is there car parking?" do not; "is there parking?" and "is parking free?" do not. Never match a personal card, and never match when the new question is personal.
- question: the new question as one short, clear English sentence that someone on the crew understands without the chat around it (for example "Is there parking for two-wheelers at the venue?"). Keep names of places and things.
- topic: the closest topic.
- personal: true only when the answer depends on facts about this one person that the crew must look up (is their registration confirmed, which team they were put in, did their payment go through, where is their lost bag). A rule or policy asked in the first person is not personal, because the same answer helps anyone: "can I switch teams after hacking starts?", "can I bring a friend?", "can I leave early?" are all personal: false.`;

export async function prepareCard(input: {
  choice: ModelChoice;
  question: string;
  asker: string;
  open: OpenCard[];
}): Promise<{ prep: CardPrep | null; joins: OpenCard | null; usage: Usage; latencyMs: number }> {
  const { text, byShort } = shortCardIds(input.open);
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: PREP_SYSTEM, cache_control: { type: "ephemeral" } }],
    user: `Open cards:\n${text}\n\nNew question from ${input.asker}:\n${input.question}`,
    schema: CardPrepSchema,
    maxTokens: 2000,
  });
  const prep = out.data;
  let joins = prep && !prep.personal ? resolveShortCard(prep.same_as, byShort) : null;
  if (joins?.personal) joins = null;
  return { prep, joins, usage: out.usage, latencyMs: out.latencyMs };
}

// ── Card text and timing ──────────────────────────────────────────────────

export function cardTitle(input: {
  mentions: string[];
  topic: string;
  asker: string;
  roomName: string;
  asked: string;
}): string {
  const who = input.mentions.length ? `${input.mentions.join(" ")} · ` : "";
  const quoted = input.asked.replace(/\s+/g, " ").trim();
  const head = `${who}${input.topic} · ${input.asker} asked in ${input.roomName}: `;
  const room = 500 - head.length - 2;
  return `${head}“${quoted.length > room ? `${quoted.slice(0, room - 1)}…` : quoted}”`;
}

export const CARD_PROMPT =
  'Write the answer in quotes after the card code shown below, for example A1 "Bike parking is in the basement". ' +
  "Or just tell me in this room: @ferri followed by the answer. It goes to everyone who asked and is saved for next time.";

export interface LadderTimes {
  nudgeAt: Date;
  escalateAt: Date;
  expiresAt: Date;
}

/**
 * The timeout ladder: nudge the owners at T, the whole crew at 2T, expire at
 * 24 hours (Switch's limit) or the end of the event, never under 30 minutes.
 * T is 10 minutes while the event is live, 2 hours before it.
 */
export function ladderTimes(input: {
  now: Date;
  stage: string | null;
  eventEndsAt: Date | null;
  nudgeSeconds?: number;
  ttlSeconds?: number;
  /** The event's own T (spec 21 settings `ladderLiveMinutes`, `ladderBeforeMinutes`); `nudgeSeconds` (tests) still wins. */
  liveMinutes?: number;
  beforeMinutes?: number;
}): LadderTimes {
  const now = input.now.getTime();
  const t = (input.nudgeSeconds ?? (input.stage === "live" ? (input.liveMinutes ?? 10) * 60 : (input.beforeMinutes ?? 120) * 60)) * 1000;
  let ttl: number;
  if (input.ttlSeconds !== undefined) {
    ttl = input.ttlSeconds * 1000;
  } else {
    // Leaves room under Switch's 24 hour cap for the card's own, later expiry (see switchExpiry).
    ttl = 24 * 60 * 60 * 1000 - 15 * 60 * 1000;
    const untilEnd = input.eventEndsAt ? input.eventEndsAt.getTime() - now : Infinity;
    ttl = Math.max(30 * 60 * 1000, Math.min(ttl, untilEnd));
  }
  return { nudgeAt: new Date(now + t), escalateAt: new Date(now + 2 * t), expiresAt: new Date(now + ttl) };
}

/**
 * When Switch itself should expire the card: 10 minutes after Ferri does.
 * Ferri closes the card at its own expiry, so the card reads "closed"; Switch
 * shows a card it expired as "answered", which would mislead the crew.
 */
export function switchExpiry(ferriExpiry: Date, now = new Date()): Date {
  const cap = now.getTime() + 24 * 60 * 60 * 1000 - 60 * 1000;
  return new Date(Math.min(ferriExpiry.getTime() + 10 * 60 * 1000, cap));
}

// ── Saving what the crew said ─────────────────────────────────────────────

/** "Lantern Build Night crew answers", or the community's when there is no event. */
export function crewSourceTitle(eventName: string | null, communityName: string): string {
  return `${eventName ?? communityName} crew answers`;
}

export async function saveCrewEntry(
  db: Db,
  input: {
    communityId: string;
    eventId: string | null;
    key: string;
    sourceRef: string;
    sourceTitle: string;
    heading: string;
    body: string;
    by: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(knowledgeEntries)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        key: input.key,
        sourceKind: "crew_answer",
        sourceRef: input.sourceRef,
        sourceTitle: input.sourceTitle,
        heading: input.heading,
        body: input.body,
        createdBy: input.by,
        position: 0,
      })
      .returning({ id: knowledgeEntries.id });
    await tx.insert(knowledgeRevisions).values({
      entryId: row!.id,
      version: 1,
      heading: input.heading,
      body: input.body,
      sourceKind: "crew_answer",
      editedBy: input.by,
      change: "created",
    });
    return row!.id;
  });
}

export function newCrewNoteKey(): string {
  return `crew-notes/${randomUUID()}`;
}

/** Questions still waiting on a card, oldest first. */
export async function waitingQuestions(db: Db, cardId: string) {
  return db
    .select()
    .from(questions)
    .where(and(eq(questions.cardId, cardId), isNull(questions.resolvedAt)))
    .orderBy(asc(questions.askedAt));
}

export async function waitingCount(db: Db, cardId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.cardId, cardId), isNull(questions.resolvedAt)));
  return row?.n ?? 0;
}
