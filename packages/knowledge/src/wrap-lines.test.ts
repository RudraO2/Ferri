import { describe, expect, it } from "vitest";
import { closeLine, thankYouRequest, type RecapStats } from "./wrap.ts";

describe("what Ferri says when it closes", () => {
  it("says goodbye with the spaces Off", () => {
    expect(closeLine({ eventName: "Lantern Build Night", spaces: 9, movedTo: null, crewRoomOff: false, openCases: 0 })).toBe(
      "Lantern Build Night is closed. Its 9 spaces are Off now; the recap and the starter kit are in Desk.",
    );
  });
  it("says where the spaces moved, and the open cases", () => {
    expect(closeLine({ eventName: "Build Night", spaces: 1, movedTo: "Build Night 2", crewRoomOff: false, openCases: 2 })).toBe(
      "Build Night is closed. Its 1 space moves to Build Night 2 with the same modes; the recap and the starter kit are in Desk. 2 care cases stay open in Desk.",
    );
    expect(closeLine({ eventName: "A", spaces: 3, movedTo: "B", crewRoomOff: true, openCases: 1 })).toContain("(this crew room goes Off: B has its own)");
  });
});

describe("the thank-you request", () => {
  it("uses only the recap's numbers", () => {
    const stats = {
      questions: { answeredByFerri: 30, answeredByCrew: 8 },
      guests: { checkedIn: 64, going: 80 },
      care: { solved: 3 },
    } as unknown as RecapStats;
    const t = thankYouRequest("Lantern Build Night", stats, { wentWell: ["Answers were fast."], toFix: [], answerEarly: [] });
    expect(t).toContain("Thank everyone who came to Lantern Build Night");
    expect(t).toContain("64 people checked in; 38 questions from members answered in all (by Ferri and the crew together); 3 people helped when they got stuck");
    // The lessons hold the crew's own numbers (Ferri vs crew); members only get the totals.
    expect(t).not.toContain("Answers were fast.");
  });
});
