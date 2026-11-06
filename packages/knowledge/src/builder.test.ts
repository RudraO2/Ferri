import { describe, expect, it } from "vitest";
import { firstHttpsUrl, handoffMessage, jobFolder, parseBuilderReport, siteEventLine } from "./builder.ts";

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

describe("firstHttpsUrl", () => {
  it("takes the first https link without trailing punctuation", () => {
    expect(firstHttpsUrl("The site is live at https://lantern-build-night.vercel.app. Register there.")).toBe("https://lantern-build-night.vercel.app");
    expect(firstHttpsUrl("Live: (https://x.vercel.app/), then https://y.dev")).toBe("https://x.vercel.app/");
  });
  it("ignores plain http and this laptop", () => {
    expect(firstHttpsUrl("built at http://localhost:3300")).toBeNull();
    expect(firstHttpsUrl("see https://localhost:3300")).toBeNull();
    expect(firstHttpsUrl("index.html is in jobs/B1")).toBeNull();
  });
});

describe("siteEventLine", () => {
  it("tells the crew about the first registration and every tenth", () => {
    expect(siteEventLine("registration", { count: 1, name: "Meera" })).toBe("First registration on the site: Meera.");
    expect(siteEventLine("registration", { count: 2, name: "Arjun" })).toBeNull();
    expect(siteEventLine("registration", { count: 20, name: "Priya" })).toBe("20 people have registered on the site (latest: Priya).");
  });
  it("tells the crew when a credit pool runs low, runs out or is topped up", () => {
    expect(siteEventLine("pool_low", { sponsor: "CloudCo", left: 1, lowAt: 2 })).toContain("CloudCo credits are running low on the site: 1 code left.");
    expect(siteEventLine("pool_low", { sponsor: "CloudCo", left: 0 })).toContain("all claimed");
    expect(siteEventLine("pool_refilled", { sponsor: "CloudCo", left: 40 })).toBe("CloudCo credits are topped up on the site: 40 codes left.");
    expect(siteEventLine("something_else", {})).toBeNull();
  });
});
