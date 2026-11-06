import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  cards,
  careCases,
  communities,
  contactEvents,
  contacts,
  createDb,
  crewMembers,
  eventSpaces,
  events,
  guests,
  knowledgeEntries,
  knowledgeRevisions,
  planItems,
  questions,
  runMigrations,
  spaces,
  starterKits,
} from "@ferri/db";
import {
  allowedNumbers,
  applyKitSort,
  cleanPartners,
  contactKindForRole,
  dropInventedNumbers,
  guardLessons,
  kitInstructions,
  kitPlanQuestions,
  listingPlatform,
  matchEvent,
  numbersIn,
  pendingWrapRequests,
  recapLines,
  recapStats,
  renameSource,
  renderKitMarkdown,
  renderRecapText,
  requestWrap,
  savePartners,
  startFromKit,
  takeWrapRequests,
  wrapOptions,
  type RecapStats,
  type StarterKitContent,
} from "./wrap.ts";

const emptyStats = (): RecapStats => ({
  event: { name: "Lantern Build Night", startsAt: null, endsAt: null },
  questions: { asked: 0, people: 0, answeredByFerri: 0, answeredByCrew: 0, unanswered: 0, listened: 0, medianFerriSeconds: null, medianCrewMinutes: null, platforms: [] },
  knowledge: { crewAnswers: 0 },
  cards: { opened: 0, byKind: {}, answered: 0, expired: 0, dismissed: 0 },
  announcements: { sent: 0, spaces: 0, edits: 0 },
  care: { cases: 0, solved: 0, byBuilder: 0, open: 0 },
  guests: { registered: 0, going: 0, waitlist: 0, pending: 0, notGoing: 0, checkedIn: 0, confirmed: 0, freed: 0, reoffered: 0, sources: {} },
  guestEmails: { sends: 0, mails: 0, delivered: 0 },
  outreach: { emailed: 0, replies: 0, interested: 0, declined: 0 },
  listings: [],
  builder: { done: 0, byKind: {} },
  shield: { checks: 0, blocked: 0, redacted: 0 },
  spaces: { count: 0, platforms: [] },
  computedAt: "2026-11-22T10:00:00.000Z",
});

describe("the number guard", () => {
  const stats = emptyStats();
  stats.questions = { ...stats.questions, asked: 42, people: 17, answeredByFerri: 30, unanswered: 4 };
  stats.guests = { ...stats.guests, registered: 1200, checkedIn: 3 };
  const allowed = allowedNumbers(stats);

  it("collects every number in the stats", () => {
    expect(allowed.has("42")).toBe(true);
    expect(allowed.has("1200")).toBe(true);
    expect(allowed.has("5")).toBe(false);
  });

  it("reads digits, thousands and number words", () => {
    expect(numbersIn("We had 1,200 guests and 3.5 hours")).toEqual(["1200", "3.5"]);
    expect(numbersIn("twelve people and two teams")).toEqual(["12", "2"]);
    expect(numbersIn("No one was late")).toEqual([]);
  });

  it("drops only the sentences with an invented number", () => {
    const out = dropInventedNumbers(
      ["Ferri answered 30 of the 42 questions at once. That is 71% of them.", "About 50 people came.", "Answers were quick."],
      allowed,
    );
    expect(out).toEqual(["Ferri answered 30 of the 42 questions at once.", "Answers were quick."]);
  });

  it("ignores digits inside names it is told about", () => {
    expect(dropInventedNumbers(["Lantern Build Night 2 can reuse the FAQ."], allowed, ["Lantern Build Night 2"])).toEqual(["Lantern Build Night 2 can reuse the FAQ."]);
    expect(dropInventedNumbers(["Lantern Build Night 2 can reuse the FAQ."], allowed)).toEqual([]);
  });

  it("guards every list of the lessons", () => {
    const l = guardLessons({ wentWell: ["- 17 people asked.", "Nobody waited 9 hours."], toFix: ["Answer the wifi question early."], answerEarly: ["Is there parking for 20 cars?"] }, stats);
    expect(l).toEqual({ wentWell: ["17 people asked."], toFix: ["Answer the wifi question early."], answerEarly: [] });
  });
});

