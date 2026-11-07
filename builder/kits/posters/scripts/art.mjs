#!/usr/bin/env node
/**
 * Make the background art for a poster job with the OpenAI Images API.
 *
 *   node <kit>/scripts/art.mjs --job <job folder> [--style gradient] [--prompt "..."] [--size 1536x1024] [--name background] [--again] [--show-prompt]
 *
 * Background art only, and designed, not a photo: every prompt is built from a
 * style preset (artStyle in design.json, or --style), the event's palette
 * (accent, ink, theme) and the motif (artPrompt), plus fixed rules: no people
 * or faces, no text, letters, numbers, signage or logos (render.mjs draws the
 * words exactly), no busy photoreal scenes, and calm negative space.
 *
 *   geometric     Swiss and Bauhaus shapes: tech, hack and build nights, maker events
 *   gradient      soft gradient-mesh light: talks, meetups, conferences, launches
 *   illustration  editorial flat illustration of one motif: food, music, film, games, outdoors, culture
 *   riso          risograph print on paper: workshops, zines, art, design, books, indie events
 *   custom        artPrompt as written (still with the rules); for a crew's own idea
 * Without artStyle the kit picks one from the event's words (said in the output).
 *
 * One call makes art/<name>.png. Each call is logged in art/calls.json, and the
 * script refuses more than `maxCallsPerJob` calls per job folder (images cost money).
 * --show-prompt prints the full prompt and makes no call.
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
// Landscape by default: the art fills a wide band on the tall formats and the hero of the event site.
const size = typeof flag("size") === "string" ? flag("size") : "1536x1024";
if (!/^\d+x\d+$|^auto$/.test(size)) stop(1, `--size must be WIDTHxHEIGHT (1536x1024, 1024x1536, 1024x1024), got ${size}.`);

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

const designFile = path.join(jobDir, "design.json");
const design = fs.existsSync(designFile) ? JSON.parse(fs.readFileSync(designFile, "utf8")) : {};
const str = (v) => (typeof v === "string" ? v.trim() : "");
const HEX = /^#[0-9a-f]{6}$/i;

let prompt = typeof flag("prompt") === "string" ? flag("prompt") : str(design.artPrompt) || null;
if (!prompt) stop(1, 'No prompt: pass --prompt "..." or set "artPrompt" in design.json (the motif, a few words).');

// ── Style presets ───────────────────────────────────────────────────────────
const STYLES = {
  geometric:
    "Style: abstract geometric poster art in the Swiss and Bauhaus tradition. A few large, bold, flat shapes (circles, half circles, arcs, bars, quarter rounds) placed on a clear grid, crisp vector edges, solid fills with at most a gentle gradient, a fine print grain. Confident, minimal and modern, like the identity a good design studio makes for an event.",
  gradient:
    "Style: soft gradient-mesh light. Large, smooth, blurred fields of colour that melt into each other, like coloured light through frosted glass, with one or two soft glowing forms and a fine film grain. Minimal, calm and premium, like the backdrop of a modern keynote.",
  illustration:
    "Style: editorial flat illustration, like a modern magazine cover or a museum poster. One simple, symbolic motif drawn with flat shapes and clean curves, a limited palette, a subtle paper texture and a lot of empty background. Not a scene, not a cartoon, no characters.",
  riso:
    "Style: risograph print. Two or three spot inks overprinting with slight misregistration, visible halftone dots and grain on warm off-white paper, simple bold cut-paper shapes. Handmade and warm, like an independent print studio's poster.",
  custom: "",
};
function pickStyle() {
  const words = `${str(design.event)} ${str(design.tagline)} ${prompt}`.toLowerCase();
  if (/\b(zine|print|poetry|poem|book|reading|comic|art|arts|craft|crafts|design|illustrat\w*|indie|sketch|drawing)\b/.test(words)) return "riso";
  if (/\b(hack\w*|build|builders?|code|coding|dev|devs|developers?|engineer\w*|ai|ml|data|cloud|web|robot\w*|hardware|maker\w*|startup\w*|tech|security|open source|game jam)\b/.test(words)) return "geometric";
  if (/\b(food|cook\w*|music|band|gig|film|movie|cinema|festival|garden\w*|nature|walk|run|running|sport\w*|game night|board games?|picnic|cultur\w*|dance|trek|cycling)\b/.test(words)) return "illustration";
  return "gradient";
}
const asked = str(typeof flag("style") === "string" ? flag("style") : design.artStyle).toLowerCase();
if (asked && !(asked in STYLES)) stop(1, `Unknown style "${asked}". Known: ${Object.keys(STYLES).join(", ")}.`);
const style = asked || pickStyle();

// ── Palette: the event's accent, ink and theme, named so the model follows it ─
const accent = HEX.test(str(design.accent)) ? str(design.accent) : "#F5A524";
const ink = HEX.test(str(design.ink)) ? str(design.ink) : "#0b0b10";
const paper = HEX.test(str(design.paper)) ? str(design.paper) : "#f4efe6";
const light = str(design.theme) === "light";
function colourName(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12 || d < 0.04) return l > 0.85 ? "off-white" : l < 0.15 ? "near-black" : "grey";
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const names = [[12, "red"], [25, "vermilion"], [35, "orange"], [48, "amber"], [62, "golden yellow"], [80, "yellow-green"], [150, "green"], [175, "teal"], [195, "cyan"], [230, "blue"], [260, "indigo"], [290, "violet"], [320, "magenta"], [345, "pink"], [361, "red"]];
  const base = names.find(([edge]) => hue < edge)[1];
  return `${l < 0.22 ? "very dark " : l < 0.35 ? "deep " : l > 0.8 ? "pale " : ""}${base}`;
}
const palette = light
  ? `Palette: mostly light, airy warm off-white (${paper}), with ${colourName(accent)} (${accent}) as the bold lead colour and ${colourName(ink)} (${ink}) for a few small dark accents. At most four colours in all, all in harmony with ${accent}.`
  : `Palette: mostly deep, dark tones close to ${colourName(ink)} (${ink}), with ${colourName(accent)} (${accent}) as the glowing lead colour and a touch of warm off-white. At most four colours in all, all in harmony with ${accent}.`;

const fullPrompt = [
  STYLES[style],
  style === "custom" ? prompt.trim() : `Motif: ${prompt.trim().replace(/\.$/, "")}. Treat it as a simple, symbolic idea, not a literal scene.`,
  palette,
  "Composition: this is a backdrop that will be cropped to a wide band and to a tall strip, so spread the forms across the whole frame with nothing important at the edges, and keep large calm areas of plain or softly graded colour. Few elements, large scale, generous negative space. Keep the top-left corner quiet, a small label sits there.",
  "Strictly: no people, faces, hands or figures; no text, letters, numbers, words, signage, logos, symbols that look like writing, watermarks, screens or user interfaces; not a photograph, no photorealism, no busy scene, no clutter of small objects; no border, frame or vignette.",
]
  .filter(Boolean)
  .join("\n\n");

if (flag("show-prompt")) {
  console.log(`Style: ${style}${asked ? "" : " (picked from the event's words; set artStyle in design.json to choose)"}. Size ${size}.\n\n${fullPrompt}`);
  process.exit(0);
}

const artDir = path.join(jobDir, "art");
fs.mkdirSync(artDir, { recursive: true });
const logFile = path.join(artDir, "calls.json");
const calls = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
const out = path.join(artDir, `${name}.png`);
if (fs.existsSync(out) && !flag("again")) stop(0, `art/${name}.png is already there; reusing it (pass --again for a new one).`);
if (calls.length >= maxCalls) stop(4, `This job already made ${calls.length} image call(s), the most allowed per job (${maxCalls}). Reuse the art you have.`);

const key = process.env.OPENAI_API_KEY;
if (!key) stop(3, "No OPENAI_API_KEY in this session, so no generated art: the render uses the kit's own background. Say so in the report.");

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
console.log(`Made art/${name}.png with ${model} (${size}, ${quality}, style ${style}${asked ? "" : ", picked from the event's words"}) in ${Math.round((Date.now() - started) / 1000)} s. Image calls for this job: ${calls.length} of ${maxCalls}.`);

function log(entry) {
  calls.push({ at: new Date().toISOString(), model, size, quality, name, style, ms: Date.now() - started, prompt: prompt.slice(0, 500), ...entry });
  fs.writeFileSync(logFile, JSON.stringify(calls, null, 2));
}

function stop(code, msg) {
  (code === 0 ? console.log : console.error)(`art: ${msg}`);
  process.exit(code);
}
