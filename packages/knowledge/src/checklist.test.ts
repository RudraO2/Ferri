import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { firstRunChecklist, firstRunFocus, isDemoKnowledge, isTestChat, type FirstRunFacts, type FirstRunSpace, type FirstRunTickId } from "./checklist.ts";
import type { BridgeInfo } from "./doctor.ts";
import { parseKnowledgeMarkdown } from "./markdown.ts";

const LANTERN = { id: "ev-demo", name: "Lantern Build Night" };
const MINE = { id: "ev-mine", name: "Pune Hack Night" };

const bridge = (type: string, extra: Partial<BridgeInfo> = {}): BridgeInfo => ({
  bridge_id: `b-${type}`,
  bridge_type: type,
  display_name: type,
  status: "active",
  room_count: 1,
  attention: null,
  ...extra,
});

function space(name: string, platform: string | null, at?: { event: { id: string; name: string }; role?: "members" | "crew" }, archived = false): FirstRunSpace {
  return { name, platform, archived, attachment: at ? { eventId: at.event.id, eventName: at.event.name, role: at.role ?? "members" } : null };
}

const demoKnowledge = [
  { eventId: null, sourceKind: "markdown", sourceTitle: "About Lantern Labs" },
  { eventId: null, sourceKind: "markdown", sourceTitle: "Lantern Labs Code of Conduct" },
  { eventId: LANTERN.id, sourceKind: "markdown", sourceTitle: "Lantern Build Night FAQ" },
];

/** A fresh `./ferri up`: the Mattermost test chat, the demo event and its knowledge, the demo crew. */
const fresh: FirstRunFacts = {
  bridges: [bridge("mattermost")],
  spaces: [space("ferri-lab", "mattermost", { event: LANTERN }), space("ferri-crew", "mattermost", { event: LANTERN, role: "crew" }), space("Town Square", "mattermost")],
  liveEvents: [LANTERN],
  knowledge: demoKnowledge,
  crew: [
    { name: "Rudra", eventId: LANTERN.id, linked: false, push: false },
    { name: "Priya", eventId: LANTERN.id, linked: false, push: false },
  ],
};

/** The host's own community next to the demo: Telegram and Discord, their event, crew room, FAQ and crew on Pocket. */
const ready: FirstRunFacts = {
  bridges: [bridge("mattermost"), bridge("telegram"), bridge("discord")],
  spaces: [
    ...fresh.spaces!,
    space("Telegram: Pune Hack Night", "telegram", { event: MINE }),
    space("Pune Discord: general", "discord", { event: MINE }),
    space("Pune Discord: crew", "discord", { event: MINE, role: "crew" }),
  ],
  liveEvents: [LANTERN, MINE],
  knowledge: [
    ...demoKnowledge,
    { eventId: MINE.id, sourceKind: "desk", sourceTitle: "Pune Hack Night FAQ" },
    { eventId: MINE.id, sourceKind: "markdown", sourceTitle: "Pune Hack Night schedule" },
  ],
  crew: [
    ...fresh.crew!,
    { name: "Asha", eventId: MINE.id, linked: true, push: true },
    { name: "asha ", eventId: null, linked: false, push: false },
    { name: "Ravi", eventId: MINE.id, linked: true, push: false },
  ],
};

const statuses = (facts: FirstRunFacts) => Object.fromEntries(firstRunChecklist(facts).ticks.map((t) => [t.id, t.status]));
const tick = (facts: FirstRunFacts, id: FirstRunTickId) => firstRunChecklist(facts).ticks.find((t) => t.id === id)!;