describe("the recap text", () => {
  it("has only lines with something to say", () => {
    const s = emptyStats();
    s.questions = { ...s.questions, asked: 5, people: 3, answeredByFerri: 4, unanswered: 1, medianFerriSeconds: 2.5, platforms: ["mattermost", "telegram"] };
    s.care = { cases: 2, solved: 1, byBuilder: 1, open: 1 };
    s.listings = [{ platform: "Luma", url: "https://lu.ma/x" }];
    const lines = recapLines(s);
    expect(lines).toEqual([
      "Questions: 5 questions from 3 people on Mattermost, Telegram; Ferri answered 4 at once (median 2.5 s); 1 still unanswered.",
      "Care: 2 cases, 1 solved (1 by the Builder), 1 still open.",
      "Listings: Luma (https://lu.ma/x).",
    ]);
    const text = renderRecapText("Lantern Build Night", s, { wentWell: ["Answers were fast."], toFix: [], answerEarly: ["Where is parking?"] });
    expect(text).toContain("How Lantern Build Night went:");
    expect(text).toContain("What went well:\n- Answers were fast.");
    expect(text).not.toContain("To fix next time");
    expect(text).toContain("Answer early next time:\n- Where is parking?");
  });

  it("says so when nothing happened", () => {
    expect(renderRecapText("X", emptyStats(), { wentWell: [], toFix: [], answerEarly: [] })).toBe("How X went:\nNothing Ferri can count happened at this event yet.");
  });

  it("names listing platforms", () => {
    expect(listingPlatform("https://lu.ma/build-night")).toBe("Luma");
    expect(listingPlatform("https://luma.com/abc")).toBe("Luma");
    expect(listingPlatform("https://www.example.org/e")).toBe("example.org");
  });
});

describe("partners", () => {
  const sources = [
    { id: "K1", title: "Build Night FAQ: Sponsors", text: "CloudCo gives every team credits. Contact: asha@cloudco.example, cloudco.example" },
    { id: "P1", title: "plan decision: Food", text: "Pizza from Slice House." },
  ];
  it("keeps an email or website only when written in a source", () => {
    const out = cleanPartners(
      [
        { org: "CloudCo", role: "sponsor", note: "Credits for every team", email: "asha@cloudco.example", website: "https://cloudco.example", where: "K1" },
        { org: "Slice House", role: "food", note: "Pizza", email: "hello@slicehouse.example", website: "slicehouse.example", where: "[P1]" },
        { org: "cloudco", role: "sponsor", note: "dup", email: "", website: "", where: "K1" },
        { org: "Lantern Labs", role: "community", note: "us", email: "", website: "", where: "K1" },
      ],
      sources,
      "Lantern Labs",
    );
    expect(out).toEqual([
      { org: "CloudCo", role: "sponsor", note: "Credits for every team", email: "asha@cloudco.example", website: "https://cloudco.example", where: "Build Night FAQ: Sponsors" },
      { org: "Slice House", role: "food", note: "Pizza", email: null, website: null, where: "plan decision: Food" },
    ]);
  });
  it("maps roles to contact kinds", () => {
    expect(contactKindForRole("prize")).toBe("sponsor");
    expect(contactKindForRole("food")).toBe("company");
    expect(contactKindForRole("partner")).toBe("other");
  });
});

