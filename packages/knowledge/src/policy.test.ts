import { describe, expect, it } from "vitest";
import { decideAction, mayPost, type DecisionInput } from "./policy.ts";
import { roomPlatform } from "./spaces.ts";

const base: DecisionInput = {
  attached: { mode: "auto", role: "members" },
  archived: false,
  muted: false,
  paused: false,
  fromCrew: false,
  addressed: false,
  mentioned: false,
};
const d = (over: Partial<DecisionInput>) => decideAction({ ...base, ...over });

describe("decideAction", () => {
  it("ignores Off, archived and muted, even when mentioned", () => {
    expect(d({ attached: null, addressed: true, mentioned: true })).toEqual({ act: "ignore", reason: "space is off (not attached to an event)" });
    expect(d({ archived: true, addressed: true, mentioned: true }).act).toBe("ignore");
    expect(d({ muted: true, addressed: true, mentioned: true })).toMatchObject({ act: "ignore", reason: "sender is muted" });
    expect(d({ muted: true, fromCrew: true, addressed: true, mentioned: true }).act).toBe("ignore");
  });

  it("routes mentions, follow-ups and room messages with the space's mode", () => {
    expect(d({ addressed: true, mentioned: true })).toEqual({ act: "direct", posting: "auto", crewRoom: false });
    expect(d({ addressed: true })).toEqual({ act: "follow_up", posting: "auto", crewRoom: false });
    expect(d({})).toEqual({ act: "room", posting: "auto", crewRoom: false });
    expect(d({ attached: { mode: "listen", role: "members" }, addressed: true, mentioned: true })).toMatchObject({ act: "direct", posting: "listen" });
    expect(d({ attached: { mode: "approve", role: "members" } })).toMatchObject({ act: "room", posting: "approve" });
  });

  it("puts the master pause above every mode", () => {
    for (const mode of ["listen", "approve", "auto"] as const) {
      expect(d({ attached: { mode, role: "members" }, paused: true, addressed: true, mentioned: true })).toMatchObject({ posting: "paused" });
    }
    expect(d({ attached: { mode: "listen", role: "crew" }, paused: true, fromCrew: true, addressed: true })).toMatchObject({ act: "crew", posting: "paused" });
  });

  it("lets the crew work with Ferri anywhere, and keeps the crew room quiet otherwise", () => {
    expect(d({ fromCrew: true, addressed: true, mentioned: true })).toMatchObject({ act: "crew", crewRoom: false });
    // A crew follow-up outside the crew room is an ordinary follow-up.
    expect(d({ fromCrew: true, addressed: true })).toMatchObject({ act: "follow_up" });
    const crewRoom = { mode: "listen" as const, role: "crew" as const };
    expect(d({ attached: crewRoom, fromCrew: true, addressed: true })).toEqual({ act: "crew", posting: "auto", crewRoom: true });
    expect(d({ attached: crewRoom, addressed: true, mentioned: true })).toEqual({ act: "direct", posting: "auto", crewRoom: true });
    expect(d({ attached: crewRoom })).toEqual({ act: "ignore", reason: "crew chatter" });
    expect(d({ attached: crewRoom, fromCrew: true })).toEqual({ act: "ignore", reason: "crew chatter" });
  });

  it("posts only in auto", () => {
    expect(["auto", "approve", "listen", "paused"].map((p) => mayPost(p as never))).toEqual([true, false, false, false]);
  });
});


describe("roomPlatform", () => {
  it("prefers the bridge type, then a platform named in the connection, then the name", async () => {
    const lookup = async (id: string) => (id === "b1" ? "slack" : null);
    expect(await roomPlatform({ bridge_id: "b1", bridge_display_name: "Pulse" }, lookup)).toBe("slack");
    expect(await roomPlatform({ bridge_id: "b2", bridge_display_name: "Pulse Slack" }, lookup)).toBe("slack");
    expect(await roomPlatform({ bridge_display_name: "Lantern Labs Discord" })).toBe("discord");
    expect(await roomPlatform({ bridge_display_name: "Telegram" })).toBe("telegram");
    expect(await roomPlatform({ bridge_display_name: "Acme Chat" })).toBe("acme chat");
    expect(await roomPlatform({})).toBeNull();
  });
});
