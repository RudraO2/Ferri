import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { community, db } from "./db";
import { announcementPosts, announcementTargets, announcementVersions, announcements, cards, events, type TargetSpace } from "./ferri";

/** The card option Ferri reads as "post it" (or, for a later version, "edit everywhere"). */
export const ANNOUNCE_POST_OPTION = "post";

export type AnnouncementRow = typeof announcements.$inferSelect;
export type VersionRow = typeof announcementVersions.$inferSelect;
export type PostRow = typeof announcementPosts.$inferSelect;

export interface AnnouncementView extends AnnouncementRow {
  eventName: string | null;
  versions: VersionRow[];
  posts: PostRow[];
  /** The version waiting for its OK, with its open card. */
  waiting: (VersionRow & { cardId: string }) | null;
  targets: TargetSpace[];
}

/** Every announcement of the community, newest first, with versions, posts and targets. */
export async function announcementList(limit = 60): Promise<AnnouncementView[]> {
  const c = await community();
  const rows = await db()
    .select({ a: announcements, eventName: events.name })
    .from(announcements)
    .leftJoin(events, eq(events.id, announcements.eventId))
    .where(eq(announcements.communityId, c.id))
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.a.id);
  if (!ids.length) return [];
  const versions = await db().select().from(announcementVersions).where(inArray(announcementVersions.announcementId, ids)).orderBy(asc(announcementVersions.version));
  const posts = await db().select().from(announcementPosts).where(inArray(announcementPosts.announcementId, ids)).orderBy(asc(announcementPosts.platform), asc(announcementPosts.spaceName));
  const openCards = await db()
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.status, "open"), eq(cards.kind, "announce"), inArray(cards.announcementId, ids)));
  const open = new Set(openCards.map((x) => x.id));
  const targetsByEvent = new Map<string, TargetSpace[]>();
  const out: AnnouncementView[] = [];
  for (const { a, eventName } of rows) {
    const vs = versions.filter((v) => v.announcementId === a.id);
    const w = vs.find((v) => v.status === "waiting" && v.cardId && open.has(v.cardId));
    const key = a.eventId ?? "";
    if (!targetsByEvent.has(key)) targetsByEvent.set(key, await announcementTargets(db(), a.eventId));
    const all = targetsByEvent.get(key)!;
    out.push({
      ...a,
      eventName,
      versions: vs,
      posts: posts.filter((p) => p.announcementId === a.id),
      waiting: w ? { ...w, cardId: w.cardId! } : null,
      targets: a.targetSpaceIds?.length ? all.filter((t) => a.targetSpaceIds!.includes(t.spaceId)) : all,
    });
  }
  return out;
}

export async function announcementFor(cardId: string): Promise<AnnouncementView | null> {
  const [card] = await db().select({ announcementId: cards.announcementId }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card?.announcementId) return null;
  return (await announcementList(200)).find((a) => a.id === card.announcementId) ?? null;
}

/** Announce card: unchanged (or empty) text approves Ferri's draft; anything else posts the organizer's version. */
export async function announceAnswer(cardId: string, text: string): Promise<{ selected: string[]; text: string | null }> {
  const [card] = await db().select({ draft: cards.draftText }).from(cards).where(eq(cards.id, cardId)).limit(1);
  const unchanged = !text || text === (card?.draft ?? "").trim();
  return unchanged ? { selected: [ANNOUNCE_POST_OPTION], text: null } : { selected: [], text };
}

/** A `datetime-local` value ("2026-11-21T18:00") read as a time in the community's zone. */
export function zonedTime(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment: format the guess in the zone and compare.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (shown - guess));
}

export const STATUS_LABEL: Record<string, string> = {
  requested: "opening its card",
  waiting: "waiting for an OK",
  scheduled: "approved, scheduled",
  sent: "posted",
  dismissed: "not posted",
  expired: "not approved in time",
  missed: "missed its time",
};

export const POST_LABEL: Record<string, string> = {
  posted: "posted",
  edited: "edited in place",
  reposted: "posted again as an update",
  failed: "failed",
  skipped: "skipped",
};
