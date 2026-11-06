#!/usr/bin/env node
/**
 * Take down a listing this kit published (result.json). A public step: the
 * Builder's permission rules make it ask the crew on a card first.
 *
 *   node <kit>/scripts/takedown.mjs --job <job folder>
 */
import path from "node:path";
import { EXIT, args, connect, disconnect, jobDir, readJson, recipe, settings, stop, writeJson } from "./lib.mjs";

const { flags } = args();
const dir = jobDir(flags);
const result = readJson(path.join(dir, "result.json"), "result.json (nothing was published from this job)");
if (result.takenDownAt) stop(EXIT.ok, `Already taken down at ${result.takenDownAt}.`);
const r = await recipe(result.platform);
if (result.via === "api") stop(EXIT.refused, "This listing was made through the API: cancel it on the platform's site.");
if (!r.takeDown) stop(EXIT.refused, `The ${r.label} recipe cannot take a listing down; do it on the site.`);
const { browser, context } = await connect(settings(dir));
const page = await context.newPage();
try {
  await r.takeDown(page, result);
} catch (err) {
  await disconnect(browser);
  stop(EXIT.error, `Could not take it down: ${err.message.split("\n")[0]}`);
}
await page.close().catch(() => {});
await disconnect(browser);
writeJson(path.join(dir, "result.json"), { ...result, takenDownAt: new Date().toISOString() });
console.log(`Taken down from ${r.label}: ${result.url}`);
