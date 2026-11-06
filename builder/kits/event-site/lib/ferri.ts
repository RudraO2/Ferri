import "server-only";
import { event } from "./event";

export type FerriEvent =
  | { type: "registration"; count: number; name: string }
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
