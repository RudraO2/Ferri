#!/usr/bin/env node
/**
 * One look per event: the site takes the look of the event's posters, so the
 * site, the posters, the social cards and the listing cover match.
 *
 *   node scripts/poster-look.mjs                    from the site folder: the event's newest poster job
 *   node scripts/poster-look.mjs --poster <folder>  that poster job (its folder, with design.json and out/)
 *   node scripts/poster-look.mjs --none             the kit's own look, without a poster
 *   (--jobs <folder> looks for poster jobs there instead of the Builder's jobs/)
 *
 * It looks in the Builder's jobs/ folder for the newest poster job of this
 * event: a design.json whose "event" is the name in content/event.json, drawn
 * into out/ by the poster kit (the highest job number wins). From it, into this site:
 *   - the poster's background, the generated art or the community photo it
 *     used, becomes the hero image (public/poster/hero.*), over the gradient
 *     the poster kit draws when it has neither;
 *   - the link card (else the X card, else the square card) becomes the link
 *     preview image (public/poster/card.jpg); the square card and the
 *     community logo come along (public/poster/square.jpg, logo.*);
 *   - the poster's fonts, the very files the poster kit drew with, are served
 *     from public/poster/fonts/.
 * It writes content/look.json: where the look came from, the accent, the
 * fonts, the images and the font CSS the layout puts in the page (lib/look.ts
 * reads it). With no poster job, content/look.json says so and the site keeps
 * the kit's own look. Run it again after a new poster job: it replaces
 * public/poster/ and content/look.json, and nothing else.
 */
import fs from "node:fs";
import path from "node:path";

const site = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : null;
};
const str = (v) => (typeof v === "string" ? v.trim() : "");
const HEX = /^#[0-9a-f]{6}$/i;

function stop(code, msg) {
  (code === 0 ? console.log : console.error)(`poster-look: ${msg}`);
  process.exit(code);
}
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};

const eventFile = path.join(site, "content", "event.json");
if (!fs.existsSync(eventFile) || !fs.existsSync(path.join(site, "package.json"))) {
  stop(2, "run it from the site folder (the copy of kits/event-site, with content/event.json).");
}
const eventName = str(readJson(eventFile)?.name);
const lookFile = path.join(site, "content", "look.json");
const posterDir = path.join(site, "public", "poster");
const writeLook = (look) => fs.writeFileSync(lookFile, `${JSON.stringify(look, null, 2)}\n`);

// The Builder's folder: the nearest folder above with .ferri/ (or with jobs/ and kits/).
let home = null;
for (let dir = site; ; dir = path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, ".ferri")) || (fs.existsSync(path.join(dir, "jobs")) && fs.existsSync(path.join(dir, "kits")))) {
    home = dir;
    break;
  }
  if (path.dirname(dir) === dir) break;
}
function jobsFolder() {
  if (typeof flag("jobs") === "string") return path.resolve(flag("jobs"));
  for (let dir = path.dirname(site); path.dirname(dir) !== dir; dir = path.dirname(dir)) if (path.basename(dir) === "jobs") return dir;
  return home ? path.join(home, "jobs") : null;
}

