#!/usr/bin/env node
/**
 * Submit the form fill left open, and read back the listing's address.
 * This is a public step: the Builder's permission rules make this command ask
 * the crew on a Switch card first. Run it only after the screenshot is posted.
 *
 *   node <kit>/scripts/publish.mjs --job <job folder> [--say "Publish Lantern Build Night on Luma"]
 *
 * It refuses (exit 4) unless the tab is still the one fill made and the form
 * shows exactly what the screenshot showed. Exit 5: a person is needed (a
 * captcha or a login appeared). Writes result.json and out/<platform>-live.jpg.
 */
import path from "node:path";
import { EXIT, args, connect, disconnect, humanCheck, jobDir, jobPage, readJson, recipe, rel, settings, shot, stop, writeJson } from "./lib.mjs";

const { flags } = args();
const dir = jobDir(flags);
const state = readJson(path.join(dir, "state.json"), "state.json (run listing.mjs fill first)");
if (state.stage !== "filled") stop(EXIT.refused, `The form is not filled (state: ${state.stage}). Run listing.mjs fill first.`);
const r = await recipe(state.platform);
r.prepare?.({ jobDir: dir });
const s = settings(dir);
const { browser, context } = await connect(s);
const page = await jobPage(context, state.tag);
if (!page) {
  await disconnect(browser);
  stop(EXIT.refused, "The filled tab is gone from the Builder's browser. Run fill again and post the new screenshot before publishing.");
}
if (page.url() !== state.pageUrl) {
  await disconnect(browser);
  stop(EXIT.refused, `The tab moved since the screenshot (now ${page.url()}). Run fill again.`);
}
const now = await r.readBack(page);
const changed = Object.keys(state.values).filter((k) => JSON.stringify(state.values[k]) !== JSON.stringify(now[k]));
if (changed.length) {
  await disconnect(browser);
  stop(EXIT.refused, `The form changed since the screenshot (${changed.join(", ")}). Run fill again and post the new screenshot.`);
}
const check = await humanCheck(page);
if (check) {
  await shot(page, path.join(dir, "out", "needs-you.jpg"), { fullPage: false });
  await page.bringToFront().catch(() => {});
  await disconnect(browser);
  stop(EXIT.needsPerson, `${r.label} shows ${check}. A person has to deal with it in the Builder's browser, then run publish again.`);
}

if (typeof flags.say === "string") console.log(flags.say);
await page.evaluate(() => (window.__ferriGuard = false));
await r.submitButton(page).click();
let result;
try {
  result = await r.published(page);
} catch (err) {
  await shot(page, path.join(dir, "out", `${state.platform}-after-submit.jpg`)).catch(() => {});
  const human = await humanCheck(page);
  await disconnect(browser);
  if (human) stop(EXIT.needsPerson, `${r.label} asked for ${human} after the submit. A person has to finish it in the Builder's browser.`);
  stop(EXIT.error, `Submitted, but could not read the listing's address: ${err.message.split("\n")[0]}. Check out/${state.platform}-after-submit.jpg and the Builder's browser.`);
}
const manage = page.url();
let live = null;
if (result.url) {
  await page.goto(result.url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  live = await shot(page, path.join(dir, "out", `${state.platform}-live.jpg`));
  await page.goto(manage, { waitUntil: "domcontentloaded" }).catch(() => {});
}
writeJson(path.join(dir, "result.json"), { platform: state.platform, ...result, publishedAt: new Date().toISOString(), screenshot: live ? path.relative(dir, live).replace(/\\/g, "/") : null });
writeJson(path.join(dir, "state.json"), { ...state, stage: "published" });
await disconnect(browser);
console.log(`Published on ${r.label}: ${result.url ?? "(address not found)"}`);
if (result.manageUrl) console.log(`Manage: ${result.manageUrl}`);
if (live) console.log(`Screenshot of the live page: ${rel(live)}`);
