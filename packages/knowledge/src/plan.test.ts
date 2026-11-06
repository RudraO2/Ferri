import { describe, expect, it } from "vitest";
import type { CrewMember } from "./crew.ts";
import { applyPlanOwners, crewByName, planSummary, renderPlanDocument, shortPlanIds, type PlanItem } from "./plan.ts";

const crew: CrewMember[] = [
  { id: "r", eventId: "e", name: "Rudra", handles: { mattermost: "user" }, topics: ["registration", "judging"], lead: true, onDuty: true },
  { id: "p", eventId: "e", name: "Priya", handles: { mattermost: "priya" }, topics: ["food", "venue"], lead: false, onDuty: false },
  { id: "a", eventId: "e", name: "Arjun Mehta", handles: { mattermost: "arjun" }, topics: [], lead: false, onDuty: false },
];

let n = 0;
function item(over: Partial<PlanItem>): PlanItem {
  const t = new Date(Date.UTC(2026, 10, 6, 10, 0, n++));
  return {
    id: `i${n}`,
    communityId: "c",
    eventId: "e",
    kind: "decision",
    status: "confirmed",
    topic: "other",
    title: "Title",
    text: "Text.",
    ownerId: null,
    dueAt: null,
    forMembers: false,
    origin: "chat",
    decidedBy: "Rudra",
    sourceKey: null,
    cardId: null,
    entryId: null,
    remindedAt: null,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

describe("applyPlanOwners", () => {
  it("moves a topic to the person the plan names", () => {
    const out = applyPlanOwners(crew, [{ topic: "registration", ownerId: "a", updatedAt: new Date(1) }]);
    expect(out.find((c) => c.id === "a")!.topics).toEqual(["registration"]);
    expect(out.find((c) => c.id === "r")!.topics).toEqual(["judging"]);
    expect(out.find((c) => c.id === "p")!.topics).toEqual(["food", "venue"]);
  });

  it("lets the latest owner of a topic win", () => {
    const out = applyPlanOwners(crew, [
      { topic: "food", ownerId: "a", updatedAt: new Date(2) },
      { topic: "food", ownerId: "r", updatedAt: new Date(1) },
    ]);
    expect(out.find((c) => c.id === "a")!.topics).toContain("food");
    expect(out.find((c) => c.id === "r")!.topics).not.toContain("food");
    expect(out.find((c) => c.id === "p")!.topics).toEqual(["venue"]);
  });

  it("changes nothing without owner items", () => {
    expect(applyPlanOwners(crew, [])).toBe(crew);
  });
});

describe("crewByName", () => {
  it("finds a member by name, handle or first name", () => {
    expect(crewByName(crew, "Priya")?.id).toBe("p");
    expect(crewByName(crew, "@arjun")?.id).toBe("a");
    expect(crewByName(crew, "arjun")?.id).toBe("a");
    expect(crewByName(crew, "user")?.id).toBe("r");
    expect(crewByName(crew, "meera")).toBeNull();
    expect(crewByName(crew, null)).toBeNull();
  });
});

describe("the plan as text", () => {
  const items = [
    item({ title: "Event date", text: "Build Night is on 21 November.", forMembers: true }),
    item({ kind: "task", title: "Projector", text: "Book the projector.", ownerId: "a", dueAt: new Date("2026-11-13T12:30:00Z") }),
    item({ kind: "task", status: "done", title: "Badges", text: "Print the badges." }),
    item({ kind: "question", title: "Judging format", text: "We still need to pick the judging format." }),
    item({ status: "proposed", origin: "draft", title: "Team size", text: "Teams of 2 to 4 people.", decidedBy: null }),
  ];

  it("gives the model short ids for every live item", () => {
    const { text, byShort } = shortPlanIds(items, crew);
    expect(byShort.get("P2")?.title).toBe("Projector");
    expect(text).toContain("P2 [task, confirmed, owner Arjun Mehta, due 2026-11-13T12:30:00.000Z] Projector");
  });

  it("renders every section of the document", () => {
    const doc = renderPlanDocument({ eventName: "Build Night", items, crew, agenda: { text: "Sat 10:00  Doors open", requestedBy: "Rudra", createdAt: new Date() }, timeZone: "Asia/Kolkata" });
    expect(doc).toContain("# Build Night: the plan");
    expect(doc).toContain("- **Event date**: Build Night is on 21 November. (Rudra)");
    expect(doc).toContain("- **Team size**: Teams of 2 to 4 people. (proposed by Ferri");
    expect(doc).toContain("- food: Priya");
    expect(doc).toContain("- [ ] Book the projector. (Arjun Mehta, due ");
    expect(doc).toContain("- [x] Print the badges.");
    expect(doc).toContain("- We still need to pick the judging format.");
    expect(doc).toContain("Sat 10:00  Doors open");
  });

  it("summarises the plan for chat", () => {
    const s = planSummary({ items, crew, timeZone: "Asia/Kolkata", now: new Date("2026-11-14T00:00:00Z") });
    expect(s).toContain("Decided: Event date (Build Night is on 21 November)");
    expect(s).toContain("Waiting for an OK on a card: Team size.");
    expect(s).toContain("Still open: We still need to pick the judging format");
    expect(s).toContain("Projector (Arjun Mehta,");
    expect(s).toContain("(overdue)");
    expect(s).not.toContain("Badges");
  });

  it("says so when the plan is empty", () => {
    expect(planSummary({ items: [], crew, timeZone: "Asia/Kolkata" })).toContain("The plan is empty");
  });
});