const norm = (s) => str(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

/** This event's poster jobs that the poster kit drew (out/manifest.json), newest first. */
function posterJobs(jobs) {
  if (!jobs || !fs.existsSync(jobs)) return [];
  const found = [];
  for (const e of fs.readdirSync(jobs, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(jobs, e.name);
    const design = readJson(path.join(dir, "design.json"));
    const manifest = readJson(path.join(dir, "out", "manifest.json"));
    if (!design || !manifest || norm(design.event) !== norm(eventName)) continue;
    const n = Number(/^[a-z]*(\d+)/i.exec(e.name)?.[1] ?? 0);
    found.push({ dir, design, manifest, n, at: fs.statSync(path.join(dir, "out", "manifest.json")).mtimeMs });
  }
  return found.sort((a, b) => b.n - a.n || b.at - a.at);
}

let chosen = null;
const explicit = flag("poster");
if (!flag("none")) {
  if (typeof explicit === "string") {
    const dir = [path.resolve(explicit), home && path.join(home, explicit), home && path.join(home, "jobs", explicit)].find(
      (d) => d && fs.existsSync(path.join(d, "design.json")),
    );
    if (!dir) stop(2, `no design.json in ${explicit}.`);
    const design = readJson(path.join(dir, "design.json"));
    if (!design) stop(2, `${path.join(dir, "design.json")} is not valid JSON.`);
    if (norm(design.event) !== norm(eventName)) console.log(`poster-look: note: that poster is for "${design.event}", and the site is for "${eventName}".`);
    chosen = { dir, design, manifest: readJson(path.join(dir, "out", "manifest.json")) ?? { formats: [] } };
  } else if (eventName && !/^\[.*\]$/.test(eventName)) {
    chosen = posterJobs(jobsFolder())[0] ?? null;
  }
}

// Start clean: only what this script wrote before.
fs.rmSync(posterDir, { recursive: true, force: true });

if (!chosen) {
  writeLook({
    note: "The kit's own look. scripts/poster-look.mjs replaces this file with the look of the event's posters (accent, fonts, hero art, link preview); run it again rather than editing this file.",
    from: null,
  });
  if (flag("none")) stop(0, "the site keeps the kit's own look.");
  if (!eventName || /^\[.*\]$/.test(eventName)) stop(0, "content/event.json has no event name yet, so no poster matches: the site keeps the kit's own look.");
  stop(0, `no poster job for "${eventName}" in ${jobsFolder() ?? "jobs/"}: the site keeps the kit's own look (its accent from content/event.json). Run this again after the posters are made.`);
}

const design = chosen.design;
fs.mkdirSync(posterDir, { recursive: true });
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
function copyAs(src, base) {
  const ext = path.extname(src).toLowerCase();
  if (!IMAGE.has(ext)) return null;
  const name = `${base}${ext === ".jpeg" ? ".jpg" : ext}`;
  fs.copyFileSync(src, path.join(posterDir, name));
  return `/poster/${name}`;
}
const inJob = (p) => (path.isAbsolute(p) ? p : path.join(chosen.dir, p));

// Colours: the poster's accent and the dark ink under its text (render.mjs uses the same defaults).
const accent = HEX.test(str(design.accent)) ? str(design.accent) : "#F5A524";
const ink = HEX.test(str(design.ink)) ? str(design.ink) : "#0b0b10";

// The background, chosen as render.mjs chooses it: a community photo, unless it is an inset next to the art.
const art = inJob(str(design.art) || "art/background.png");
const photo = str(design.photo) ? inJob(str(design.photo)) : null;
const hasArt = fs.existsSync(art);
const hasPhoto = !!photo && fs.existsSync(photo);
const background = hasPhoto && !(design.photoInset && hasArt) ? photo : hasArt ? art : null;
const heroImage = background ? copyAs(background, "hero") : null;
const heroKind = !heroImage ? "the poster's gradient" : background === photo ? "community photo" : "generated art";
const gradient = `radial-gradient(circle at 78% 18%, ${accent}d9 0%, ${accent}00 46%), radial-gradient(circle at 12% 70%, #6d5bd0aa 0%, #6d5bd000 52%), linear-gradient(160deg, #1c1733 0%, ${ink} 100%)`;

// The cards the poster kit drew: the link card is the link preview (else the X card, else the square card).
const SIZES = { link: [1200, 630], x: [1600, 900], square: [1080, 1080] };
const outDir = path.join(chosen.dir, "out");
function cardFile(format) {
  const listed = (chosen.manifest.formats ?? []).find((f) => f.format === format)?.files?.find((f) => /\.jpe?g$/i.test(f) && !/-preview\./i.test(f));
  if (listed && fs.existsSync(path.join(outDir, listed))) return path.join(outDir, listed);
  const found = fs.existsSync(outDir) ? fs.readdirSync(outDir).find((f) => new RegExp(`-${format}\\.jpe?g$`, "i").test(f)) : null;
  return found ? path.join(outDir, found) : null;
}
let card = null;
for (const format of ["link", "x", "square"]) {
  const f = cardFile(format);
  if (!f) continue;
  fs.copyFileSync(f, path.join(posterDir, "card.jpg"));
  card = { image: "/poster/card.jpg", width: SIZES[format][0], height: SIZES[format][1], format };
  break;
}
const squareFile = cardFile("square");
const square = squareFile ? (fs.copyFileSync(squareFile, path.join(posterDir, "square.jpg")), "/poster/square.jpg") : null;
const logoFile = str(design.logo) ? inJob(str(design.logo)) : null;
const logo = logoFile && fs.existsSync(logoFile) ? copyAs(logoFile, "logo") : null;

// Fonts: the poster kit's own files (fontsource), latin and latin-ext like the posters.
const fontRoot = [home && path.join(home, "kits", "posters", "node_modules", "@fontsource")].find((d) => d && fs.existsSync(d)) ?? null;
const fontId = (v, fallback) => (/^[a-z0-9-]+$/.test(str(v)) ? str(v) : fallback);
const roles = {
  display: { id: fontId(design.fonts?.display, "space-grotesk"), weights: [700, 800, 600, 500, 400], one: true },
  body: { id: fontId(design.fonts?.body, "inter"), weights: [400, 500, 600, 700], one: false },
};
function faces(id, weight) {
  const cssFile = path.join(fontRoot, id, `${weight}.css`);
  if (!fs.existsSync(cssFile)) return [];
  const list = [];
  for (const m of fs.readFileSync(cssFile, "utf8").matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (!new RegExp(`^${id}-(latin|latin-ext)-${weight}-normal$`).test(m[1])) continue;
    const family = /font-family:\s*'([^']+)'/.exec(m[2])?.[1];
    const file = /url\(\.\/files\/([a-z0-9-]+\.woff2)\)/.exec(m[2])?.[1];
    const range = /unicode-range:\s*([U+0-9A-Fa-f,\s-]+);/.exec(m[2])?.[1];
    if (!family || !/^[\w .-]+$/.test(family) || !file || !fs.existsSync(path.join(fontRoot, id, "files", file))) continue;
    list.push({ family, weight, file, range: range?.replace(/\s+/g, "") ?? null, src: path.join(fontRoot, id, "files", file) });
  }
  return list;
}
const families = { display: null, body: null };
const rules = [];
if (fontRoot) {
  fs.mkdirSync(path.join(posterDir, "fonts"), { recursive: true });
  for (const [role, r] of Object.entries(roles)) {
    for (const weight of r.weights) {
      const list = faces(r.id, weight);
      if (!list.length) continue;
      for (const f of list) {
        fs.copyFileSync(f.src, path.join(posterDir, "fonts", f.file));
        rules.push(`@font-face{font-family:'${f.family}';font-style:normal;font-display:swap;font-weight:${f.weight};src:url(/poster/fonts/${f.file}) format('woff2');${f.range ? `unicode-range:${f.range};` : ""}}`);
      }
      families[role] = list[0].family;
      if (r.one) break; // headings use one weight, as on the posters
    }
  }
}
const stack = "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const fontBody = families.body ? `'${families.body}',${stack}` : null;
const fontDisplay = families.display ? `'${families.display}',${fontBody ?? stack}` : null;
const css = [...new Set(rules), `:root{${fontBody ? `--font-body:${fontBody};` : ""}${fontDisplay ? `--font-display:${fontDisplay};` : ""}--ink:${ink};}`].join("\n");

const from = path.basename(chosen.dir);
writeLook({
  note: `The look of the posters in job ${from}, written by scripts/poster-look.mjs. Run it again rather than editing this file.`,
  from,
  event: str(design.event),
  accent,
  ink,
  hero: { image: heroImage, kind: heroKind, background: gradient },
  card,
  square,
  logo,
  fonts: { display: families.display, body: families.body },
  css,
});

const said = [
  `accent ${accent}`,
  families.display || families.body
    ? `${families.display ?? "system fonts"} for headings and ${families.body ?? "system fonts"} for text`
    : "system fonts (the poster kit's fonts are not installed here: run npm ci in kits/posters)",
  `${heroKind === "the poster's gradient" ? heroKind : `the ${heroKind}`} behind the hero`,
  card ? `the ${card.format} card as the link preview` : "no card for link previews (the poster job drew none)",
  ...(logo ? ["the community logo in the header"] : []),
];
const big = heroImage && fs.statSync(path.join(site, "public", heroImage)).size > 4 * 1024 * 1024;
console.log(`poster-look: the site takes the look of ${from} (${str(design.event)}): ${said.join(", ")}.${big ? " The hero image is large; the site serves it resized." : ""}`);
