import "server-only";
import { event } from "./event";
import type { Status } from "./rsvp";

export type FerriEvent =
  /** A new registration. `id` is the person's user id; `count` is every registration so far. */
  | { type: "registration"; id: string; email: string; name: string; status: Status; count: number }
  /** Someone freed their spot or left the waitlist. `count` is how many are going after it. */
  | { type: "cancelled"; id: string; email: string; name: string; count: number }
  /** Any other status change (a cancelled person registered again). */
  | { type: "status"; id: string; email: string; name: string; status: Status }
  | { type: "pool_low"; sponsor: string; left: number; lowAt: number }
  | { type: "pool_refilled"; sponsor: string; left: number };

/**
 * Tell Ferri what happened on the site, so the crew hears it in their room.
 * Never blocks the visitor: 3 seconds at most, errors are only logged.
 */
export async function tellFerri(e: FerriEvent): Promise<void> {
  const url = process.env.FERRI_HOOK_URL;
  const secret = process.env.FERRI_HOOK_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...e, site: process.env.FERRI_SITE_ID ?? event.name, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error("tellFerri failed:", (err as Error).message);
  }
}
