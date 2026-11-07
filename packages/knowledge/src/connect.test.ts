import { describe, expect, it } from "vitest";
import {
  DISCORD_PERMISSIONS,
  checkTelegramToken,
  connectPlatform,
  findConnection,
  formatBridges,
  gatewayDetail,
  parseCliFlags,
  parseConnectArgs,
  type ConnectCommand,
} from "./connect.ts";
import type { BridgeInfo } from "./doctor.ts";

const TG = "123456789:AAH-fake_token_for_tests_only_0000";

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  return (async (input: string | URL | Request) => {
    const r = routes[String(input)];
    if (!r) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function fakeGateway(bridges: BridgeInfo[], extra: Record<string, unknown> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  return {
    calls,
    gateway: {
      async call<T>(method: string, path: string, body?: unknown): Promise<T> {
        calls.push({ method, path, body });
        if (method === "GET" && path === "/gateway/collaborations") return bridges as T;
        if (method === "POST" && path === "/gateway/collaborations") {
          const b = body as { bridge_type: string; display_name: string };
          return { bridge_id: "new-1", bridge_type: b.bridge_type, display_name: b.display_name } as T;
        }
        const key = `${method} ${path}`;
        if (key in extra) return extra[key] as T;
        throw new Error(`unexpected ${key}`);
      },
    },
  };
}

describe("parseCliFlags", () => {
  it("reads --k v, --k=v and bare switches", () => {
    expect(parseCliFlags(["remove", "b1", "--yes", "--name=My Bot", "--token", "t"])).toEqual({ words: ["remove", "b1"], flags: { yes: true, name: "My Bot", token: "t" } });
  });
});

describe("parseConnectArgs", () => {
  it("parses each platform and fills from .env", () => {
    expect(parseConnectArgs(["telegram", "--token", TG, "--username", "@my_bot"])).toEqual({ action: "connect", platform: "telegram", token: TG, username: "my_bot", name: "Ferri Telegram" });
    expect(parseConnectArgs(["telegram"], { TELEGRAM_BOT_TOKEN: TG })).toMatchObject({ token: TG, username: null });
    expect(parseConnectArgs(["discord", "--guild", "123456789012345678", "--name", "Club"], { DISCORD_BOT_TOKEN: "x.y.z" })).toEqual({
      action: "connect",
      platform: "discord",
      token: "x.y.z",
      guild: "123456789012345678",
      name: "Club",
    });
    expect(parseConnectArgs(["slack", "--bot-token", "xoxb-1", "--app-token", "xapp-1"])).toMatchObject({ platform: "slack", workspace: null, name: "Ferri Slack" });
    expect(parseConnectArgs(["list"])).toEqual({ action: "list" });
    expect(parseConnectArgs(["remove", "b1", "--yes"])).toEqual({ action: "remove", id: "b1", yes: true });
    expect(parseConnectArgs([])).toEqual({ action: "help" });
  });
  it("says what to fix", () => {
    expect(() => parseConnectArgs(["telegram"])).toThrow(/BotFather/);
    expect(() => parseConnectArgs(["telegram", "--token", "nope"])).toThrow(/does not look like/);
    expect(() => parseConnectArgs(["discord", "--token", "t"])).toThrow(/server id/);
    expect(() => parseConnectArgs(["discord", "--token", "t", "--guild", "abc"])).toThrow(/not a Discord server id/);
    expect(() => parseConnectArgs(["slack", "--bot-token", "xoxp-1", "--app-token", "xapp-1"])).toThrow(/xoxb-/);
    expect(() => parseConnectArgs(["teams"])).toThrow(/Unknown platform/);
    expect(() => parseConnectArgs(["remove"])).toThrow(/connect list/);
  });
});

describe("checkTelegramToken", () => {
  it("reads the bot and its group privacy", async () => {
    const f = fakeFetch({
      [`https://api.telegram.org/bot${TG}/getMe`]: { body: { ok: true, result: { id: 1, username: "ferri_test_bot", first_name: "Ferri", can_join_groups: true, can_read_all_group_messages: false } } },
    });
    expect(await checkTelegramToken(TG, f)).toEqual({ id: 1, username: "ferri_test_bot", firstName: "Ferri", canJoinGroups: true, canReadAllGroupMessages: false });
  });
  it("explains a refused token", async () => {
    const f = fakeFetch({ [`https://api.telegram.org/bot${TG}/getMe`]: { status: 401, body: { ok: false, description: "Unauthorized" } } });
    await expect(checkTelegramToken(TG, f)).rejects.toThrow(/Telegram refused the token \(Unauthorized\)/);
  });
});

describe("connectPlatform", () => {
  const tgCmd = { action: "connect", platform: "telegram", token: TG, username: null, name: "Ferri Telegram" } as Extract<ConnectCommand, { action: "connect" }>;
  const tgFetch = (privacyOff: boolean) =>
    fakeFetch({ [`https://api.telegram.org/bot${TG}/getMe`]: { body: { ok: true, result: { id: 1, username: "ferri_test_bot", first_name: "Ferri", can_join_groups: true, can_read_all_group_messages: privacyOff } } } });

  it("creates a Telegram connection with the username from getMe and warns about Group Privacy", async () => {
    const { gateway, calls } = fakeGateway([]);
    const r = await connectPlatform(tgCmd, { gateway, fetch: tgFetch(false) });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      bridge_type: "telegram",
      display_name: "Ferri Telegram",
      connection_config: { bot_token: TG, bot_username: "ferri_test_bot" },
    });
    const text = r.lines.join("\n");
    expect(text).toContain("Turn Group Privacy off in BotFather");
    expect(text).toContain("!invite-agent @ferri");
    expect(text).toContain("Add @ferri_test_bot to your Telegram group");
  });

  it("is idempotent: an existing connection with the same name is reported, not duplicated", async () => {
    const { gateway, calls } = fakeGateway([{ bridge_id: "b1", bridge_type: "telegram", display_name: "ferri telegram" }]);
    const r = await connectPlatform(tgCmd, { gateway, fetch: tgFetch(true) });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(r.bridge?.bridge_id).toBe("b1");
    expect(r.lines.join("\n")).toContain("Already connected");
    expect(r.lines.join("\n")).not.toContain("Group Privacy");
  });

  it("gets the Slack workspace from Switch's token check", async () => {
    const { gateway, calls } = fakeGateway([], {
      "POST /gateway/collaborations/setup/slack/check": { workspace_id: "T123", workspace_name: "Lantern", bot_name: "switch" },
    });
    await connectPlatform({ action: "connect", platform: "slack", botToken: "xoxb-1", appToken: "xapp-1", workspace: null, name: "Ferri Slack" }, { gateway, fetch: fakeFetch({}) });
    expect(calls.find((c) => c.path === "/gateway/collaborations" && c.method === "POST")?.body).toEqual({
      bridge_type: "slack",
      display_name: "Ferri Slack",
      connection_config: { bot_token: "xoxb-1", app_token: "xapp-1", workspace_id: "T123" },
    });
  });

  it("checks the Discord token and tells how to invite the bot", async () => {
    const { gateway } = fakeGateway([]);
    const f = fakeFetch({ "https://discord.com/api/v10/users/@me": { body: { id: "999", username: "switch", bot: true } } });
    const r = await connectPlatform({ action: "connect", platform: "discord", token: "t", guild: "123456789012345678", name: "Ferri Discord" }, { gateway, fetch: f });
    expect(r.lines.join("\n")).toContain(`client_id=999&scope=bot+applications.commands&permissions=${DISCORD_PERMISSIONS}`);
    expect(DISCORD_PERMISSIONS).toBe(310043053136);
  });

  it("refuses a bad Discord token with what to do", async () => {
    const { gateway } = fakeGateway([]);
    const f = fakeFetch({ "https://discord.com/api/v10/users/@me": { status: 401, body: { message: "401: Unauthorized" } } });
    await expect(connectPlatform({ action: "connect", platform: "discord", token: "t", guild: "123456789012345678", name: "D" }, { gateway, fetch: f })).rejects.toThrow(/Reset Token/);
  });
});

describe("helpers", () => {
  it("findConnection matches platform and name", () => {
    const list = [{ bridge_id: "1", bridge_type: "slack", display_name: "Ferri Slack" }];
    expect(findConnection(list, "slack", " ferri slack ")?.bridge_id).toBe("1");
    expect(findConnection(list, "discord", "Ferri Slack")).toBeNull();
  });
  it("formatBridges lists or says none", () => {
    expect(formatBridges([])).toBe("No connections in Switch yet.");
    expect(formatBridges([{ bridge_id: "b1", bridge_type: "telegram", display_name: "T", room_count: 2, status: "active" }])).toBe("b1  telegram  T  2 rooms  active");
  });
  it("gatewayDetail reads Switch's detail", () => {
    expect(gatewayDetail({ body: '{"detail":"Unauthorized: bad token"}', message: "x" })).toBe("Unauthorized: bad token");
    expect(gatewayDetail({ body: '{"detail":[{"msg":"field required"}]}', message: "x" })).toBe("field required");
    expect(gatewayDetail(new Error("plain"))).toBe("plain");
  });
});
