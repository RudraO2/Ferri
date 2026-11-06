/**
 * Shared helpers for the listings kit: settings, the Builder's browser over
 * CDP, the job folder, screenshots, and the checks that stop for a person
 * (login, captcha) or refuse to go on (placeholders, a submit during fill).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const KIT = path.resolve(import.meta.dirname, "..");

// Exit codes the skill reads.
export const EXIT = { ok: 0, error: 1, usage: 2, noKey: 3, refused: 4, needsPerson: 5 };

export function args(argv = process.argv.slice(2)) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

export function stop(code, message) {
  (code === 0 ? console.log : console.error)(message);
  process.exit(code);
}

/** The nearest `.ferri/listings.json` above a folder, with defaults. */
export function settings(from = process.cwd()) {
  let found = {};
  let home = null;
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const f = path.join(dir, ".ferri", "listings.json");
    if (fs.existsSync(f)) {
      found = JSON.parse(fs.readFileSync(f, "utf8"));
      home = dir;
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  const port = Number(found.port ?? 9333);
  return {
    home,
    port,
    cdpUrl: found.cdpUrl ?? `http://127.0.0.1:${port}`,
    executable: found.executable ?? findBrowser(),
    profile: found.profile ?? path.join(os.homedir(), ".ferri", "builder-browser"),
    luma: found.luma ?? {},
  };
}

/** Chrome first, then Edge: an ordinary installed browser, never a bundled test build. */
export function findBrowser() {
  const local = process.env.LOCALAPPDATA ?? "";
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          path.join(local, "Google\\Chrome\\Application\\chrome.exe"),
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/** Is the Builder's browser answering on its debugging port? */
export async function browserUp(cdpUrl) {
  try {
    const r = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Connect to the Builder's browser (it must be running: `browser.mjs start`). */
export async function connect(s) {
  if (!(await browserUp(s.cdpUrl))) {
    stop(EXIT.needsPerson, `The Builder's browser is not running. Start it with: node ${rel(path.join(KIT, "scripts", "browser.mjs"))} start`);
  }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(s.cdpUrl, { timeout: 15_000 });
  const context = browser.contexts()[0];
  if (!context) stop(EXIT.error, "The Builder's browser has no window open.");
  return { browser, context };
}

/** Leave the browser and its tabs running: only this script's connection closes. */
export async function disconnect(browser) {
  try {
    await browser.close();
  } catch {
    /* already gone */
  }
}

export function rel(p) {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith("..") ? r.replace(/\\/g, "/") : p.replace(/\\/g, "/");
}

export function jobDir(flags) {
  const dir = path.resolve(typeof flags.job === "string" ? flags.job : process.cwd());
  if (!fs.existsSync(dir)) stop(EXIT.usage, `No job folder at ${dir}.`);
  return dir;
}

export function readJson(file, what) {
  if (!fs.existsSync(file)) stop(EXIT.usage, `No ${what} at ${rel(file)}.`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    stop(EXIT.usage, `${rel(file)} is not valid JSON: ${err.message}`);
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A recipe module by platform name (`luma`, `generic`, ...). */
export async function recipe(platform) {
  const name = String(platform ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const file = path.join(KIT, "recipes", `${name}.mjs`);
  if (!name || !fs.existsSync(file)) {
    const have = fs.readdirSync(path.join(KIT, "recipes")).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
    stop(EXIT.usage, `No recipe for "${platform}". Recipes: ${have.join(", ")}. Any other site: --platform generic with a form.json.`);
  }
  return (await import(pathToFileURL(file).href)).default;
}

/** Strings with a `[placeholder]` in them are never typed into a public form. */
export function placeholders(value, at = "") {
  if (typeof value === "string") return /\[[^\]]+\]/.test(value) ? [`${at}: ${value}`] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => placeholders(v, `${at}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => placeholders(v, at ? `${at}.${k}` : k));
  return [];
}

// Buttons fill must never press: they publish.
export const PUBLISH_WORDS = /\b(publish|submit|create( event)?|post( event)?|go live|launch|list (it|event)|send|confirm and (pay|publish)|pay)\b/i;

/** A captcha or a human check on the page (the person solves it, never the Builder). */
export async function humanCheck(page) {
  const frames = page.frames().map((f) => f.url());
  const hit = frames.find((u) => /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha/i.test(u));
  if (hit) return `a captcha (${new URL(hit).hostname})`;
  const text = await page
    .evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "")
    .catch(() => "");
  if (/verify (that )?you are (a )?human|are you a robot|press and hold|unusual traffic|security check/i.test(text)) return "a human check";
  return null;
}

/** A small JPEG of the page (chat bridges time out on big files). */
export async function shot(page, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: "jpeg", quality: 72, fullPage: opts.fullPage ?? true, timeout: 20_000 }).catch(async () => {
    await page.screenshot({ path: file, type: "jpeg", quality: 72, timeout: 20_000 });
  });
  return file;
}

/** The tab this job filled, found again by its window name. */
export async function jobPage(context, tag) {
  for (const p of context.pages()) {
    const name = await p.evaluate(() => window.name).catch(() => "");
    if (name === tag) return p;
  }
  return null;
}

export const tagFor = (jobFolder) => `ferri-${path.basename(jobFolder)}`;
