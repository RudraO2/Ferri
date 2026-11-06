import { describe, expect, it } from "vitest";
import { autoHelp, builderPolicy, careCardTitle, careLine, careOptions, careRoute, caseLine, helpHandoff, tidyReading, type CareReading } from "./care.ts";
import type { CrewMember } from "./crew.ts";

const crew: CrewMember[] = [
  { id: "p", eventId: "e", name: "Priya", handles: {}, topics: ["food", "tech"], lead: false, onDuty: false },
  { id: "r", eventId: null, name: "Rudra", handles: {}, topics: ["registration"], lead: true, onDuty: true },
  { id: "a", eventId: null, name: "Asha", handles: {}, topics: [], lead: true, onDuty: false },
];

const reading = (over: Partial<CareReading>): CareReading => ({
  signal: "stuck",
  technical: false,
  severity: "normal",
  topic: "other",
  reason: "Meera can't get in",
  quote: "can't get in",
  case: "new",
  ...over,
});

describe("tidyReading", () => {
  it("makes unsafe always high", () => {
    expect(tidyReading(reading({ signal: "unsafe", severity: "normal" }), false).severity).toBe("high");
  });
  it("turns update and solved into new or none without an open case", () => {
    expect(tidyReading(reading({ case: "update" }), false).case).toBe("new");
    expect(tidyReading(reading({ case: "solved", signal: "none", reason: "" }), false).case).toBe("none");
  });
  it("never opens a case without a signal or a reason", () => {
    expect(tidyReading(reading({ signal: "none" }), false).case).toBe("none");
    expect(tidyReading(reading({ reason: "  " }), false).case).toBe("none");
  });
  it("keeps solved and update when there is an open case", () => {
    expect(tidyReading(reading({ case: "solved", signal: "none", reason: "" }), true).case).toBe("solved");
    expect(tidyReading(reading({ case: "update" }), true).case).toBe("update");
  });
  it("lands a flagged problem the model said none to on a case", () => {
    expect(tidyReading(reading({ case: "none" }), false).case).toBe("new");
    expect(tidyReading(reading({ case: "none" }), true).case).toBe("update");
  });
});

describe("careRoute", () => {
  it("gives a technical problem to the tech owner", () => {
    expect(careRoute(crew, reading({ technical: true })).owner?.name).toBe("Priya");
  });
  it("falls back to whoever is on duty", () => {
    expect(careRoute(crew, reading({ topic: "venue" })).owner?.name).toBe("Rudra");
  });
  it("sends unsafe to the on-duty person and tells every lead", () => {
    const r = careRoute(crew, reading({ signal: "unsafe", severity: "high", topic: "food" }));
    expect(r.owner?.name).toBe("Rudra");
    expect(r.notify.map((m) => m.name).sort()).toEqual(["Asha", "Rudra"]);
  });
  it("tells the leads about a high case too", () => {
    const r = careRoute(crew, reading({ technical: true, severity: "high" }));
    expect(r.owner?.name).toBe("Priya");
    expect(r.notify.map((m) => m.name).sort()).toEqual(["Asha", "Priya", "Rudra"]);
  });
  it("works with no crew", () => {
    expect(careRoute([], reading({})).owner).toBeNull();
  });
});

describe("autoHelp", () => {
  const base = { technical: true, kind: "stuck", stage: "live", mode: "auto", paused: false };
  it("sends a technical problem to the Builder during the event in an Auto space", () => {
    expect(autoHelp(base)).toBe(true);
  });
  it("waits for the crew before the event, in Approve or Listen spaces, during the pause, and for non-technical cases", () => {
    expect(autoHelp({ ...base, stage: "launch" })).toBe(false);
    expect(autoHelp({ ...base, mode: "approve" })).toBe(false);
    expect(autoHelp({ ...base, mode: "listen" })).toBe(false);
    expect(autoHelp({ ...base, paused: true })).toBe(false);
    expect(autoHelp({ ...base, technical: false })).toBe(false);
    expect(autoHelp({ ...base, kind: "upset" })).toBe(false);
  });
});

describe("builderPolicy", () => {
  it("admits the owner and Ferri everywhere, and people in crew and help rooms", () => {
    const p = builderPolicy(["!crew"], ["!help", "!crew"]);
    expect(p.rules[0]).toEqual({ owner: true, owner_agents: true, users: [], agents: [] });
    expect(p.rules[1]).toEqual({ rooms: ["!crew", "!help"], users: "*", agents: [] });
  });
  it("has no open rule without rooms", () => {
    expect(builderPolicy([], []).rules).toHaveLength(1);
  });
});

describe("card text", () => {
  const c = { number: 3, kind: "stuck", severity: "high", personName: "Meera", reason: "x".repeat(800), status: "open", ownerName: null };
  it("keeps the card title inside Switch's 500 characters", () => {
    const t = careCardTitle(c, "ferri-lab");
    expect(t.length).toBeLessThanOrEqual(500);
    expect(t.startsWith("Case 3 · urgent · stuck · Meera in ferri-lab: ")).toBe(true);
  });
  it("offers the Builder only for technical cases in spaces Ferri posts in, when it is not already helping", () => {
    expect(careOptions({ technical: true, mode: "auto", builderBusy: false }).map((o) => o.id)).toEqual(["mine", "builder", "solved", "drop"]);
    expect(careOptions({ technical: true, mode: "listen", builderBusy: false }).map((o) => o.id)).not.toContain("builder");
    expect(careOptions({ technical: true, mode: "auto", builderBusy: true }).map((o) => o.id)).not.toContain("builder");
    expect(careOptions({ technical: false, mode: "auto", builderBusy: false }).map((o) => o.id)).not.toContain("builder");
  });
  it("names the owner in the crew-room line", () => {
    const line = careLine({ c: { ...c, reason: "Meera can't push to GitHub" }, roomName: "ferri-lab", owner: "@priya", builder: false });
    expect(line).toContain("Urgent: Case 3 · stuck · Meera in ferri-lab: Meera can't push to GitHub");
    expect(line).toContain("@priya, it's yours");
  });
  it("describes an open case in one line", () => {
    expect(caseLine({ number: 2, kind: "upset", status: "helping", reason: "Arjun's team left him", ownerName: "Priya" })).toBe(
      "Case 2 [upset, someone is on it, owner Priya]: Arjun's team left him",
    );
  });
});

describe("helpHandoff", () => {
  it("is short, names the job and the case, and asks for the reports", () => {
    const t = helpHandoff({ job: 16, caseNumber: 3, personName: "meera.k", reason: "Meera can't push to GitHub", agentName: "ferri" });
    expect(t).toContain("Please help meera here: Meera can't push to GitHub");
    expect(t).toContain("job B16 for case 3");
    expect(t).toContain('"Job B16 done:"');
    expect(t).toContain("help-member");
    expect(t).toContain("meera, start your replies with @builder");
    expect(t.length).toBeLessThan(900);
  });
});
