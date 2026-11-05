import { describe, expect, it } from "vitest";
import { cardTitle, ladderTimes, resolveShortCard, shortCardIds, switchExpiry, type OpenCard } from "./cards.ts";
import { findCrewMember, foldHandle, mention, parseSender, routeCard, sameHandle, type CrewMember } from "./crew.ts";
import { looksLikeCardAnswer } from "./intent.ts";

const crew: CrewMember[] = [
  { id: "r", eventId: "e", name: "Rudra", handles: { mattermost: "user" }, topics: ["prizes", "rules"], lead: true, onDuty: true },
  { id: "p", eventId: "e", name: "Priya", handles: { mattermost: "priya", telegram: "priya_k" }, topics: ["food", "venue"], lead: false, onDuty: false },
];

describe("parseSender", () => {
  it("reads platform and username from a Switch platform id", () => {
    expect(parseSender("@switch-mattermost-4c80b8b2-0a05-484a-9d09-d94293496905-meera:localhost")).toEqual({
      platform: "mattermost",
      username: "meera",
    });
    expect(parseSender("@switch-slack-4c80b8b2-0a05-484a-9d09-d94293496905-jo-ann.k:example.org").username).toBe("jo-ann.k");
  });
  it("falls back to the sender name for other ids", () => {
    expect(parseSender("u-123", "Meera")).toEqual({ platform: null, username: "Meera" });
  });
  it("keeps the real platform username, which the bridges turn into a native mention", () => {
    const slack = "@switch-slack-1d0ad338-58fa-4f2f-bd02-fb2daea57388-rudra-pratap-12233:localhost";
    expect(parseSender(slack, "rudra.pratap.12233")).toEqual({ platform: "slack", username: "rudra.pratap.12233" });
    const tg = "@switch-telegram-7d38f725-6195-4602-9e26-535c69036a78-greenvalley_8123:localhost";
    expect(parseSender(tg, "GreenValley_8123").username).toBe("GreenValley_8123");
    // Switch appends a digest when two names fold alike.
    const twin = "@switch-slack-1d0ad338-58fa-4f2f-bd02-fb2daea57388-ann-marie-0a1b2c3d:localhost";
    expect(parseSender(twin, "Ann.Marie").username).toBe("Ann.Marie");
    // A sender name that is not the folded username (a display name) is not used.
    expect(parseSender(slack, "Rudra Pratap Singh").username).toBe("rudra-pratap-12233");
  });
  it("folds handles the way Switch does", () => {
    expect(foldHandle("@Jo.Ann ")).toBe("jo-ann");
    expect(sameHandle("@rudra.pratap.12233", "rudra-pratap-12233")).toBe(true);
    expect(sameHandle("priya", "priyanka")).toBe(false);
  });
});

describe("findCrewMember", () => {
  const id = (u: string, platform = "mattermost") => `@switch-${platform}-4c80b8b2-0a05-484a-9d09-d94293496905-${u}:localhost`;
  it("matches the handle on the same platform only, any case", () => {
    expect(findCrewMember(crew, id("Priya"))?.name).toBe("Priya");
    expect(findCrewMember(crew, id("priya_k", "telegram"))?.name).toBe("Priya");
    expect(findCrewMember(crew, id("priya_k"))).toBeNull();
    expect(findCrewMember(crew, id("meera"))).toBeNull();
  });
  it("matches a handle with dots or an @ against Switch's folded id", () => {
    const slackCrew: CrewMember[] = [{ ...crew[0]!, handles: { slack: "@rudra.pratap.12233" } }];
    expect(findCrewMember(slackCrew, id("rudra-pratap-12233", "slack"), "rudra.pratap.12233")?.name).toBe("Rudra");
    expect(mention(slackCrew[0]!, "slack")).toBe("@rudra.pratap.12233");
  });
});

