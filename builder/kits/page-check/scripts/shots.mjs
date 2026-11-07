#!/usr/bin/env node
/**
 * The page check: look at a page the Builder made the way a visitor will see
 * it, before anyone is asked to publish it.
 *
 *   node <kit>/scripts/shots.mjs --site <site folder> [--build]   a Next.js site, started with next start on a free local port
 *                                                                  (--build runs next build first; it always builds when there is no build yet)
 *   node <kit>/scripts/shots.mjs --url http://127.0.0.1:3300      a server that is already running
 *   node <kit>/scripts/shots.mjs --file <page.html>               one self-contained page
 *
 *   --pages /,/register,/login   the paths to check (default: those three with --site, / with --url)
 *   --out <folder>               where the screenshots go (default: shots/ in the job folder, next to the site or the page)
 *   --browser <path>             the Chrome, Edge or Chromium to use (default: the one installed here)
 *   --tiles all                  every page in screen-sized parts, in both schemes (default: only the first page, in light)
 *
 * The method is the webapp-testing skill's: start the server, wait until the
 * network is idle, then take screenshots and read the console. It runs on Node
 * with playwright-core and the browser already on this machine (Chrome, then
 * Edge, then Chromium), headless, in a throwaway profile: no Python, no
 * browser download, and never the Builder's own browser.
 *
 * Every page is opened at desktop (1440 x 900) and phone (390 x 844) size:
 *   - JPEGs: <page>-<desktop|phone>-<light|dark>.jpg is the first screen. The
 *     first page also gets the rest of its length as screen-sized parts
 *     (-2, -3, ...), so every image stays readable. Dark ones only when the
 *     page has a dark colour scheme.
 *   - Problems: an HTTP error, console errors, uncaught exceptions, requests
 *     that failed (images, fonts, scripts), sideways scrolling and the
 *     elements that cause it, broken images, images without alt text, fonts
 *     that did not load, and animations that keep running when the visitor
 *     asked for reduced motion.
 *   - Notes: [placeholders] still on the page, the fonts that loaded, the
 *     title and the link preview image.
 * Everything also goes to report.json next to the screenshots.
 *
 * Exit codes: 0 no problems; 4 problems found (they are listed: fix them and
 * run it again); 1 the page could not be checked (the build or the server
 * failed); 2 usage; 3 no Chrome, Edge or Chromium on this machine.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const KIT = path.resolve(import.meta.dirname, "..");
const EXIT = { ok: 0, error: 1, usage: 2, noBrowser: 3, problems: 4 };
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, maxParts: 6 },
  { name: "phone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, maxParts: 8 },
];
const SHOT_NAME = /^[a-z0-9-]+-(desktop|phone)-(light|dark)(-\d+)?\.jpg$/;

// ── Arguments ───────────────────────────────────────────────────────────────
const flags = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[a.slice(2)] = next;
      i++;
    } else flags[a.slice(2)] = true;
  }
}
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const site = str(flags.site) ? path.resolve(flags.site) : null;
const file = str(flags.file) ? path.resolve(flags.file) : null;
const url = str(flags.url) ? flags.url.trim().replace(/\/+$/, "") : null;
const allParts = flags.tiles === "all";

// Cleanup runs once, in reverse order (the browser closes before the server stops).
const cleanups = [];
let finishing = false;
async function finish(code, message) {
  if (!finishing) {
    finishing = true;
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch {
        /* best effort */
      }
    }
  }
  if (message) (code === EXIT.ok || code === EXIT.problems ? console.log : console.error)(message);
  process.exit(code);
}
process.on("SIGINT", () => finish(EXIT.error, "Stopped."));
process.on("SIGTERM", () => finish(EXIT.error, "Stopped."));

