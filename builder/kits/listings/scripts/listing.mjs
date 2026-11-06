#!/usr/bin/env node
/**
 * Fill an event platform's create form in the Builder's browser. Never submits.
 *
 *   node <kit>/scripts/listing.mjs check   --job <job folder>        is listing.json fine to fill?
 *   node <kit>/scripts/listing.mjs fill    --job <job folder>        fill the form, screenshot it, leave the tab open
 *   node <kit>/scripts/listing.mjs inspect --job <job folder> --url https://...   list a page's fields (for form.json)
 *
 * Exit codes: 0 done, 1 error, 2 usage or a bad listing.json, 5 a person is
 * needed (not logged in, a captcha, the browser is not running): the
 * screenshot `out/needs-you.jpg` shows what they will see.
 *
 * fill blocks the platform's publish requests and every click on a submit
 * or publish button while it works, and leaves a guard in the page that
 * stops a submit until publish.mjs (which asks the crew on a card) lifts it.
 */
import fs from "node:fs";
import path from "node:path";
import { checkListing, coverPath } from "./listing-file.mjs";
import { EXIT, PUBLISH_WORDS, args, connect, disconnect, humanCheck, jobDir, jobPage, readJson, recipe, rel, settings, shot, stop, tagFor, writeJson } from "./lib.mjs";

const { positional, flags } = args();
const cmd = positional[0];
const dir = jobDir(flags);
const out = path.join(dir, "out");

/** In the page: no submit and no click on a publish button while the guard is up. */
function installGuard(words) {
  const re = new RegExp(words, "i");
  window.__ferriGuard = true;
  window.__ferriBlocked = window.__ferriBlocked ?? [];
  if (window.__ferriGuardInstalled) return;
  window.__ferriGuardInstalled = true;
  const named = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || "").replace(/\s+/g, " ").trim();
  document.addEventListener(
    "click",
    (e) => {
      if (!window.__ferriGuard) return;
      const el = e.target instanceof Element ? e.target.closest('button, [role="button"], input[type="submit"], a') : null;
      if (!el) return;
      if (el.getAttribute("data-ferri-submit") === "1" || (el.tagName !== "A" && re.test(named(el)))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.__ferriBlocked.push(named(el).slice(0, 80));
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    (e) => {
      if (!window.__ferriGuard) return;
      // Only the form that publishes (it holds the submit button); a dialog's own small form is fine.
      const form = e.target instanceof Element ? e.target : null;
      const publishing =
        !!form?.querySelector('[data-ferri-submit="1"]') ||
        [...(form?.querySelectorAll('button, input[type="submit"]') ?? [])].some((b) => re.test(named(b)));
      if (!publishing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.__ferriBlocked.push("form submit");
    },
    true,
  );
}

if (cmd === "check") {
  const l = readJson(path.join(dir, "listing.json"), "listing.json");
  const problems = checkListing(l, dir);
  if (problems.length) stop(EXIT.usage, `listing.json is not ready:\n- ${problems.join("\n- ")}`);
  stop(EXIT.ok, `listing.json is ready for ${l.platform}.`);
}

if (cmd === "inspect") {
  const url = flags.url;
  // https only; plain http just for a test page on this machine.
  if (typeof url !== "string" || !/^(https:\/\/|http:\/\/127\.0\.0\.1[:/])/.test(url)) stop(EXIT.usage, "inspect needs --url https://...");
  const s = settings(dir);
  const { browser, context } = await connect(s);
  const page = (await jobPage(context, tagFor(dir))) ?? (await context.newPage());
  await page.evaluate((t) => (window.name = t), tagFor(dir)).catch(() => {});
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.evaluate((t) => (window.name = t), tagFor(dir));
  const fields = await page.evaluate(() => {
    const label = (el) => {
      const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText : null;
      const wrap = el.closest("label")?.innerText;
      const aria = el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") ? document.getElementById(el.getAttribute("aria-labelledby"))?.innerText : null);
      return (aria || byFor || wrap || el.getAttribute("placeholder") || el.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 80);
    };
    const els = [...document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="switch"], [role="checkbox"], button, [role="button"]')];
    return els
      .filter((el) => el.offsetParent !== null || el.type === "file")
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        type: el.getAttribute("type"),
        label: label(el),
        text: el.tagName === "BUTTON" || el.getAttribute("role") === "button" ? (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60) : undefined,
        required: el.required || el.getAttribute("aria-required") === "true" || undefined,
        value: "value" in el && el.type !== "password" ? String(el.value ?? "").slice(0, 60) : undefined,
      }))
      .filter((f) => f.label || f.text);
  });
  const who = await humanCheck(page);
  fs.mkdirSync(out, { recursive: true });
  writeJson(path.join(out, "inspect.json"), { url: page.url(), fields });
  await shot(page, path.join(out, "inspect.jpg"));
  await disconnect(browser);
  console.log(`${fields.length} fields on ${page.url()} (out/inspect.json, out/inspect.jpg).`);
  for (const f of fields.slice(0, 60)) console.log(`- ${f.role ?? f.tag}${f.type ? `[${f.type}]` : ""} "${f.label || f.text}"${f.required ? " (required)" : ""}`);
  if (who) stop(EXIT.needsPerson, `The page shows ${who}. A person has to deal with it in the Builder's browser.`);
  process.exit(EXIT.ok);
}

