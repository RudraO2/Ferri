import { describe, expect, it } from "vitest";
import { buildTsQuery, formatSourceLine, renderKnowledge } from "./render.ts";
import { finalizeAnswer, HOLDING_REPLY } from "./answer.ts";
import type { KnowledgeItem } from "./store.ts";

const item = (id: string, sourceTitle: string, heading: string, body = "b"): KnowledgeItem => ({
  id,
  key: `${sourceTitle}#${heading}`,
  eventId: null,
  eventName: null,
  sourceKind: "markdown",
  sourceTitle,
  heading,
  body,
  version: 1,
  updatedAt: new Date("2026-11-05T10:00:00Z"),
});

const food = item("u1", "Build Night FAQ", "Food", "Lunch at 1:30 PM.");
const wifi = item("u2", "Build Night FAQ", "Wi-Fi");
const sat = item("u3", "Build Night schedule", "Saturday");

describe("renderKnowledge", () => {
  it("gives short ids in order and is byte-stable for the same input", () => {
    const a = renderKnowledge([food, wifi]);
    expect([...a.ids.keys()]).toEqual(["K1", "K2"]);
    expect(a.ids.get("K1")).toBe(food);
    expect(a.text).toContain(
      '<entry id="K1" source="Build Night FAQ" section="Food" scope="community">\nLunch at 1:30 PM.\n</entry>',
    );
    expect(renderKnowledge([food, wifi]).text).toBe(a.text);
  });

  it("escapes quotes in attributes", () => {
    expect(renderKnowledge([item("x", 'The "Big" FAQ', "A")]).text).toContain('source="The &quot;Big&quot; FAQ"');
  });
});

describe("formatSourceLine", () => {
  it("groups headings per source", () => {
    expect(formatSourceLine([food])).toBe("Source: Build Night FAQ (Food)");
    expect(formatSourceLine([food, wifi])).toBe("Source: Build Night FAQ (Food, Wi-Fi)");
    expect(formatSourceLine([food, sat])).toBe("Sources: Build Night FAQ (Food); Build Night schedule (Saturday)");
    expect(formatSourceLine([item("o", "About", "Overview")])).toBe("Source: About");
  });
});

describe("buildTsQuery", () => {
  it("ORs words and strips query syntax", () => {
    expect(buildTsQuery(["wi-fi password", "internet"])).toBe("wi | fi | password | internet");
    expect(buildTsQuery(["a' & !b:* | (c)"])).toBe("");
    expect(buildTsQuery(["lunch & (dinner)"])).toBe("lunch | dinner");
    expect(buildTsQuery([])).toBe("");
  });
});

describe("finalizeAnswer", () => {
  const ids = renderKnowledge([food, wifi, sat]).ids;

  it("adds the source line and keeps only real ids", () => {
    const r = finalizeAnswer(
      { kind: "answer", reply: "Lunch is at 1:30 PM.", source_ids: ["K1", "K9", "k1"], missing: null },
      ids,
    );
    expect(r.kind).toBe("answer");
    expect(r.sources).toEqual([food]);
    expect(r.text).toBe("Lunch is at 1:30 PM.\n\nSource: Build Night FAQ (Food)");
  });

  it("downgrades an answer with no valid citation to the holding reply", () => {
    const r = finalizeAnswer({ kind: "answer", reply: "Parking is free.", source_ids: ["K42"], missing: null }, ids);
    expect(r).toMatchObject({ kind: "unknown", text: HOLDING_REPLY, downgraded: true, sources: [] });
  });

  it("keeps the missing part of a partial answer", () => {
    const r = finalizeAnswer({ kind: "answer", reply: "Lunch is at 1:30.", source_ids: ["K1"], missing: " parking " }, ids);
    expect(r.missing).toBe("parking");
  });

  it("passes unknown and chat through without sources", () => {
    expect(finalizeAnswer({ kind: "unknown", reply: "", source_ids: ["K1"], missing: null }, ids)).toMatchObject({
      kind: "unknown",
      text: HOLDING_REPLY,
      sources: [],
    });
    expect(finalizeAnswer({ kind: "chat", reply: "Hi!", source_ids: [], missing: null }, ids).text).toBe("Hi!");
  });
});
