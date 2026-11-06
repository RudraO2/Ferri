import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { communities, createDb, eventSpaces, events, spaces } from "@ferri/db";
import { finalizeAnswer } from "./answer.ts";
import { ladderTimes } from "./cards.ts";
import { autoHelp, checkInDelayMs } from "./care.ts";
import { languagesNeeded, translationBlock, translationsFrom } from "./launch.ts";
import {
  DEFAULT_SETTINGS,
  SETTINGS_BY_KEY,
  applySettingChange,
  changedBy,
  cleanSettings,
  describeSettings,
  effectiveSettings,
  explainSettings,
  matchSpace,
  normalizeSettingInput,
  parseSetting,
  settingsFor,
  sourceLabel,
  voiceBlock,
  writeSettings,
} from "./settings.ts";
import { listSkillFiles, resetSkill, saveSkill, skillRevisionList, skillText, communitySkillRows, sortSkillKeys } from "./skills.ts";
import type { KnowledgeItem } from "./store.ts";

describe("parseSetting", () => {
  it("reads numbers in range and refuses the rest", () => {
    expect(parseSetting("stepInSeconds", "60")).toBe(60);
    expect(parseSetting("stepInSeconds", 5.4)).toBe(5);
    expect(parseSetting("stepInSeconds", "-1")).toBeUndefined();
    expect(parseSetting("stepInSeconds", "soon")).toBeUndefined();
    expect(parseSetting("ladderLiveMinutes", "0")).toBeUndefined();
    expect(parseSetting("guestReminderHours", "0")).toBe(0);
  });
  it("reads switches and choices", () => {
    expect(parseSetting("autoWrap", "off")).toBe(false);
    expect(parseSetting("decisionWatcher", "ON")).toBe(true);
    expect(parseSetting("planReader", "maybe")).toBeUndefined();
    expect(parseSetting("care", "Off")).toBe("off");
    expect(parseSetting("autoHelp", "always")).toBe("always");
    expect(parseSetting("autoHelp", "sometimes")).toBeUndefined();
  });
  it("keeps text short and trimmed", () => {
    expect(parseSetting("tone", "  playful ")).toBe("playful");
    expect((parseSetting("tone", "x".repeat(900)) as string).length).toBe(400);
    expect(parseSetting("language", 3)).toBeUndefined();
  });
});

describe("cleanSettings and effectiveSettings", () => {
  it("drops unknown keys, bad values and the _by map", () => {
    expect(cleanSettings({ tone: "warm", stepInSeconds: "x", bogus: 1, _by: { tone: { by: "R", at: "" } } })).toEqual({ tone: "warm" });
  });
  it("layers default, base, community, event, space (space only tone and language)", () => {
    const s = effectiveSettings({
      base: { stepInSeconds: 3 },
      community: { tone: "warm", care: "off" },
      event: { tone: "playful", ladderLiveMinutes: 2 },
      space: { language: "Hindi", care: "on" },
    });
    expect(s.stepInSeconds).toBe(3);
    expect(s.tone).toBe("playful");
    expect(s.language).toBe("Hindi");
    expect(s.care).toBe("off");
    expect(s.ladderLiveMinutes).toBe(2);
    expect(s.guestDailyCap).toBe(DEFAULT_SETTINGS.guestDailyCap);
  });
  it("describes only what changed", () => {
    const lines = describeSettings(effectiveSettings({ event: { care: "off", autoWrap: false } }));
    expect(lines).toEqual(["Care: off", "Wrap by itself: off"]);
  });
});

