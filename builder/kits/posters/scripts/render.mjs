#!/usr/bin/env node
/**
 * Render an event's poster and social cards from one design.json.
 *
 *   node <kit>/scripts/render.mjs --job <job folder> [--only square,story]
 *   node <kit>/scripts/render.mjs --example        (the kit's own example, no art needed)
 *
 * Every word on the images is typed text from design.json, drawn by Satori with
 * real fonts, so nothing is misspelt by an image model. The background is the
 * generated art (art/background.png), a community photo, or, when neither is
 * there, a background the kit draws itself (said so in the output).
 *
 * Checks, and the render fails when one does not pass:
 *   - every character of every text is in the fonts (no missing glyph boxes);
 *   - the QR code on every image reads back as exactly the design's URL.
 * It prints the exact strings it drew, for the crew to check at a glance.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import jsQR from "jsqr";
import jpeg from "jpeg-js";
import opentype from "opentype.js";

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : null;
};

const example = !!flag("example");
const jobDir = path.resolve(example ? path.join(kit, "example") : (flag("job") ?? process.cwd()));
const designFile = path.join(jobDir, "design.json");
if (!fs.existsSync(designFile)) fail(`No design.json in ${jobDir}. Write it first (see the kit's example/design.json).`);
const design = JSON.parse(fs.readFileSync(designFile, "utf8"));
const outDir = path.join(jobDir, "out");

// ── Formats ─────────────────────────────────────────────────────────────────
export const FORMATS = {
  poster: { w: 2480, h: 3508, shape: "tall", label: "Print poster, A4 at 300 dpi", jpg: true, svg: true, preview: 1240 },
  square: { w: 1080, h: 1080, shape: "square", label: "Instagram, Facebook, LinkedIn, WhatsApp, Discord and Telegram posts", jpg: true },
  portrait: { w: 1080, h: 1350, shape: "tall", label: "Instagram and LinkedIn feed (4:5)", jpg: true },
  story: { w: 1080, h: 1920, shape: "story", label: "Instagram and Facebook stories, WhatsApp status", jpg: true },
  link: { w: 1200, h: 630, shape: "wide", label: "Link previews (Open Graph), LinkedIn and Facebook link posts", jpg: true },
  x: { w: 1600, h: 900, shape: "wide", label: "X (Twitter) posts", jpg: true },
};
const only = typeof flag("only") === "string" ? flag("only").split(",").map((s) => s.trim()) : null;
const wanted = (only ?? design.formats ?? Object.keys(FORMATS)).filter((f) => {
  if (!FORMATS[f]) fail(`Unknown format "${f}". Known: ${Object.keys(FORMATS).join(", ")}.`);
  return true;
});

// ── Fonts (latin and latin-ext: ₹ lives in latin-ext) ───────────────────────
const fontFile = (pkg, subset, weight) => path.join(kit, "node_modules", "@fontsource", pkg, "files", `${pkg}-${subset}-${weight}-normal.woff`);
const fonts = [];
const families = { Inter: [], Display: [] };
for (const [family, pkg, weights] of [
  ["Inter", "inter", [400, 600, 700]],
  ["Display", "space-grotesk", [700]],
]) {
  for (const weight of weights) {
    for (const subset of ["latin", "latin-ext"]) {
      const data = fs.readFileSync(fontFile(pkg, subset, weight));
      // Satori falls back across families, not across fonts of one family: latin-ext gets its own name.
      fonts.push({ name: subset === "latin" ? family : `${family}Ext`, data, weight, style: "normal" });
      families[family].push(opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
    }
  }
}
const missingGlyphs = (text, family) =>
  [...new Set([...text].filter((c) => !/\s/.test(c) && !families[family].some((f) => f.charToGlyphIndex(c) > 0)))];

// ── The design ──────────────────────────────────────────────────────────────
const str = (v) => (typeof v === "string" ? v.trim() : "");
const url = str(design.url);
if (!/^https?:\/\//.test(url)) fail(`design.json "url" must be the full address (https://...), got "${url}".`);
const urlLabel = str(design.urlLabel) || url.replace(/^https?:\/\//, "").replace(/\/$/, "");
const texts = {
  event: str(design.event),
  kicker: str(design.kicker),
  tagline: str(design.tagline),
  date: str(design.date),
  time: str(design.time),
  venue: str(design.venue),
  cta: str(design.cta) || "Register",
  url: urlLabel,
  community: str(design.community),
  highlights: (Array.isArray(design.highlights) ? design.highlights : []).map(str).filter(Boolean).slice(0, 3),
};
if (!texts.event) fail('design.json needs "event" (the event name).');
const accent = /^#[0-9a-f]{6}$/i.test(str(design.accent)) ? str(design.accent) : "#F5A524";

// Every character must exist in the fonts, or the image would show a box where a letter should be.
const problems = [];
for (const [key, value] of Object.entries(texts)) {
  for (const v of [].concat(value)) {
    const miss = missingGlyphs(v, key === "event" ? "Display" : "Inter");
    if (miss.length) problems.push(`"${v}" (${key}) has characters the fonts cannot draw: ${miss.join(" ")}`);
  }
}
if (problems.length) fail(`Change these texts in design.json:\n- ${problems.join("\n- ")}`);
const placeholders = [];
for (const [key, value] of Object.entries(texts)) for (const v of [].concat(value)) if (/\[[^\]]+\]/.test(v)) placeholders.push(`${key}: ${v}`);

// ── Images: art, photo, logo ────────────────────────────────────────────────
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
function dataUrl(file) {
  const p = path.isAbsolute(file) ? file : path.join(jobDir, file);
  if (!fs.existsSync(p)) return null;
  const mime = MIME[path.extname(p).toLowerCase()];
  if (!mime || mime === "image/webp") fail(`${file}: use PNG, JPEG or SVG.`);
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}
const artPath = str(design.art) || "art/background.png";
const art = dataUrl(artPath);
const photo = str(design.photo) ? dataUrl(str(design.photo)) : null;
if (str(design.photo) && !photo) fail(`design.json "photo" points to ${design.photo}, which is not there.`);
const logo = str(design.logo) ? dataUrl(str(design.logo)) : null;
if (str(design.logo) && !logo) fail(`design.json "logo" points to ${design.logo}, which is not there.`);
// A photo of the community replaces the art as background unless the design asks for it as an inset.
const photoAsInset = !!(photo && art && design.photoInset);
const background = photo && !photoAsInset ? photo : art;
const backgroundKind = photo && !photoAsInset ? "community photo" : art ? "generated art" : "the kit's own background (no art file)";

// ── Layout ──────────────────────────────────────────────────────────────────
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) } });
const img = (src, style) => ({ type: "img", props: { src, style } });

/** Title size so the event name sits on about two lines. */
function titleSize(width, max) {
  const words = texts.event.split(/\s+/);
  let best = texts.event.length;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    best = Math.min(best, Math.max(a, b));
  }
  return Math.floor(Math.min(max, width / (best * 0.6)));
}

