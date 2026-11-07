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
 * The layout: the art (or photo) is one full-bleed block, and every word sits on
 * a solid panel in the event's colours (theme "dark" on `ink`, or "light" on
 * `paper`), never on the picture itself, so the text reads on any art. Tall
 * formats stack art over panel; wide ones put the panel left and the art right.
 * One margin and one spacing scale per format; the title is measured with the
 * font and set as large as the width allows on at most two lines (three on wide
 * cards); then date and place, then one call to action with the address and the
 * QR code. The community's logo and name (or the kicker) sit on a small tag.
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

/**
 * The grid of each format, in units of 1/1080 of the short side: margin (m),
 * panel padding above (top) and below (bottom) the text, the title's largest
 * size and line count, the type sizes (strong for date and place, soft for the
 * second lines), the QR code, and what the format has room for.
 */
const SPEC = {
  poster: { m: 80, top: 64, bottom: 80, title: 132, lines: 2, tagline: 30, strong: 33, soft: 27, facts: 26, cta: 30, url: 27, tag: 26, logo: 56, qr: 196, showTagline: true, showFacts: true },
  portrait: { m: 64, top: 56, bottom: 64, title: 112, lines: 2, tagline: 28, strong: 29, soft: 25, facts: 24, cta: 28, url: 25, tag: 25, logo: 50, qr: 170, showTagline: true, showFacts: false },
  story: { m: 72, top: 64, bottom: 236, tagTop: 216, title: 128, lines: 2, tagline: 30, strong: 32, soft: 27, facts: 26, cta: 31, url: 27, tag: 27, logo: 56, qr: 200, showTagline: true, showFacts: true },
  square: { m: 60, top: 48, bottom: 56, title: 96, lines: 2, tagline: 0, strong: 28, soft: 24, facts: 0, cta: 27, url: 24, tag: 24, logo: 46, qr: 150, showTagline: false, showFacts: false },
  link: { wide: true, panel: 0.58, m: 64, top: 64, bottom: 64, title: 150, lines: 3, strong: 30, soft: 26, cta: 28, url: 26, tag: 26, logo: 52, qr: 170 },
  x: { wide: true, panel: 0.56, m: 72, top: 72, bottom: 72, title: 150, lines: 3, strong: 30, soft: 26, cta: 28, url: 26, tag: 26, logo: 52, qr: 170 },
};

// ── Fonts (latin and latin-ext: ₹ lives in latin-ext) ───────────────────────
const fontFile = (pkg, subset, weight) => path.join(kit, "node_modules", "@fontsource", pkg, "files", `${pkg}-${subset}-${weight}-normal.woff`);
const fonts = [];
const families = { Inter: [], Display: [] };
const faces = { Inter: {}, Display: {} }; // family -> weight -> [latin, latin-ext], for measuring
for (const [family, pkg, weights] of [
  ["Inter", "inter", [400, 600, 700]],
  ["Display", "space-grotesk", [700]],
]) {
  for (const weight of weights) {
    for (const subset of ["latin", "latin-ext"]) {
      const data = fs.readFileSync(fontFile(pkg, subset, weight));
      // Satori falls back across families, not across fonts of one family: latin-ext gets its own name.
      fonts.push({ name: subset === "latin" ? family : `${family}Ext`, data, weight, style: "normal" });
      const parsed = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      families[family].push(parsed);
      (faces[family][weight] ??= []).push(parsed);
    }
  }
}
const missingGlyphs = (text, family) =>
  [...new Set([...text].filter((c) => !/\s/.test(c) && !families[family].some((f) => f.charToGlyphIndex(c) > 0)))];

/** Width of a line of text in px, from the font's own advances (kerning left out, so a little generous). */
function textWidth(text, family, weight, size, tracking = 0) {
  const list = faces[family][weight] ?? Object.values(faces[family])[0];
  let w = 0;
  for (const ch of text) {
    const f = list.find((x) => x.charToGlyphIndex(ch) > 0) ?? list[0];
    w += (f.charToGlyph(ch).advanceWidth / f.unitsPerEm) * size + tracking * size;
  }
  return w;
}

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
const HEX = /^#[0-9a-f]{6}$/i;
const accent = HEX.test(str(design.accent)) ? str(design.accent) : "#F5A524";
// The same defaults as the event site kit's poster-look.mjs, which reads ink too.
const ink = HEX.test(str(design.ink)) ? str(design.ink) : "#0b0b10";
const paper = HEX.test(str(design.paper)) ? str(design.paper) : "#f4efe6";
const theme = str(design.theme) === "light" ? "light" : "dark";

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