describe("routeCard", () => {
  it("goes to topic owners, then whoever is on duty, then everyone", () => {
    expect(routeCard(crew, "venue")).toMatchObject({ reason: "owner", owners: [{ name: "Priya" }] });
    expect(routeCard(crew, "tech")).toMatchObject({ reason: "on_duty", owners: [{ name: "Rudra" }] });
    const noDuty = crew.map((c) => ({ ...c, onDuty: false }));
    expect(routeCard(noDuty, "tech").reason).toBe("everyone");
    expect(routeCard(noDuty, "tech").owners).toHaveLength(2);
  });
  it("writes @handles for the platform, or the name", () => {
    expect(mention(crew[1]!, "mattermost")).toBe("@priya");
    expect(mention(crew[1]!, "discord")).toBe("Priya");
  });
});

describe("ladderTimes", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const min = 60 * 1000;
  it("uses 10 minutes while live and 2 hours otherwise", () => {
    const live = ladderTimes({ now, stage: "live", eventEndsAt: null });
    expect(live.nudgeAt.getTime() - now.getTime()).toBe(10 * min);
    expect(live.escalateAt.getTime() - now.getTime()).toBe(20 * min);
    const before = ladderTimes({ now, stage: "launch", eventEndsAt: null });
    expect(before.nudgeAt.getTime() - now.getTime()).toBe(120 * min);
  });
  it("expires by the end of the event, never under 30 minutes, under Switch's 24 hours", () => {
    const soon = ladderTimes({ now, stage: "live", eventEndsAt: new Date(now.getTime() + 2 * 60 * min) });
    expect(soon.expiresAt.getTime() - now.getTime()).toBe(120 * min);
    const ending = ladderTimes({ now, stage: "live", eventEndsAt: new Date(now.getTime() + 5 * min) });
    expect(ending.expiresAt.getTime() - now.getTime()).toBe(30 * min);
    const far = ladderTimes({ now, stage: "plan", eventEndsAt: null });
    expect(switchExpiry(far.expiresAt, now).getTime() - now.getTime()).toBeLessThan(24 * 60 * min);
    expect(switchExpiry(far.expiresAt, now).getTime()).toBeGreaterThan(far.expiresAt.getTime());
  });
  it("takes test overrides", () => {
    const t = ladderTimes({ now, stage: "live", eventEndsAt: null, nudgeSeconds: 15, ttlSeconds: 60 });
    expect([t.nudgeAt, t.escalateAt, t.expiresAt].map((d) => (d.getTime() - now.getTime()) / 1000)).toEqual([15, 30, 60]);
  });
});

describe("cardTitle", () => {
  it("names topic, asker and room, and stays within 500 characters", () => {
    expect(cardTitle({ mentions: [], topic: "venue", asker: "meera", roomName: "ferri-lab", asked: "is there  parking?" })).toBe(
      "venue · meera asked in ferri-lab: “is there parking?”",
    );
    const long = cardTitle({ mentions: ["@priya"], topic: "food", asker: "a", roomName: "r", asked: "x".repeat(900) });
    expect(long.length).toBeLessThanOrEqual(500);
    expect(long.endsWith("…”")).toBe(true);
  });
});

describe("short card ids", () => {
  const open: OpenCard[] = [
    { id: "u1", eventId: null, topic: "venue", question: "Is there bike parking?", personal: false, crewRoomId: "c" },
    { id: "u2", eventId: null, topic: "registration", question: "Is Arjun's registration confirmed?", personal: true, crewRoomId: "c" },
  ];
  it("lists cards for a model and maps ids back", () => {
    const { text, byShort } = shortCardIds(open);
    expect(text).toBe("C1 [venue]: Is there bike parking?\nC2 [registration, personal]: Is Arjun's registration confirmed?");
    expect(resolveShortCard(" c2 ", byShort)?.id).toBe("u2");
    expect(resolveShortCard("C9", byShort)).toBeNull();
    expect(shortCardIds([]).text).toBe("(none)");
  });
});

describe("looksLikeCardAnswer", () => {
  it("spots typed card answers and nothing else", () => {
    for (const s of ['A1 "Dogs are fine"', "A12 1", "**A3 2**", "R4: yes", "a2 1"]) expect(looksLikeCardAnswer(s)).toBe(true);
    for (const s of ["Are there lockers?", "A1sauce is great", "AA1 yes", "I asked A1?", "anyone?"]) expect(looksLikeCardAnswer(s)).toBe(false);
  });
});