describe("firstRunChecklist", () => {
  it("starts at 0 of 6 on a fresh install: the test chat and the Lantern demo are demo, not done", () => {
    const list = firstRunChecklist(fresh);
    expect(list.ticks.map((t) => t.id)).toEqual(["platform", "group", "event", "crew-room", "knowledge", "pocket"]);
    expect(statuses(fresh)).toEqual({ platform: "demo", group: "demo", event: "demo", "crew-room": "demo", knowledge: "demo", pocket: "todo" });
    expect(list).toMatchObject({ done: 0, total: 6, connected: [] });
    expect(tick(fresh, "platform")).toMatchObject({ detail: "Only the built-in test chat (Mattermost) is connected.", cmd: "./ferri connect telegram --token <bot token>" });
    expect(tick(fresh, "group").next).toBe("Connect a chat app first (the step above).");
    expect(tick(fresh, "event").detail).toBe("Only the test chat is attached: “ferri-lab”, to Lantern Build Night.");
    expect(tick(fresh, "crew-room").detail).toBe("The crew room is “ferri-crew”, in the test chat.");
    expect(tick(fresh, "knowledge")).toMatchObject({ detail: "Only the Lantern demo knowledge is loaded.", next: "Make it yours: add your own FAQ, then remove the demo pages." });
    expect(tick(fresh, "pocket").detail).toBe("None of the 2 crew members is on Pocket yet.");
  });

  it("is 6 of 6 once the host's own community is set, with every tick saying what it found", () => {
    const list = firstRunChecklist(ready);
    expect(list).toMatchObject({ done: 6, total: 6, connected: ["telegram", "discord"] });
    expect(list.ticks.every((t) => t.next === null && t.cmd === null)).toBe(true);
    expect(list.ticks.map((t) => t.detail)).toEqual([
      "Telegram and Discord are connected.",
      "Ferri is in 3 groups: 2 on Discord and 1 on Telegram.",
      "2 groups are attached to Pune Hack Night.",
      "Cards for Pune Hack Night go to “Pune Discord: crew”.",
      "4 entries, 2 of them yours; the rest is the Lantern demo.",
      "2 of 2 crew members are on Pocket; 1 gets notices.",
    ]);
  });

  it("asks for a crew room on the host's event even when the demo event has one", () => {
    const facts = { ...ready, spaces: ready.spaces!.filter((s) => s.name !== "Pune Discord: crew") };
    expect(tick(facts, "crew-room")).toMatchObject({
      status: "todo",
      detail: "Pune Hack Night has no crew room, so questions Ferri can't answer reach nobody.",
      next: "On Spaces, tick crew room on a private group your crew uses.",
    });
  });

  it("calls a crew room in the test chat demo, and names the platform when the room name does not", () => {
    const testCrew = { ...ready, spaces: [...fresh.spaces!.filter((s) => s.attachment?.role !== "crew"), space("Telegram group", "telegram", { event: LANTERN }), space("ferri-crew", "mattermost", { event: LANTERN, role: "crew" })] };
    expect(tick(testCrew, "crew-room")).toMatchObject({ status: "demo", detail: "The crew room is “ferri-crew”, in the test chat." });
    const onSlack = { ...ready, spaces: [space("build-night", "slack", { event: MINE }), space("crew", "slack", { event: MINE, role: "crew" })] };
    expect(tick(onSlack, "crew-room").detail).toBe("Cards for Pune Hack Night go to “crew” on Slack.");
  });

  it("shows can't check for platforms when Switch is down, and still reads the rest from the database", () => {
    const facts = { ...fresh, bridges: null };
    expect(tick(facts, "platform")).toMatchObject({ status: "unknown", detail: "Switch's connections could not be read just now.", next: "Fix the Core checks below, then reload this page." });
    expect(tick(facts, "group")).toMatchObject({ status: "demo", next: "Add the bot to your group and post once there, then press Add Ferri on Spaces." });
    expect(statuses(facts)).toMatchObject({ event: "demo", knowledge: "demo", pocket: "todo" });
    expect(firstRunChecklist(facts).connected).toEqual([]);
  });

  it("shows can't check for everything from the database when it is down", () => {
    const facts: FirstRunFacts = { bridges: [bridge("telegram")], spaces: null, liveEvents: null, knowledge: null, crew: null };
    expect(statuses(facts)).toEqual({ platform: "done", group: "unknown", event: "unknown", "crew-room": "unknown", knowledge: "unknown", pocket: "unknown" });
    expect(tick(facts, "pocket").detail).toBe("Ferri's database did not answer just now.");
    expect(firstRunChecklist(facts).done).toBe(1);
  });

  it("is not done while the only platform needs attention, and mentions a broken one next to a working one", () => {
    const sick = { ...fresh, bridges: [bridge("telegram", { attention: "token revoked" })] };
    expect(tick(sick, "platform")).toMatchObject({ status: "todo", detail: "Telegram is connected but needs attention." });
    expect(firstRunChecklist(sick).connected).toEqual([]);
    const mixed = { ...fresh, bridges: [bridge("discord"), bridge("slack", { status: "error" }), bridge("whatsapp_web", { attention: "logged out" })] };
    expect(tick(mixed, "platform")).toMatchObject({ status: "done", detail: "Discord is connected. Slack and WhatsApp need attention (see Integrations below)." });
    expect(firstRunChecklist(mixed).connected).toEqual(["discord"]);
  });

  it("gives the first step for each tick on an empty install", () => {
    const empty: FirstRunFacts = { bridges: [], spaces: [], liveEvents: [], knowledge: [], crew: [] };
    const list = firstRunChecklist(empty, ".\\ferri");
    expect(list.done).toBe(0);
    expect(list.ticks.map((t) => [t.status, t.detail, t.next, t.cmd, t.page])).toEqual([
      ["todo", "No chat app is connected yet.", "Make a bot on Telegram, Discord or Slack, then connect it:", ".\\ferri connect telegram --token <bot token>", null],
      ["todo", "Ferri is not in any group yet.", "Connect a chat app first (the step above).", null, "spaces"],
      ["todo", "There is no live event yet.", "Create your event on Events.", null, "events"],
      ["todo", "There is no live event yet.", "Create your event on Events first.", null, "events"],
      ["todo", "No knowledge yet, so Ferri can only ask the crew.", "Add your FAQ on Knowledge, or load your markdown files:", ".\\ferri kb seed", "knowledge"],
      ["todo", "There is no crew yet.", "Add your crew and the topics each person owns on Events.", null, "events"],
    ]);
    // With an event and a crew, the steps happen on Spaces and in Pocket.
    expect(firstRunChecklist(fresh).ticks.map((t) => t.page)).toEqual([null, "spaces", "spaces", "spaces", "knowledge", "pocket"]);
  });

  it("counts only groups Ferri is still in, and attachments of the community's own apps", () => {
    const facts = { ...fresh, bridges: [bridge("telegram")], spaces: [...fresh.spaces!, space("Old Telegram group", "telegram", { event: LANTERN }, true)] };
    expect(statuses(facts)).toMatchObject({ platform: "done", group: "demo", event: "demo" });
    const nothingAttached = { ...facts, spaces: [space("Telegram: Lantern Build Night", "telegram")] };
    expect(tick(nothingAttached, "group").detail).toBe("Ferri is in 1 group on Telegram.");
    expect(tick(nothingAttached, "event")).toMatchObject({ status: "todo", detail: "No group is attached to an event yet, so Ferri is Off everywhere." });
  });

  it("counts crew members on Pocket once per person, and says when notices are off", () => {
    const one = { ...fresh, crew: [{ name: "Rudra", eventId: LANTERN.id, linked: false, push: false }] };
    expect(tick(one, "pocket").detail).toBe("Your crew member is not on Pocket yet.");
    const noPush = {
      ...fresh,
      crew: [
        { name: "Rudra", eventId: LANTERN.id, linked: true, push: false },
        { name: "rudra", eventId: null, linked: false, push: false },
        { name: "Priya", eventId: LANTERN.id, linked: false, push: false },
      ],
    };
    expect(tick(noPush, "pocket")).toMatchObject({ status: "done", detail: "1 of 2 crew members is on Pocket. Notices are not on yet." });
    const allPush = { ...fresh, crew: [{ name: "Rudra", eventId: null, linked: true, push: true }] };
    expect(tick(allPush, "pocket").detail).toBe("1 of 1 crew member is on Pocket, with notices on.");
  });

  it("leaves the demo event's crew out once the host's own event is the one it is about", () => {
    // ready keeps the demo crew (Rudra, Priya, not on Pocket) next to the host's own crew.
    expect(tick(ready, "pocket").detail).toBe("2 of 2 crew members are on Pocket; 1 gets notices.");
    // Without the spaces to tell which event matters, every crew row counts.
    expect(tick({ ...ready, spaces: null }, "pocket").detail).toBe("2 of 4 crew members are on Pocket; 1 gets notices.");
  });

  it("counts only the knowledge of the events it is about (plus the community's own)", () => {
    const facts = { ...ready, knowledge: [...demoKnowledge, { eventId: LANTERN.id, sourceKind: "crew_answer", sourceTitle: "Crew answer" }] };
    // The host's event has only the demo's community pages; the crew answer belongs to the demo event.
    expect(tick(facts, "knowledge")).toMatchObject({ status: "demo" });
    const own = { ...ready, knowledge: [{ eventId: null, sourceKind: "desk", sourceTitle: "About Pune Devs" }] };
    expect(tick(own, "knowledge").detail).toBe("1 entry for Pune Hack Night.");
  });
});

