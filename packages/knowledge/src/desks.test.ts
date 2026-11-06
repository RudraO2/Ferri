import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import YAML from "yaml";
import { communities, createDb, deskRows, desks, events, guests, runMigrations, skillRevisions, skills, spaces } from "@ferri/db";
import type { CrewMember } from "./crew.ts";
import {
  DESK_KINDS,
  PACK_TYPES,
  checkInGuest,
  checkInTarget,
  customDeskText,
  deskAutoHelp,
  deskCare,
  deskForRoom,
  deskInvitees,
  deskKickoff,
  deskKindFor,
  deskPromptBlock,
  deskRoomName,
  deskTemplate,
  eventShortName,
  fallbackDeskSkill,
  findDesk,
  freeSkillKey,
  matchRowForChange,
  mergeRow,
  packTypeFor,
  parseDeskSkill,
  parsePack,
  parseWho,
  renderDeskSkill,
  renderSheetDocument,
  saveFerriSkill,
  sheetCsv,
  sheetSummary,
  summaryText,
  tidySheetReading,
  type Desk,
  type DeskSheet,
} from "./desks.ts";

const skillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../skills");
const read = (key: string) => fs.readFileSync(path.join(skillsDir, `${key}.md`), "utf8");

describe("shipped desk skills and packs", () => {
  it.each(DESK_KINDS)("desks/%s parses", (kind) => {
    const p = parseDeskSkill(read(`desks/${kind}`));
    if (!p.ok) throw new Error(p.error);
    expect(p.skill.kind).toBe(kind);
    expect(p.skill.body.length).toBeGreaterThan(100);
    expect(p.skill.kickoff).toContain("{event}");
    // A re-render parses to the same skill (Desk edits round-trip).
    const again = parseDeskSkill(renderDeskSkill(p.skill));
    expect(again.ok && again.skill).toEqual(p.skill);
  });
  it.each(PACK_TYPES)("packs/%s parses and names only shipped desks", (type) => {
    const p = parsePack(read(`packs/${type}`), type);
    if (!p.ok) throw new Error(p.error);
    expect(p.pack.type).toBe(type);
    for (const d of p.pack.desks) expect(DESK_KINDS as readonly string[]).toContain(d);
    expect(p.pack.instructions.length).toBeGreaterThan(20);
  });
  it("has the right care and sheets on the special desks", () => {
    const get = (k: string) => {
      const p = parseDeskSkill(read(`desks/${k}`));
      if (!p.ok) throw new Error(p.error);
      return p.skill;
    };
    expect(get("help").care).toBe("help");
    expect(get("help").sheet).toBeNull();
    expect(get("judging").sheet?.summary).toEqual({ by: "team", op: "sum", value: "score" });
    expect(get("judging").visibility).toBe("private");
    expect(get("checkin").sheet?.link).toBe("guests.checkin");
    expect(get("safety").sheet?.link).toBe("care");
    expect(get("safety").body).toMatch(/on duty/);
    expect(get("safety").body).not.toMatch(/we (read|store)/i);
  });
  it("hackathon has the five desks of the spec", () => {
    const p = parsePack(read("packs/hackathon"));
    expect(p.ok && p.pack.desks).toEqual(["help", "judging", "mentors", "volunteers", "checkin"]);
  });
});

describe("parseDeskSkill", () => {
  const base = (front: string) => `---\nkind: x\ntitle: X desk\nroom: x\n${front}\n---\nBe nice.`;
  it("fills defaults", () => {
    const p = parseDeskSkill(base(""));
    expect(p.ok && p.skill).toMatchObject({ visibility: "private", mode: "auto", who: [{ kind: "named" }], topic: "other", care: "normal", sheet: null, body: "Be nice." });
  });
  it("refuses bad files with a reason", () => {
    expect(parseDeskSkill("no front matter")).toMatchObject({ ok: false });
    expect(parseDeskSkill(base("mode: shout"))).toMatchObject({ ok: false });
    expect(parseDeskSkill(base("who: everyone"))).toMatchObject({ ok: false, error: expect.stringContaining("who") });
    expect(parseDeskSkill(base("sheet:\n  name: S\n  columns: [a, a]"))).toMatchObject({ ok: false });
    expect(parseDeskSkill(base("sheet:\n  name: S\n  columns: [a, b]\n  summary: { by: c, count: true }"))).toMatchObject({ ok: false });
    expect(parseDeskSkill(base("sheet:\n  name: S\n  columns: [a, b]\n  summary: { by: a }"))).toMatchObject({ ok: false });
    expect(parseDeskSkill("---\nkind: [unclosed\n---\nx")).toMatchObject({ ok: false });
  });
  it("normalizes columns", () => {
    const p = parseDeskSkill(base("sheet:\n  name: Items\n  columns: [Item, Where found]\n  summary: { by: Where found, count: true }"));
    expect(p.ok && p.skill.sheet).toMatchObject({ columns: ["item", "where_found"], summary: { by: "where_found", op: "count", value: null } });
  });
  it("reads who", () => {
    expect(parseWho("topic:judging, leads")).toEqual([{ kind: "topic", topic: "judging" }, { kind: "leads" }]);
    expect(parseWho("crew")).toEqual([{ kind: "crew" }]);
    expect(parseWho("the judges")).toBeNull();
  });
});

