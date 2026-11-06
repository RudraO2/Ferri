import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { careCases, careNotes, type Db } from "@ferri/db";
import type { CrewMember } from "./crew.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import { TOPICS, type ChatLine } from "./triage.ts";

// ── Care (spec 16): members who need a person ─────────────────────────────

export type CareCase = typeof careCases.$inferSelect;
export type CareNote = typeof careNotes.$inferSelect;

export const CARE_KINDS = ["confused", "stuck", "upset", "unsafe"] as const;
export type CareKind = (typeof CARE_KINDS)[number];
/** Statuses of a case that still needs someone. */
export const CARE_OPEN = ["open", "helping", "builder"] as const;
export const CARE_STATUS_LABEL: Record<string, string> = {
  open: "nobody on it yet",
  helping: "someone is on it",
  builder: "the Builder is helping",
  solved: "solved",
  dropped: "not a case",
};

/** `Case 3`: the crew's name for a case (cards already use C1, A1 in Ferri's prompts). */
export const caseRef = (c: Pick<CareCase, "number">) => `Case ${c.number}`;

// ── The care reader: one Haiku call per member message ────────────────────

export const CareReadingSchema = z.strictObject({
  signal: z.enum(["none", ...CARE_KINDS]),
  technical: z.boolean(),
  severity: z.enum(["normal", "high"]),
  topic: z.enum(TOPICS),
  reason: z.string(),
  quote: z.string(),
  case: z.enum(["new", "update", "solved", "none"]),
});
export type CareReading = z.infer<typeof CareReadingSchema>;

const CARE_SYSTEM = `You read one message that a member of a community wrote in one of its chat spaces, for Ferri, the AI teammate of the community's organizing crew. You decide whether this person needs someone from the crew: they are confused, stuck, upset or unsafe. You never answer them.

signal:
- none: ordinary chat, a plain question (Ferri answers questions from its knowledge, so a question on its own is not a case, even a short or blunt one like "where is the wifi password?"), excitement, thanks, jokes, playful grumbling ("this bug is killing me lol", "coffee pls"), and stories about other people.
- confused: they tried and are still lost about how or where something works at the event, and say so ("I've looked everywhere and still can't find where to submit", "nobody told us which room we're in and we've asked twice"). A first question is not confused.
- stuck: they cannot go on with what they are doing. A technical problem: their code, tools, laptop, accounts, API keys, deploys, the event's wifi, site or platform failing for them ("git push keeps failing with permission denied", "my API key stopped working an hour ago"). Or a practical one: they cannot get in, lost their team, their registration or badge is not working.
- upset: frustrated, angry, sad, left out, treated badly, or about to leave ("this is so unfair, I'm going home", "nobody is helping us").
- unsafe: harassment, a threat, someone hurt or ill, someone saying they feel unsafe. Always severity high.

technical: true when what blocks them is technical (code, tools, setup, accounts, keys, network, the event's own site or platform), else false.
severity: high for unsafe, for someone about to leave or very distressed, or for a problem that blocks a whole team during the event; else normal.
topic: the closest topic.
reason: one plain line for the crew to read at a glance: the person's name, what is wrong, and since when or what they tried, only from what they wrote (for example: Meera can't push to GitHub: "Permission denied (publickey)" since setting up her laptop). Never guess a cause or add facts. It is only about this person's problem: never mention cases, case numbers, other problems or who is helping. Empty when signal is none.
quote: the most telling words of the message, under 120 characters, copied exactly. Empty when signal is none.
case: what this message means for the person's open case (shown below when they have one):
- new: a problem that needs a case of its own (they have no open case, or this is a different problem).
- update: more about the problem of the open case (still broken, angrier, a new error, a detail). reason then describes the case as it stands now, signal and technical the case's.
- solved: the open case's problem is fixed or not needed any more ("works now, thanks", "never mind, found it", "all good now"). signal is none.
- none: nothing for a case: the signal is none (ordinary chat, a question, or chat beside the open case). When the signal is not none, case is never none: it is new or update.`;

export async function readCare(input: {
  choice: ModelChoice;
  roomName: string;
  sender: string;
  message: string;
  before: ChatLine[];
  /** The person's open case, in one line, or null. */
  openCase: string | null;
  /** The event's stage ("live" during the event). */
  stage: string | null;
}): Promise<{ reading: CareReading | null; usage: Usage; latencyMs: number }> {
  const before = input.before.slice(-8).map((l) => `${l.sender}: ${l.body}`).join("\n") || "(none)";
  const call = () =>
    structuredCall({
      choice: input.choice,
      system: [{ type: "text", text: CARE_SYSTEM, cache_control: { type: "ephemeral" } }],
      user:
        `Space: ${input.roomName}\nEvent stage: ${input.stage ?? "none"}\n` +
        `${input.sender}'s open case: ${input.openCase ?? "(none)"}\n\n` +
        `Earlier messages:\n${before}\n\nThe message, from ${input.sender}:\n${input.message}`,
      schema: CareReadingSchema,
      maxTokens: 1500,
    });
  let out = await call();
  // An output that did not parse (rare on Haiku): one more try, so a real problem is not missed.
  if (!out.data && !out.refused) out = await call();
  return { reading: out.data ? tidyReading(out.data, !!input.openCase) : null, usage: out.usage, latencyMs: out.latencyMs };
}

