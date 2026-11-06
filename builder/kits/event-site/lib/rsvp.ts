import "server-only";
import { capacity } from "./event";
import { adminClient } from "./supabase";

/**
 * The guest list (spec 17). Every registration is going (has a spot), on the
 * waitlist, or cancelled (freed their spot). All writes use the secret key on
 * the server; participants only read their own row.
 */
export const STATUSES = ["going", "waitlist", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (s: unknown): s is Status => typeof s === "string" && (STATUSES as readonly string[]).includes(s);

/** What a participant fills in on /register. */
export interface Profile {
  name: string;
  email: string;
  role: string;
  team_status: string;
  team_name: string | null;
  dietary: string | null;
  consent: boolean;
}

/** One person on the guest list, as Ferri reads it. */
export interface Guest {
  id: string;
  name: string;
  email: string;
  team: string | null;
  status: Status;
  createdAt: string;
  statusAt: string | null;
}

export const GUEST_COLUMNS = "user_id, name, email, team_name, status, created_at, status_at";
export interface GuestRow {
  user_id: string;
  name: string;
  email: string;
  team_name: string | null;
  status: Status;
  created_at: string;
  status_at: string | null;
}
export const toGuest = (r: GuestRow): Guest => ({
  id: r.user_id,
  name: r.name,
  email: r.email,
  team: r.team_name,
  status: r.status,
  createdAt: r.created_at,
  statusAt: r.status_at,
});

const now = () => new Date().toISOString();
const PAGE = 1000;

/** Registrations (all, or one status), oldest first, past the API's 1000-row page. */
export async function allRegistrations<T>(columns: string, status?: Status): Promise<T[]> {
  const db = adminClient();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from("registrations").select(columns);
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at").order("user_id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** How many registrations have this status (all of them without one). */
export async function countOf(status?: Status): Promise<number> {
  let q = adminClient().from("registrations").select("*", { count: "exact", head: true });
  if (status) q = q.eq("status", status);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function counts(): Promise<Record<Status, number>> {
  const [going, waitlist, cancelled] = await Promise.all(STATUSES.map((s) => countOf(s)));
  return { going: going ?? 0, waitlist: waitlist ?? 0, cancelled: cancelled ?? 0 };
}

/** Full: every spot is taken, or people are already waiting (they go first). */
export async function isFull(): Promise<boolean> {
  if (capacity === null) return false;
  const c = await counts();
  return c.going >= capacity || c.waitlist > 0;
}

/** The waitlist's user ids in order: who joined it first comes first. */
export async function waitlistOrder(): Promise<string[]> {
  const rows = await allRegistrations<{ user_id: string; created_at: string; status_at: string | null }>("user_id, created_at, status_at", "waitlist");
  const t = (s: string | null) => (s ? Date.parse(s) : Number.POSITIVE_INFINITY);
  return rows
    .sort((a, b) => t(a.status_at) - t(b.status_at) || t(a.created_at) - t(b.created_at) || a.user_id.localeCompare(b.user_id))
    .map((r) => r.user_id);
}

/** This person's number on the waitlist (1 is next), or null if they are not on it. */
export async function waitlistNumber(userId: string): Promise<number | null> {
  const i = (await waitlistOrder()).indexOf(userId);
  return i < 0 ? null : i + 1;
}

/**
 * A spot if there is room and nobody is waiting before them, otherwise the end
 * of the waitlist. With a capacity, the database decides one person at a time
 * (`rsvp_seat`), so two people never both take the last spot.
 */
async function seat(userId: string): Promise<Status> {
  const db = adminClient();
  if (capacity === null) {
    const { error } = await db.from("registrations").update({ status: "going", status_at: now() }).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return "going";
  }
  const { data, error } = await db.rpc("rsvp_seat", { p_user: userId, p_capacity: capacity });
  if (error) throw new Error(error.message);
  return isStatus(data) ? data : "waitlist";
}

/**
 * Save a registration. A new one gets a spot or a place on the waitlist; an
 * existing one keeps its status and only its details change.
 */
export async function saveRegistration(userId: string, profile: Profile, retry = true): Promise<{ status: Status; created: boolean }> {
  const db = adminClient();
  const { data: before, error } = await db.from("registrations").select("status").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (before) {
    const { error: e } = await db.from("registrations").update(profile).eq("user_id", userId);
    if (e) throw new Error(e.message);
    return { status: isStatus(before.status) ? before.status : "going", created: false };
  }
  // With a capacity, a new row waits outside the list (no status_at) until seat() decides.
  const open = capacity === null;
  const { error: e } = await db
    .from("registrations")
    .insert({ user_id: userId, ...profile, status: open ? "going" : "waitlist", status_at: open ? now() : null });
  // A second click got there first: save the details on that row.
  if (e?.code === "23505" && retry) return saveRegistration(userId, profile, false);
  if (e) throw new Error(e.message);
  return { status: open ? "going" : await seat(userId), created: true };
}

/** A cancelled person registers again. Null if they were not cancelled. */
export async function rejoin(userId: string): Promise<{ status: Status; name: string; email: string } | null> {
  const { data, error } = await adminClient().from("registrations").select("status, name, email").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== "cancelled") return null;
  return { status: await seat(userId), name: data.name, email: data.email };
}

/** Free a spot or leave the waitlist. Null if there was nothing to cancel. */
export async function cancel(userId: string): Promise<{ was: Status; name: string; email: string } | null> {
  const db = adminClient();
  const { data: cur, error } = await db.from("registrations").select("status").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cur || cur.status === "cancelled") return null;
  const { data, error: e } = await db
    .from("registrations")
    .update({ status: "cancelled", status_at: now() })
    .eq("user_id", userId)
    .in("status", ["going", "waitlist"])
    .select("name, email");
  if (e) throw new Error(e.message);
  const row = data?.[0];
  return row ? { was: cur.status as Status, name: row.name, email: row.email } : null;
}

/** Set a status (Ferri's route). The same status again changes nothing. Null for an unknown person. */
export async function setStatus(userId: string, status: Status): Promise<GuestRow | null> {
  const db = adminClient();
  const { data: cur, error } = await db.from("registrations").select(GUEST_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cur) return null;
  if ((cur as GuestRow).status === status) return cur as GuestRow;
  const { data, error: e } = await db.from("registrations").update({ status, status_at: now() }).eq("user_id", userId).select(GUEST_COLUMNS).maybeSingle();
  if (e) throw new Error(e.message);
  return (data as GuestRow | null) ?? null;
}
