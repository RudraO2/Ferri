import { describe, expect, it } from "vitest";
import { bridgeCheck, builderCheck, formatDoctorReport, publicUrlOff, pushCheck, runDoctor, shieldCheck, type DoctorReport } from "./doctor.ts";

const SWITCH = "http://switch.test:8000";

/** A fake fetch: each route answers with a status and JSON, anything else refuses to connect. */
function fakeFetch(routes: Record<string, { status?: number; body?: unknown; headers?: Record<string, string> } | (() => never)>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    calls.push(key);
    const route = routes[key] ?? routes[url];
    if (!route) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    if (typeof route === "function") return route();
    return new Response(route.body === undefined ? "" : JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  }) as typeof fetch;
  return { f, calls };
}

const healthyEnv = {
  SWITCH_URL: SWITCH,
  SWITCH_ADMIN_EMAIL: "admin@switch.local",
  SWITCH_ADMIN_PASSWORD: "pw",
  FERRI_AGENT_ID: "a1",
  FERRI_AGENT_KEY: "k1",
  FERRI_CREW_ROOM_ID: "r-crew",
  FERRI_LAB_ROOM_ID: "r-lab",
  DATABASE_URL: "postgres://ferri:ferri@db:5432/ferri",
  ANTHROPIC_API_KEY: "sk-ant-test",
};

const healthyRoutes = {
  [`GET ${SWITCH}/health`]: { body: { ok: true } },
  [`POST ${SWITCH}/gateway/auth/login`]: { body: {}, headers: { "set-cookie": "session=abc; Path=/" } },
  [`GET ${SWITCH}/gateway/agents`]: { body: [{ id: "a1", name: "ferri" }] },
  [`GET ${SWITCH}/gateway/agents/a1`]: { body: { id: "a1", sessions: [{ lifecycle: "connection", state: "live" }] } },
  [`GET ${SWITCH}/gateway/collaborations`]: {
    body: [{ bridge_id: "b1", bridge_type: "mattermost", display_name: "Mattermost", status: "active", room_count: 4, attention: null }],
  },
  [`GET ${SWITCH}/gateway/trust-settings`]: { body: { endpoint: "", policy_id: null, has_api_key: false, enabled: false } },
  [`GET ${SWITCH}/gateway/management/agents`]: { body: [] },
  [`POST ${SWITCH}/agents/a1/ops/list_rooms`]: {
    body: {
      result: [
        { room_id: "r-crew", name: "ferri-crew" },
        { room_id: "r-lab", name: "ferri-lab" },
      ],
    },
  },
  "GET https://api.anthropic.com/v1/models?limit=1": { body: { data: [] } },
};

const byId = (r: DoctorReport, id: string) => r.checks.find((c) => c.id === id)!;