// What goes where. The tag carries the logo and one name: the kicker when it already
// names the community ("Lantern Labs presents"), else the community. A kicker that
// says something else sits above the title instead.
const kickerNamesCommunity = !!(texts.kicker && texts.community && texts.kicker.toLowerCase().includes(texts.community.toLowerCase()));
const tagText = kickerNamesCommunity ? texts.kicker : texts.community || texts.kicker;
const panelKicker = texts.kicker && tagText !== texts.kicker ? texts.kicker : "";
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const timeLine = capFirst(texts.time);
// "Koramangala Makerspace, 3rd floor, 80 Feet Road" -> the place in bold, the address under it.
const venueComma = texts.venue.indexOf(",");
const place = venueComma > 0 ? texts.venue.slice(0, venueComma).trim() : texts.venue;
const address = venueComma > 0 ? texts.venue.slice(venueComma + 1).trim() : "";

// ── Colours ─────────────────────────────────────────────────────────────────
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
const mix = (a, b, t) => `#${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
const luminance = (hex) => {
  const c = rgb(hex).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const WHITE = "#f7f4ee";
const C = theme === "dark" ? { bg: ink, fg: WHITE, soft: rgba(WHITE, 0.7), hair: rgba(WHITE, 0.16) } : { bg: paper, fg: ink, soft: rgba(ink, 0.68), hair: rgba(ink, 0.16) };
C.accentText = contrast(accent, C.bg) >= 4.5 ? accent : C.fg;
C.onAccent = contrast(accent, ink) >= contrast(accent, "#ffffff") ? ink : "#ffffff";

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
// Where the art is cropped from ("center", "top", "50% 30%", ...).
const artFocus = str(design.artFocus) || "center";
// How the picture meets the panel: a clean cut for flat art (geometric, illustration,
// riso: its shapes are meant to be cropped), a short fade for photos and gradient light.
const FLAT_STYLES = new Set(["geometric", "illustration", "riso"]);
const artEdge = ["cut", "fade"].includes(str(design.artEdge))
  ? str(design.artEdge)
  : !background || (background === art && FLAT_STYLES.has(str(design.artStyle).toLowerCase()))
    ? "cut"
    : "fade";

// ── Layout ──────────────────────────────────────────────────────────────────
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== "") } });
const img = (src, style) => ({ type: "img", props: { src, style } });
const text = (value, style) => h("div", { display: "flex", ...style }, value);

const TITLE_TRACKING = -0.025;
/** All the ways to break the words into n lines, in order. */
function splits(words, n) {
  if (n === 1) return [[words.join(" ")]];
  const out = [];
  for (let i = 1; i <= words.length - n + 1; i++) for (const rest of splits(words.slice(i), n - 1)) out.push([words.slice(0, i).join(" "), ...rest]);
  return out;
}
/**
 * The title's lines and size: measured with the display font, as large as the
 * width allows up to `max`, on at most `maxLines` lines. More lines only when
 * that makes the title clearly bigger (15%); ties go to the most even lines.
 */
function fitTitle(maxW, max, maxLines) {
  const words = texts.event.split(/\s+/).filter(Boolean);
  let pick = null;
  for (let n = 1; n <= Math.min(maxLines, words.length, 4); n++) {
    let best = null;
    for (const lines of splits(words, n)) {
      const widths = lines.map((l) => textWidth(l, "Display", 700, 100, TITLE_TRACKING) / 100);
      const widest = Math.max(...widths);
      const size = Math.min(max, (maxW * 0.97) / widest);
      const spread = widest - Math.min(...widths);
      if (!best || size > best.size + 0.5 || (Math.abs(size - best.size) <= 0.5 && spread < best.spread)) best = { lines, size, spread };
    }
    if (!pick || best.size > pick.size * 1.15) pick = best;
  }
  return { lines: pick.lines, size: Math.floor(pick.size) };
}

/** The kit's own art when there is no art file: a few flat shapes in the accent, like the geometric style. */
function kitArt(D, px) {
  const disc = (d, style) => h("div", { position: "absolute", display: "flex", width: Math.round(d), height: Math.round(d), borderRadius: 9999, ...style });
  return h(
    "div",
    { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: "flex", backgroundColor: mix(C.bg, accent, theme === "dark" ? 0.07 : 0.12) },
    disc(D * 1.15, { left: -D * 0.25, bottom: -D * 0.62, backgroundColor: mix(accent, C.bg, 0.35) }),
    disc(D, { right: -D * 0.1, top: D * 0.12, backgroundColor: accent }),
    disc(D * 0.5, { left: "20%", top: D * 0.2, border: `${Math.max(2, px(4))}px solid ${rgba(C.fg, 0.35)}` }),
    disc(D * 0.17, { left: "47%", top: D * 0.5, backgroundColor: theme === "dark" ? WHITE : ink }),
  );
}

function qrSize(fmt) {
  const { w, h: H } = FORMATS[fmt];
  return Math.round(SPEC[fmt].qr * (Math.min(w, H) / 1080));
}

function card(fmt) {
  const { w: W, h: H, shape } = FORMATS[fmt];
  const S = SPEC[fmt];
  const u = Math.min(W, H) / 1080;
  const px = (v) => Math.round(v * u);
  const wide = !!S.wide;
  const m = px(S.m);
  const panelW = wide ? Math.round(W * S.panel) : W;
  const innerW = panelW - m * 2;
  const T = fitTitle(innerW, px(S.title), S.lines);
  const qr = qrSize(fmt);

  // ── Pieces ──
  const logoImg = (size) => (logo ? img(logo, { width: size, height: size, borderRadius: Math.round(size * 0.22) }) : null);
  const tagRow = tagText || logo
    ? h(
        "div",
        { display: "flex", alignItems: "center", gap: px(14) },
        logoImg(px(S.logo)),
        tagText ? text(tagText, { fontSize: px(S.tag), fontWeight: 600, lineHeight: 1.2, color: C.fg }) : null,
      )
    : null;

  const title = h(
    "div",
    { display: "flex", flexDirection: "column" },
    T.lines.map((line) =>
      text(line, { fontFamily: "Display, DisplayExt, Inter, InterExt", fontWeight: 700, fontSize: T.size, lineHeight: 1.02, letterSpacing: `${TITLE_TRACKING}em`, whiteSpace: "nowrap", color: C.fg }),
    ),
  );

  const kicker = panelKicker ? text(panelKicker, { fontSize: px(S.tag), fontWeight: 600, color: C.accentText, marginBottom: px(16) }) : null;
  const tagline =
    S.showTagline && texts.tagline
      ? text(texts.tagline, { fontSize: px(S.tagline), lineHeight: 1.38, color: C.soft, marginTop: px(24), maxWidth: Math.round(innerW * 0.92), textWrap: "balance" })
      : null;

  // Date and place: two columns, the strong line over a soft one.
  const infoCol = (strong, soft) =>
    strong || soft
      ? h(
          "div",
          { display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, gap: px(6) },
          strong ? text(strong, { fontSize: px(S.strong), fontWeight: 600, lineHeight: 1.25, color: C.fg, textWrap: "balance" }) : null,
          soft ? text(soft, { fontSize: px(S.soft), lineHeight: 1.35, color: C.soft, textWrap: "balance" }) : null,
        )
      : null;
  const info = h(
    "div",
    { display: "flex", gap: px(40), alignItems: "flex-start" },
    infoCol(texts.date, timeLine),
    infoCol(place, address),
  );

  const facts =
    S.showFacts && texts.highlights.length
      ? h(
          "div",
          { display: "flex", flexWrap: "wrap", columnGap: px(36), rowGap: px(12), marginTop: px(36) },
          texts.highlights.map((t) =>
            h(
              "div",
              { display: "flex", alignItems: "center", gap: px(12) },
              h("div", { display: "flex", width: px(12), height: px(12), borderRadius: 999, backgroundColor: accent }),
              text(t, { fontSize: px(S.facts), fontWeight: 600, color: C.fg }),
            ),
          ),
        )
      : null;

  const ctaBlock = h(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: px(14), flexShrink: 1, minWidth: 0 },
    text(texts.cta, {
      fontSize: px(S.cta),
      fontWeight: 700,
      lineHeight: 1.1,
      color: C.onAccent,
      backgroundColor: accent,
      padding: `${px(16)}px ${px(28)}px`,
      borderRadius: px(10),
    }),
    text(texts.url, { fontSize: px(S.url), fontWeight: 600, color: C.fg, lineHeight: 1.2 }),
  );
  const qrTile = h(
    "div",
    {
      display: "flex",
      flexShrink: 0,
      padding: px(12),
      backgroundColor: "#ffffff",
      borderRadius: px(12),
      ...(theme === "light" ? { border: `${Math.max(1, px(2))}px solid ${C.hair}` } : {}),
    },
    img(qrImages[fmt], { width: qr, height: qr }),
  );
  const footer = h(
    "div",
    { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: px(32) },
    ctaBlock,
    qrTile,
  );

  // ── The picture block ──
  const artFill = background
    ? img(background, { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: artFocus })
    : kitArt(wide ? Math.min(H * 0.62, (W - panelW - m) * 0.72) : W * 0.46, px);
  const fade = (edge) =>
    h("div", {
      position: "absolute",
      display: "flex",
      ...(edge === "left"
        ? { left: 0, top: 0, width: px(150), height: "100%", backgroundImage: `linear-gradient(90deg, ${C.bg} 0%, ${rgba(C.bg, 0)} 100%)` }
        : { left: 0, bottom: 0, width: "100%", height: px(110), backgroundImage: `linear-gradient(180deg, ${rgba(C.bg, 0)} 0%, ${C.bg} 100%)` }),
    });
  const inset =
    photoAsInset && !wide && shape !== "square"
      ? img(photo, {
          position: "absolute",
          right: m,
          bottom: m,
          width: Math.round(innerW * 0.46),
          height: Math.round(innerW * 0.32),
          objectFit: "cover",
          borderRadius: px(16),
          border: `${px(6)}px solid ${C.bg}`,
        })
      : null;

  if (wide) {
    // Panel left (logo and name, then title and facts, then the call to action), art right.
    return h(
      "div",
      { width: W, height: H, display: "flex", backgroundColor: C.bg, color: C.fg, fontFamily: "Inter, InterExt" },
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: panelW,
          flexShrink: 0,
          paddingLeft: m,
          paddingRight: m,
          paddingTop: px(S.top),
          paddingBottom: px(S.bottom),
        },
        tagRow ?? h("div", { display: "flex" }),
        h("div", { display: "flex", flexDirection: "column" }, kicker, title, h("div", { display: "flex", flexDirection: "column", marginTop: px(32) }, info)),
        footer,
      ),
      artEdge === "cut"
        ? // Flat art as a framed block on the panel's grid, so its own background never meets the panel edge to edge.
          h(
            "div",
            { display: "flex", flexGrow: 1, paddingTop: px(S.top), paddingRight: m, paddingBottom: px(S.bottom) },
            h("div", { display: "flex", flexGrow: 1, position: "relative", overflow: "hidden", borderRadius: px(20) }, artFill),
          )
        : h("div", { display: "flex", flexGrow: 1, position: "relative", overflow: "hidden" }, artFill, fade("left")),
    );
  }

  // Tall and square: the art on top, the panel under it at its natural height.
  const tagChip = tagRow
    ? h(
        "div",
        {
          position: "absolute",
          left: m,
          top: px(S.tagTop ?? S.m),
          display: "flex",
          padding: `${px(10)}px ${px(tagText ? 22 : 10)}px ${px(10)}px ${px(10)}px`,
          backgroundColor: C.bg,
          borderRadius: px(16),
        },
        tagRow,
      )
    : null;
  return h(
    "div",
    { width: W, height: H, display: "flex", flexDirection: "column", backgroundColor: C.bg, color: C.fg, fontFamily: "Inter, InterExt" },
    h("div", { display: "flex", flexGrow: 1, flexShrink: 1, minHeight: Math.round(H * 0.22), position: "relative", overflow: "hidden" }, artFill, artEdge === "fade" ? fade("bottom") : null, inset, tagChip),
    h(
      "div",
      { display: "flex", flexDirection: "column", flexShrink: 0, paddingLeft: m, paddingRight: m, paddingTop: px(S.top), paddingBottom: px(S.bottom), backgroundColor: C.bg },
      kicker,
      title,
      tagline,
      facts,
      h("div", { display: "flex", flexDirection: "column", marginTop: px(shape === "square" ? 28 : 40) }, info),
      h("div", { display: "flex", height: Math.max(1, px(2)), backgroundColor: C.hair, marginTop: px(shape === "square" ? 28 : 36), marginBottom: px(shape === "square" ? 28 : 36) }),
      footer,
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
  ...(texts.tagline && wanted.some((f) => SPEC[f].showTagline) ? { tagline: texts.tagline } : {}),
  when: [texts.date, timeLine].filter(Boolean).join(", "),
  where: texts.venue,
  button: texts.cta,
  url: texts.url,
  qr: url,
  ...(texts.highlights.length && wanted.some((f) => SPEC[f].showFacts) ? { highlights: texts.highlights.join(" | ") } : {}),
  ...(texts.community && tagText === texts.community ? { community: texts.community } : {}),
};
const manifest = { event: texts.event, url, background: backgroundKind, logo: !!logo, photo: photo ? (photoAsInset ? "inset" : "background") : null, theme, accent, ink, text: drawn, placeholders, formats: made };
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\nBackground: ${backgroundKind}. Theme: ${theme} (accent ${accent}, ${theme === "dark" ? `ink ${ink}` : `paper ${paper}`}).`);
console.log("Exact text on every image:");
for (const [k, v] of Object.entries(drawn)) console.log(`  ${k}: ${v}`);
if (placeholders.length) console.log(`\nPlaceholders still to fill: ${placeholders.join("; ")}`);
console.log(`\nWrote ${made.length} format(s) to ${outDir} (manifest.json lists them).`);

function fail(msg) {
  console.error(`render: ${msg}`);
  process.exit(1);
}
