#!/usr/bin/env node
/**
 * Make the background art for a poster job with the OpenAI Images API.
 *
 *   node <kit>/scripts/art.mjs --job <job folder> [--prompt "..."] [--size 1024x1536] [--name background] [--again]
 *
 * Background art only: the prompt always forbids text, letters, numbers and
 * logos, because the words are drawn exactly by render.mjs. One call makes
 * art/<name>.png. Each call is logged in art/calls.json, and the script
 * refuses more than `maxCallsPerJob` calls per job folder (images cost money).
 *
 * Settings come from `.ferri/studio.json` in the Builder's folder (model,
 * quality, maxCallsPerJob); the key from OPENAI_API_KEY. The key is never
 * printed. With no key, or when the call fails, it says so and exits 3: the
 * render then uses the kit's own background, and the report must say that.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : null;
};
const jobDir = path.resolve(typeof flag("job") === "string" ? flag("job") : process.cwd());
const name = typeof flag("name") === "string" ? flag("name").replace(/[^a-z0-9-]/gi, "") : "background";
const size = typeof flag("size") === "string" ? flag("size") : "1024x1536";
if (!/^\d+x\d+$|^auto$/.test(size)) stop(1, `--size must be WIDTHxHEIGHT (1024x1536, 1536x1024, 1024x1024), got ${size}.`);

// Settings: the nearest .ferri/studio.json above the job folder.
function findSettings(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const f = path.join(dir, ".ferri", "studio.json");
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
    if (path.dirname(dir) === dir) return {};
  }
}
const settings = findSettings(jobDir);
const model = settings.model ?? "gpt-image-2.6-flare";
const quality = settings.quality ?? "medium";
const maxCalls = Number(settings.maxCallsPerJob ?? 2);

let prompt = typeof flag("prompt") === "string" ? flag("prompt") : null;
if (!prompt) {
  const designFile = path.join(jobDir, "design.json");
  if (fs.existsSync(designFile)) prompt = JSON.parse(fs.readFileSync(designFile, "utf8")).artPrompt ?? null;
}
if (!prompt) stop(1, 'No prompt: pass --prompt "..." or set "artPrompt" in design.json.');

const artDir = path.join(jobDir, "art");
fs.mkdirSync(artDir, { recursive: true });
const logFile = path.join(artDir, "calls.json");
const calls = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
const out = path.join(artDir, `${name}.png`);
if (fs.existsSync(out) && !flag("again")) stop(0, `art/${name}.png is already there; reusing it (pass --again for a new one).`);
if (calls.length >= maxCalls) stop(4, `This job already made ${calls.length} image call(s), the most allowed per job (${maxCalls}). Reuse the art you have.`);

const key = process.env.OPENAI_API_KEY;
if (!key) stop(3, "No OPENAI_API_KEY in this session, so no generated art: the render uses the kit's own background. Say so in the report.");

const fullPrompt = [
  prompt.trim(),
  "",
  "This is background art for an event poster. Absolutely no text, letters, numbers, words, signs, captions, logos or watermarks anywhere in the image.",
  "Keep the lower half calm, darker and low in detail, so text can be placed over it. Rich colour, high quality, no borders or frames.",
].join("\n");

const started = Date.now();
let res;
try {
  res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: fullPrompt, size, quality, n: 1 }),
    signal: AbortSignal.timeout(240_000),
  });
} catch (err) {
  log({ ok: false, error: String(err?.message ?? err) });
  stop(3, `The image call did not complete (${err?.message ?? err}). The render uses the kit's own background; say so in the report.`);
}
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  const msg = body?.error?.message ?? `HTTP ${res.status}`;
  log({ ok: false, status: res.status, error: msg });
  stop(3, `The image call failed: ${msg}. The render uses the kit's own background; say so in the report.`);
}
const b64 = body?.data?.[0]?.b64_json;
if (!b64) {
  log({ ok: false, status: res.status, error: "no image in the answer" });
  stop(3, "The image call answered without an image. The render uses the kit's own background; say so in the report.");
}
fs.writeFileSync(out, Buffer.from(b64, "base64"));
log({ ok: true, file: `art/${name}.png`, usage: body.usage ?? null });
console.log(`Made art/${name}.png with ${model} (${size}, ${quality}) in ${Math.round((Date.now() - started) / 1000)} s. Image calls for this job: ${calls.length} of ${maxCalls}.`);

function log(entry) {
  calls.push({ at: new Date().toISOString(), model, size, quality, name, ms: Date.now() - started, prompt: prompt.slice(0, 500), ...entry });
  fs.writeFileSync(logFile, JSON.stringify(calls, null, 2));
}

function stop(code, msg) {
  (code === 0 ? console.log : console.error)(`art: ${msg}`);
  process.exit(code);
}