/** What a reading does with the person's case, after a few rules the prompt alone may miss. */
export function tidyReading(r: CareReading, hasOpenCase: boolean): CareReading {
  let out = { ...r, reason: r.reason.trim(), quote: r.quote.trim().slice(0, 160) };
  if (out.signal === "unsafe") out = { ...out, severity: "high" };
  if (!hasOpenCase && (out.case === "update" || out.case === "solved")) out = { ...out, case: out.signal === "none" ? "none" : "new" };
  if (out.case === "new" && (out.signal === "none" || !out.reason)) out = { ...out, case: "none" };
  // A real signal always lands on a case: a new one, or (when they have one open) that one, rather than a duplicate.
  if (out.case === "none" && out.signal !== "none" && out.reason) out = { ...out, case: hasOpenCase ? "update" : "new" };
  return out;
}

// ── Who owns a case ───────────────────────────────────────────────────────

/**
 * The owner of a new case: the topic owner (tech for a technical problem),
 * else whoever is on duty, else a lead, else anyone on the crew. Unsafe goes
 * to the on-duty person, and every lead is told.
 */
export function careRoute(crew: CrewMember[], r: Pick<CareReading, "signal" | "technical" | "topic" | "severity">): { owner: CrewMember | null; notify: CrewMember[] } {
  const leads = crew.filter((c) => c.lead);
  const duty = crew.filter((c) => c.onDuty);
  const uniq = (list: CrewMember[]) => [...new Map(list.map((c) => [c.id, c])).values()];
  if (r.signal === "unsafe") {
    const owner = duty[0] ?? leads[0] ?? crew[0] ?? null;
    return { owner, notify: uniq([...(owner ? [owner] : []), ...leads]) };
  }
  const topic = r.technical ? "tech" : r.topic;
  const owner = crew.find((c) => c.topics.includes(topic)) ?? duty[0] ?? leads[0] ?? crew[0] ?? null;
  const notify = uniq([...(owner ? [owner] : []), ...(r.severity === "high" ? leads : [])]);
  return { owner, notify };
}

// ── The Builder for technical problems ────────────────────────────────────

/**
 * Whether a case goes to the Builder at once, without a tap: a technical
 * problem during the event (Live), in a space where Ferri posts on its own.
 */
export function autoHelp(input: { technical: boolean; kind: string; stage: string | null; mode: string | null; paused: boolean }): boolean {
  return input.technical && (input.kind === "stuck" || input.kind === "confused") && input.stage === "live" && input.mode === "auto" && !input.paused;
}

/** Whether the Builder may be sent to a case's space at all (the crew's tap, or automatically). */
export function builderAllowed(mode: string | null): boolean {
  return mode === "auto" || mode === "approve";
}

/**
 * The Builder's addressing policy: its owner and the owner's agents (Ferri)
 * everywhere, and anyone in the crew rooms and in the rooms where it is
 * helping someone right now. Switch has no read route for it, so Ferri always
 * writes it whole.
 */
export function builderPolicy(crewRooms: string[], helpRooms: string[]) {
  const rooms = [...new Set([...crewRooms, ...helpRooms])].sort();
  return {
    rules: [
      { owner: true, owner_agents: true, users: [] as string[], agents: [] as string[] },
      ...(rooms.length ? [{ rooms, users: "*" as const, agents: [] as string[] }] : []),
    ],
  };
}

/** The hand-off in the member's own room: short, friendly, readable by everyone there. */
export function helpHandoff(input: { job: number; caseNumber: number; personName: string; reason: string; agentName: string }): string {
  const first = input.personName.split(/[\s._-]+/)[0] || input.personName;
  return (
    `Please help ${first} here: ${input.reason.replace(/\s+/g, " ").trim().slice(0, 600)}\n` +
    `This is job B${input.job} for case ${input.caseNumber}. Start with your help-member skill (call it even if you used it before), ` +
    `answer ${first} in this room, and tell ${input.agentName} "Job B${input.job} done:" when it works, or "Job B${input.job} stuck:" if it needs the crew.
` +
    `${first}, start your replies with @builder so they reach it.`
  );
}

// ── The card and the crew-room line ───────────────────────────────────────

export const CARE_MINE = "mine";
export const CARE_BUILDER = "builder";
export const CARE_SOLVED = "solved";
export const CARE_DROP = "drop";

