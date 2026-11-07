import { describe, expect, it } from "vitest";
import { countsLine, importedStatus, lumaToStatus, newGuestCode, parseGuestCsv, personalText, rsvpUrl, siteToStatus } from "./guests.ts";

describe("statuses", () => {
  it("maps Luma's approval_status", () => {
    expect(lumaToStatus("approved")).toBe("going");
    expect(lumaToStatus("waitlist")).toBe("waitlist");
    expect(lumaToStatus("pending_approval")).toBe("pending");
    expect(lumaToStatus("invited")).toBe("pending");
    expect(lumaToStatus("declined")).toBe("not_going");
  });
  it("maps the site's status", () => {
    expect(siteToStatus("going")).toBe("going");
    expect(siteToStatus("waitlist")).toBe("waitlist");
    expect(siteToStatus("cancelled")).toBe("not_going");
    expect(siteToStatus(undefined)).toBe("going");
  });
  it("reads statuses written in imported lists", () => {
    expect(importedStatus("Going")).toBe("going");
    expect(importedStatus("Waitlisted")).toBe("waitlist");
    expect(importedStatus("Not Going")).toBe("not_going");
    expect(importedStatus("declined")).toBe("not_going");
    expect(importedStatus("pending_approval")).toBe("pending");
    expect(importedStatus("")).toBe("going");
  });
});

describe("parseGuestCsv", () => {
  it("reads Luma's own export", () => {
    const csv = 'api_id,name,first_name,last_name,email,approval_status,created_at\ngst-1,Asha Guest,Asha,Guest,RSVP-asha@example.com,approved,2026-11-06\ngst-2,"Ravi, R",Ravi,R,rsvp-ravi@example.com,waitlist,2026-11-06\n';
    const r = parseGuestCsv(csv);
    expect(r.rows).toEqual([
      { name: "Asha Guest", email: "rsvp-asha@example.com", status: "going", team: null },
      { name: "Ravi, R", email: "rsvp-ravi@example.com", status: "waitlist", team: null },
    ]);
  });
  it("reads a Google Forms or Tally export with first and last name", () => {
    const csv = "Timestamp;First name;Last name;Email address;Team name\n2026-11-01;Meera;K;meera@example.org;Lamps\n";
    expect(parseGuestCsv(csv).rows).toEqual([{ name: "Meera K", email: "meera@example.org", status: "going", team: "Lamps" }]);
  });
  it("skips rows without an email, keeps the first of duplicates, and refuses a file without an email column", () => {
    const r = parseGuestCsv("name,email\nA,a@x.org\nB,not-an-email\nA again,A@x.org\n");
    expect(r.rows.map((x) => x.email)).toEqual(["a@x.org"]);
    expect(r.skipped).toHaveLength(1);
    expect(parseGuestCsv("name,phone\nA,123\n").skipped[0]).toMatch(/No email column/);
  });
});

describe("emails", () => {
  it("makes a short lowercase code", () => {
    const c = newGuestCode();
    expect(c).toMatch(/^[a-z0-9]{8}$/);
  });
  it("builds the RSVP link from Desk's public address", () => {
    expect(rsvpUrl("https://ferri.example.com/", "abc12345")).toBe("https://ferri.example.com/rsvp/abc12345");
  });
  it("makes each guest's copy personal, with their RSVP link and the footer", () => {
    const t = personalText({ kind: "nudge", text: "Hi {first},\n\nBuild Night is full.", name: "Asha Guest", url: "https://x/rsvp/a", eventName: "Lantern Build Night" });
    expect(t.startsWith("Hi Asha,")).toBe(true);
    expect(t).toContain("https://x/rsvp/a");
    expect(t).toContain("frees your spot");
    expect(t).toContain("You're getting this because you registered for Lantern Build Night.");
    const plain = personalText({ kind: "reminder", text: "See you Saturday.", name: "ravi", url: "u", eventName: "E" });
    expect(plain.startsWith("Hi ravi,\n\nSee you Saturday.")).toBe(true);
  });
  it("says the counts in one line", () => {
    expect(countsLine({ going: 118, waitlist: 4, pending: 0, not_going: 2, checked_in: 0, total: 124 }, 120)).toBe("118 going of 120, 4 on the waitlist, 2 not going");
  });
});
