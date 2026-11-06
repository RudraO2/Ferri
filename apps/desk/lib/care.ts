import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { answerAs } from "./cards";
import { community, db } from "./db";
import {
  CARE_BUILDER,
  CARE_DROP,
  CARE_MINE,
  CARE_OPEN,
  CARE_SOLVED,
  CARE_STATUS_LABEL,
  builderAllowed,
  builderJobs,
  cards,
  careCases,
  caseNotes,
  caseRef,
  closedCases,
  crewForSwitchEmail,
  eventSpaces,
  jobRef,
  openCases,
  spaces,
  type CareCase,
  type CareNote,
} from "./ferri";
import type { DeskUser } from "./session";

// ── Care (spec 16): cases in Desk and Pocket ──────────────────────────────

export const CARE_ACTIONS = ["mine", "builder", "solved", "drop", "message", "reopen"] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

/** The care card's option for each action that has one (message is free text, reopen never meets an open card). */
const OPTION: Partial<Record<CareAction, string>> = { mine: CARE_MINE, builder: CARE_BUILDER, solved: CARE_SOLVED, drop: CARE_DROP };
/** A Builder job in one of these is still going, so the Builder is not offered again. */
const UNFINISHED_JOB = ["queued", "handed", "working"];
/** A request younger than this is still waiting for Ferri's tick; a new one would overwrite it. */
const REQUEST_PENDING_MS = 60_000;

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "queued",
  handed: "handed over",
  working: "working",
  done: "done",
  stuck: "stuck",
  failed: "failed",
  cancelled: "cancelled",
};

export interface CaseView extends CareCase {
  /** "Case 3". */
  ref: string;
  urgent: boolean;
  /** Still needs someone (open, helping, builder). */
  isOpen: boolean;
  /** The timeline, oldest first (empty when not loaded). */
  notes: CareNote[];
  spaceName: string | null;
  /** The space's mode for the case's event; null when the space is Off. */
  mode: string | null;
  job: { id: string; ref: string; status: string; title: string } | null;
  /** The case's card is still open in Switch, so actions answer it. */
  cardOpen: boolean;
  canBuilder: boolean;
  canMessage: boolean;
}

const isOpenStatus = (status: string) => (CARE_OPEN as readonly string[]).includes(status);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const firstName = (name: string) => name.split(/[\s._-]+/)[0] || name;

/** Space name and mode, Builder job, card state and (optionally) the timeline for each case. */
async function details(rows: CareCase[], withNotes: boolean): Promise<CaseView[]> {
  if (!rows.length) return [];
  const spaceIds = [...new Set(rows.map((r) => r.spaceId).filter((x): x is string => !!x))];
  const jobIds = [...new Set(rows.map((r) => r.builderJobId).filter((x): x is string => !!x))];
  const cardIds = [...new Set(rows.map((r) => r.cardId).filter((x): x is string => !!x))];
  const [notes, spaceRows, attachRows, jobRows, openCardRows] = await Promise.all([
    withNotes ? caseNotes(db(), rows.map((r) => r.id)) : Promise.resolve(new Map<string, CareNote[]>()),
    (async () => (spaceIds.length ? await db().select({ id: spaces.id, name: spaces.name }).from(spaces).where(inArray(spaces.id, spaceIds)) : []))(),
    (async () =>
      spaceIds.length
        ? await db().select({ spaceId: eventSpaces.spaceId, eventId: eventSpaces.eventId, mode: eventSpaces.mode }).from(eventSpaces).where(inArray(eventSpaces.spaceId, spaceIds))
        : [])(),
    (async () =>
      jobIds.length
        ? await db().select({ id: builderJobs.id, number: builderJobs.number, status: builderJobs.status, title: builderJobs.title }).from(builderJobs).where(inArray(builderJobs.id, jobIds))
        : [])(),
    (async () => (cardIds.length ? await db().select({ id: cards.id }).from(cards).where(and(inArray(cards.id, cardIds), eq(cards.status, "open"))) : []))(),
  ]);
  const spaceName = new Map(spaceRows.map((s) => [s.id, s.name]));
  const jobBy = new Map(jobRows.map((j) => [j.id, j]));
  const openCardIds = new Set(openCardRows.map((c) => c.id));
  return rows.map((r) => {
    const atts = attachRows.filter((a) => a.spaceId === r.spaceId);
    const mode = (atts.find((a) => a.eventId === r.eventId) ?? atts[0])?.mode ?? null;
    const j = r.builderJobId ? jobBy.get(r.builderJobId) : undefined;
    const job = j ? { id: j.id, ref: jobRef(j), status: j.status, title: j.title } : null;
    const builderBusy = !!job && UNFINISHED_JOB.includes(job.status);
    const isOpen = isOpenStatus(r.status);
    return {
      ...r,
      ref: caseRef(r),
      urgent: r.severity === "high",
      isOpen,
      notes: notes.get(r.id) ?? [],
      spaceName: r.spaceId ? (spaceName.get(r.spaceId) ?? null) : null,
      mode,
      job,
      cardOpen: !!r.cardId && openCardIds.has(r.cardId),
      canBuilder: r.technical && builderAllowed(mode) && (r.status === "open" || r.status === "helping") && !builderBusy,
      canMessage: isOpen && !!mode && mode !== "listen",
    };
  });
}

/** Cases that still need someone: urgent first, then oldest first, with their timelines. */
export async function openCaseList(): Promise<CaseView[]> {
  const c = await community();
  const rows = await details(await openCases(db(), c.id), true);
  return rows.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.createdAt.getTime() - b.createdAt.getTime());
}

