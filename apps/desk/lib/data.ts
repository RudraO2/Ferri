import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { community, db } from "./db";
import { CARE_OPEN, cards, careCases, crewMembers, eventSpaces, events, knowledgeEntries, mutedPeople, questions, spaces } from "./ferri";

export async function liveEvents(communityId: string) {
  return db()
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), isNull(events.closedAt)))
    .orderBy(asc(events.startsAt), asc(events.name));
}

export async function allEvents(communityId: string) {
  return db().select().from(events).where(eq(events.communityId, communityId)).orderBy(desc(events.startsAt));
}

/** Every space with its attachment to a live event (null: Off). */
export async function spacesWithSettings(communityId: string) {
  const rows = await db().select().from(spaces).where(eq(spaces.communityId, communityId)).orderBy(asc(spaces.name));
  const atts = await db()
    .select({ spaceId: eventSpaces.spaceId, eventId: eventSpaces.eventId, mode: eventSpaces.mode, role: eventSpaces.role, eventName: events.name })
    .from(eventSpaces)
    .innerJoin(events, eq(events.id, eventSpaces.eventId))
    .where(isNull(events.closedAt));
  const bySpace = new Map(atts.map((a) => [a.spaceId, a]));
  return rows.map((s) => ({ ...s, attachment: bySpace.get(s.id) ?? null }));
}

export async function overview() {
  const c = await community();
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  const [openQuestions, repliesWaiting, unanswered, discovered, entries, announcementsWaiting, planWaiting, emailsWaiting, casesOpen, guestsWaiting] = await Promise.all([
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "question")))),
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "reply")))),
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "expired"), eq(cards.kind, "question")))),
    count(db().select({ n }).from(spaces).where(and(eq(spaces.communityId, c.id), eq(spaces.state, "new"), eq(spaces.archived, false)))),
    count(db().select({ n }).from(knowledgeEntries).where(and(eq(knowledgeEntries.communityId, c.id), isNull(knowledgeEntries.archivedAt)))),
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "announce")))),
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "plan")))),
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "outreach")))),
    count(db().select({ n }).from(careCases).where(and(eq(careCases.communityId, c.id), inArray(careCases.status, [...CARE_OPEN])))),
    // Spec 17: emails to guests and freed spots waiting for an OK.
    count(db().select({ n }).from(cards).where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), inArray(cards.kind, ["guests", "spot"])))),
  ]);
  const recent = await db()
    .select({
      id: questions.id,
      askerName: questions.askerName,
      text: questions.text,
      outcome: questions.outcome,
      resolution: questions.resolution,
      askedAt: questions.askedAt,
      spaceName: spaces.name,
    })
    .from(questions)
    .leftJoin(spaces, eq(spaces.id, questions.spaceId))
    .where(eq(questions.communityId, c.id))
    .orderBy(desc(questions.askedAt))
    .limit(15);
  return { community: c, openQuestions, repliesWaiting, unanswered, discovered, entries, announcementsWaiting, planWaiting, emailsWaiting, casesOpen, guestsWaiting, recent };
}

export async function cardLists() {
  const c = await community();
  const all = await db().select().from(cards).where(eq(cards.communityId, c.id)).orderBy(desc(cards.createdAt)).limit(200);
  const ids = all.map((x) => x.id);
  const asked = ids.length
    ? await db()
        .select({ cardId: questions.cardId, askerName: questions.askerName, text: questions.text, resolution: questions.resolution, roomId: questions.roomId })
        .from(questions)
        .where(inArray(questions.cardId, ids))
    : [];
  const byCard = new Map<string, typeof asked>();
  for (const q of asked) {
    if (!q.cardId) continue;
    byCard.set(q.cardId, [...(byCard.get(q.cardId) ?? []), q]);
  }
  const owners = await db().select({ id: crewMembers.id, name: crewMembers.name }).from(crewMembers).where(eq(crewMembers.communityId, c.id));
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const withPeople = all.map((x) => ({ ...x, askers: byCard.get(x.id) ?? [], ownerNames: x.ownerIds.map((id) => ownerName.get(id) ?? "?") }));
  return {
    openQuestions: withPeople.filter((x) => x.status === "open" && x.kind === "question"),
    repliesWaiting: withPeople.filter((x) => x.status === "open" && x.kind === "reply"),
    answered: withPeople.filter((x) => x.status === "answered" && (x.kind === "question" || x.kind === "reply")).slice(0, 30),
    unanswered: withPeople.filter((x) => x.status === "expired" && x.kind === "question"),
    dismissed: withPeople.filter((x) => (x.kind === "question" || x.kind === "reply") && (x.status === "dismissed" || (x.status === "expired" && x.kind === "reply"))).slice(0, 30),
  };
}

export async function crewFor(communityId: string, eventId: string | null) {
  return db()
    .select()
    .from(crewMembers)
    .where(and(eq(crewMembers.communityId, communityId), eventId ? eq(crewMembers.eventId, eventId) : isNull(crewMembers.eventId)))
    .orderBy(asc(crewMembers.name));
}

export async function muted(communityId: string) {
  return db().select().from(mutedPeople).where(eq(mutedPeople.communityId, communityId)).orderBy(asc(mutedPeople.username));
}

export async function knowledgeList(communityId: string, opts: { q?: string; archived?: boolean }) {
  const q = opts.q?.trim();
  return db()
    .select({
      id: knowledgeEntries.id,
      key: knowledgeEntries.key,
      eventId: knowledgeEntries.eventId,
      sourceKind: knowledgeEntries.sourceKind,
      sourceTitle: knowledgeEntries.sourceTitle,
      heading: knowledgeEntries.heading,
      body: knowledgeEntries.body,
      version: knowledgeEntries.version,
      archivedAt: knowledgeEntries.archivedAt,
      updatedAt: knowledgeEntries.updatedAt,
      createdBy: knowledgeEntries.createdBy,
      position: knowledgeEntries.position,
    })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.communityId, communityId),
        opts.archived ? undefined : isNull(knowledgeEntries.archivedAt),
        q ? sql`(${knowledgeEntries.heading} ilike ${`%${q}%`} or ${knowledgeEntries.body} ilike ${`%${q}%`} or ${knowledgeEntries.sourceTitle} ilike ${`%${q}%`})` : undefined,
      ),
    )
    .orderBy(asc(knowledgeEntries.sourceTitle), asc(knowledgeEntries.position), asc(knowledgeEntries.heading));
}

export async function entry(id: string) {
  const [row] = await db().select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).limit(1);
  return row ?? null;
}

export const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";

export function ago(d: Date | null | undefined): string {
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
