import { describe, expect, it } from "vitest";
import { z } from "zod";
import { repairEmptyChoices } from "./model.ts";

describe("repairEmptyChoices", () => {
  const S = z.strictObject({ intent: z.enum(["plan", "other"]), plan: z.strictObject({ kind: z.enum(["task", "decision"]) }).nullable() });
  it("gives a nested empty choice its first option", () => {
    const raw = { intent: "plan", plan: { kind: "" } };
    const first = S.safeParse(raw);
    expect(first.success).toBe(false);
    expect(repairEmptyChoices(raw, first.error!.issues as never)).toBe(true);
    expect(S.parse(raw)).toEqual({ intent: "plan", plan: { kind: "task" } });
  });
  it("leaves a top-level choice and real wrong values alone", () => {
    const top = { intent: "", plan: null };
    expect(repairEmptyChoices(top, S.safeParse(top).error!.issues as never)).toBe(false);
    const wrong = { intent: "plan", plan: { kind: "meeting" } };
    expect(repairEmptyChoices(wrong, S.safeParse(wrong).error!.issues as never)).toBe(false);
  });
});