describe("names and templates", () => {
  it("puts the event's short name in front", () => {
    expect(eventShortName({ slug: "build-night", name: "Lantern Build Night" })).toBe("bn");
    expect(eventShortName({ slug: "diwali", name: "Diwali" })).toBe("diwali");
    expect(eventShortName({ slug: "", name: "Lantern Build Night" })).toBe("lbn");
    expect(deskRoomName({ slug: "build-night" }, "judging")).toBe("bn-judging");
    expect(deskRoomName({ slug: "build-night" }, "Rangoli Judges")).toBe("bn-rangoli-judges");
    expect(deskRoomName(null, "help")).toBe("help");
  });
  it("writes a template like the team rooms", () => {
    const yaml = deskTemplate({
      bridge: "Mattermost",
      agentName: "ferri",
      eventName: "Lantern Build Night",
      desk: { title: "Judging desk", roomName: "bn-judging", visibility: "private", members: ["arjun"], kickoff: 'Welcome, "judges"!' },
    });
    const doc = YAML.parse(yaml);
    expect(doc.version).toBe(2);
    expect(doc.resources.desk_1).toEqual({
      type: "room",
      name: "bn-judging",
      description: "Judging desk, Lantern Build Night",
      bridge: "Mattermost",
      channel_type: "channel_private",
      agents: ["ferri"],
      users: ["arjun"],
      kickoff: 'Welcome, "judges"!',
    });
    const pub = YAML.parse(deskTemplate({ bridge: "B", agentName: "ferri", eventName: "E", desk: { title: "T", roomName: "r", visibility: "public", members: [], kickoff: "k" } }));
    expect(pub.resources.desk_1.channel_type).toBe("channel_public");
    expect(pub.resources.desk_1.users).toEqual([]);
  });
  it("fills the kickoff", () => {
    expect(deskKickoff({ kickoff: "Hi {event}, ask @{agent}.", title: "T", eventName: "Build Night", agentName: "ferri" })).toBe("Hi Build Night, ask @ferri.");
    expect(deskKickoff({ kickoff: "", title: "Help desk", eventName: "BN", agentName: "ferri" })).toBe("Welcome to the Help desk for BN! Ask @ferri anything here.");
  });
  it("maps words to kinds and packs", () => {
    expect(deskKindFor("lost and found")).toBe("lost-found");
    expect(deskKindFor("check-in")).toBe("checkin");
    expect(deskKindFor("judging")).toBe("judging");
    expect(deskKindFor("rangoli photographers")).toBeNull();
    expect(packTypeFor("a board game night")).toBe("game-night");
    expect(packTypeFor("Diwali party")).toBe("festival");
    expect(packTypeFor("meetup")).toBe("meetup");
    expect(packTypeFor("hackathon")).toBe("hackathon");
    expect(packTypeFor("a wedding")).toBeNull();
  });
});

describe("deskInvitees", () => {
  const crew: CrewMember[] = [
    { id: "1", eventId: "e", name: "Rudra", handles: { mattermost: "user" }, topics: ["judging"], lead: true, onDuty: true },
    { id: "2", eventId: "e", name: "Arjun Rao", handles: { mattermost: "arjun", slack: "Arjun.R" }, topics: ["tech"], lead: false, onDuty: false },
    { id: "3", eventId: "e", name: "Priya", handles: { slack: "priya_k" }, topics: ["judging"], lead: false, onDuty: false },
  ];
  it("invites exactly the people named, by their handle on the platform", () => {
    expect(deskInvitees({ who: [{ kind: "topic", topic: "judging" }], crew, named: ["arjun", "@meera"], platform: "mattermost" })).toEqual({ users: ["arjun", "meera"], names: ["Arjun Rao", "meera"], missing: [] });
    expect(deskInvitees({ who: [], crew, named: ["Arjun"], platform: "slack" }).users).toEqual(["Arjun.R"]);
  });
  it("uses who when nobody is named", () => {
    expect(deskInvitees({ who: [{ kind: "topic", topic: "judging" }], crew, named: [], platform: "mattermost" })).toEqual({ users: ["user"], names: ["Rudra"], missing: ["Priya"] });
    expect(deskInvitees({ who: [{ kind: "leads" }], crew, named: [], platform: "mattermost" }).users).toEqual(["user"]);
    expect(deskInvitees({ who: [{ kind: "crew" }, { kind: "leads" }], crew, named: [], platform: "slack" }).users).toEqual(["Arjun.R", "priya_k"]);
  });
});

