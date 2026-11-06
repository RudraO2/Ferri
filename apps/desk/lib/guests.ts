import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { zonedTime } from "./announce";
import { community, db } from "./db";
import { SEND_KIND_LABEL, cards, crewForSwitchEmail, events, formatWhen, guestCounts, guestSends, guests, type Guest, type GuestSend } from "./ferri";
import type { DeskUser } from "./session";

// ── RSVP (spec 17) in Desk and Pocket: guest cards, sends, the list ───────

/** The card kinds of spec 17: an email to guests waiting for its OK, and a freed spot to offer. */
export const GUEST_CARD_KINDS = ["guests", "spot"] as const;
/** A spot card's option Ferri reads as "offer the spot to this guest". */
export const SPOT_OFFER_OPTION = "offer";

/** What a new send can be: the kind and who it goes to. */
export const SEND_CHOICES = [
  { value: "reminder:going", kind: "reminder", audience: "going", label: "Reminder to everyone going" },
  { value: "reminder:waitlist", kind: "reminder", audience: "waitlist", label: "Reminder to the waitlist" },
  { value: "nudge:going", kind: "nudge", audience: "going", label: "Free-your-spot nudge to everyone going" },
] as const;

export const SEND_STATUS_LABEL: Record<string, string> = {
  requested: "drafting",
  drafting: "drafting",
  waiting: "waiting for an OK",
  scheduled: "approved, scheduled",
  sending: "sending",
  sent: "sent",
  dismissed: "not sent",
  expired: "not approved in time",
  failed: "failed",
};

export const SYNC_SOURCE_LABEL: Record<string, string> = { site: "Event site", luma: "Luma" };

export const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** "42 people going", "5 people on the waitlist", "3 people". */
export function audienceLine(audience: string, n: number | null): string {
  const who = n === null ? "everyone" : people(n);
  if (audience === "waitlist") return n === null ? "everyone on the waitlist" : `${who} on the waitlist`;
  if (audience === "listed") return n === null ? "the chosen guests" : who;
  return n === null ? "everyone going" : `${who} going`;
}

