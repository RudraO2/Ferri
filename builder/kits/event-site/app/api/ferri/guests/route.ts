import { createHash, timingSafeEqual } from "node:crypto";
import { capacity, event } from "@/lib/event";
import { allRegistrations, GUEST_COLUMNS, type GuestRow, isStatus, setStatus, toGuest } from "@/lib/rsvp";

/**
 * Ferri's view of the guest list (spec 17), with the hook's shared secret.
 *   GET   every registration, oldest first.
 *   POST  { id, status }: set one person's status (how Ferri moves someone off
 *         the waitlist after the crew says yes). Sends no email; Ferri does.
 * Never cached: every call reads the database.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when the bearer matches FERRI_HOOK_SECRET; otherwise the answer to send. */
function refuse(req: Request): Response | null {
  const secret = process.env.FERRI_HOOK_SECRET ?? "";
  if (!secret) return json({ error: "The guest list is not set up on this site." }, 503);
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Compare digests, so neither the length nor the content leaks through timing.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return got && timingSafeEqual(digest(got), digest(secret)) ? null : json({ error: "unauthorized" }, 401);
}

const site = () => process.env.FERRI_SITE_ID ?? event.name;

export async function GET(req: Request) {
  const no = refuse(req);
  if (no) return no;
  try {
    const rows = await allRegistrations<GuestRow>(GUEST_COLUMNS);
    return json({ site: site(), capacity, guests: rows.map(toGuest) });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}

export async function POST(req: Request) {
  const no = refuse(req);
  if (no) return no;
  const raw = await req.text();
  if (raw.length > 2000) return json({ error: "too large" }, 413);
  let body: { id?: unknown; status?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({ error: "bad json" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "bad json" }, 400);
  if (!isStatus(body.status)) return json({ error: "status must be going, waitlist or cancelled" }, 400);
  if (typeof body.id !== "string" || !UUID.test(body.id)) return json({ error: "id must be a registration's user id" }, 400);
  try {
    const row = await setStatus(body.id, body.status);
    if (!row) return json({ error: "no such registration" }, 404);
    return json(toGuest(row));
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}
