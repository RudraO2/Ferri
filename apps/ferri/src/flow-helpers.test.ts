import { describe, expect, it } from "vitest";
import { mentionRegex } from "./mentions.ts";
import { RoomHistory, type RoomLine } from "./rooms.ts";

describe("mentionRegex", () => {
  const re = mentionRegex("ferri");
  it("matches @ferri at a token boundary, any case", () => {
    expect(re.test("@ferri when is lunch?")).toBe(true);
    expect(re.test("hey @Ferri, help")).toBe(true);
  });
  it("does not match longer names or a bare name", () => {
    expect(re.test("@ferri-builder do it")).toBe(false);
    expect(re.test("@ferrix")).toBe(false);
    expect(re.test("ferri when is lunch")).toBe(false);
  });
});

const line = (id: string, t: number): RoomLine => ({
  id,
  senderId: "u",
  sender: "u",
  body: id,
  timestamp: t,
  fromFerri: false,
});

describe("RoomHistory", () => {
  it("loads once, merges live lines without duplicates, and slices before and after", async () => {
    let loads = 0;
    const h = new RoomHistory(async () => {
      loads++;
      return [line("a", 1), line("b", 2)];
    });
    await Promise.all([h.ensure("r"), h.ensure("r")]);
    h.push("r", line("b", 2));
    h.push("r", line("c", 3));
    h.push("r", line("d", 4));
    expect(loads).toBe(1);
    expect(h.before("r", "c").map((l) => l.id)).toEqual(["a", "b"]);
    expect(h.after("r", "b").map((l) => l.id)).toEqual(["c", "d"]);
    expect(h.after("r", "zz")).toEqual([]);
  });

  it("keeps only the newest lines", async () => {
    const h = new RoomHistory(async () => [], 3);
    await h.ensure("r");
    for (let i = 0; i < 5; i++) h.push("r", line(`m${i}`, i));
    expect(h.before("r", "none", 10).map((l) => l.id)).toEqual(["m2", "m3", "m4"]);
  });
});