if ([site, file, url].filter(Boolean).length !== 1) {
  await finish(EXIT.usage, "Usage: shots.mjs --site <site folder> [--build] | --url http://127.0.0.1:<port> | --file <page.html>  [--pages /,/register] [--out <folder>] [--browser <path>] [--tiles all]");
}
if (url && !/^https?:\/\//.test(url)) await finish(EXIT.usage, `--url must start with http:// or https://, got ${url}.`);
if (file && !fs.existsSync(file)) await finish(EXIT.usage, `No page at ${file}.`);
if (site && !fs.existsSync(path.join(site, "package.json"))) await finish(EXIT.usage, `No package.json in ${site}: --site is the site's folder.`);

const out = path.resolve(str(flags.out) ?? (site ? path.join(path.dirname(site), "shots") : file ? path.join(path.dirname(file), "shots") : "shots"));
const pages = file
  ? [""]
  : str(flags.pages)
    ? flags.pages.split(",").map((s) => s.trim()).filter(Boolean).map((p) => (p.startsWith("/") ? p : `/${p}`))
    : site
      ? ["/", "/register", "/login"]
      : ["/"];

const rel = (p) => {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r.replace(/\\/g, "/") : p.replace(/\\/g, "/");
};
const firstLine = (err) => String(err?.message ?? err).split("\n")[0].slice(0, 300);
const clip = (s, n = 240) => (s.length > n ? `${s.slice(0, n)}...` : s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageName = (p) =>
  (file ? path.basename(file).replace(/\.[^.]+$/, "") : p.replace(/^\/+|\/+$/g, "").replace(/\.html?$/i, ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || (file ? "page" : "home");

// ── The browser: the one installed here, never a download ───────────────────
function nearestJson(relPath, from) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const f = path.join(dir, relPath);
    if (fs.existsSync(f)) {
      try {
        return JSON.parse(fs.readFileSync(f, "utf8"));
      } catch {
        return null;
      }
    }
    if (path.dirname(dir) === dir) return null;
  }
}

function findBrowser(from) {
  if (str(flags.browser)) return fs.existsSync(flags.browser) ? flags.browser : null;
  const named = [process.env.FERRI_BROWSER_EXE, nearestJson(path.join(".ferri", "listings.json"), from)?.executable].filter(Boolean);
  const local = process.env.LOCALAPPDATA;
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const candidates =
    process.platform === "win32"
      ? [
          path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
          path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
          local && path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
          path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
          path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
          local && path.join(local, "Chromium", "Application", "chrome.exe"),
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/opt/google/chrome/chrome",
            "/usr/bin/microsoft-edge",
            "/usr/bin/microsoft-edge-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ];
  return [...named, ...candidates].find((c) => c && fs.existsSync(c)) ?? null;
}

// ── The site's own server (next start), stopped when the check ends ─────────
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

async function startSite() {
  const nextBin = path.join(site, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) await finish(EXIT.error, `Next.js is not installed in ${rel(site)}: run npm ci there first.`);
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  if (flags.build || !fs.existsSync(path.join(site, ".next", "BUILD_ID"))) {
    console.log("Building the site (next build)...");
    const started = Date.now();
    const b = spawnSync(process.execPath, [nextBin, "build"], { cwd: site, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000, windowsHide: true });
    if (b.status !== 0) {
      const lines = `${b.stdout ?? ""}${b.stderr ?? ""}`.trim().split(/\r?\n/).slice(-60).join("\n");
      await finish(EXIT.error, `next build failed, so the page was not checked:\n${lines}`);
    }
    console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s.`);
  }
  const port = str(flags.port) ? Number(flags.port) : await freePort();
  const log = [];
  const keep = (d) => {
    log.push(...String(d).split(/\r?\n/).filter(Boolean));
    if (log.length > 200) log.splice(0, log.length - 200);
  };
  // Loopback only: the page is not on the network while it is checked.
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: site,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  cleanups.push(() => killTree(child));
  const base = `http://127.0.0.1:${port}`;
  for (const until = Date.now() + 90_000; Date.now() < until; ) {
    if (child.exitCode !== null) await finish(EXIT.error, `next start stopped (exit ${child.exitCode}):\n${log.slice(-40).join("\n")}`);
    try {
      await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      return base;
    } catch {
      await sleep(500);
    }
  }
  await finish(EXIT.error, `The site did not answer on ${base} within 90 s:\n${log.slice(-40).join("\n")}`);
}

// ── In the page: what a screenshot alone does not show ──────────────────────
async function measure() {
  const doc = document.documentElement;
  const body = document.body ?? doc;
  const width = doc.clientWidth;
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
    if (cls.length) s += `.${cls.join(".")}`;
    const text = (el.innerText || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 40);
    return text ? `${s} ("${text}")` : s;
  };
  // An element inside a box that hides or scrolls its overflow does not widen the page.
  const clipped = (el) => {
    for (let a = el.parentElement; a && a !== body && a !== doc; a = a.parentElement) {
      if (["hidden", "auto", "scroll", "clip"].includes(getComputedStyle(a).overflowX)) return true;
    }
    return false;
  };
  const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
  const wide = [];
  if (scrollWidth > width + 1) {
    for (const el of body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= width + 1) continue;
      const parent = el.parentElement;
      if (parent && parent !== body && parent.getBoundingClientRect().right > width + 1) continue;
      if (clipped(el)) continue;
      wide.push(`${describe(el)} reaches ${Math.round(r.right)} px`);
      if (wide.length >= 5) break;
    }
  }
  const broken = [];
  for (const img of document.images) {
    const src = img.currentSrc || img.src;
    if (!src || !img.complete || img.naturalWidth > 0) continue;
    if (await img.decode().then(() => false, () => true)) broken.push(src.slice(0, 160));
  }
  const noAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => (i.currentSrc || i.src || "an inline image").slice(0, 160));
  const faces = document.fonts ? [...document.fonts] : [];
  const face = (f) => `${f.family.replace(/["']/g, "")} ${f.weight}`;
  const running = document.getAnimations ? document.getAnimations().filter((a) => a.playState === "running") : [];
  const style = (el) => getComputedStyle(el);
  return {
    title: document.title,
    linkPreview: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
    height: Math.max(doc.scrollHeight, body.scrollHeight),
    sideways: scrollWidth > width + 1 ? scrollWidth : 0,
    wide,
    broken,
    noAlt,
    placeholders: [...new Set((body.innerText || "").match(/\[[^\]\n]{1,60}\]/g) ?? [])].slice(0, 20),
    fonts: [...new Set(faces.filter((f) => f.status === "loaded").map(face))],
    fontErrors: [...new Set(faces.filter((f) => f.status === "error").map(face))],
    animations: [...new Set(running.map((a) => (a.effect?.target ? describe(a.effect.target) : "an animation")))].slice(0, 5),
    scheme: `${style(doc).backgroundColor}|${style(body).backgroundColor}|${style(body).color}`,
  };
}