function qrSize(fmt) {
  const { w, h: H, shape } = FORMATS[fmt];
  return Math.round((shape === "wide" || shape === "square" ? 170 : 230) * (Math.min(w, H) / 1080));
}

function card(fmt) {
  const { w: W, h: H, shape } = FORMATS[fmt];
  const u = Math.min(W, H) / 1080;
  const wide = shape === "wide";
  const pad = Math.round(72 * u);
  const padY = shape === "story" ? Math.round(240 * u) : pad;
  const contentW = wide ? Math.round(W * 0.6) - pad : W - pad * 2;
  // Square and wide cards have about 930 units of height for everything: no tagline or chips there.
  const dense = wide || shape === "square";
  const T = titleSize(contentW, (dense ? 104 : 140) * u);
  const qr = qrSize(fmt);
  const gap = Math.round((dense ? 18 : 26) * u);

  const bg = background
    ? img(background, { position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" })
    : h("div", {
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: H,
        backgroundImage: `radial-gradient(circle at 78% 18%, ${accent}d9 0%, ${accent}00 46%), radial-gradient(circle at 12% 70%, #6d5bd0aa 0%, #6d5bd000 52%), linear-gradient(160deg, #1c1733 0%, #0b0b10 100%)`,
      });
  const scrim = h("div", {
    position: "absolute",
    left: 0,
    top: 0,
    width: W,
    height: H,
    backgroundImage: wide
      ? "linear-gradient(90deg, rgba(8,8,12,0.94) 0%, rgba(8,8,12,0.86) 48%, rgba(8,8,12,0.15) 85%)"
      : "linear-gradient(180deg, rgba(8,8,12,0.55) 0%, rgba(8,8,12,0.05) 22%, rgba(8,8,12,0.10) 38%, rgba(8,8,12,0.86) 62%, rgba(8,8,12,0.96) 100%)",
  });

  const top = h(
    "div",
    { display: "flex", alignItems: "center", gap: Math.round(20 * u) },
    logo ? img(logo, { width: Math.round(64 * u), height: Math.round(64 * u), borderRadius: Math.round(14 * u) }) : null,
    texts.community ? h("div", { fontSize: Math.round(30 * u), fontWeight: 600, letterSpacing: "0.01em" }, texts.community) : null,
  );

  const infoLine = (label, value) =>
    value
      ? h(
          "div",
          { display: "flex", alignItems: "baseline", gap: Math.round(16 * u), fontSize: Math.round((dense ? 30 : 34) * u), lineHeight: 1.25 },
          h("div", { color: accent, fontWeight: 700, fontSize: Math.round(22 * u), letterSpacing: "0.12em", width: Math.round(110 * u), flexShrink: 0 }, label),
          h("div", { fontWeight: 600, display: "flex", flex: 1 }, value),
        )
      : null;

  const chips = texts.highlights.length
    ? h(
        "div",
        { display: "flex", flexWrap: "wrap", gap: Math.round(12 * u) },
        texts.highlights.map((t) =>
          h(
            "div",
            {
              display: "flex",
              fontSize: Math.round(26 * u),
              fontWeight: 600,
              padding: `${Math.round(8 * u)}px ${Math.round(18 * u)}px`,
              borderRadius: 999,
              border: `${Math.max(1, Math.round(2 * u))}px solid rgba(255,255,255,0.35)`,
              backgroundColor: "rgba(255,255,255,0.08)",
            },
            t,
          ),
        ),
      )
    : null;

  const cta = h(
    "div",
    { display: "flex", flexDirection: "column", gap: Math.round(14 * u), flex: 1 },
    h(
      "div",
      { display: "flex" },
      h(
        "div",
        {
          display: "flex",
          backgroundColor: accent,
          color: "#0b0b10",
          fontWeight: 700,
          fontSize: Math.round(32 * u),
          padding: `${Math.round(14 * u)}px ${Math.round(28 * u)}px`,
          borderRadius: Math.round(14 * u),
        },
        texts.cta,
      ),
    ),
    h("div", { display: "flex", fontSize: Math.round(30 * u), fontWeight: 600, color: "rgba(255,255,255,0.92)" }, texts.url),
  );
  const qrTile = h(
    "div",
    { display: "flex", padding: Math.round(14 * u), backgroundColor: "#ffffff", borderRadius: Math.round(18 * u) },
    img(qrImages[fmt], { width: qr, height: qr }),
  );

  const inset =
    photoAsInset && !wide && shape !== "square"
      ? h(
          "div",
          { display: "flex", marginTop: Math.round(40 * u) },
          img(photo, {
            width: Math.round(contentW * 0.55),
            height: Math.round(contentW * 0.38),
            objectFit: "cover",
            borderRadius: Math.round(20 * u),
            border: `${Math.round(4 * u)}px solid rgba(255,255,255,0.85)`,
          }),
        )
      : null;

  const bottom = h(
    "div",
    { display: "flex", flexDirection: "column", gap, width: contentW },
    texts.kicker ? h("div", { display: "flex", color: accent, fontWeight: 700, fontSize: Math.round(26 * u), letterSpacing: "0.14em" }, texts.kicker.toUpperCase()) : null,
    h("div", { display: "flex", fontFamily: "Display, DisplayExt, Inter, InterExt", fontWeight: 700, fontSize: T, lineHeight: 1.0, letterSpacing: "-0.02em" }, texts.event),
    texts.tagline && !dense
      ? h("div", { display: "flex", fontSize: Math.round(32 * u), lineHeight: 1.35, color: "rgba(255,255,255,0.86)" }, texts.tagline)
      : null,
    h(
      "div",
      { display: "flex", flexDirection: "column", gap: Math.round(8 * u), paddingLeft: Math.round(22 * u), borderLeft: `${Math.round(5 * u)}px solid ${accent}` },
      infoLine("WHEN", [texts.date, texts.time].filter(Boolean).join(", ")),
      infoLine("WHERE", texts.venue),
    ),
    dense ? null : chips,
    h("div", { display: "flex", alignItems: "flex-end", gap: Math.round(28 * u), marginTop: Math.round(10 * u) }, cta, qrTile),
  );

  return h(
    "div",
    { width: W, height: H, display: "flex", position: "relative", backgroundColor: "#0b0b10", color: "#ffffff", fontFamily: "Inter, InterExt" },
    bg,
    scrim,
    h(
      "div",
      {
        // Sized without padding: Satori would add padding to a full-size box and push the bottom off the image.
        position: "absolute",
        left: pad,
        top: padY,
        width: W - pad * 2,
        height: H - padY * 2,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      },
      h("div", { display: "flex", flexDirection: "column" }, top, inset),
      bottom,
    ),
  );
}

// ── Render ──────────────────────────────────────────────────────────────────
const qrImages = {};
for (const fmt of wanted) {
  const px = qrSize(fmt);
  qrImages[fmt] = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: px, color: { dark: "#0b0b10", light: "#ffffff" } });
}

