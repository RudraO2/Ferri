import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  cards,
  eventPartners,
  events,
  kitForEvent,
  latestRecap,
  listKits,
  pendingWrapRequests,
  recapStats,
  type EventRecap,
  type RecapStats,
  type StarterKit,
  type StarterKitContent,
  type WrapCardPayload,
} from "./ferri";

// ── Wrap (spec 19) in Desk ─────────────────────────────────────────────────

export type EventRow = typeof events.$inferSelect;

/** Every event of the community, live first (newest first), then closed (most recently closed first). */
export async function wrapEvents(communityId: string): Promise<EventRow[]> {
  const all = await db().select().from(events).where(eq(events.communityId, communityId)).orderBy(desc(events.createdAt));
  const live = all.filter((e) => !e.closedAt);
  const closed = all.filter((e) => e.closedAt).sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
  return [...live, ...closed];
}

/** The event a page shows: ?event=slug, else the newest live one, else the newest closed one. */
export function pickEvent(list: EventRow[], slug: string | undefined): EventRow | null {
  return list.find((e) => e.slug === slug) ?? list[0] ?? null;
}

export interface WrapView {
  event: EventRow;
  stats: RecapStats;
  recap: EventRecap | null;
  partners: Awaited<ReturnType<typeof eventPartners>>;
  kit: StarterKit | null;
  kitContent: StarterKitContent | null;
  /** The open close card (answered through the Gateway as the signed-in person). */
  card: { id: string; moveTo: string | null; moveToName: string | null } | null;
  /** What Desk asked Ferri for that Ferri has not picked up yet. */
  pending: string[];
  /** Live events the spaces could move to, newest first. */
  others: EventRow[];
}

const REQUEST_LABEL: Record<string, string> = { close: "closing", reopen: "reopening", recap: "a fresh recap", kit: "the starter kit", partners: "saving the partners" };

export async function wrapView(event: EventRow, all: EventRow[]): Promise<WrapView> {
  const [stats, recap, partners, kit, cardRows, pending] = await Promise.all([
    recapStats(db(), event.id),
    latestRecap(db(), event.id),
    eventPartners(db(), event.id),
    kitForEvent(db(), event.id),
    db()
      .select()
      .from(cards)
      .where(and(eq(cards.eventId, event.id), eq(cards.kind, "wrap"), eq(cards.status, "open")))
      .limit(1),
    pendingWrapRequests(db(), event.id),
  ]);
  const c = cardRows[0];
  const p = (c?.payload ?? null) as WrapCardPayload | null;
  return {
    event,
    stats,
    recap,
    partners,
    kit,
    kitContent: (kit?.content ?? null) as StarterKitContent | null,
    card: c ? { id: c.id, moveTo: p?.moveTo ?? null, moveToName: p?.moveToName ?? null } : null,
    pending: pending.map((r) => `${REQUEST_LABEL[r.action] ?? r.action} (asked by ${r.by})`),
    others: all.filter((e) => !e.closedAt && e.id !== event.id),
  };
}

/** Closed events with their kits, for the Events page. */
export async function closedWithKits(communityId: string) {
  const [all, kits] = await Promise.all([wrapEvents(communityId), listKits(db(), communityId)]);
  const byEvent = new Map(kits.map((k) => [k.fromEventId, k]));
  return { closed: all.filter((e) => e.closedAt).map((e) => ({ event: e, kit: byEvent.get(e.id) ?? null })), kits };
}

/** The tiles on the Wrap page: label, number, a short note. Only tiles with something to show. */
export function statTiles(s: RecapStats): { label: string; value: string; note?: string }[] {
  const t: { label: string; value: string; note?: string }[] = [];
  const q = s.questions;
  t.push({ label: "Questions", value: String(q.asked), note: q.people ? `from ${q.people} ${q.people === 1 ? "person" : "people"}` : undefined });
  t.push({ label: "Answered by Ferri", value: String(q.answeredByFerri), note: q.medianFerriSeconds !== null ? `median ${q.medianFerriSeconds} s` : undefined });
  t.push({ label: "Answered by the crew", value: String(q.answeredByCrew), note: q.medianCrewMinutes !== null ? `median ${q.medianCrewMinutes} min` : undefined });
  t.push({ label: "Still unanswered", value: String(q.unanswered) });
  if (s.knowledge.crewAnswers) t.push({ label: "Knowledge learned", value: String(s.knowledge.crewAnswers), note: "crew answers saved" });
  if (s.cards.opened) t.push({ label: "Cards", value: String(s.cards.opened), note: `${s.cards.answered} answered, ${s.cards.expired} expired` });
  if (s.announcements.sent) t.push({ label: "Announcements", value: String(s.announcements.sent), note: `to ${s.announcements.spaces} spaces` });
  if (s.care.cases) t.push({ label: "Care cases", value: String(s.care.cases), note: `${s.care.solved} solved, ${s.care.open} open` });
  if (s.guests.registered) t.push({ label: "Guests", value: String(s.guests.registered), note: `${s.guests.going} going, ${s.guests.checkedIn} checked in` });
  if (s.guestEmails.sends) t.push({ label: "Guest emails", value: String(s.guestEmails.mails), note: `${s.guestEmails.delivered} delivered` });
  if (s.outreach.emailed || s.outreach.replies) t.push({ label: "Outreach", value: String(s.outreach.emailed), note: `${s.outreach.replies} replies, ${s.outreach.interested} interested or partner${s.outreach.declined ? `, ${s.outreach.declined} declined` : ""}` });
  if (s.builder.done) t.push({ label: "Builder jobs", value: String(s.builder.done) });
  if (s.shield.checks) t.push({ label: "Shield checks", value: String(s.shield.checks), note: `${s.shield.blocked} blocked, ${s.shield.redacted} redacted` });
  t.push({ label: "Spaces", value: String(s.spaces.count) });
  return t;
}