if (cmd === "fill") {
  const l = readJson(path.join(dir, "listing.json"), "listing.json");
  const problems = checkListing(l, dir);
  if (problems.length) stop(EXIT.usage, `listing.json is not ready, so nothing was typed:\n- ${problems.join("\n- ")}`);
  const r = await recipe(l.platform);
  const s = settings(dir);
  const { browser, context } = await connect(s);
  const tag = tagFor(dir);
  const warnings = [];
  const h = { jobDir: dir, cover: coverPath(l, dir), coverName: l.cover ? path.basename(l.cover) : null, warn: (w) => warnings.push(w) };
  try {
    r.prepare?.(h);
  } catch (err) {
    await disconnect(browser);
    stop(EXIT.usage, err.message);
  }
  const createUrl = typeof r.createUrl === "function" ? r.createUrl(l, h) : r.createUrl;

  let page = await jobPage(context, tag);
  if (!page) page = await context.newPage();
  // Publish requests never leave while fill works.
  const blocked = [];
  for (const re of r.publishRequests ?? []) {
    await page.route(re, (route) => {
      if (route.request().method() === "GET") return route.continue();
      blocked.push(`${route.request().method()} ${route.request().url()}`);
      return route.abort("blockedbyclient");
    });
  }
  await page.goto(createUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.evaluate((t) => (window.name = t), tag);
  await page.waitForTimeout(2000);

  const needsPerson = async (why) => {
    fs.mkdirSync(out, { recursive: true });
    await shot(page, path.join(out, "needs-you.jpg"), { fullPage: false });
    await page.bringToFront().catch(() => {});
    writeJson(path.join(dir, "state.json"), { platform: l.platform, tag, stage: "needs-person", why, at: new Date().toISOString() });
    await disconnect(browser);
    stop(EXIT.needsPerson, `${why} Nothing was typed. A person has to do this in the Builder's browser window (screenshot: ${rel(path.join(out, "needs-you.jpg"))}); then run fill again.`);
  };
  const check = await humanCheck(page);
  if (check) await needsPerson(`${r.label} shows ${check}.`);
  if (!(await r.loggedIn(page))) await needsPerson(`The Builder's browser is not logged in to ${r.label}.`);

  await page.evaluate(installGuard, PUBLISH_WORDS.source);
  await r
    .submitButton(page)
    .evaluate((el) => el.setAttribute("data-ferri-submit", "1"))
    .catch(() => warnings.push("Could not find the submit button to guard it."));
  let typed;
  try {
    typed = await r.fill(page, l, h);
  } catch (err) {
    await shot(page, path.join(out, `${l.platform}-error.jpg`)).catch(() => {});
    await disconnect(browser);
    stop(EXIT.error, `Filling ${r.label} failed: ${err.message.split("\n")[0]} (screenshot: out/${l.platform}-error.jpg). Nothing was submitted.`);
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);
  const late = await humanCheck(page);
  if (late) await needsPerson(`${r.label} showed ${late} while filling.`);
  // Still the create form: nothing was published by a stray click or key.
  if (r.isCreatePage && !r.isCreatePage(page.url())) {
    await shot(page, path.join(out, `${l.platform}-moved.jpg`));
    await disconnect(browser);
    stop(EXIT.error, `The page left the create form while filling (now ${page.url()}). Check the Builder's browser before anything else.`);
  }
  const pageBlocked = await page.evaluate(() => window.__ferriBlocked ?? []);
  const values = await r.readBack(page);
  const filled = path.join(out, `${l.platform}-filled.jpg`);
  await shot(page, filled);
  writeJson(path.join(dir, "state.json"), {
    platform: l.platform,
    tag,
    stage: "filled",
    pageUrl: page.url(),
    filledAt: new Date().toISOString(),
    typed,
    values,
    screenshot: path.relative(dir, filled).replace(/\\/g, "/"),
  });
  await disconnect(browser);
  console.log(`Filled ${r.label}'s form (nothing submitted). Screenshot: ${rel(filled)}`);
  for (const [k, v] of typed) console.log(`- ${k}: ${String(v).replace(/\s*\n+\s*/g, " / ")}`);
  for (const w of warnings) console.log(`Note: ${w}`);
  if (blocked.length || pageBlocked.length) console.log(`Held back while filling: ${[...blocked, ...pageBlocked].join("; ")}`);
  console.log("The tab stays open in the Builder's browser. Submitting is publish.mjs, which asks the crew first.");
  process.exit(EXIT.ok);
}

stop(EXIT.usage, "Usage: listing.mjs check | fill | inspect --job <job folder> [--url https://...]");