describe("sheets", () => {
  const sheet: DeskSheet = { name: "Scores", columns: ["team", "judge", "criterion", "score", "note"], add: "a score", summary: { by: "team", op: "sum", value: "score" }, link: "none" };
  const rows = [
    { id: "a", data: { team: "Team Alpha", judge: "Arjun", criterion: "innovation", score: 8, note: null }, by: "Arjun", createdAt: new Date("2026-11-21T10:00:00Z") },
    { id: "b", data: { team: "team alpha", judge: "Priya", criterion: "design", score: 7, note: null }, by: "Priya", createdAt: new Date("2026-11-21T10:05:00Z") },
    { id: "c", data: { team: "Team Beta", judge: "Arjun", criterion: "innovation", score: 9, note: "great | demo" }, by: "Arjun", createdAt: new Date("2026-11-21T10:10:00Z") },
  ];
  it("sums per group, ranked, case-insensitive", () => {
    expect(sheetSummary(sheet, rows)).toEqual([
      { key: "Team Alpha", value: 15, rows: 2 },
      { key: "Team Beta", value: 9, rows: 1 },
    ]);
    expect(sheetSummary({ ...sheet, summary: { by: "team", op: "average", value: "score" } }, rows)[0]).toEqual({ key: "Team Beta", value: 9, rows: 1 });
    expect(sheetSummary({ ...sheet, summary: { by: "judge", op: "count", value: null } }, rows)).toEqual([
      { key: "Arjun", value: 2, rows: 2 },
      { key: "Priya", value: 1, rows: 1 },
    ]);
  });
  it("writes the summary for chat", () => {
    const t = summaryText(sheet, rows, "Judging desk");
    expect(t).toContain("3 scores so far");
    expect(t).toContain("1. Team Alpha: 15 (2 scores)");
    expect(t).toContain("2. Team Beta: 9 (1 score)");
    expect(summaryText(sheet, [])).toContain("Nothing yet");
    const noSum = summaryText({ ...sheet, summary: null, name: "Check-ins" }, [{ data: { team: "Asha Guest" }, by: "Meera" }]);
    expect(noSum).toContain("1 check-in so far");
    expect(noSum).toContain("- Asha Guest (Meera)");
  });
  it("renders the document and the CSV", () => {
    const doc = renderSheetDocument({ title: "Judging desk", roomName: "bn-judging", eventName: "Build Night", sheet, rows, timeZone: "Asia/Kolkata" });
    expect(doc).toContain("# Judging desk: Scores");
    expect(doc).toContain("| # | team | judge | criterion | score | note | by | when |");
    expect(doc).toContain("great \\| demo");
    expect(doc).toContain("## Summary");
    const csv = sheetCsv(sheet, rows);
    expect(csv.split("\r\n")[0]).toBe("team,judge,criterion,score,note,by,at");
    expect(csv).toContain("Team Beta,Arjun,innovation,9,great | demo,Arjun,2026-11-21T10:10:00.000Z");
  });
  it("tidies a reading in code", () => {
    const refs = new Map([["S1", "a"]]);
    expect(tidySheetReading({ action: "add", rows: [{ row_ref: "", team: "Team Alpha", judge: "Arjun", criterion: "innovation", score: "8", note: "" }] }, sheet, refs)).toEqual({
      action: "add",
      rows: [{ ref: null, data: { team: "Team Alpha", judge: "Arjun", criterion: "innovation", score: 8, note: null } }],
    });
    expect(tidySheetReading({ action: "change", rows: [{ row_ref: "s1", team: "", judge: "", criterion: "", score: "9", note: "" }] }, sheet, refs).rows[0]!.ref).toBe("a");
    expect(tidySheetReading({ action: "add", rows: [{ row_ref: "", team: "", judge: "", criterion: "", score: "", note: "" }] }, sheet, refs).action).toBe("none");
    expect(tidySheetReading({ action: "show", rows: [{ row_ref: "", team: "x", judge: "", criterion: "", score: "", note: "" }] }, sheet, refs)).toEqual({ action: "show", rows: [] });
  });
  it("finds the row a change means and keeps untouched values", () => {
    expect(matchRowForChange(sheet, rows, { team: "Team Alpha", judge: "Arjun", criterion: "innovation", score: 9, note: null }, "Arjun")).toBe("a");
    expect(matchRowForChange(sheet, rows, { team: "Team Gamma", judge: null, criterion: null, score: 9, note: null }, "Arjun")).toBeNull();
    expect(mergeRow(rows[0]!.data, { team: null, judge: null, criterion: null, score: 9, note: null })).toEqual({ ...rows[0]!.data, score: 9 });
  });
  it("finds the guest a check-in names", () => {
    const s: DeskSheet = { name: "Check-ins", columns: ["name", "email", "note"], add: "", summary: null, link: "guests.checkin" };
    expect(checkInTarget(s, { name: "Asha Guest", email: null, note: null })).toEqual({ email: null, name: "Asha Guest" });
    expect(checkInTarget(s, { name: null, email: "a@x.io", note: null })).toEqual({ email: "a@x.io", name: null });
  });
});

