import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "./db";
import { communities, events, guests, type Guest } from "./ferri";

// ── The guest's own RSVP page (spec 17), public, no sign-in ───────────────

export type RsvpAnswer = "yes" | "no" | "take";
/** Where the guest stands: their status, with a waitlist spot offer that is still open told apart. */
export type RsvpState = "going" | "pending" | "offer" | "waitlist" | "not_going";

export const RSVP_STATES: RsvpState[] = ["going", "pending", "offer", "waitlist", "not_going"];

export function rsvpState(g: Pick<Guest, "status" | "offeredAt" | "offerExpiresAt">, now = new Date()): RsvpState {
  if (g.status === "waitlist") return g.offeredAt && g.offerExpiresAt && g.offerExpiresAt.getTime() > now.getTime() ? "offer" : "waitlist";
  if (g.status === "pending") return "pending";
  if (g.status === "not_going") return "not_going";
  return "going";
}

/** The answers the page offers in each state; the action accepts nothing else. */
export const RSVP_CHOICES: Record<RsvpState, RsvpAnswer[]> = {
  going: ["yes", "no"],
  pending: ["yes", "no"],
  offer: ["take", "no"],
  waitlist: ["no"],
  not_going: ["yes"],
};

/** Codes are short lowercase letters and digits. */
export const cleanCode = (raw: string) => {
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9]{4,40}$/.test(v) ? v : null;
};

/** The guest behind a code, with their event and community (once per request). */
export const rsvpGuest = cache(async (rawCode: string) => {
  const code = cleanCode(rawCode);
  if (!code) return null;
  const [row] = await db()
    .select({ guest: guests, event: events, communityName: communities.name, timezone: communities.timezone })
    .from(guests)
    .innerJoin(events, eq(events.id, guests.eventId))
    .innerJoin(communities, eq(communities.id, guests.communityId))
    .where(eq(guests.code, code))
    .limit(1);
  return row ?? null;
});

/** "Saturday 21 November 2026, 10:00 AM to 6:00 PM" in the community's timezone. */
export function eventWhen(start: Date | null, end: Date | null, timeZone: string): string | null {
  if (!start) return null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  if (!end) return `${day(start)}, ${time(start)}`;
  return day(end) === day(start) ? `${day(start)}, ${time(start)} to ${time(end)}` : `${day(start)}, ${time(start)} to ${day(end)}, ${time(end)}`;
}

/** "Sunday 8 November, 6:30 PM" for an offer's deadline. */
export function deadline(d: Date, timeZone: string): string {
  const day = d.toLocaleDateString("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" });
  return `${day}, ${d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" })}`;
}