const schemeOf = () => {
  const s = (el) => getComputedStyle(el);
  const body = document.body ?? document.documentElement;
  return `${s(document.documentElement).backgroundColor}|${s(body).backgroundColor}|${s(body).color}`;
};

// Requests a browser makes on its own, or that a closing page cancels.
const ignorable = (u) => /\/favicon\.ico(\?|$)|\/_next\/webpack-hmr|^(chrome-extension|data|blob):/i.test(u);
const shortUrl = (u) => {
  if (/^data:/i.test(u)) return `an inline ${u.slice(5, u.search(/[;,]/)) || "data"} image`;
  try {
    const x = new URL(u);
    return x.protocol === "file:" ? path.basename(decodeURIComponent(x.pathname)) : `${x.host}${x.pathname}`.slice(0, 160);
  } catch {
    return u.slice(0, 160);
  }
};

async function check(browser, target, name, vp, entry, parts) {
  const result = { width: vp.width, height: null, problems: [], notes: [], shots: [] };
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    const exceptions = [];
    const failed = [];
    page.on("console", (m) => {
      // A failed resource is reported with its address by the response handler below.
      if (m.type() === "error" && !/^Failed to load resource/i.test(m.text())) errors.push(clip(m.text()));
    });
    page.on("pageerror", (e) => exceptions.push(clip(e?.message ?? String(e))));
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "failed";
      if (!/ERR_ABORTED/i.test(why) && !ignorable(r.url())) failed.push(`${why} ${shortUrl(r.url())}`);
    });
    page.on("response", (r) => {
      if (r.status() < 400 || ignorable(r.url())) return;
      try {
        // The page itself: its status is reported once, below.
        if (r.request().isNavigationRequest() && r.request().frame() === page.mainFrame()) return;
      } catch {
        /* a request without a frame */
      }
      failed.push(`${r.status()} ${shortUrl(r.url())}`);
    });

    let res = null;
    try {
      res = await page.goto(target, { waitUntil: "networkidle", timeout: 45_000 });
    } catch (err) {
      // A page that keeps a connection open never goes idle: check it as loaded.
      if (!/timeout/i.test(String(err?.message))) {
        result.problems.push(`the page did not open: ${firstLine(err)}`);
        return result;
      }
      result.notes.push("the network was still busy after 45 s; checked the page as it was");
    }
    const status = res ? res.status() : null;
    if (entry.status === null) entry.status = status;
    if (status !== null && status >= 400) result.problems.push(`the page answers HTTP ${status}`);

    // Scroll through once, so lazy images and scroll-triggered content are there, then back to the top.
    await page
      .evaluate(async () => {
        const step = Math.max(200, Math.floor(window.innerHeight * 0.9));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
        await document.fonts?.ready;
      })
      .catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);

    let facts = null;
    try {
      facts = await page.evaluate(measure);
    } catch (err) {
      result.problems.push(`the page could not be read: ${firstLine(err)}`);
    }
    if (facts) {
      result.height = facts.height;
      if (facts.sideways) result.problems.push(`the page scrolls sideways (${facts.sideways} px wide on a ${vp.width} px screen)${facts.wide.length ? `: ${facts.wide.join("; ")}` : ""}`);
      for (const b of facts.broken) result.problems.push(`broken image: ${shortUrl(b)}`);
      for (const a of facts.noAlt) result.problems.push(`image without alt text: ${shortUrl(a)}`);
      for (const f of facts.fontErrors) result.problems.push(`font did not load: ${f}`);
      if (facts.animations.length) result.problems.push(`animations keep running with reduced motion on (respect prefers-reduced-motion): ${facts.animations.join("; ")}`);
      if (entry.title === null) entry.title = facts.title;
      if (entry.linkPreview === null) entry.linkPreview = facts.linkPreview;
      entry.placeholders = [...new Set([...entry.placeholders, ...facts.placeholders])];
      entry.fonts = [...new Set([...entry.fonts, ...facts.fonts])];
    }

    const screens = Math.max(1, Math.ceil((facts?.height ?? vp.height) / vp.height));
    const shoot = async (scheme, wantParts) => {
      const total = Math.max(vp.height, facts?.height ?? vp.height);
      const n = wantParts ? Math.min(vp.maxParts, screens) : 1;
      for (let i = 0; i < n; i++) {
        const y = i * vp.height;
        const h = Math.min(vp.height, total - y);
        if (h < 40) break;
        const fileName = `${name}-${vp.name}-${scheme}${i ? `-${i + 1}` : ""}.jpg`;
        try {
          await page.screenshot({
            path: path.join(out, fileName),
            type: "jpeg",
            quality: 80,
            fullPage: true,
            clip: { x: 0, y, width: vp.width, height: h },
            animations: "disabled",
            timeout: 30_000,
          });
        } catch (err) {
          result.notes.push(`${scheme} screenshot ${i + 1} failed: ${firstLine(err)}`);
          break;
        }
        result.shots.push(fileName);
      }
      if (wantParts && n < screens) result.notes.push(`${scheme}: the first ${n} of ${screens} screens`);
    };
    await shoot("light", parts);

    // Dark only when the page has a dark scheme of its own.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    const dark = await page.evaluate(schemeOf).catch(() => null);
    if (facts && dark && dark !== facts.scheme) {
      entry.darkScheme = true;
      await shoot("dark", parts && allParts);
    }

    for (const e of new Set(errors)) result.problems.push(`console error: ${e}`);
    for (const e of new Set(exceptions)) result.problems.push(`uncaught error: ${e}`);
    for (const f of new Set(failed)) result.problems.push(`request failed: ${f}`);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