describe("custom desks", () => {
  it("the fallback is a valid skill", () => {
    const p = parseDeskSkill(fallbackDeskSkill({ what: "the rangoli judges post scores per entry", name: "rangoli judges" }));
    expect(p.ok && p.skill).toMatchObject({ kind: "custom-rangoli-judges", room: "rangoli-judges", visibility: "private", sheet: null });
  });
  it("writes the writer's fields as a valid skill", () => {
    const text = customDeskText(
      {
        title: "Rangoli judging desk",
        room: "rangoli-judging",
        visibility: "private",
        mode: "auto",
        who: "named",
        topic: "judging",
        care: "normal",
        kickoff: "Welcome, rangoli judges! Post scores like \"Entry 4: 9 for colour\".",
        behavior: "Judges post scores per entry.\n- Never say who is winning.",
        has_sheet: true,
        sheet_name: "Scores",
        columns: ["Entry", "judge", "criterion", "score"],
        add: "A judge scores an entry",
        summary_by: "entry",
        summary_op: "sum",
        summary_value: "score",
      },
      { name: "rangoli judges" },
    );
    const p = parseDeskSkill(text);
    if (!p.ok) throw new Error(p.error);
    expect(p.skill.kind).toBe("custom-rangoli-judges");
    expect(p.skill.sheet).toEqual({ name: "Scores", columns: ["entry", "judge", "criterion", "score"], add: "A judge scores an entry", summary: { by: "entry", op: "sum", value: "score" }, link: "none" });
    expect(p.skill.body).toBe("- Judges post scores per entry.\n- Never say who is winning.");
  });
  it("drops a summary that names no column", () => {
    const p = parseDeskSkill(
      customDeskText(
        { title: "Photo desk", room: "photos", visibility: "public", mode: "auto", who: "crew", topic: "other", care: "off", kickoff: "", behavior: "- Log shots.", has_sheet: true, sheet_name: "Shots", columns: ["shot", "by"], add: "", summary_by: "camera", summary_op: "count", summary_value: "" },
        { name: "" },
      ),
    );
    expect(p.ok && p.skill.sheet?.summary).toBeNull();
    expect(p.ok && p.skill.care).toBe("off");
  });
});

describe("desk helpers", () => {
  const d = (over: Partial<Desk>): Desk => ({ id: "x", communityId: "c", eventId: "e", kind: "judging", title: "Judging desk", skillKey: "desks/judging", skillVersion: 0, spaceId: null, roomName: "bn-judging", switchRoomId: null, platform: "mattermost", visibility: "private", members: [], status: "created", error: null, cardId: null, sheetDocumentId: null, requestedBy: "Rudra", sourceMessageId: null, createdAt: new Date(), updatedAt: new Date(), ...over });
  it("finds a desk by kind or name", () => {
    const list = [d({ id: "1" }), d({ id: "2", kind: "custom-rangoli-judges", title: "Rangoli judging desk", roomName: "bn-rangoli-judging" }), d({ id: "3", kind: "checkin", status: "planned" })];
    expect(findDesk(list, { kind: "judging" })?.id).toBe("1");
    expect(findDesk(list, { kind: "", name: "rangoli judges" })?.id).toBe("2");
    expect(findDesk(list, { kind: "checkin" })).toBeNull();
  });
  it("help desks send technical cases at any stage, never in Listen or the pause", () => {
    const c = { technical: true, kind: "stuck", mode: "auto", paused: false };
    expect(deskAutoHelp("help", c)).toBe(true);
    expect(deskAutoHelp("normal", c)).toBe(false);
    expect(deskAutoHelp("help", { ...c, mode: "listen" })).toBe(false);
    expect(deskAutoHelp("help", { ...c, paused: true })).toBe(false);
    expect(deskAutoHelp("help", { ...c, kind: "upset" })).toBe(false);
  });
  it("names the desk in the prompt block", () => {
    const p = parseDeskSkill(read("desks/judging"));
    if (!p.ok) throw new Error(p.error);
    const block = deskPromptBlock({ desk: { title: "Judging desk", roomName: "bn-judging" }, skill: p.skill, eventName: "Build Night" });
    expect(block.split("\n")[0]).toBe("# This room: Judging desk (#bn-judging, Build Night)");
    expect(block).not.toContain("kickoff:");
  });
});

