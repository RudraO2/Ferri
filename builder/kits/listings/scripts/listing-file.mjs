/**
 * listing.json: the facts the Builder writes from the room's documents, one
 * file per job. Checked before anything is typed into a public form.
 */
import fs from "node:fs";
import path from "node:path";
import { placeholders } from "./lib.mjs";
import { isValidZone, parseLocal } from "./when.mjs";

export const FIELDS = {
  platform: "luma, generic, ... (the recipe)",
  name: "the event's name exactly as the documents write it",
  start: "local start, 2026-11-21T10:00",
  end: "local end, 2026-11-22T18:00",
  timezone: "IANA zone, Asia/Kolkata",
  venue: "the address as one line, or null for an online event",
  online: "the join link for an online event, else null",
  description: "plain text, short paragraphs separated by a blank line; the site's address in it",
  url: "the event's own site (https://...), or null",
  visibility: "public or private (private: only people with the link)",
  capacity: "a number, or null for no limit",
  cover: "path to a square JPEG or PNG (the poster's square card), or null",
};

/** Problems with a listing, in plain words (empty when it is fine to fill). */
export function checkListing(l, baseDir = process.cwd()) {
  const out = [];
  if (!l || typeof l !== "object") return ["listing.json is not an object."];
  if (!l.platform) out.push('"platform" is missing.');
  if (!l.name || typeof l.name !== "string") out.push('"name" is missing.');
  else if (l.name.length > 140) out.push('"name" is longer than 140 characters.');
  const s = parseLocal(l.start);
  const e = parseLocal(l.end);
  if (!s) out.push('"start" must be a local time like 2026-11-21T10:00.');
  if (!e) out.push('"end" must be a local time like 2026-11-22T18:00.');
  if (s && e && String(l.end) <= String(l.start)) out.push('"end" must be after "start".');
  if (!l.timezone || !isValidZone(l.timezone)) out.push('"timezone" must be an IANA zone like Asia/Kolkata.');
  if (!l.venue && !l.online) out.push('Give a "venue" (address) or an "online" link.');
  if (l.online && !/^https:\/\//.test(l.online)) out.push('"online" must be an https:// link.');
  if (l.url && !/^https:\/\//.test(l.url)) out.push('"url" must be an https:// link.');
  if (l.visibility && !["public", "private"].includes(l.visibility)) out.push('"visibility" is public or private.');
  if (l.capacity != null && !(Number.isInteger(l.capacity) && l.capacity > 0)) out.push('"capacity" is a whole number or null.');
  if (l.cover) {
    const p = path.resolve(baseDir, l.cover);
    if (!fs.existsSync(p)) out.push(`"cover" file not found: ${l.cover}`);
    else if (!/\.(jpe?g|png)$/i.test(p)) out.push('"cover" must be a JPEG or PNG.');
  }
  for (const p of placeholders(l)) out.push(`Placeholder, not a fact: ${p}`);
  return out;
}

export function coverPath(l, baseDir) {
  return l.cover ? path.resolve(baseDir, l.cover) : null;
}

/** The description as paragraphs (blank-line separated). */
export function paragraphs(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}