describe("applySettingChange and explainSettings", () => {
  const at = new Date("2026-11-06T10:00:00Z");
  it("sets, records who, and resets", () => {
    const one = applySettingChange({}, { set: { language: "Hindi" }, by: "Rudra", at });
    expect(one).toEqual({ language: "Hindi", [SETTINGS_BY_KEY]: { language: { by: "Rudra", at: at.toISOString() } } });
    const two = applySettingChange(one, { set: { tone: "playful" }, by: "Asha", at });
    expect(changedBy(two)).toEqual({ language: { by: "Rudra", at: at.toISOString() }, tone: { by: "Asha", at: at.toISOString() } });
    const three = applySettingChange(two, { remove: ["language"], by: "Asha", at });
    expect(three).toEqual({ tone: "playful", [SETTINGS_BY_KEY]: { tone: { by: "Asha", at: at.toISOString() } } });
    expect(applySettingChange(three, { remove: ["tone"], by: "Asha" })).toEqual({});
  });
  it("says where each value comes from", () => {
    const e = explainSettings({
      base: { stepInSeconds: 20, guestDailyCap: 10 },
      community: applySettingChange({}, { set: { tone: "warm" }, by: "Rudra", at }),
      event: { tone: "brief" },
      space: { language: "Hindi" },
    });
    expect(e.stepInSeconds.from).toBe("default"); // the env base equals the default
    expect(e.guestDailyCap).toMatchObject({ value: 10, from: "env" });
    expect(e.tone).toMatchObject({ value: "brief", from: "event", by: null });
    expect(e.language).toMatchObject({ value: "Hindi", from: "space" });
    expect(e.care.from).toBe("default");
  });
});

describe("voice and language", () => {
  it("is empty by default and names tone and language when set", () => {
    expect(voiceBlock(DEFAULT_SETTINGS)).toBe("");
    const v = voiceBlock({ tone: "playful", language: "Hindi" });
    expect(v).toContain("Playful and upbeat");
    expect(v).toContain("write in Hindi");
    expect(voiceBlock({ tone: "like a pirate", language: "" })).toContain("Tone: like a pirate");
  });
  it("translates the source label for common languages", () => {
    expect(sourceLabel("Hindi", false)).toBe("स्रोत");
    expect(sourceLabel("spanish", true)).toBe("Fuentes");
    expect(sourceLabel("", true)).toBe("Sources");
    expect(sourceLabel("Klingon", false)).toBe("Source");
  });
  it("keeps the citation check and changes only the label", () => {
    const item = { id: "1", key: "k", eventId: null, eventName: null, sourceKind: "markdown", sourceTitle: "FAQ", heading: "Food", body: "Lunch at 1", version: 1, updatedAt: new Date() } as KnowledgeItem;
    const ids = new Map([["K1", item]]);
    const ok = finalizeAnswer({ kind: "answer", reply: "दोपहर का खाना 1 बजे है।", source_ids: ["K1"], missing: null }, ids, { language: "Hindi" });
    expect(ok.text).toBe("दोपहर का खाना 1 बजे है।\n\nस्रोत: FAQ (Food)");
    const bad = finalizeAnswer({ kind: "answer", reply: "Lunch at 1", source_ids: ["K9"], missing: null }, ids, { language: "Hindi" });
    expect(bad.downgraded).toBe(true);
    expect(finalizeAnswer({ kind: "answer", reply: "Lunch at 1", source_ids: ["K1"], missing: null }, ids).text).toBe("Lunch at 1\n\nSource: FAQ (Food)");
  });
  it("tidies chat values", () => {
    expect(normalizeSettingInput("language", "hindi")).toBe("Hindi");
    expect(normalizeSettingInput("language", "each person's own")).toBe("");
    expect(normalizeSettingInput("tone", "Playful")).toBe("playful");
    expect(normalizeSettingInput("stepInSeconds", "a minute")).toBe("60");
    expect(normalizeSettingInput("stepInSeconds", "2 minutes")).toBe("120");
    expect(normalizeSettingInput("stepInSeconds", "5 seconds")).toBe("5");
  });
});

describe("matchSpace", () => {
  const list = [
    { name: "Pulse Slack: build-night", platform: "slack", role: "members" },
    { name: "Lantern Build Night", platform: "whatsapp_web", role: "members" },
    { name: "Discord: build-night", platform: "discord", role: "members" },
    { name: "Discord: crew", platform: "discord", role: "crew" },
  ];
  it("finds a space by its platform", () => {
    expect(matchSpace("the WhatsApp group", list).match?.platform).toBe("whatsapp_web");
    expect(matchSpace("Discord", list).match?.name).toBe("Discord: build-night");
  });
  it("finds a space by its name and says when it cannot tell", () => {
    expect(matchSpace("slack build-night", list).match?.platform).toBe("slack");
    expect(matchSpace("build-night", list).match).toBeNull();
    expect(matchSpace("Telegram", list).match).toBeNull();
  });
});