/** "6 Nov, 14:05" in the community's timezone. */
export function shortWhen(d: Date | null | undefined, timeZone: string): string {
  if (!d) return "—";
  const day = d.toLocaleDateString("en-GB", { timeZone, day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${day}, ${time}`;
}

/**
 * Desk's public address, for guests' RSVP links: FERRI_PUBLIC_URL (what
 * Ferri's emails use), else the address this page was opened on.
 */
export async function publicBase(): Promise<string> {
  const env = process.env.FERRI_PUBLIC_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Keep only the `evt-...` id of a Luma event (a manage URL, an event URL or
 * the id itself). Without one, the text as given.
 */
export function lumaEventIdFrom(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  return /\bevt-[A-Za-z0-9]+/.exec(v)?.[0] ?? v;
}

// ── Cards waiting for an OK ───────────────────────────────────────────────

export interface GuestCardInfo {
  send: Pick<GuestSend, "id" | "kind" | "audience" | "subject" | "ask" | "scheduledAt" | "requestedBy" | "origin" | "total" | "guestIds" | "status"> | null;
  guest: Pick<Guest, "id" | "name" | "email" | "status" | "registeredAt" | "offeredAt" | "offerExpiresAt"> | null;
  eventId: string | null;
  eventName: string | null;
  /** How many guests the email goes to (right now, for a send to everyone going or waiting). */
  count: number | null;
}

/** The send, guest and event behind each guests or spot card. */
export async function guestCardInfo(rows: { id: string; kind: string; guestSendId: string | null; guestId: string | null; eventId: string | null }[]): Promise<Map<string, GuestCardInfo>> {
  const mine = rows.filter((r) => r.kind === "guests" || r.kind === "spot");
  const out = new Map<string, GuestCardInfo>();
  if (!mine.length) return out;
  const sendIds = mine.map((r) => r.guestSendId).filter((x): x is string => !!x);
  const guestIds = mine.map((r) => r.guestId).filter((x): x is string => !!x);
  const sends = sendIds.length ? await db().select().from(guestSends).where(inArray(guestSends.id, sendIds)) : [];
  const gs = guestIds.length ? await db().select().from(guests).where(inArray(guests.id, guestIds)) : [];
  const sendBy = new Map(sends.map((s) => [s.id, s]));
  const guestBy = new Map(gs.map((g) => [g.id, g]));
  const eventOf = (r: (typeof mine)[number]) => (r.guestSendId ? sendBy.get(r.guestSendId)?.eventId : undefined) ?? (r.guestId ? guestBy.get(r.guestId)?.eventId : undefined) ?? r.eventId ?? null;
  const eventIds = [...new Set(mine.map(eventOf).filter((x): x is string => !!x))];
  const evs = eventIds.length ? await db().select({ id: events.id, name: events.name }).from(events).where(inArray(events.id, eventIds)) : [];
  const eventName = new Map(evs.map((e) => [e.id, e.name]));
  const counts = new Map<string, Awaited<ReturnType<typeof guestCounts>>>();
  for (const r of mine) {
    const s = r.guestSendId ? (sendBy.get(r.guestSendId) ?? null) : null;
    const g = r.guestId ? (guestBy.get(r.guestId) ?? null) : null;
    const eventId = eventOf(r);
    let count: number | null = null;
    if (s) {
      if (s.audience === "listed") count = s.guestIds.length;
      else if (s.total) count = s.total;
      else if (eventId) {
        if (!counts.has(eventId)) counts.set(eventId, await guestCounts(db(), eventId));
        const c = counts.get(eventId)!;
        count = s.audience === "waitlist" ? c.waitlist : c.going;
      }
    } else if (g) count = 1;
    out.set(r.id, {
      send: s
        ? {
            id: s.id,
            kind: s.kind,
            audience: s.audience,
            subject: s.subject,
            ask: s.ask,
            scheduledAt: s.scheduledAt,
            requestedBy: s.requestedBy,
            origin: s.origin,
            total: s.total,
            guestIds: s.guestIds,
            status: s.status,
          }
        : null,
      guest: g ? { id: g.id, name: g.name, email: g.email, status: g.status, registeredAt: g.registeredAt, offeredAt: g.offeredAt, offerExpiresAt: g.offerExpiresAt } : null,
      eventId,
      eventName: eventId ? (eventName.get(eventId) ?? null) : null,
      count,
    });
  }
  return out;
}

/** Open guests and spot cards, oldest first, with what is behind them. */
export async function guestCardsWaiting() {
  const c = await community();
  const rows = await db()
    .select()
    .from(cards)
    .where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), inArray(cards.kind, [...GUEST_CARD_KINDS])))
    .orderBy(cards.createdAt);
  const info = await guestCardInfo(rows);
  return rows.map((r) => ({ card: r, info: info.get(r.id)! }));
}

/** The note after a guests card's OK: now, or at the send's scheduled time. */
export async function approvedNote(cardId: string, edited: boolean): Promise<string> {
  const c = await community();
  const [row] = await db()
    .select({ scheduledAt: guestSends.scheduledAt })
    .from(cards)
    .innerJoin(guestSends, eq(guestSends.id, cards.guestSendId))
    .where(eq(cards.id, cardId))
    .limit(1);
  const at = row?.scheduledAt && row.scheduledAt.getTime() > Date.now() ? ` at ${formatWhen(row.scheduledAt, c.timezone)}` : " now";
  return `${edited ? "Approved your version." : "Approved."} Ferri emails the guests${at}.`;
}

// ── A new send from Desk or Pocket ────────────────────────────────────────

/**
 * Ask Ferri for an email to guests: a `guest_sends` row in "requested". Ferri
 * drafts it from the knowledge and opens its card within seconds; nothing goes
 * out before one OK.
 */
export async function requestSend(
  user: DeskUser,
  input: { eventId: string; what: string; ask: string; when: string; origin: "desk" | "pocket" },
): Promise<{ ok: boolean; note: string }> {
  const c = await community();
  const choice = SEND_CHOICES.find((x) => x.value === input.what);
  if (!input.eventId) return { ok: false, note: "Pick the event first." };
  if (!choice) return { ok: false, note: "Pick what to send." };
  const scheduledAt = input.when ? zonedTime(input.when, c.timezone) : null;
  if (input.when && (!scheduledAt || scheduledAt.getTime() < Date.now() + 60_000))
    return { ok: false, note: "Pick a time at least a minute from now, or leave it empty to send once approved." };
  const counts = await guestCounts(db(), input.eventId);
  const n = choice.audience === "waitlist" ? counts.waitlist : counts.going;
  if (!n)
    return {
      ok: false,
      note: choice.audience === "waitlist" ? "Nobody is on the waitlist, so there is no one to send it to." : "Nobody is going yet, so there is no one to send it to.",
    };
  const who = (await crewForSwitchEmail(db(), c.id, user.email))[0] ?? null;
  await db()
    .insert(guestSends)
    .values({
      communityId: c.id,
      eventId: input.eventId,
      kind: choice.kind,
      audience: choice.audience,
      ask: input.ask || null,
      status: "requested",
      scheduledAt,
      requestedBy: who?.name ?? user.name,
      requestedById: who?.id ?? null,
      origin: input.origin,
    });
  return {
    ok: true,
    note: `Ferri is drafting the ${SEND_KIND_LABEL[choice.kind] ?? choice.kind} to ${audienceLine(choice.audience, n)}. Its card opens for an OK in a few seconds.`,
  };
}