// ── Run ─────────────────────────────────────────────────────────────────────
const exe = findBrowser(site ?? (file ? path.dirname(file) : process.cwd()));
if (!exe) {
  await finish(
    EXIT.noBrowser,
    str(flags.browser)
      ? `No browser at ${flags.browser}.`
      : "No Chrome, Edge or Chromium on this machine, so the page was not checked in a browser. Install Chrome (or pass --browser <path>), and say in your report that there are no screenshots.",
  );
}

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  await finish(EXIT.error, `playwright-core is not installed: run npm ci in ${rel(KIT)} (pnpm builder:setup does it).`);
}

const base = site ? await startSite() : url;
let browser;
try {
  browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    timeout: 60_000,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--mute-audio"],
  });
} catch (err) {
  await finish(EXIT.error, `Could not start ${exe} headless: ${firstLine(err)}`);
}
cleanups.push(() => browser.close());

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (SHOT_NAME.test(f) || f === "report.json") fs.rmSync(path.join(out, f), { force: true });

const report = {
  at: new Date().toISOString(),
  target: site ? rel(site) : file ? rel(file) : url,
  browser: `${path.basename(exe)} ${browser.version()}`,
  viewports: VIEWPORTS.map((v) => `${v.name} ${v.width}x${v.height}`),
  pages: [],
  problems: 0,
  post: [],
};
for (const [i, p] of pages.entries()) {
  const name = pageName(p);
  const target = file ? pathToFileURL(file).href : `${base}${p}`;
  const entry = { page: file ? path.basename(file) : p, name, url: target, status: null, title: null, linkPreview: null, darkScheme: false, placeholders: [], fonts: [], viewports: {} };
  for (const vp of VIEWPORTS) entry.viewports[vp.name] = await check(browser, target, name, vp, entry, i === 0 || allParts);
  report.pages.push(entry);
}

