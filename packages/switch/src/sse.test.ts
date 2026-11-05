import { describe, expect, it } from "vitest";
import { SseParser } from "./sse.js";
import { isAfter } from "./client.js";

describe("SseParser", () => {
  it("parses id, event and data, and drops keepalive comments", () => {
    const p = new SseParser();
    const frames = p.push(': keepalive\n\nid: 9007194959773697\nevent: message\ndata: {"a":1}\n\n');
    expect(frames).toEqual([{ id: "9007194959773697", event: "message", data: '{"a":1}' }]);
  });

  it("joins multi-line data and handles chunks split anywhere, including CRLF", () => {
    const p = new SseParser();
    const text = "event: connection_state\r\ndata: line1\r\ndata: line2\r\n\r\n";
    const out = [];
    for (const ch of text) out.push(...p.push(ch));
    expect(out).toEqual([{ event: "connection_state", data: "line1\nline2" }]);
  });

  it("defaults the event name to message", () => {
    const p = new SseParser();
    expect(p.push("data: x\n\n")).toEqual([{ event: "message", data: "x" }]);
  });
});

describe("isAfter", () => {
  it("compares decimal strings past 2^53 exactly", () => {
    expect(isAfter("9007199254740993", "9007199254740992")).toBe(true);
    expect(isAfter("9007199254740992", "9007199254740993")).toBe(false);
    expect(isAfter("10", "9")).toBe(true);
    expect(isAfter("5", "5")).toBe(false);
  });
});
