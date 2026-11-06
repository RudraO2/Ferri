#!/usr/bin/env node
/**
 * The kit checks itself without a browser or a real platform:
 * times, listing.json checks, and the Luma API path against a stand-in server.
 *
 *   node scripts/check.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { KIT, placeholders } from "./lib.mjs";
import { checkListing, paragraphs } from "./listing-file.mjs";
import { hhmm, lumaDate, toUtcIso } from "./when.mjs";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

t("local times to UTC", () => {
  assert.equal(toUtcIso("2026-11-21T10:00", "Asia/Kolkata"), "2026-11-21T04:30:00.000Z");
  assert.equal(toUtcIso("2026-07-01T09:00", "America/New_York"), "2026-07-01T13:00:00.000Z");
  assert.equal(toUtcIso("2026-12-01T09:00", "America/New_York"), "2026-12-01T14:00:00.000Z");
  assert.throws(() => toUtcIso("21 Nov 10am", "Asia/Kolkata"));
});

t("Luma's date and time formats", () => {
  assert.equal(lumaDate("2026-11-21T10:00"), "Sat, Nov 21");
  assert.equal(lumaDate("2027-03-13T17:30"), "Sat, Mar 13");
  assert.equal(hhmm("2026-11-21T09:05"), "09:05");
});

const example = JSON.parse(fs.readFileSync(path.join(KIT, "example", "listing.json"), "utf8"));
t("the example listing is ready", () => assert.deepEqual(checkListing(example, path.join(KIT, "example")), []));

t("placeholders and bad facts are refused", () => {
  const bad = { ...example, venue: "[venue address]", end: example.start, timezone: "Mars/Olympus", capacity: 0, url: "http://x" };
  const p = checkListing(bad, KIT);
  assert.ok(p.some((x) => x.includes("Placeholder") && x.includes("venue")));
  assert.ok(p.some((x) => x.includes('"end" must be after')));
  assert.ok(p.some((x) => x.includes("timezone")));
  assert.ok(p.some((x) => x.includes("capacity")));
  assert.ok(p.some((x) => x.includes('"url"')));
  assert.deepEqual(placeholders({ a: ["ok", "[date]"] }), ["a[1]: [date]"]);
});

t("description paragraphs", () => assert.deepEqual(paragraphs("One\nline.\n\nTwo."), ["One line.", "Two."]));

// The API path against a stand-in for public-api.luma.com.
const seen = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.setEncoding("latin1");
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/upload/cover") {
      seen.push({ method: req.method, url: req.url, bytes: body.length, type: req.headers["content-type"] });
      return res.writeHead(200).end();
    }
    seen.push({ method: req.method, url: req.url, key: req.headers["x-luma-api-key"], body: body ? JSON.parse(body) : null });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/images/create-upload-url" && req.headers["x-luma-api-key"] === "test-key")
      return res.end(JSON.stringify({ upload_url: `${base}/upload/cover`, file_url: "https://images.lumacdn.com/standin/cover.jpg" }));
    if (req.headers["x-luma-api-key"] !== "test-key") return res.writeHead(401).end(JSON.stringify({ message: "bad key" }));
    if (req.url === "/v1/users/get-self") return res.end(JSON.stringify({ user: { name: "Stand-in" } }));
    if (req.url === "/v1/events/create") return res.end(JSON.stringify({ id: "evt-standin1" }));
    if (req.url.startsWith("/v1/events/get")) return res.end(JSON.stringify({ event: { id: "evt-standin1", url: "standin1" } }));
    res.writeHead(404).end("{}");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "ferri-listings-"));
const job = path.join(home, "jobs", "X1-luma");
fs.mkdirSync(path.join(home, ".ferri"), { recursive: true });
fs.mkdirSync(job, { recursive: true });
fs.writeFileSync(path.join(job, "cover.jpg"), Buffer.alloc(2048, 7));
fs.writeFileSync(path.join(job, "listing.json"), JSON.stringify({ ...example, cover: "cover.jpg" }));
const api = (args, key) => {
  fs.writeFileSync(path.join(home, ".ferri", "listings.json"), JSON.stringify(key ? { luma: { apiKey: key } } : {}));
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(KIT, "scripts", "luma-api.mjs"), ...args, "--base", base], { cwd: home });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
};

let r = await api(["check"], null);
t("no key: exit 3 and the browser path named", () => {
  assert.equal(r.code, 3);
  assert.match(r.out, /browser path/);
});
r = await api(["check"], "zz-not-the-key-91");
t("a wrong key is refused with a Luma Plus hint, and never printed", () => {
  assert.equal(r.code, 1);
  assert.match(r.out, /Luma Plus/);
  assert.doesNotMatch(r.out, /zz-not-the-key-91/);
});
r = await api(["create", "--job", job], "test-key");
t("create sends the right request and writes result.json", () => {
  assert.equal(r.code, 0, r.out);
  const create = seen.find((s) => s.url === "/v1/events/create");
  assert.equal(create.method, "POST");
  assert.equal(create.key, "test-key");
  assert.deepEqual(create.body, {
    name: "Riverside Board Game Social",
    start_at: "2027-03-13T12:00:00.000Z",
    end_at: "2027-03-13T15:30:00.000Z",
    timezone: "Asia/Kolkata",
    description_md: "An evening of board games for beginners and regulars.\n\nRegister at https://example.org/board-games",
    visibility: "private",
    geo_address_json: { type: "manual", address: "Riverside Community Hall, 12 Example Lane, Pune" },
    max_capacity: 40,
    cover_url: "https://images.lumacdn.com/standin/cover.jpg",
  });
  const upload = seen.find((s) => s.url === "/upload/cover");
  assert.equal(upload.method, "PUT");
  assert.equal(upload.bytes, 2048);
  assert.equal(upload.type, "image/jpeg");
  const result = JSON.parse(fs.readFileSync(path.join(job, "result.json"), "utf8"));
  assert.equal(result.url, "https://luma.com/standin1");
  assert.equal(result.via, "api");
  assert.doesNotMatch(r.out, /test-key/);
});
server.close();
fs.rmSync(home, { recursive: true, force: true });
console.log(`${passed} checks passed.`);