fs.mkdirSync(outDir, { recursive: true });
const slug = (str(design.slug) || texts.event).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const made = [];
for (const fmt of wanted) {
  const f = FORMATS[fmt];
  const started = Date.now();
  const svg = await satori(card(fmt), { width: f.w, height: f.h, fonts });
  const rendered = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } }).render();
  const pixels = rendered.pixels;
  const base = `${slug}-${fmt}`;
  const files = [];
  fs.writeFileSync(path.join(outDir, `${base}.png`), rendered.asPng());
  files.push(`${base}.png`);
  if (f.jpg) {
    const jpg = jpeg.encode({ data: pixels, width: rendered.width, height: rendered.height }, 90);
    fs.writeFileSync(path.join(outDir, `${base}.jpg`), jpg.data);
    files.push(`${base}.jpg`);
  }
  if (f.svg) {
    fs.writeFileSync(path.join(outDir, `${base}.svg`), svg);
    files.push(`${base}.svg`);
  }
  // A print-size file is too big for a chat upload (Mattermost times out): a half-size JPEG to show in rooms.
  if (f.preview) {
    const small = new Resvg(svg, { fitTo: { mode: "width", value: f.preview }, font: { loadSystemFonts: false } }).render();
    fs.writeFileSync(path.join(outDir, `${base}-preview.jpg`), jpeg.encode({ data: small.pixels, width: small.width, height: small.height }, 88).data);
    files.push(`${base}-preview.jpg`);
  }
  const decoded = jsQR(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), rendered.width, rendered.height);
  if (!decoded) fail(`${fmt}: the QR code could not be read back from the image (is the text too long for this size? the QR sits last, so overflow cuts it first).`);
  if (decoded.data !== url) fail(`${fmt}: the QR code reads "${decoded.data}", not "${url}".`);
  made.push({ format: fmt, width: f.w, height: f.h, for: f.label, files, qr: "reads back as the URL", ms: Date.now() - started });
  console.log(`${fmt.padEnd(8)} ${f.w}x${f.h}  ${files.join(", ")}  (QR ok, ${Date.now() - started} ms)`);
}

const drawn = {
  event: texts.event,
  ...(texts.kicker ? { kicker: texts.kicker } : {}),
  ...(texts.tagline ? { tagline: texts.tagline } : {}),
  when: [texts.date, texts.time].filter(Boolean).join(", "),
  where: texts.venue,
  button: texts.cta,
  url: texts.url,
  qr: url,
  ...(texts.highlights.length ? { highlights: texts.highlights.join(" | ") } : {}),
  ...(texts.community ? { community: texts.community } : {}),
};
const manifest = { event: texts.event, url, background: backgroundKind, logo: !!logo, photo: photo ? (photoAsInset ? "inset" : "background") : null, text: drawn, placeholders, formats: made };
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\nBackground: ${backgroundKind}.`);
console.log("Exact text on every image:");
for (const [k, v] of Object.entries(drawn)) console.log(`  ${k}: ${v}`);
if (placeholders.length) console.log(`\nPlaceholders still to fill: ${placeholders.join("; ")}`);
console.log(`\nWrote ${made.length} format(s) to ${outDir} (manifest.json lists them).`);

function fail(msg) {
  console.error(`render: ${msg}`);
  process.exit(1);
}
