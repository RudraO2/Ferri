import { describe, expect, it } from "vitest";
import { firstHttpsUrl, briefWithFiles, handoffMessage, jobFolder, listingAnnouncement, mediaFromMessage, mergeMedia, parseBuilderReport, platformOf, posterShareBrief, shareImage, siteEventLine } from "./builder.ts";

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

describe("poster media (spec 13)", () => {
  const att = (filename: string, mimetype = "image/png") => ({ filename, mimetype, size: 10, mxc: `switch-media://id-${filename}`, msgtype: "m.image" });

  it("keeps a message's attachments with their room and skips ones without a media id", () => {
    const media = mediaFromMessage([att("a-square.png"), { filename: "x.png" }], "!room", "$ev");
    expect(media).toEqual([{ mxc: "switch-media://id-a-square.png", filename: "a-square.png", mimetype: "image/png", size: 10, roomId: "!room", eventId: "$ev" }]);
    expect(mediaFromMessage(undefined, "!room", null)).toEqual([]);
  });

  it("merges without keeping a file twice", () => {
    const a = mediaFromMessage([att("one.png")], "!r", null);
    const b = mediaFromMessage([att("one.png"), att("two.png")], "!r", null);
    expect(mergeMedia(a, b).map((m) => m.filename)).toEqual(["one.png", "two.png"]);
  });

  it("shares the square card (JPEG first), then the 4:5 one, then the first image", () => {
    const set = mediaFromMessage([att("ln-poster.png"), att("ln-story.png"), att("ln-square.jpg", "image/jpeg"), att("ln-square.png")], "!r", null);
    expect(shareImage(set)?.filename).toBe("ln-square.jpg");
    expect(shareImage(mediaFromMessage([att("ln-poster.png"), att("ln-portrait.png")], "!r", null))?.filename).toBe("ln-portrait.png");
    expect(shareImage(mediaFromMessage([att("ln-poster.png")], "!r", null))?.filename).toBe("ln-poster.png");
    expect(shareImage(mediaFromMessage([att("notes.md", "text/markdown")], "!r", null))).toBeNull();
  });

  it("briefs the drafter with the link and leaves the details to the poster", () => {
    const brief = posterShareBrief({ eventName: "Lantern Build Night", url: "https://lantern-build-night.vercel.app" });
    expect(brief).toContain("Lantern Build Night poster");
    expect(brief).toContain("register at https://lantern-build-night.vercel.app");
    expect(brief).toContain("Do not repeat the date, time or venue");
  });
});

describe("files attached to a build request", () => {
  it("rides on the brief and reaches the hand-off whole", () => {
    const files = mediaFromMessage([{ filename: "last.png", mimetype: "image/png", mxc: "switch-media://abc123" }], "!r", "$e");
    const brief = briefWithFiles("Make the poster with this photo", files);
    const text = handoffMessage({
      job: { number: 7, title: "Poster", brief, kind: "poster", requestedBy: "Rudra" },
      eventName: "Lantern Build Night",
      documents: [],
      agentName: "ferri",
    });
    expect(text).toContain('Rudra asked: "Make the poster with this photo"');
    expect(text).toContain("They attached last.png (switch-media://abc123). Fetch each with download_attachment");
    expect(briefWithFiles("x", [])).toBe("x");
  });
});

describe("listings (spec 14)", () => {
  it("hands a listing job to the list-event skill, with the poster as the cover", () => {
    const text = handoffMessage({
      job: { number: 14, title: "Luma listing", brief: "Put Build Night on Luma", kind: "listing", requestedBy: "Rudra" },
      eventName: "Lantern Build Night",
      documents: ["Ferri knowledge"],
      agentName: "ferri",
      cover: "jobs/B11-build-night-poster-and-cards/out/lantern-build-night-square.jpg",
    });
    expect(text).toContain("list-event skill");
    expect(text).toContain("Post a screenshot of the filled form here before the submit");
    expect(text).toContain("Use the event's poster as the cover: jobs/B11-build-night-poster-and-cards/out/lantern-build-night-square.jpg (from job B11).");
    const plain = handoffMessage({
      job: { number: 15, title: "Luma listing", brief: "Put it on Luma", kind: "listing", requestedBy: "Rudra" },
      eventName: null,
      documents: [],
      agentName: "ferri",
    });
    expect(plain).not.toContain("as the cover");
  });

  it("names the platform from the listing's address", () => {
    expect(platformOf("https://luma.com/4qnuaknv")).toBe("Luma");
    expect(platformOf("https://lu.ma/abc")).toBe("Luma");
    expect(platformOf("https://www.meetup.com/x/events/1")).toBe("Meetup");
    expect(platformOf("https://build-night.devfolio.co/")).toBe("Devfolio");
    expect(platformOf("https://events.example.org/e/1")).toBe("events.example.org");
  });

  it("drafts the 'is on Luma' announcement, pointing to the site when there is one", () => {
    const withSite = listingAnnouncement({ eventName: "Lantern Build Night", url: "https://luma.com/abc", site: "https://lantern-build-night.vercel.app" });
    expect(withSite.title).toBe("Lantern Build Night is on Luma");
    expect(withSite.text).toBe(
      "Lantern Build Night is now listed on Luma: https://luma.com/abc\nRegistration is still on https://lantern-build-night.vercel.app; the Luma page helps more people find it.",
    );
    expect(listingAnnouncement({ eventName: "Meetup", url: "https://luma.com/x", site: null }).text).toContain("RSVP there");
  });

  it("reads the listing address from the done report", () => {
    const r = parseBuilderReport("Job B14 done: Lantern Build Night is listed on Luma at https://luma.com/4qnuaknv.");
    expect(r?.outcome).toBe("done");
    expect(firstHttpsUrl(r!.text)).toBe("https://luma.com/4qnuaknv");
  });
});