describe("finding an event by name", () => {
  const d = (s: string) => new Date(s);
  const list = [
    { name: "Lantern Build Night", slug: "build-night", startsAt: d("2026-11-21"), createdAt: d("2026-10-01") },
    { name: "Lantern Build Night 2", slug: "lantern-build-night-2", startsAt: d("2026-12-12"), createdAt: d("2026-11-06") },
    { name: "Board Game Meetup", slug: "board-games", startsAt: null, createdAt: d("2026-09-01") },
  ];
  it("prefers the exact name or slug", () => {
    expect(matchEvent(list, "Lantern Build Night")?.slug).toBe("build-night");
    expect(matchEvent(list, "build-night")?.slug).toBe("build-night");
  });
  it("reads loose names and kits", () => {
    expect(matchEvent(list, "build night")?.slug).toBe("build-night");
    expect(matchEvent(list, "the Build Night kit")?.slug).toBe("build-night");
    expect(matchEvent(list, "build night 2")?.slug).toBe("lantern-build-night-2");
    expect(matchEvent(list, "the meetup")?.slug).toBe("board-games");
  });
  it("returns null when nothing fits", () => {
    expect(matchEvent(list, "diwali fair")).toBeNull();
    expect(matchEvent(list, "")).toBeNull();
  });
});

describe("the kit", () => {
  const kit: StarterKitContent = {
    version: 1,
    event: { id: "e", name: "Lantern Build Night", slug: "build-night", venue: "Makerspace", capacity: 80, startsAt: "2026-11-21T04:30:00.000Z", endsAt: "2026-11-22T04:30:00.000Z", lengthMinutes: 1440, instructions: "Be kind." },
    crew: [{ name: "Priya", handles: { mattermost: "priya" }, topics: ["food"], lead: true }],
    knowledge: {
      keep: [{ heading: "Wi-Fi", body: "Network Lantern, password on the wall.", sourceTitle: "Lantern Build Night FAQ" }],
      check: [{ heading: "Prizes", body: "First prize 50,000 credits.", sourceTitle: "Lantern Build Night FAQ", check: "Confirm the prizes" }],
    },
    questions: { top: [{ question: "Where do teams sit?", topic: "venue", count: 4 }], unanswered: [{ question: "Is there parking?", topic: "venue", count: 1 }] },
    plan: { decisions: [{ title: "Team size", text: "Teams of up to 4.", topic: "rules" }], tasks: [{ title: "Book projector", text: "Book the projector.", topic: "venue", owner: "Arjun" }] },
    agenda: "Sat 10:00 Doors open",
    spaces: [{ spaceId: "s", roomId: "r", name: "ferri-crew", platform: "mattermost", mode: "auto", role: "crew" }],
    desks: [],
    partners: [{ org: "CloudCo", role: "sponsor", note: "Credits", email: null, website: null }],
    lessons: { wentWell: ["Answers were fast."], toFix: ["Open the help desk earlier."], answerEarly: ["Where is parking?"] },
    stats: null,
    builtAt: "2026-11-22T10:00:00.000Z",
  };

  it("sorts knowledge, treating anything unsure as check", () => {
    const entries = [
      { id: "E1", heading: "Wi-Fi", body: "x", sourceTitle: "FAQ" },
      { id: "E2", heading: "Prizes", body: "y", sourceTitle: "FAQ" },
      { id: "E3", heading: "Schedule", body: "z", sourceTitle: "FAQ" },
    ];
    const out = applyKitSort(entries, { entries: [{ id: "E1", keep: true, check: "" }, { id: "[E2]", keep: false, check: "Confirm the prizes" }] });
    expect(out.keep.map((e) => e.heading)).toEqual(["Wi-Fi"]);
    expect(out.check.map((e) => e.check)).toEqual(["Confirm the prizes", "Check: Schedule"]);
  });

  it("renders markdown with every part", () => {
    const md = renderKitMarkdown(kit);
    for (const s of ["# Lantern Build Night kit", "## Knowledge to keep", "**Wi-Fi**", "## Knowledge to check", "*Confirm the prizes*", "## Asked most", "Where do teams sit? (4)", "## Nobody answered", "Is there parking?", "## Tasks", "Book the projector. (Arjun)", "## Spaces", "ferri-crew (Mattermost): crew room", "## Partners", "CloudCo (sponsor)", "## To fix next time", "Length: 24 hours"]) {
      expect(md).toContain(s);
    }
  });

  it("gives the next event instructions with the lessons and plan questions", () => {
    expect(kitInstructions(kit)).toBe("Be kind.\n\nLessons from Lantern Build Night:\n- Open the help desk earlier.\n- Answer early: Where is parking?");
    const qs = kitPlanQuestions(kit);
    expect(qs.map((q) => q.title)).toEqual(["Confirm the prizes", "Answer early: Is there parking?", "Asked most: Where do teams sit?"]);
    expect(renameSource("Lantern Build Night FAQ", "Lantern Build Night", "Lantern Build Night 2")).toBe("Lantern Build Night 2 FAQ");
  });

  it("offers move only when there is another live event", () => {
    expect(wrapOptions(null, "skip").map((o) => o.id)).toEqual(["off", "skip"]);
    expect(wrapOptions("Build Night 2", "skip").map((o) => o.label)).toEqual(["Close, spaces Off", "Close and move the spaces to Build Night 2", "Not yet"]);
  });
});

