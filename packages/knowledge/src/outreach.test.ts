import { describe, expect, it } from "vitest";
import { OPT_OUT_LINE, cannotEmail, contactCode, contactsSummary, finalEmailText, parseProspects, reSubject, statusForReply, withoutOptOut } from "./outreach.ts";

describe("prospects from the Builder", () => {
  it("keeps an address only with the page that publishes it", () => {
    const { ok, dropped } = parseProspects({
      prospects: [
        { org: "Example College", kind: "college", email: "Club@Example.edu", source: "https://example.edu/contact" },
        { org: "Guessed Co", email: "partnerships@guessed.example", source: null },
        { org: "No Mail Community", source: "https://community.example" },
        { org: "Bad", email: "not-an-address", source: "https://bad.example" },
        { nope: true },
      ],
    });
    expect(ok.map((p) => [p.org, p.email])).toEqual([
      ["Example College", "club@example.edu"],
      ["Guessed Co", null],
      ["No Mail Community", null],
      ["Bad", null],
    ]);
    expect(dropped.some((d) => d.includes("Guessed Co") && d.includes("no source page"))).toBe(true);
    expect(dropped.some((d) => d.includes("not an address"))).toBe(true);
    expect(dropped.some((d) => d.startsWith("not a prospect"))).toBe(true);
    expect(parseProspects([{ org: "A" }]).ok).toHaveLength(1);
  });
});

describe("who Ferri may write to", () => {
  it("refuses do-not-contact, bounced and contacts with no address", () => {
    expect(cannotEmail({ org: "CloudCo", email: "a@cloudco.example", status: "do_not_contact" })).toMatch(/asked not to be contacted/);
    expect(cannotEmail({ org: "CloudCo", email: "a@cloudco.example", status: "bounced" })).toMatch(/bounced/);
    expect(cannotEmail({ org: "CloudCo", email: null, status: "prospect" })).toMatch(/no email address/);
    expect(cannotEmail({ org: "CloudCo", email: "a@cloudco.example", status: "declined" })).toBeNull();
  });
  it("moves the contact by what their reply says", () => {
    expect(statusForReply("unsubscribe", "emailed")).toBe("do_not_contact");
    expect(statusForReply("declined", "emailed")).toBe("declined");
    expect(statusForReply("interested", "emailed")).toBe("interested");
    expect(statusForReply("interested", "partner")).toBe("partner");
    expect(statusForReply("question", "emailed")).toBe("replied");
    expect(statusForReply("question", "interested")).toBe("interested");
    expect(statusForReply("auto_reply", "emailed")).toBe("emailed");
    expect(statusForReply("other", "drafted")).toBe("replied");
  });
});

describe("the email text", () => {
  it("adds the opt-out line once, only to a cold email", () => {
    const draft = "Hi CloudCo team,\n\nWould you sponsor Build Night?\n\nRudra\nLantern Labs\n\nReply \"no thanks\" and we won't write again.";
    const clean = withoutOptOut(draft);
    expect(clean.endsWith("Lantern Labs")).toBe(true);
    expect(finalEmailText(clean, true)).toBe(`${clean}\n\n${OPT_OUT_LINE}`);
    expect(finalEmailText(clean, false)).toBe(clean);
    expect(finalEmailText(withoutOptOut(finalEmailText(clean, true)), true).split(OPT_OUT_LINE)).toHaveLength(2);
  });
  it("answers with Re: once", () => {
    expect(reSubject("Sponsoring Build Night")).toBe("Re: Sponsoring Build Night");
    expect(reSubject("RE: Sponsoring Build Night")).toBe("RE: Sponsoring Build Night");
    expect(reSubject(null)).toBe("Re: your email");
  });
  it("makes short, unambiguous codes", () => {
    const codes = new Set(Array.from({ length: 200 }, () => contactCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[a-km-np-z2-9]{7}$/);
  });
  it("sums up outreach for the crew", () => {
    expect(contactsSummary([])).toMatch(/no contacts/);
    expect(
      contactsSummary([
        { org: "CloudCo", status: "interested" },
        { org: "College A", status: "emailed" },
        { org: "College B", status: "emailed" },
        { org: "Shop", status: "do_not_contact" },
      ]),
    ).toBe("1 interested (CloudCo); 2 emailed (College A, College B); 1 do not contact (Shop).");
  });
});

describe("opting out", () => {
  it("keeps the promise in the opt-out line", async () => {
    const { optedOut } = await import("./outreach.ts");
    for (const t of ["no thanks", "No thanks.", "no, thank you!", "Please unsubscribe me", "remove me from your list", "Stop emailing us"]) expect(optedOut(t)).toBe(true);
    for (const t of ["No thanks to Monday, but Tuesday works", "Thanks! Yes please", "We can't this year"]) expect(optedOut(t)).toBe(false);
  });
});
