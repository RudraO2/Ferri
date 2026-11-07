import { describe, expect, it } from "vitest";
import { fitSocialText, servicesFrom, socialCardPrompt } from "./social.ts";

describe("servicesFrom", () => {
  it("reads the networks a crew member names", () => {
    expect(servicesFrom(["LinkedIn", "X", "insta"]).sort()).toEqual(["instagram", "linkedin", "twitter"]);
    expect(servicesFrom(["twitter"])).toEqual(["twitter"]);
    expect(servicesFrom([])).toEqual([]);
    expect(servicesFrom(["social"])).toEqual([]);
  });
});

describe("fitSocialText", () => {
  const link = "https://build-night.example.com";
  it("keeps X within 280 with the link at the end", () => {
    const t = fitSocialText("twitter", `${"Build Night is coming and it will be great. ".repeat(10)}`, link);
    expect(t.endsWith(link)).toBe(true);
    expect(t.replace(link, "x".repeat(23)).length).toBeLessThanOrEqual(280);
  });
  it("strips links on Instagram and adds the link on LinkedIn", () => {
    expect(fitSocialText("instagram", `Register at ${link} today`, link)).toBe("Register at today");
    expect(fitSocialText("linkedin", "Register today.", link)).toBe(`Register today.\n\n${link}`);
  });
  it("never pages a room", () => {
    expect(fitSocialText("linkedin", "@everyone come build", null)).toBe("come build");
  });
});

describe("socialCardPrompt", () => {
  it("shows every network, the image and the time", () => {
    const p = socialCardPrompt({
      posts: [{ service: "linkedin", channelName: "Rudra", text: "Hello LinkedIn" }, { service: "twitter", channelName: "lanternlabs", text: "Hello X" }],
      imageUrl: "https://media.example/abc.jpg",
      dueAt: new Date("2027-06-01T04:30:00Z"),
      timeZone: "Asia/Kolkata",
      skipped: [],
    });
    expect(p).toContain("LinkedIn (Rudra):\nHello LinkedIn");
    expect(p).toContain("X (lanternlabs):\nHello X");
    expect(p).toContain("Image: https://media.example/abc.jpg");
    expect(p).toMatch(/Goes out .*2027/);
  });
});