// ── Report ──────────────────────────────────────────────────────────────────
const lines = [`Page check of ${report.target} in ${report.browser}, at desktop (1440 px) and phone (390 px).`];
let total = 0;
const shots = [];
for (const entry of report.pages) {
  const byProblem = new Map();
  for (const [vp, r] of Object.entries(entry.viewports)) {
    shots.push(...r.shots);
    for (const prob of r.problems) byProblem.set(prob, [...(byProblem.get(prob) ?? []), vp]);
  }
  total += byProblem.size;
  const heights = Object.entries(entry.viewports)
    .filter(([, r]) => r.height)
    .map(([vp, r]) => `${r.height} px tall at ${vp}`)
    .join(", ");
  const head = `${entry.page} (${entry.name}): ${entry.status === null ? "opened" : `HTTP ${entry.status}`}${heights ? `, ${heights}` : ""}, ${entry.darkScheme ? "light and dark" : "one colour scheme"}.`;
  lines.push(byProblem.size ? `${head} ${byProblem.size} problem${byProblem.size === 1 ? "" : "s"}:` : `${head} No problems.`);
  for (const [prob, where] of byProblem) lines.push(`  - [${where.join(", ")}] ${prob}`);
  for (const [vp, r] of Object.entries(entry.viewports)) for (const n of r.notes) lines.push(`  note [${vp}]: ${n}`);
}
report.problems = total;
const first = report.pages[0];
if (first) {
  report.post = [`${first.name}-desktop-light.jpg`, `${first.name}-phone-light.jpg`, ...(first.darkScheme ? [`${first.name}-phone-dark.jpg`] : [])].filter((f) => shots.includes(f));
}
const fonts = [...new Set(report.pages.flatMap((p) => p.fonts))];
const placeholders = [...new Set(report.pages.flatMap((p) => p.placeholders))];
lines.push(`Fonts that loaded: ${fonts.length ? fonts.join(", ") : "none (system fonts only)"}.`);
if (placeholders.length) lines.push(`Placeholders on the page: ${placeholders.join(", ")}`);
if (first?.title) lines.push(`Title: ${first.title}`);
if (first) lines.push(`Link preview image: ${first.linkPreview ?? "none"}`);
lines.push(`${shots.length} screenshot${shots.length === 1 ? "" : "s"} in ${rel(out)}; look at them with the Read tool. For the room: ${report.post.join(", ") || "none"}.`);
lines.push(total ? `${total} problem${total === 1 ? "" : "s"}: fix ${total === 1 ? "it" : "them"}, then run the check again.` : "No problems found.");
fs.writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await finish(total ? EXIT.problems : EXIT.ok, lines.join("\n"));
