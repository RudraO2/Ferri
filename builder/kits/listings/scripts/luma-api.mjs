#!/usr/bin/env node
/**
 * Luma through its public API (needs Luma Plus on the calendar and an API key
 * from luma.com/calendar/manage/api-keys, saved in .ferri/listings.json as
 * luma.apiKey). The key is never printed.
 *
 *   node <kit>/scripts/luma-api.mjs check                       whose key is it (read only)
 *   node <kit>/scripts/luma-api.mjs body   --job <job folder>   print the request create would send (no call)
 *   node <kit>/scripts/luma-api.mjs create --job <job folder>   create the event (a public step: asks on a card)
 *
 * --base <url> points at another server (a stand-in for tests).
 * Exit 3: no key (use the browser path). Writes result.json like publish.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { checkListing, coverPath, paragraphs } from "./listing-file.mjs";
import { EXIT, args, jobDir, readJson, settings, stop, writeJson } from "./lib.mjs";
import { toUtcIso } from "./when.mjs";

const { positional, flags } = args();
const cmd = positional[0];
const s = settings(typeof flags.job === "string" ? flags.job : process.cwd());
const base = (typeof flags.base === "string" ? flags.base : s.luma.baseUrl ?? "https://public-api.luma.com").replace(/\/+$/, "");
const key = s.luma.apiKey ?? null;

async function call(method, route, body) {
  const r = await fetch(`${base}${route}`, {
    method,
    headers: { "x-luma-api-key": key, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!r.ok) {
    const msg = json?.message ?? json?.error ?? text.slice(0, 200);
    const plus = r.status === 401 || r.status === 403 ? " (the key is wrong, or the calendar has no Luma Plus)" : "";
    throw new Error(`Luma ${method} ${route}: ${r.status}${plus}: ${msg}`);
  }
  return json;
}

/** The create request for a listing.json (exported for the kit's own check). */
function createBody(l, cover) {
  const body = {
    name: l.name,
    start_at: toUtcIso(l.start, l.timezone),
    end_at: toUtcIso(l.end, l.timezone),
    timezone: l.timezone,
    description_md: paragraphs(l.description).join("\n\n"),
    visibility: l.visibility === "private" ? "private" : "public",
  };
  if (l.venue) body.geo_address_json = { type: "manual", address: l.venue };
  else if (l.online) body.meeting_url = l.online;
  if (l.capacity) body.max_capacity = l.capacity;
  if (cover) body.cover_url = cover;
  return body;
}

if (cmd === "check" || cmd === "create") {
  if (!key) stop(EXIT.noKey, "No Luma API key in .ferri/listings.json (luma.apiKey). Luma's API needs Luma Plus on the calendar; use the browser path (listing.mjs fill, then publish.mjs).");
}

if (cmd === "check") {
  const me = await call("GET", "/v1/users/get-self").catch((err) => stop(EXIT.error, err.message));
  stop(EXIT.ok, `The Luma key works: ${me?.user?.name ?? me?.name ?? "a Luma user"}.`);
}

if (cmd === "body" || cmd === "create") {
  const dir = jobDir(flags);
  const l = readJson(path.join(dir, "listing.json"), "listing.json");
  const problems = checkListing(l, dir);
  if (problems.length) stop(EXIT.usage, `listing.json is not ready, so nothing was sent:\n- ${problems.join("\n- ")}`);
  if (cmd === "body") {
    console.log(JSON.stringify(createBody(l, l.cover ? "<uploaded to images.lumacdn.com>" : null), null, 2));
    process.exit(EXIT.ok);
  }
  let cover = null;
  const file = coverPath(l, dir);
  if (file) {
    const type = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    const up = await call("POST", "/v1/images/create-upload-url", { content_type: type }).catch((err) => stop(EXIT.error, err.message));
    const put = await fetch(up.upload_url, { method: "PUT", headers: { "content-type": type }, body: fs.readFileSync(file), signal: AbortSignal.timeout(60_000) });
    if (!put.ok) stop(EXIT.error, `Uploading the cover failed: ${put.status}.`);
    cover = up.file_url;
  }
  const created = await call("POST", "/v1/events/create", createBody(l, cover)).catch((err) => stop(EXIT.error, err.message));
  const id = created?.id ?? created?.event?.id ?? created?.api_id;
  if (!id) stop(EXIT.error, "Luma created something but returned no event id.");
  const got = await call("GET", `/v1/events/get?event_id=${encodeURIComponent(id)}`).catch(() => null);
  const ev = got?.event ?? got ?? {};
  const url = ev.url ? (/^https?:/.test(ev.url) ? ev.url : `https://luma.com/${String(ev.url).replace(/^\/+/, "")}`) : null;
  writeJson(path.join(dir, "result.json"), {
    platform: "luma",
    via: "api",
    id,
    url,
    manageUrl: `https://luma.com/event/manage/${id}`,
    publishedAt: new Date().toISOString(),
    screenshot: null,
  });
  console.log(`Published on Luma: ${url ?? "(address not returned)"}`);
  console.log(`Manage: https://luma.com/event/manage/${id}`);
  process.exit(EXIT.ok);
}

stop(EXIT.usage, "Usage: luma-api.mjs check | body --job <folder> | create --job <folder> [--base <url>]");