export function careOptions(input: { technical: boolean; mode: string | null; builderBusy: boolean }) {
  return [
    { id: CARE_MINE, label: "I'm on it", description: null },
    ...(input.technical && builderAllowed(input.mode) && !input.builderBusy ? [{ id: CARE_BUILDER, label: "Send the Builder", description: null }] : []),
    { id: CARE_SOLVED, label: "Solved", description: null },
    { id: CARE_DROP, label: "Not a case", description: null },
  ];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function careCardTitle(c: Pick<CareCase, "number" | "kind" | "severity" | "personName" | "reason">, roomName: string): string {
  const head = `${caseRef(c)} · ${c.severity === "high" ? "urgent · " : ""}${c.kind} · ${c.personName} in ${roomName}: `;
  return `${head}${clip(c.reason.replace(/\s+/g, " "), 500 - head.length)}`;
}

/** The one line in the crew room next to the card. */
export function careLine(input: { c: Pick<CareCase, "number" | "kind" | "severity" | "reason" | "personName">; roomName: string; owner: string | null; builder: boolean }): string {
  const { c } = input;
  const tail = input.builder
    ? ` The Builder is helping ${c.personName} there now; ${input.owner ? `${input.owner}, it stays yours if it needs a person` : "it needs an owner if it needs a person"}.`
    : input.owner
      ? ` ${input.owner}, it's yours: pick an option on the card above, or tell me "@ferri I've got case ${c.number}".`
      : " Whoever can, take it on the card above.";
  return `${c.severity === "high" ? "Urgent: " : ""}${caseRef(c)} · ${c.kind} · ${c.personName} in ${input.roomName}: ${c.reason}${tail}`;
}

/** The open case as one line for the reader and the crew intent. */
export function caseLine(c: Pick<CareCase, "number" | "kind" | "status" | "reason" | "ownerName">): string {
  return `${caseRef(c)} [${c.kind}, ${CARE_STATUS_LABEL[c.status] ?? c.status}${c.ownerName ? `, owner ${c.ownerName}` : ""}]: ${c.reason}`;
}

/** Check-ins: 30 minutes during the event, 4 hours before; at most three. */
export function checkInDelayMs(stage: string | null): number {
  return stage === "live" ? 30 * 60_000 : 4 * 3600_000;
}
export const MAX_CHECK_INS = 3;

// ── Rows ──────────────────────────────────────────────────────────────────

/** A new case with the next number. Null when the message already opened one (a replay). */
export async function createCase(db: Db, input: Omit<typeof careCases.$inferInsert, "number" | "id">): Promise<CareCase | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ next }] = (await db
      .select({ next: sql<number>`coalesce(max(${careCases.number}), 0)::int + 1` })
      .from(careCases)
      .where(eq(careCases.communityId, input.communityId))) as [{ next: number }];
    const [row] = await db
      .insert(careCases)
      .values({ ...input, number: next })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    if (input.sourceMessageId) {
      const [seen] = await db.select({ id: careCases.id }).from(careCases).where(eq(careCases.sourceMessageId, input.sourceMessageId)).limit(1);
      if (seen) return null;
    }
  }
  throw new Error("could not number a new case");
}

export async function addCareNote(db: Db, caseId: string, note: { kind: string; text: string; by: string; messageId?: string | null }): Promise<void> {
  await db.insert(careNotes).values({ caseId, kind: note.kind, text: note.text, by: note.by, messageId: note.messageId ?? null });
}

/** The person's newest case that still needs someone, or null. */
export async function openCaseFor(db: Db, communityId: string, personId: string): Promise<CareCase | null> {
  const [row] = await db
    .select()
    .from(careCases)
    .where(and(eq(careCases.communityId, communityId), eq(careCases.personId, personId), inArray(careCases.status, [...CARE_OPEN])))
    .orderBy(desc(careCases.createdAt))
    .limit(1);
  return row ?? null;
}

export async function openCases(db: Db, communityId: string, eventId?: string | null): Promise<CareCase[]> {
  return db
    .select()
    .from(careCases)
    .where(
      and(
        eq(careCases.communityId, communityId),
        inArray(careCases.status, [...CARE_OPEN]),
        eventId === undefined ? undefined : eventId === null ? sql`${careCases.eventId} is null` : eq(careCases.eventId, eventId),
      ),
    )
    .orderBy(asc(careCases.createdAt));
}

export async function findCase(db: Db, communityId: string, number: number): Promise<CareCase | null> {
  const [row] = await db.select().from(careCases).where(and(eq(careCases.communityId, communityId), eq(careCases.number, number))).limit(1);
  return row ?? null;
}

export async function caseNotes(db: Db, caseIds: string[]): Promise<Map<string, CareNote[]>> {
  const out = new Map<string, CareNote[]>();
  if (!caseIds.length) return out;
  const rows = await db.select().from(careNotes).where(inArray(careNotes.caseId, caseIds)).orderBy(asc(careNotes.createdAt));
  for (const r of rows) out.set(r.caseId, [...(out.get(r.caseId) ?? []), r]);
  return out;
}

/** Rooms where the Builder is helping someone right now (their room is in its addressing policy). */
export async function helpRooms(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ room: careCases.roomId }).from(careCases).where(eq(careCases.status, "builder"));
  return rows.map((r) => r.room);
}

/** Cases closed or dropped recently, newest first (Desk's list). */
export async function closedCases(db: Db, communityId: string, limit = 30): Promise<CareCase[]> {
  return db
    .select()
    .from(careCases)
    .where(and(eq(careCases.communityId, communityId), notInArray(careCases.status, [...CARE_OPEN])))
    .orderBy(desc(careCases.closedAt))
    .limit(limit);
}