describe("runDoctor", () => {
  it("reports a healthy core and integrations off on a clean install", async () => {
    const { f, calls } = fakeFetch(healthyRoutes);
    const r = await runDoctor(healthyEnv, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(r.ok).toBe(true);
    for (const id of ["switch", "admin", "ferri", "ferri-online", "db", "anthropic", "crew-room", "lab-room"]) expect(byId(r, id).status, id).toBe("on");
    expect(byId(r, "mattermost").status).toBe("on");
    for (const id of ["telegram", "slack", "discord", "whatsapp", "shield", "push", "email", "social", "posters", "builder", "public-url", "luma"]) {
      expect(byId(r, id).status, id).toBe("off");
      expect(byId(r, id).next, id).toBeTruthy();
    }
    expect(byId(r, "telegram").next).toBe("./ferri connect telegram --token <bot token from BotFather>");
    // No model call: only the free models list.
    expect(calls.filter((c) => c.includes("anthropic.com"))).toEqual(["GET https://api.anthropic.com/v1/models?limit=1"]);
  });

  it("never throws when Switch is down, and marks core broken", async () => {
    const { f } = fakeFetch({});
    const r = await runDoctor(healthyEnv, { fetch: f, timeoutMs: 200, checkDb: async () => Promise.reject(new Error("connect ECONNREFUSED")) });
    expect(r.ok).toBe(false);
    expect(byId(r, "switch").status).toBe("broken");
    expect(byId(r, "switch").detail).toContain("ECONNREFUSED");
    expect(byId(r, "switch").next).toContain("./ferri up");
    expect(byId(r, "admin").status).toBe("broken");
    expect(byId(r, "db").status).toBe("broken");
    expect(byId(r, "telegram").status).toBe("broken");
    expect(byId(r, "telegram").next).toBe("Fix the core checks first.");
  });

  it("turns a hanging call into broken after the timeout", async () => {
    const hang = (async (_: unknown, init?: RequestInit) =>
      new Promise((_, no) => init?.signal?.addEventListener("abort", () => no(Object.assign(new Error("aborted"), { name: "TimeoutError" }))))) as typeof fetch;
    const r = await runDoctor({ ...healthyEnv }, { fetch: hang, timeoutMs: 50, checkDb: () => new Promise(() => {}) });
    expect(byId(r, "switch").detail).toContain("no answer in time");
    expect(byId(r, "db").status).toBe("broken");
  }, 5000);

  it("flags a missing key, an unknown agent, a refused key and an unseeded database", async () => {
    const { f } = fakeFetch({
      ...healthyRoutes,
      [`GET ${SWITCH}/gateway/agents`]: { body: [{ id: "other", name: "ferri" }] },
      "GET https://api.anthropic.com/v1/models?limit=1": { status: 401, body: { error: {} } },
    });
    const r = await runDoctor({ ...healthyEnv }, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 0 }) });
    expect(byId(r, "ferri").status).toBe("broken");
    expect(byId(r, "ferri").next).toBe("./ferri setup:switch");
    expect(byId(r, "anthropic").detail).toContain("refused");
    expect(byId(r, "db").next).toBe("./ferri kb seed");

    const noKey = await runDoctor({ ...healthyEnv, ANTHROPIC_API_KEY: "" }, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(byId(noKey, "anthropic").next).toContain("ANTHROPIC_API_KEY");
  });

  it("says Ferri is not running when Switch shows no live connection", async () => {
    const { f } = fakeFetch({ ...healthyRoutes, [`GET ${SWITCH}/gateway/agents/a1`]: { body: { id: "a1", sessions: [] } } });
    const r = await runDoctor(healthyEnv, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(byId(r, "ferri").status).toBe("on");
    expect(byId(r, "ferri-online").status).toBe("broken");
  });

  it("checks Resend's domain for email", async () => {
    const { f } = fakeFetch({ ...healthyRoutes, "GET https://api.resend.com/domains": { body: { data: [{ name: "mail.example.com", status: "verified" }] } } });
    const env = { ...healthyEnv, RESEND_API_KEY: "re_x", FERRI_EMAIL_FROM: "Ferri <partners@mail.example.com>" };
    const noHook = await runDoctor(env, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(byId(noHook, "email").status).toBe("broken");
    expect(byId(noHook, "email").next).toBe("./ferri email:setup");
    const ok = await runDoctor({ ...env, RESEND_WEBHOOK_SECRET: "whsec" }, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(byId(ok, "email").status).toBe("on");
    const other = await runDoctor({ ...env, FERRI_EMAIL_FROM: "a@elsewhere.example.org" }, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(byId(other, "email").detail).toContain("elsewhere.example.org");
  });
});

describe("runDoctor, outside services", () => {
  it("does not call a rate-limited Buffer key refused, and reads a Cloudflare 530 as the tunnel", async () => {
    const { f } = fakeFetch({
      ...healthyRoutes,
      "POST https://api.buffer.com": { body: { errors: [{ message: "Too many requests from this client. Please try again later." }] } },
      "GET https://desk.my-community.org": { status: 530, body: "" },
    });
    const env = { ...healthyEnv, BUFFER_API_KEY: "b", FERRI_PUBLIC_URL: "https://desk.my-community.org" };
    const r = await runDoctor(env, { fetch: f, timeoutMs: 500, checkDb: async () => ({ communities: 1 }) });
    expect(byId(r, "social").status).toBe("on");
    expect(byId(r, "social").detail).toContain("rate-limiting");
    expect(byId(r, "public-url").status).toBe("broken");
    expect(byId(r, "public-url").detail).toContain("cannot reach the tunnel");
  });
});

describe("bridgeCheck", () => {
  const input = { id: "telegram", name: "Telegram", type: "telegram", next: "./ferri connect telegram --token <t>" };
  it("is off with no connection, on with one, broken when Switch says it needs attention", () => {
    expect(bridgeCheck(input, [], null).status).toBe("off");
    const on = bridgeCheck(input, [{ bridge_id: "b", bridge_type: "telegram", display_name: "Ferri Telegram", status: "active", room_count: 2 }], null);
    expect(on.status).toBe("on");
    expect(on.detail).toContain('"Ferri Telegram" (2 rooms)');
    const bad = bridgeCheck(input, [{ bridge_id: "b9", bridge_type: "telegram", display_name: "T", status: "active", attention: "The token was revoked" }], null);
    expect(bad.status).toBe("broken");
    expect(bad.detail).toContain("The token was revoked");
    expect(bad.next).toContain("./ferri connect remove b9");
  });
  it("is broken when the connections cannot be read", () => {
    expect(bridgeCheck(input, null, "HTTP 500").status).toBe("broken");
  });
});

describe("shieldCheck", () => {
  const trust = (enabled: boolean, policy: string | null) => ({ endpoint: "http://host.docker.internal:3200", policy_id: policy, has_api_key: true, enabled });
  it("decides from the key and Switch Trust", () => {
    expect(shieldCheck({}, trust(false, null), null, "./ferri").status).toBe("off");
    expect(shieldCheck({ SHIELD_API_KEY: "k" }, trust(true, "ferri-shield"), null, "./ferri").status).toBe("on");
    expect(shieldCheck({ SHIELD_API_KEY: "k" }, trust(false, null), null, "./ferri").status).toBe("broken");
    expect(shieldCheck({}, trust(true, "ferri-shield"), null, "./ferri").status).toBe("broken");
    expect(shieldCheck({ SHIELD_API_KEY: "k" }, trust(true, "other"), null, "./ferri").next).toBe("./ferri shield:connect");
  });
});

describe("pushCheck, builderCheck, publicUrlOff", () => {
  it("push needs both keys", () => {
    expect(pushCheck({}, "./ferri").status).toBe("off");
    expect(pushCheck({ VAPID_PUBLIC_KEY: "a" }, "./ferri").status).toBe("broken");
    expect(pushCheck({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" }, "./ferri").status).toBe("on");
  });
  it("builder: missing, offline machine, online, flag off", () => {
    expect(builderCheck({}, [], null, "./ferri").next).toContain("pnpm builder:setup");
    const agent = { agent_id: "x", name: "builder", controller_name: "laptop", controller_state: "offline" };
    expect(builderCheck({}, [agent], null, "./ferri").status).toBe("broken");
    expect(builderCheck({}, [{ ...agent, controller_state: "online" }], null, "./ferri").status).toBe("on");
    expect(builderCheck({}, null, { status: 404, message: "HTTP 404" }, "./ferri").status).toBe("off");
  });
  it("public URL is off when unset, local or an example address", () => {
    expect(publicUrlOff({})).toContain("not set");
    expect(publicUrlOff({ FERRI_PUBLIC_URL: "http://localhost:3100" })).toContain("only this machine");
    expect(publicUrlOff({ FERRI_PUBLIC_URL: "https://ferri.example.com" })).toContain("only this machine");
    expect(publicUrlOff({ FERRI_PUBLIC_URL: "https://desk.my-community.org" })).toBeNull();
  });
});

describe("formatDoctorReport", () => {
  it("groups core and integrations and gives next steps", () => {
    const text = formatDoctorReport({
      at: "2026-11-07T00:00:00Z",
      ok: false,
      checks: [
        { id: "switch", area: "core", name: "Switch", status: "broken", detail: "Not reachable.", next: "./ferri up" },
        { id: "db", area: "core", name: "Ferri database", status: "on", detail: "Reachable.", next: null },
        { id: "telegram", area: "integration", name: "Telegram", status: "off", detail: "No connection.", next: "./ferri connect telegram --token <t>" },
      ],
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Core");
    expect(text.indexOf("Integrations")).toBeGreaterThan(text.indexOf("Ferri database"));
    expect(text).toMatch(/BROKEN\s+Switch\s+Not reachable\./);
    expect(text).toContain("Next: ./ferri up");
    expect(text).toContain("Next: ./ferri connect telegram --token <t>");
    expect(text.trim().split("\n").at(-1)).toBe("1 core check is broken. Fix it first, in order.");
    expect(text).not.toContain("—");
  });
});