/** Cases solved or dropped lately, newest first. */
export async function closedCaseList(limit = 20): Promise<CaseView[]> {
  const c = await community();
  const rows = await details(await closedCases(db(), c.id, limit), false);
  const when = (r: CaseView) => (r.closedAt ?? r.updatedAt).getTime();
  return rows.sort((a, b) => when(b) - when(a));
}

/** One case with everything about it, or null. */
export async function caseView(id: string): Promise<CaseView | null> {
  if (!isUuid(id)) return null;
  const c = await community();
  const [row] = await db().select().from(careCases).where(and(eq(careCases.id, id), eq(careCases.communityId, c.id))).limit(1);
  if (!row) return null;
  return (await details([row], true))[0] ?? null;
}

/** The cases behind care cards (Pocket's Needs you), without timelines. */
export async function casesFor(caseIds: string[]): Promise<Map<string, CaseView>> {
  const ids = [...new Set(caseIds.filter(isUuid))];
  if (!ids.length) return new Map();
  const rows = await db().select().from(careCases).where(inArray(careCases.id, ids));
  return new Map((await details(rows, false)).map((v) => [v.id, v]));
}

export async function openCaseCount(): Promise<number> {
  const c = await community();
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(careCases)
    .where(and(eq(careCases.communityId, c.id), inArray(careCases.status, [...CARE_OPEN])));
  return row?.n ?? 0;
}

/** The crew member acting (by their linked Switch account), else the account's own name. */
async function actor(user: DeskUser): Promise<{ id: string | null; name: string }> {
  const c = await community();
  const me = (await crewForSwitchEmail(db(), c.id, user.email))[0];
  return { id: me?.id ?? null, name: me?.name ?? user.name };
}

function whyNoBuilder(v: CaseView): string {
  if (!v.technical) return "The Builder only helps with technical problems.";
  if (!v.mode) return "Ferri is off in that space, so the Builder cannot help there.";
  if (!builderAllowed(v.mode)) return "Ferri only listens in that space, so the Builder cannot help there.";
  if (v.job && UNFINISHED_JOB.includes(v.job.status)) return `The Builder is already on it (${v.job.ref}).`;
  return `The Builder cannot take ${v.ref} while it is ${CARE_STATUS_LABEL[v.status] ?? v.status}.`;
}

function doneNote(action: CareAction, v: CaseView): string {
  const first = firstName(v.personName);
  switch (action) {
    case "mine":
      return `${v.ref} is yours. Ferri tells the crew in a few seconds.`;
    case "builder":
      return `Ferri is sending the Builder to help ${first}. It shows on the case in a few seconds.`;
    case "solved":
      return `Ferri marks ${v.ref} as solved in a few seconds.`;
    case "drop":
      return `Ferri closes ${v.ref} as not a case in a few seconds.`;
    case "message":
      return `Ferri sends your message to ${first} in a few seconds.`;
    case "reopen":
      return `Ferri opens ${v.ref} again in a few seconds.`;
  }
}

/**
 * One action on a case from Desk or Pocket, as the signed-in person. While
 * the case's card is open, it answers the card through Switch (the person is
 * the answerer); otherwise it leaves the request on the case and Ferri's tick
 * does the rest. Ferri changes the status, never this.
 */
export async function careAction(user: DeskUser, caseId: string, action: string, note: string | null): Promise<{ ok: boolean; note: string }> {
  if (!(CARE_ACTIONS as readonly string[]).includes(action)) return { ok: false, note: "Ferri does not know that action." };
  const act = action as CareAction;
  const v = await caseView(caseId);
  if (!v) return { ok: false, note: "That case is gone." };
  const text = note?.trim() || null;
  const first = firstName(v.personName);

  if (act === "reopen") {
    if (v.isOpen) return { ok: false, note: `${v.ref} is still open.` };
  } else if (!v.isOpen) {
    return { ok: false, note: `${v.ref} is already closed (${CARE_STATUS_LABEL[v.status] ?? v.status}). Reopen it first.` };
  }
  const who = await actor(user);
  if (act === "mine" && v.status === "helping" && who.id && v.ownerId === who.id) return { ok: true, note: `${v.ref} is already yours.` };
  if (act === "builder" && !v.canBuilder) return { ok: false, note: whyNoBuilder(v) };
  if (act === "message") {
    if (!text) return { ok: false, note: `Write what Ferri should send to ${first} first.` };
    if (!v.canMessage) return { ok: false, note: `Ferri ${v.mode ? "only listens" : "is off"} in that space, so it cannot write there. Reach ${first} yourself.` };
  }

  // 1. The card is still open: answer it through Switch as this person.
  if (v.cardId && v.cardOpen && act !== "reopen") {
    const option = OPTION[act];
    const r = await answerAs(user, v.cardId, act === "message" ? { selected: [], text } : { selected: option ? [option] : [], text });
    if (r.ok) return { ok: true, note: doneNote(act, v) };
    const [still] = await db().select({ id: cards.id }).from(cards).where(and(eq(cards.id, v.cardId), eq(cards.status, "open"))).limit(1);
    if (still) return r;
    // The card was settled in the meantime: leave the request on the case instead.
  }

  // 2. Otherwise: the request on the case, for Ferri's tick.
  if (v.request && Date.now() - Date.parse(v.request.at) < REQUEST_PENDING_MS) {
    return { ok: false, note: `Ferri is still on the last request for ${v.ref}. Try again in a few seconds.` };
  }
  await db()
    .update(careCases)
    .set({ request: { action: act, by: who.name, byCrewId: who.id, note: text, at: new Date().toISOString() }, updatedAt: new Date() })
    .where(eq(careCases.id, v.id));
  return { ok: true, note: doneNote(act, v) };
}