describe("timings from settings", () => {
  const now = new Date("2026-11-21T10:00:00Z");
  it("uses the event's ladder minutes, with the test override first", () => {
    expect(ladderTimes({ now, stage: "live", eventEndsAt: null, liveMinutes: 2 }).nudgeAt.getTime() - now.getTime()).toBe(2 * 60_000);
    expect(ladderTimes({ now, stage: "plan", eventEndsAt: null, beforeMinutes: 30 }).escalateAt.getTime() - now.getTime()).toBe(60 * 60_000);
    expect(ladderTimes({ now, stage: "live", eventEndsAt: null }).nudgeAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(ladderTimes({ now, stage: "live", eventEndsAt: null, liveMinutes: 2, nudgeSeconds: 60 }).nudgeAt.getTime() - now.getTime()).toBe(60_000);
  });
  it("check-ins and the Builder's help follow the settings", () => {
    expect(checkInDelayMs("live")).toBe(30 * 60_000);
    expect(checkInDelayMs("plan", { checkInLiveMinutes: 5, checkInBeforeMinutes: 60 })).toBe(60 * 60_000);
    const base = { technical: true, kind: "stuck", mode: "auto", paused: false };
    expect(autoHelp({ ...base, stage: "plan" })).toBe(false);
    expect(autoHelp({ ...base, stage: "plan", when: "always" })).toBe(true);
    expect(autoHelp({ ...base, stage: "live", when: "never" })).toBe(false);
    expect(autoHelp({ ...base, stage: "live", when: "always", mode: "approve" })).toBe(false);
  });
});

describe("announcement languages", () => {
  const t = (spaceId: string, language: string, name = spaceId) => ({ spaceId, language, name, platform: "whatsapp_web" as string | null });
  it("needs a version only for a space language that differs from the event's", () => {
    const need = languagesNeeded("", [t("a", "Hindi"), t("b", ""), t("c", "hindi "), t("d", "Kannada")]);
    expect([...need.keys()]).toEqual(["hindi", "kannada"]);
    expect(need.get("hindi")!.spaces.map((s) => s.spaceId)).toEqual(["a", "c"]);
    expect(languagesNeeded("Hindi", [t("a", "Hindi")]).size).toBe(0);
  });
  it("reads stored translations only for the same text", () => {
    const payload = { translations: { source: "Lunch at 1", byLanguage: { hindi: { language: "Hindi", text: "खाना 1 बजे" } } } };
    expect(translationsFrom(payload, "Lunch at 1").hindi?.text).toBe("खाना 1 बजे");
    expect(translationsFrom(payload, "Lunch at 2")).toEqual({});
    expect(translationsFrom(null, "x")).toEqual({});
    const block = translationBlock(languagesNeeded("", [t("a", "Hindi", "Lantern Build Night")]), translationsFrom(payload, "Lunch at 1"));
    expect(block).toBe("In Hindi for WhatsApp Lantern Build Night:\n\nखाना 1 बजे");
  });
});

describe("skill files", () => {
  it("lists every default skill by key, persona first", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ferri-skills-"));
    fs.mkdirSync(path.join(dir, "desks"));
    for (const f of ["librarian.md", "ferri.md", "desks/judging.md", "desks/README.md", "notes.txt"]) fs.writeFileSync(path.join(dir, f), "x");
    expect(listSkillFiles(dir)).toEqual(["ferri", "librarian", "desks/judging"]);
    expect(sortSkillKeys(["packs/meetup", "desks/custom-x", "librarian", "ferri"])).toEqual(["ferri", "librarian", "desks/custom-x", "packs/meetup"]);
  });
});

