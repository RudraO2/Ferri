import { describe, expect, it } from "vitest";
import { FloodWatch, check, defang, describe as describeVerdict, extractLinks, lookalikeOf, normalizeDomain as normalizeDomainForTest, skeleton } from "./index.ts";

const user = (content: string, extra: Partial<Parameters<typeof check>[0]> = {}) => check({ role: "user", content, roomId: "r1", ...extra });

describe("links", () => {
  it("finds links with and without a scheme, and skips emails", () => {
    const l = extractLinks("see https://lu.ma/build-night, www.github.com/lantern and dlscord-gift.com/claim. mail crew@lantern.dev");
    expect(l.map((x) => x.host)).toEqual(["lu.ma", "github.com", "dlscord-gift.com"]);
    expect(l[2]!.domain).toBe("dlscord-gift.com");
  });
  it("defangs hosts so the crew alert is not a link", () => {
    expect(defang("dlscord-gift.com")).toBe("dlscord-gift[.]com");
    expect(extractLinks("dlscord-gift[.]com")).toEqual([]);
  });
  it("folds lookalike letters", () => {
    expect(skeleton("dlscord")).toBe(skeleton("discord"));
    expect(skeleton("disc0rd")).toBe(skeleton("discord"));
    expect(skeleton("steamcommunlty")).toBe(skeleton("steamcommunity"));
  });
});

describe("ordinary messages pass", () => {
  for (const msg of [
    "when does hacking start?",
    "slides are at https://github.com/lantern-labs/build-night and the RSVP is on https://lu.ma/build-night",
    "join the discord: https://discord.gg/lantern",
    "docs: https://vercel.com/docs and https://docs.google.com/document/d/abc",
    "our repo is on gitlab.com/team/app",
    "airdrop the files to me please",
  ]) {
    it(msg, () => expect(user(msg).outcome).toBe("ok"));
  }
});

describe("scams are blocked", () => {
  it("a lookalike domain", () => {
    const v = user("check this https://dlscord.com/gift/abc");
    expect(v.outcome).toBe("blocked");
    expect(v.findings[0]!.category).toBe("lookalike_domain");
    expect(describeVerdict(v)).toContain("dlscord[.]com looks like discord");
    expect(lookalikeOf(extractLinks("steamcommunlty.com/tradeoffer")[0]!)).toBe("steamcommunity");
  });
  it("a brand inside a strange domain with scam words", () => {
    expect(user("FREE NITRO for everyone https://discord-nitro.gift/claim").outcome).toBe("blocked");
  });
  it("scam words with any link", () => {
    const v = user("Claim your free airdrop now: https://tokens-drop.xyz");
    expect(v.outcome).toBe("blocked");
    expect(v.findings[0]!.detector_name).toBe("scam_phrase_with_link");
  });
  it("a punycode lookalike", () => {
    expect(user("login at https://xn--dscord-pvf.com").outcome).toBe("blocked"); // dіscord with a Cyrillic і
  });
  it("the community block list, but the allow list wins", () => {
    expect(user("see https://spammy.example.org/x", { rules: { allow: [], block: ["example.org"] } }).outcome).toBe("blocked");
    expect(user("Claim your reward at https://hackathon-prizes.dev", { rules: { allow: ["hackathon-prizes.dev"], block: [] } }).outcome).toBe("ok");
  });
});

describe("secrets are redacted", () => {
  it("an API key", () => {
    const key = "sk-ant-api03-" + "a".repeat(40);
    const v = user(`my key is ${key} pls help`);
    expect(v.outcome).toBe("redacted");
    expect(v.findings[0]!.detected_string).toBe(key);
    expect(describeVerdict(v)).toBe("an Anthropic API key");
    expect(v.findings).toHaveLength(1);
  });
  it("in Ferri's own posts too", () => {
    expect(check({ role: "assistant", content: "token ghp_" + "b".repeat(36), roomId: "r" }).outcome).toBe("redacted");
  });
  it("a private key block", () => {
    expect(user("-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----").outcome).toBe("redacted");
  });
  it("a scam beats a secret", () => {
    expect(user(`free nitro https://dlscord.com sk-ant-${"c".repeat(30)}`).outcome).toBe("blocked");
  });
});

describe("floods", () => {
  it("blocks the third copy of a link in two minutes, per room", () => {
    const flood = new FloodWatch(120_000, 3);
    const t = 1_000_000;
    const msg = "vote for us https://our-demo.app/vote";
    expect(user(msg, { flood, now: t }).outcome).toBe("ok");
    expect(user(msg, { flood, now: t + 1000, roomId: "other" }).outcome).toBe("ok");
    expect(user(msg, { flood, now: t + 2000 }).outcome).toBe("ok");
    const third = user(msg, { flood, now: t + 3000 });
    expect(third.outcome).toBe("blocked");
    expect(third.findings[0]!.category).toBe("link_flood");
    expect(user(msg, { flood, now: t + 200_000 }).outcome).toBe("ok");
  });
  it("Ferri's posts never count as a flood", () => {
    const flood = new FloodWatch(120_000, 2);
    for (let i = 0; i < 3; i++) expect(check({ role: "assistant", content: "rsvp https://lu.ma/x", roomId: "r", flood }).outcome).toBe("ok");
  });
  it("alerts on many links in one message", () => {
    expect(user(Array.from({ length: 6 }, (_, i) => `https://site${i}.dev`).join(" ")).outcome).toBe("alerted");
  });
});

describe("domains from Desk", () => {
  it("normalizes what an organizer types", () => {
    expect(normalizeDomainForTest("https://www.Lu.ma/build-night")).toBe("lu.ma");
    expect(normalizeDomainForTest("not a domain")).toBeNull();
  });
});
