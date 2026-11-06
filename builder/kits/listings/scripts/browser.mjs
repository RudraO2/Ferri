#!/usr/bin/env node
/**
 * The Builder's own browser: Chrome (or Edge) with a profile folder of its
 * own, on the organizer's screen, with remote debugging on 127.0.0.1 so the
 * kit can fill forms in it. A person logs in to each platform there,
 * themselves; the kit never types or stores a password.
 *
 *   node scripts/browser.mjs start            open it (or say it is already open)
 *   node scripts/browser.mjs status           is it running, and which platforms is it logged in to
 *   node scripts/browser.mjs open <url>       open a page in it (for a person to log in)
 *
 * Settings: `.ferri/listings.json` (executable, profile, port, cdpUrl).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { EXIT, KIT, args, browserUp, connect, disconnect, settings, stop } from "./lib.mjs";

const { positional } = args();
const cmd = positional[0] ?? "status";
const s = settings();

if (cmd === "start") {
  if (await browserUp(s.cdpUrl)) stop(EXIT.ok, `The Builder's browser is already open (${s.cdpUrl}).`);
  if (!s.executable || !fs.existsSync(s.executable)) stop(EXIT.error, "No Chrome or Edge found. Set \"executable\" in .ferri/listings.json.");
  fs.mkdirSync(s.profile, { recursive: true });
  const child = spawn(
    s.executable,
    [
      `--user-data-dir=${s.profile}`,
      `--remote-debugging-port=${s.port}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,960",
      "about:blank",
    ],
    { detached: true, stdio: "ignore", windowsHide: false },
  );
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const v = await browserUp(s.cdpUrl);
    if (v) stop(EXIT.ok, `The Builder's browser is open: ${v.Browser} (profile ${path.basename(s.profile)}).`);
  }
  stop(EXIT.error, "The Builder's browser did not open its debugging port in 10 s. Is another copy of this profile open without it? Close it and try again.");
}

if (cmd === "status") {
  const v = await browserUp(s.cdpUrl);
  if (!v) stop(EXIT.needsPerson, "The Builder's browser is not running (node scripts/browser.mjs start).");
  const { browser, context } = await connect(s);
  const recipes = fs.readdirSync(path.join(KIT, "recipes")).filter((f) => f.endsWith(".mjs") && f !== "generic.mjs");
  const lines = [`The Builder's browser is open: ${v.Browser}.`];
  for (const f of recipes) {
    const r = (await import(new URL(`../recipes/${f}`, import.meta.url).href)).default;
    if (!r.loggedIn) continue;
    const page = await context.newPage();
    try {
      await page.goto(r.home ?? r.createUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1500);
      lines.push(`${r.label}: ${(await r.loggedIn(page)) ? "logged in" : "not logged in"}`);
    } catch (err) {
      lines.push(`${r.label}: could not check (${err.message.split("\n")[0]})`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  await disconnect(browser);
  stop(EXIT.ok, lines.join("\n"));
}

if (cmd === "open") {
  const url = positional[1];
  if (!url || !/^https:\/\//.test(url)) stop(EXIT.usage, "Usage: browser.mjs open https://...");
  const { browser, context } = await connect(s);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.bringToFront();
  await disconnect(browser);
  stop(EXIT.ok, `Opened ${url} in the Builder's browser.`);
}

stop(EXIT.usage, "Usage: browser.mjs start | status | open <url>");