describe("firstRunFocus", () => {
  it("prefers events with the community's own groups, then any attached group, then every live event", () => {
    expect(firstRunFocus(ready.spaces!, ready.liveEvents!)).toEqual([MINE]);
    expect(firstRunFocus(fresh.spaces!, [LANTERN, MINE])).toEqual([LANTERN]);
    expect(firstRunFocus([space("Town Square", "mattermost")], [LANTERN, MINE])).toEqual([LANTERN, MINE]);
  });
});

describe("isTestChat and isDemoKnowledge", () => {
  it("treats the stack's Mattermost and Switch's own rooms as the test chat", () => {
    expect([null, "mattermost", "switch"].every(isTestChat)).toBe(true);
    expect(["telegram", "discord", "slack", "whatsapp_web", "teams"].some(isTestChat)).toBe(false);
  });

  it("recognises every page of the demo in seed/ as seeded, and nothing the host wrote or edited", () => {
    const seed = fileURLToPath(new URL("../../../seed", import.meta.url));
    const dirs = [path.join(seed, "knowledge"), ...fs.readdirSync(path.join(seed, "events")).map((e) => path.join(seed, "events", e, "knowledge"))];
    const titles = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => parseKnowledgeMarkdown(f, fs.readFileSync(path.join(d, f), "utf8")).title));
    expect(titles.length).toBeGreaterThanOrEqual(5);
    for (const title of titles) expect(isDemoKnowledge({ sourceKind: "markdown", sourceTitle: title }), title).toBe(true);
    expect(isDemoKnowledge({ sourceKind: "desk", sourceTitle: "Lantern Build Night FAQ" })).toBe(false);
    expect(isDemoKnowledge({ sourceKind: "crew_answer", sourceTitle: "Lantern Build Night FAQ" })).toBe(false);
    expect(isDemoKnowledge({ sourceKind: "markdown", sourceTitle: "Pune Hack Night FAQ" })).toBe(false);
  });
});
