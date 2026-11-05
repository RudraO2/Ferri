import { describe, expect, it } from "vitest";
import type { CrewMember } from "./crew.ts";
import { shortAnnouncementIds } from "./intent.ts";
import {
  approvers,
  describeTargets,
  findRoomId,
  formatWhen,
  localNow,
  parseWhen,
  stripRoomWide,
  teamRoomName,
  teamRoomsTemplate,
  worthAnnouncing,
} from "./launch.ts";

const member = (name: string, extra: Partial<CrewMember> = {}): CrewMember => ({
  id: name,
  eventId: "e",
  name,
  handles: {},
  topics: [],
  lead: false,
  onDuty: false,
  ...extra,
});

describe("time", () => {
  const now = new Date("2026-11-21T08:00:00Z");
  it("accepts a time from now up to 60 days ahead", () => {
    expect(parseWhen("2026-11-21T18:00:00+05:30", now)?.toISOString()).toBe("2026-11-21T12:30:00.000Z");
    expect(parseWhen("2026-11-21T07:59:00Z", now)).not.toBeNull(); // a minute late still counts
  });
  it("refuses junk, the past and far futures", () => {
    expect(parseWhen("tomorrow", now)).toBeNull();
    expect(parseWhen("2026-11-21T07:00:00Z", now)).toBeNull();
    expect(parseWhen("2027-03-01T00:00:00Z", now)).toBeNull();
    expect(parseWhen(null, now)).toBeNull();
  });
  it("writes times in the community's zone", () => {
    expect(formatWhen(new Date("2026-11-21T12:30:00Z"), "Asia/Kolkata")).toBe("6:00 PM, Sat 21 Nov");
    expect(localNow("Asia/Kolkata", now)).toMatch(/Saturday, 21 November 2026.*1:30:00 pm \(Asia\/Kolkata, GMT\+05:30\)/i);
  });
});

describe("announcement text", () => {
  it("never pages a whole channel", () => {
    expect(stripRoomWide("@everyone Lunch moves to 1:30.")).toBe("Lunch moves to 1:30.");
    expect(stripRoomWide("Heads up @channel: doors open")).toBe("Heads up doors open");
    expect(stripRoomWide("Email us at crew@lantern.dev")).toBe("Email us at crew@lantern.dev");
  });
  it("names where it goes", () => {
    expect(describeTargets([])).toBe("no spaces");
    expect(
      describeTargets([
        { name: "Pulse Slack: build-night", platform: "slack" },
        { name: "ferri-lab", platform: "mattermost" },
      ]),
    ).toBe("2 spaces: Slack build-night, Mattermost ferri-lab");
  });
  it("gives recent announcements short ids, newest first", () => {
    const { text, byShort } = shortAnnouncementIds([
      { id: "x", title: "Lunch moves", text: "Lunch is at 1:30.", status: "sent" },
      { id: "y", title: "Wifi", text: "Wifi is back.", status: "waiting" },
    ]);
    expect(text).toContain("A1 [sent] Lunch moves: Lunch is at 1:30.");
    expect(byShort.get("A2")?.id).toBe("y");
  });
});

describe("decisions", () => {
  const d = { decision: true, for_members: true, final: true, what: "Judging moves to 4 PM.", changes: null, duplicate_of: null };
  it("offers only settled decisions the members need", () => {
    expect(worthAnnouncing(d)).toBe(true);
    expect(worthAnnouncing({ ...d, final: false })).toBe(false);
    expect(worthAnnouncing({ ...d, for_members: false })).toBe(false);
    expect(worthAnnouncing({ ...d, what: " " })).toBe(false);
    expect(worthAnnouncing(null)).toBe(false);
  });
});

describe("approvers", () => {
  it("leads first, then on duty, then everyone", () => {
    const crew = [member("Rudra", { lead: true }), member("Priya", { onDuty: true }), member("Sam")];
    expect(approvers(crew)).toMatchObject({ reason: "lead", owners: [{ name: "Rudra" }] });
    expect(approvers(crew.slice(1))).toMatchObject({ reason: "on_duty", owners: [{ name: "Priya" }] });
    expect(approvers([member("Sam")]).reason).toBe("everyone");
  });
});

describe("team rooms", () => {
  it("makes plain channel names", () => {
    expect(teamRoomName("Team Alpha")).toBe("team-alpha");
    expect(teamRoomName("Rocket 🚀 Squad")).toBe("team-rocket-squad");
    expect(teamRoomName("!!!")).toBe("team");
  });
  it("writes a version 2 template with the bridge, members, Ferri and a kickoff", () => {
    const yaml = teamRoomsTemplate({
      bridge: "Mattermost",
      agentName: "ferri",
      eventName: "Lantern Build Night",
      teams: [{ name: "Team Alpha", roomName: "team-alpha", members: ["meera", "arjun"] }],
    });
    expect(yaml).toContain("version: 2");
    expect(yaml).toContain('    name: "team-alpha"');
    expect(yaml).toContain('    bridge: "Mattermost"');
    expect(yaml).toContain("    channel_type: channel_private");
    expect(yaml).toContain('    agents: ["ferri"]');
    expect(yaml).toContain('    users: ["meera", "arjun"]');
    expect(yaml).toContain("Welcome, Team Alpha!");
  });
  it("finds the new room's id in the template run's result", () => {
    const id = "44348140-bbf7-4192-a629-ef31efce44c9";
    expect(findRoomId({ rooms: [{ id: "8076dc9e-9286-4921-aab1-151f673946b4", name: "team-beta" }, { id, name: "team-alpha" }] }, "team-alpha")).toBe(id);
    expect(findRoomId({ room_id: id }, "x")).toBe(id);
    expect(findRoomId({ ok: true }, "x")).toBeNull();
  });
});