// Runs against the local Ferri Postgres (`pnpm db:up`) with a throwaway community; skipped when it is not running.
const url = process.env.DATABASE_URL ?? "postgres://ferri:ferri@localhost:5433/ferri";
const reachable = await (async () => {
  const probe = createDb(url);
  try {
    await probe.sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.close();
  }
})();

describe.skipIf(!reachable)("settings and skills in Postgres", () => {
  const { db, close } = createDb(url);
  const slug = `settings-test-${Date.now()}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ferri-skills-db-"));
  let communityId = "";
  let eventId = "";
  let spaceId = "";

  beforeAll(async () => {
    fs.writeFileSync(path.join(dir, "librarian.md"), "Default librarian.");
    const [c] = await db.insert(communities).values({ slug, name: "Settings Test" }).returning();
    communityId = c!.id;
    const [e] = await db.insert(events).values({ communityId, slug: "night", name: "Test Night", stage: "live" }).returning();
    eventId = e!.id;
    const [s] = await db.insert(spaces).values({ communityId, switchRoomId: `room-${slug}`, name: "Test WhatsApp", platform: "whatsapp_web", state: "known" }).returning();
    spaceId = s!.id;
    await db.insert(eventSpaces).values({ eventId, spaceId, mode: "auto", role: "members" });
  });

  afterAll(async () => {
    if (communityId) await db.delete(communities).where(eq(communities.id, communityId));
    await close();
  });

  it("writes only the changed keys at each level and reads them back fresh", async () => {
    await writeSettings(db, { level: "community", communityId }, { set: { tone: "warm" }, by: "Rudra" });
    await writeSettings(db, { level: "event", eventId }, { set: { care: "off", stepInSeconds: 5 }, by: "Asha" });
    // Only tone and language reach a space.
    await writeSettings(db, { level: "space", eventId, spaceId }, { set: { language: "Hindi", care: "on" }, by: "Rudra" });
    const s = await settingsFor(db, { communityId, eventId, spaceId });
    expect(s).toMatchObject({ tone: "warm", language: "Hindi", care: "off", stepInSeconds: 5 });
    const [row] = await db.select({ settings: eventSpaces.settings }).from(eventSpaces).where(eq(eventSpaces.spaceId, spaceId));
    expect(cleanSettings(row!.settings)).toEqual({ language: "Hindi" });
    expect(changedBy(row!.settings).language?.by).toBe("Rudra");
    await writeSettings(db, { level: "event", eventId }, { remove: ["care"], by: "Asha" });
    expect((await settingsFor(db, { communityId, eventId })).care).toBe("on");
  });

  it("edits a skill with revisions and resets it to the default file", async () => {
    expect((await skillText(db, dir, communityId, "librarian"))?.text).toBe("Default librarian.");
    await saveSkill(db, { communityId, key: "librarian", body: "Edited.\n\nSign off with: Cheers, Ferri", by: "Rudra" });
    expect(await skillText(db, dir, communityId, "librarian")).toMatchObject({ edited: true, version: 1 });
    expect((await saveSkill(db, { communityId, key: "librarian", body: "Edited.\n\nSign off with: Cheers, Ferri", by: "Rudra" })).changed).toBe(false);
    await saveSkill(db, { communityId, key: "librarian", body: "Edited twice.", by: "Asha" });
    await resetSkill(db, dir, { communityId, key: "librarian", by: "Asha" });
    expect(await skillText(db, dir, communityId, "librarian")).toMatchObject({ edited: false, text: "Default librarian." });
    const [row] = (await communitySkillRows(db, communityId)).filter((r) => r.key === "librarian");
    const revs = await skillRevisionList(db, row!.id);
    expect(revs.map((r) => r.change)).toEqual(["reset", "edited", "created"]);
    // Editing again after a reset makes the row live again.
    await saveSkill(db, { communityId, key: "librarian", body: "Back again.", by: "Rudra" });
    expect((await skillText(db, dir, communityId, "librarian"))?.text).toBe("Back again.");
    await expect(resetSkill(db, dir, { communityId, key: "desks/custom-x", by: "Rudra" })).rejects.toThrow(/no default/);
  });
});