// ── Postgres ────────────────────────────────────────────────────────────

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

describe.skipIf(!reachable)("wrap (Postgres)", () => {
  const slug = `wrap-test-${Date.now()}`;
  const { db, close } = createDb(url);
  let communityId = "";
  let eventId = "";
  const roomA = `!wrap-a-${Date.now()}:test`;
  const roomB = `!wrap-b-${Date.now()}:test`;

  beforeAll(async () => {
    await runMigrations(url);
    const [c] = await db.insert(communities).values({ slug, name: "Wrap Test Labs" }).returning();
    communityId = c!.id;
    const [e] = await db
      .insert(events)
      .values({ communityId, slug: "night", name: "Wrap Night", stage: "live", startsAt: new Date("2026-11-21T04:30:00Z"), endsAt: new Date("2026-11-21T16:30:00Z"), venue: "Hall" })
      .returning();
    eventId = e!.id;
    const [sa] = await db.insert(spaces).values({ communityId, switchRoomId: roomA, name: "general", platform: "mattermost" }).returning();
    const [sb] = await db.insert(spaces).values({ communityId, switchRoomId: roomB, name: "tg", platform: "telegram" }).returning();
    await db.insert(eventSpaces).values([
      { eventId, spaceId: sa!.id, mode: "auto", role: "members" },
      { eventId, spaceId: sb!.id, mode: "listen", role: "members" },
    ]);
    const t = (m: number) => new Date(Date.parse("2026-11-21T06:00:00Z") + m * 60000);
    const times = { nudgeAt: t(10), escalateAt: t(20), expiresAt: t(60) };
    const [card] = await db
      .insert(cards)
      .values({ communityId, eventId, crewRoomId: roomA, switchSessionId: "s", kind: "question", topic: "venue", question: "Where is parking?", status: "expired", ...times })
      .returning();
    const [card2] = await db
      .insert(cards)
      .values({ communityId, eventId, crewRoomId: roomA, switchSessionId: "s", kind: "question", topic: "food", question: "Is there vegan food?", status: "answered", ...times })
      .returning();
    const q = (i: number, extra: Partial<typeof questions.$inferInsert>) => ({
      communityId,
      eventId,
      roomId: roomA,
      spaceId: sa!.id,
      messageId: `${slug}-m${i}`,
      askerId: `@p${i % 3}`,
      askerName: `P${i % 3}`,
      text: `q${i}`,
      addressed: true,
      askedAt: t(i),
      ...extra,
    });
    await db.insert(questions).values([
      q(1, { outcome: "answered", latencyMs: 2000 }),
      q(2, { outcome: "answered", latencyMs: 4000 }),
      q(3, { outcome: "unknown", cardId: card!.id, resolution: "expired", resolvedAt: t(70) }),
      q(4, { outcome: "unknown", cardId: card2!.id, resolution: "answered", resolvedAt: t(14) }),
      q(5, { outcome: "unknown", cardId: card2!.id, resolution: "answered", resolvedAt: t(15) }),
      q(6, { outcome: "chat" }),
      q(7, { outcome: "listened", roomId: roomB, spaceId: sb!.id }),
    ]);
    await db.insert(careCases).values([
      { communityId, eventId, number: 1, roomId: roomA, personId: "@p1", personName: "P1", kind: "stuck", reason: "Laptop will not connect", status: "solved", closedBy: "the Builder" },
      { communityId, eventId, number: 2, roomId: roomA, personId: "@p2", personName: "P2", kind: "upset", reason: "Lost their team", status: "helping" },
    ]);
    await db.insert(guests).values([
      { communityId, eventId, email: `a-${slug}@x.example`, name: "A", code: `${slug}-a`, status: "going", sources: ["site", "luma"], checkedInAt: t(0) },
      { communityId, eventId, email: `b-${slug}@x.example`, name: "B", code: `${slug}-b`, status: "waitlist", sources: ["luma"] },
      { communityId, eventId, email: `c-${slug}@x.example`, name: "C", code: `${slug}-c`, status: "not_going", sources: ["site"], freedAt: t(0) },
    ]);
    await db.insert(contacts).values([
      { communityId, eventId, code: `${slug}-c1`, org: "CloudCo", email: `asha-${slug}@cloudco.example`, kind: "sponsor", status: "interested", addedBy: "test" },
      { communityId, eventId, code: `${slug}-c2`, org: "NoReply Inc", kind: "company", status: "emailed", addedBy: "test" },
    ]);
  });

  afterAll(async () => {
    await db.delete(communities).where(eq(communities.slug, slug));
    await close();
  });

  it("computes every number from the tables", async () => {
    const s = await recapStats(db, eventId);
    expect(s.questions).toEqual({
      asked: 6,
      people: 3,
      answeredByFerri: 2,
      answeredByCrew: 2,
      unanswered: 1,
      listened: 1,
      medianFerriSeconds: 3,
      medianCrewMinutes: 10,
      platforms: ["mattermost", "telegram"],
    });
    expect(s.cards).toMatchObject({ opened: 2, byKind: { question: 2 }, answered: 1, expired: 1 });
    expect(s.care).toEqual({ cases: 2, solved: 1, byBuilder: 1, open: 1 });
    expect(s.guests).toMatchObject({ registered: 3, going: 1, waitlist: 1, notGoing: 1, checkedIn: 1, freed: 1, sources: { luma: 2, site: 2 } });
    expect(s.outreach).toMatchObject({ interested: 1, declined: 0 });
    expect(s.spaces).toEqual({ count: 2, platforms: ["mattermost", "telegram"] });
  });

  it("saves partners once, matched by email then name", async () => {
    const found = [
      { org: "cloudco", role: "sponsor" as const, note: "Credits", email: null, website: null, where: "FAQ: Sponsors" },
      { org: "Slice House", role: "food" as const, note: "Pizza", email: null, website: null, where: "plan decision: Food" },
    ];
    const first = await savePartners(db, { communityId, eventId, eventName: "Wrap Night", found, by: "test" });
    expect(first.map((p) => [p.org, p.role, p.created, p.added])).toEqual([
      ["CloudCo", "sponsor", false, true],
      ["Slice House", "food", true, true],
    ]);
    const [slice] = await db.select().from(contacts).where(and(eq(contacts.communityId, communityId), eq(contacts.org, "Slice House")));
    expect(slice).toMatchObject({ status: "partner", kind: "company", source: "Wrap Night wrap (plan decision: Food)" });
    const again = await savePartners(db, { communityId, eventId, eventName: "Wrap Night", found, by: "test" });
    expect(again.every((p) => !p.created && !p.added)).toBe(true);
    const links = await db.select().from(contactEvents).where(eq(contactEvents.eventId, eventId));
    expect(links).toHaveLength(2);
    const all = await db.select().from(contacts).where(eq(contacts.communityId, communityId));
    expect(all).toHaveLength(3);
  });

  it("starts the next event from a kit", async () => {
    const content: StarterKitContent = {
      version: 1,
      event: { id: eventId, name: "Wrap Night", slug: "night", venue: "Hall", capacity: 50, startsAt: "2026-11-21T04:30:00.000Z", endsAt: "2026-11-21T16:30:00.000Z", lengthMinutes: 720, instructions: "Be kind." },
      crew: [{ name: "Priya", handles: { mattermost: "priya" }, topics: ["food"], lead: true }],
      knowledge: { keep: [{ heading: "Wi-Fi", body: "Network Hall.", sourceTitle: "Wrap Night FAQ" }], check: [{ heading: "Prizes", body: "Credits.", sourceTitle: "Wrap Night FAQ", check: "Confirm the prizes" }] },
      questions: { top: [], unanswered: [{ question: "Where is parking?", topic: "venue", count: 1 }] },
      plan: { decisions: [], tasks: [{ title: "Projector", text: "Book the projector.", topic: "venue", owner: null }] },
      agenda: null,
      spaces: [],
      desks: [],
      partners: [],
      lessons: { wentWell: [], toFix: ["Open the doors earlier."], answerEarly: [] },
      stats: null,
      builtAt: new Date().toISOString(),
    };
    const [kit] = await db
      .insert(starterKits)
      .values({ communityId, fromEventId: eventId, name: "Wrap Night kit", content: content as unknown as Record<string, unknown>, markdown: "x", createdBy: "test" })
      .returning();
    const started = await startFromKit(db, { communityId, kitId: kit!.id, name: "Wrap Night 2", startsAt: new Date("2026-12-12T04:30:00Z"), by: "Priya" });
    expect(started).toMatchObject({ slug: "wrap-night-2", crew: 1, knowledge: 1, questions: 2, tasks: 1 });
    const [ev] = await db.select().from(events).where(eq(events.id, started.eventId));
    expect(ev).toMatchObject({ stage: "plan", fromKitId: kit!.id, venue: "Hall", capacity: 50 });
    expect(ev!.endsAt?.toISOString()).toBe("2026-12-12T16:30:00.000Z");
    expect(ev!.instructions).toContain("Open the doors earlier.");
    const crew = await db.select().from(crewMembers).where(eq(crewMembers.eventId, started.eventId));
    expect(crew.map((c) => [c.name, c.topics])).toEqual([["Priya", ["food"]]]);
    const entries = await db.select().from(knowledgeEntries).where(eq(knowledgeEntries.eventId, started.eventId));
    expect(entries.map((e) => [e.heading, e.sourceTitle])).toEqual([["Wi-Fi", "Wrap Night 2 FAQ"]]);
    const revs = await db.select().from(knowledgeRevisions).where(eq(knowledgeRevisions.entryId, entries[0]!.id));
    expect(revs).toHaveLength(1);
    const plan = await db.select().from(planItems).where(eq(planItems.eventId, started.eventId));
    expect(plan.map((p) => [p.kind, p.status, p.title]).sort()).toEqual([
      ["question", "confirmed", "Answer early: Where is parking?"],
      ["question", "confirmed", "Confirm the prizes"],
      ["task", "proposed", "Projector"],
    ]);
    await expect(startFromKit(db, { communityId, kitId: kit!.id, name: "wrap night 2", startsAt: null, by: "Priya" })).rejects.toThrow(/already an event/);
  });

  it("hands each Desk request out once", async () => {
    await requestWrap(db, { action: "reopen", eventId, moveTo: null, by: "Desk test" });
    await requestWrap(db, { action: "reopen", eventId, moveTo: null, by: "Desk test 2" });
    const waiting = await pendingWrapRequests(db, eventId);
    expect(waiting.map((r) => r.by)).toEqual(["Desk test 2"]);
    const taken = await takeWrapRequests(db, eventId);
    expect(taken).toHaveLength(1);
    expect(await takeWrapRequests(db, eventId)).toHaveLength(0);
  });
});