// Runs against the local Ferri Postgres (`pnpm db:up`); skipped when it is not running.
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

describe.skipIf(!reachable)("desks in Postgres", () => {
  const { db, close } = createDb(url);
  const slug = `desks-test-${Date.now()}`;
  let communityId = "";
  let eventId = "";
  let spaceId = "";

  beforeAll(async () => {
    await runMigrations(url);
    const [c] = await db.insert(communities).values({ slug, name: "Desks Test" }).returning();
    communityId = c!.id;
    const [e] = await db.insert(events).values({ communityId, slug: "night", name: "Test Night" }).returning();
    eventId = e!.id;
    const [s] = await db.insert(spaces).values({ communityId, switchRoomId: `room-${slug}`, name: "Mattermost: tn-help", platform: "mattermost" }).returning();
    spaceId = s!.id;
    await db.insert(guests).values([
      { communityId, eventId, email: "asha@example.com", name: "Asha  Guest", code: `${slug}-1` },
      { communityId, eventId, email: "ravi@example.com", name: "Ravi", code: `${slug}-2` },
      { communityId, eventId, email: "ravi2@example.com", name: "ravi", code: `${slug}-3` },
    ]);
  });
  afterAll(async () => {
    await db.delete(communities).where(eq(communities.id, communityId));
    await close();
  });

  it("checks guests in by email, else exact name, never a guess", async () => {
    expect(await checkInGuest(db, eventId, { name: "asha guest" })).toMatchObject({ name: "Asha  Guest", already: false });
    expect(await checkInGuest(db, eventId, { email: "ASHA@example.com" })).toMatchObject({ already: true });
    expect(await checkInGuest(db, eventId, { name: "Ravi" })).toBeNull(); // two guests named Ravi
    expect(await checkInGuest(db, eventId, { email: "ravi2@example.com", name: "whoever" })).toMatchObject({ name: "ravi" });
    expect(await checkInGuest(db, eventId, { name: "Nobody" })).toBeNull();
    const [g] = await db.select().from(guests).where(eq(guests.email, "asha@example.com"));
    expect(g!.checkedInAt).not.toBeNull();
  });

  it("finds a desk by room and space, with its care", async () => {
    const [d] = await db
      .insert(desks)
      .values({ communityId, eventId, kind: "help", title: "Help desk", skillKey: "desks/help", spaceId, roomName: "tn-help", switchRoomId: `room-${slug}`, status: "created", requestedBy: "test" })
      .returning();
    expect((await deskForRoom(db, `room-${slug}`))?.id).toBe(d!.id);
    expect(await deskCare(db, skillsDir, spaceId)).toBe("help");
    await db.insert(deskRows).values({ deskId: d!.id, data: { a: 1 }, by: "x", messageId: `${slug}-m1` });
    // A community edit to the skill wins over the file.
    await db.insert(skills).values({ communityId, key: "desks/help", body: read("desks/help").replace("care: help", "care: off"), editedBy: "test" });
    expect(await deskCare(db, skillsDir, spaceId)).toBe("off");
  });

  it("saves a skill Ferri wrote with revision 1, and finds a free key", async () => {
    const key = await freeSkillKey(db, communityId, "desks/custom-rangoli");
    expect(key).toBe("desks/custom-rangoli");
    const saved = await saveFerriSkill(db, { communityId, key, body: fallbackDeskSkill({ what: "x", name: "rangoli" }), by: "Rudra" });
    expect(saved.version).toBe(1);
    const [row] = await db.select().from(skills).where(eq(skills.id, saved.id));
    expect(row).toMatchObject({ origin: "ferri", editedBy: "Rudra" });
    const revs = await db.select().from(skillRevisions).where(eq(skillRevisions.skillId, saved.id));
    expect(revs.map((r) => [r.version, r.change])).toEqual([[1, "created"]]);
    expect(await freeSkillKey(db, communityId, "desks/custom-rangoli")).toBe("desks/custom-rangoli-2");
  });
});
