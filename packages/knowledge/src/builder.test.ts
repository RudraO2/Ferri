import { describe, expect, it } from "vitest";
import { handoffMessage, jobFolder, parseBuilderReport } from "./builder.ts";

describe("parseBuilderReport", () => {
  it("reads a done report, with or without the mention Switch prepends", () => {
    expect(parseBuilderReport("@ferri Job B2 done: checklist.md is ready.")).toEqual({ ref: 2, outcome: "done", text: "checklist.md is ready." });
    expect(parseBuilderReport("Job B12 done: index.html")).toEqual({ ref: 12, outcome: "done", text: "index.html" });
  });
  it("reads a stuck report and the near spellings", () => {
    expect(parseBuilderReport("@ferri Job B3 stuck: I need the venue address.")?.outcome).toBe("stuck");
    expect(parseBuilderReport("**Job B4 finished** - poster.html")?.outcome).toBe("done");
    expect(parseBuilderReport("job b5 blocked: no logo")?.outcome).toBe("stuck");
  });
  it("ignores everything else", () => {
    expect(parseBuilderReport("On it: a one-page site for Lantern Build Night.")).toBeNull();
    expect(parseBuilderReport("The job B1 is done, I think")).toBeNull();
    expect(parseBuilderReport("A38 2")).toBeNull();
  });
});

describe("jobFolder", () => {
  it("is the job ref and a short slug", () => {
    expect(jobFolder(1, "Build Night one-page site")).toBe("B1-build-night-one-page-site");
    expect(jobFolder(7, "Day-of checklist (v2) for the Diwali party!")).toBe("B7-day-of-checklist-v2-for");
    expect(jobFolder(3, "  ")).toBe("B3");
  });
});

describe("handoffMessage", () => {
  const job = { number: 4, title: "Event one-page site", brief: "Make a page for Build Night.", kind: "site", requestedBy: "Priya" };
  it("points at the room's documents and asks for the report", () => {
    const text = handoffMessage({ job, eventName: "Lantern Build Night", documents: ["Ferri knowledge: Lantern Labs", "Lantern Build Night: the plan"], agentName: "ferri" });
    expect(text).toContain("Job B4: Event one-page site for Lantern Build Night.");
    expect(text).toContain('Priya asked: "Make a page for Build Night."');
    expect(text).toContain('"Ferri knowledge: Lantern Labs" and "Lantern Build Night: the plan"');
    expect(text).toContain("jobs/B4-event-one-page-site/");
    expect(text).toContain('tell ferri "Job B4 done:"');
    expect(text).toContain("index.html");
    expect(text).toContain("without a yes on a card");
  });
  it("stays well under a chat platform's post limit", () => {
    const text = handoffMessage({ job: { ...job, brief: "x ".repeat(5000) }, eventName: "E", documents: [], agentName: "ferri" });
    expect(text.length).toBeLessThan(3000);
    expect(text).toContain("leave a clear placeholder");
  });
});
