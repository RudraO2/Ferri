/**
 * Ferri doctor (spec 23): what is on, off or broken, and the exact next step
 * for each. Used by `scripts/doctor.ts` (`./ferri doctor`) and Desk's Setup page.
 *
 * Every network call has a short timeout and every failure becomes a "broken"
 * check with the error; nothing here throws. No model is called: the Anthropic
 * key is checked with the free models list.
 */
import { communities, createDb } from "@ferri/db";
import { GatewayClient } from "@ferri/switch";
import { sql } from "drizzle-orm";
import { builderName } from "./builder.ts";

// Desk's first-run checklist (spec 25) builds on this report's connections.
export * from "./checklist.ts";

export type CheckStatus = "on" | "off" | "broken";
export type CheckArea = "core" | "integration";

export interface DoctorCheck {
  id: string;
  area: CheckArea;
  name: string;
  status: CheckStatus;
  /** What was found, in one or two plain sentences. */
  detail: string;
  /** The exact next step (a command or what to set in .env), or null when nothing is needed. */
  next: string | null;
}

export interface DoctorReport {
  at: string;
  checks: DoctorCheck[];
  /** False when any core check is broken. */
  ok: boolean;
  /** Switch's connections as read for the checks; null when they could not be read. Desk's first-run checklist uses them. */
  bridges?: BridgeInfo[] | null;
}

export interface DoctorDeps {
  fetch?: typeof fetch;
  /** Per request, in milliseconds (default 4000). */
  timeoutMs?: number;
  /** Ferri's database: a `select 1` and the number of communities. Throws when it cannot connect. */
  checkDb?: (url: string) => Promise<{ communities: number }>;
  /** How commands are shown in next steps (default "./ferri"). */
  command?: string;
}

type Env = Record<string, string | undefined>;

/** A Switch connection (bridge) as `GET /gateway/collaborations` lists it. */
export interface BridgeInfo {
  bridge_id: string;
  bridge_type: string;
  display_name: string;
  status?: string;
  room_count?: number;
  attention?: string | null;
}

interface TrustSettings {
  endpoint: string;
  policy_id: string | null;
  has_api_key: boolean;
  enabled: boolean;
}

interface ManagedAgent {
  agent_id: string;
  name: string;
  controller_name: string | null;
  controller_state: string | null;
  desired_state?: string;
}

interface AgentDetail {
  id: string;
  sessions?: { lifecycle: string; state: string; last_seen_at?: string }[];
}

const DEFAULT_TIMEOUT = 4000;

const errText = (e: unknown): string => {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "no answer in time";
  const cause = err?.cause?.code ?? err?.cause?.message;
  return `${err?.message ?? String(e)}${cause ? ` (${cause})` : ""}`.slice(0, 240);
};

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url) || /(^|\.)example\.(com|org|net)(:|\/|$)/i.test(new URL(url).hostname + "/");

/** Statuses from fake or real answers, kept pure so they can be tested without a network. */
export function bridgeCheck(
  input: { id: string; name: string; type: string | string[]; next: string; offDetail?: string; cmd?: string },
  bridges: BridgeInfo[] | null,
  bridgeError: string | null,
): DoctorCheck {
  const base = { id: input.id, area: "integration" as const, name: input.name };
  if (!bridges) {
    return { ...base, status: "broken", detail: `Cannot read Switch's connections: ${bridgeError ?? "Switch is not reachable"}.`, next: "Fix the core checks first." };
  }
  const types = Array.isArray(input.type) ? input.type : [input.type];
  const mine = bridges.filter((b) => types.includes(b.bridge_type));
  if (!mine.length) return { ...base, status: "off", detail: input.offDetail ?? `No ${input.name} connection in Switch.`, next: input.next };
  const bad = mine.find((b) => (b.status && b.status !== "active") || b.attention);
  if (bad) {
    return {
      ...base,
      status: "broken",
      detail: `"${bad.display_name}" needs attention: ${bad.attention ?? `status ${bad.status}`}.`,
      next: `Fix it in Switch, or remove it (${input.cmd ?? "./ferri"} connect remove ${bad.bridge_id}) and connect again.`,
    };
  }
  const names = mine.map((b) => `"${b.display_name}"${typeof b.room_count === "number" ? ` (${b.room_count} room${b.room_count === 1 ? "" : "s"})` : ""}`);
  return { ...base, status: "on", detail: `Connected: ${names.join(", ")}.`, next: null };
}

export function shieldCheck(env: Env, trust: TrustSettings | null, trustError: string | null, cmd: string): DoctorCheck {
  const base = { id: "shield", area: "integration" as const, name: "Shield" };
  const policy = env.SHIELD_POLICY_ID ?? "ferri-shield";
  const key = !!env.SHIELD_API_KEY?.trim();
  if (!trust) {
    if (!key) return { ...base, status: "off", detail: "No SHIELD_API_KEY.", next: `${cmd} shield:connect` };
    return { ...base, status: "broken", detail: `Cannot read Switch Trust settings: ${trustError ?? "Switch is not reachable"}.`, next: "Fix the core checks first." };
  }
  const ours = trust.enabled && trust.policy_id === policy;
  if (ours && key) return { ...base, status: "on", detail: `Switch checks every message with Shield at ${trust.endpoint}.`, next: null };
  if (ours && !key) {
    return { ...base, status: "broken", detail: "Switch sends every message to Shield, but SHIELD_API_KEY is not set, so Ferri does not serve Shield.", next: `${cmd} shield:connect (or ${cmd} shield:connect --off)` };
  }
  if (trust.enabled) return { ...base, status: "off", detail: `Switch Trust points at another checker (${trust.endpoint}, policy ${trust.policy_id ?? "none"}).`, next: `${cmd} shield:connect` };
  if (key) return { ...base, status: "broken", detail: "SHIELD_API_KEY is set, but Switch Trust is off, so nothing is checked.", next: `${cmd} shield:connect` };
  return { ...base, status: "off", detail: "Switch Trust is off.", next: `${cmd} shield:connect` };
}

export function pushCheck(env: Env, cmd: string): DoctorCheck {
  const base = { id: "push", area: "integration" as const, name: "Pocket push" };
  const pub = !!env.VAPID_PUBLIC_KEY?.trim();
  const priv = !!env.VAPID_PRIVATE_KEY?.trim();
  if (pub && priv) return { ...base, status: "on", detail: "Web Push keys are set: Pocket can send notices to the crew.", next: null };
  if (pub || priv) return { ...base, status: "broken", detail: `Only ${pub ? "VAPID_PUBLIC_KEY" : "VAPID_PRIVATE_KEY"} is set.`, next: `${cmd} push:keys` };
  return { ...base, status: "off", detail: "No Web Push keys.", next: `${cmd} push:keys` };
}

export function builderCheck(
  env: Env,
  agents: ManagedAgent[] | null,
  agentsError: { status: number | null; message: string } | null,
  cmd: string,
): DoctorCheck {
  const base = { id: "builder", area: "integration" as const, name: "Builder" };
  const name = builderName(env);
  if (!agents) {
    if (agentsError?.status === 404) {
      return { ...base, status: "off", detail: "Agent management is off on this Switch (feature flag agent_management).", next: "Turn on the agent_management feature flag in Switch (FEATURE_FLAGS_ENABLED), then pnpm builder:setup on the Builder's machine" };
    }
    return { ...base, status: "broken", detail: `Cannot read Switch's managed agents: ${agentsError?.message ?? "Switch is not reachable"}.`, next: "Fix the core checks first." };
  }
  const b = agents.find((a) => a.name === name);
  if (!b) return { ...base, status: "off", detail: `No managed agent named "${name}".`, next: "On the machine that will run it (Node 22 and Claude Code installed): pnpm install, then pnpm builder:setup (docs/builder.md)" };
  if (b.controller_state === "online") return { ...base, status: "on", detail: `"${name}" runs on the machine "${b.controller_name ?? "?"}", which is online.`, next: null };
  return {
    ...base,
    status: "broken",
    detail: `"${name}" exists, but its machine${b.controller_name ? ` "${b.controller_name}"` : ""} is ${b.controller_state ?? "not known"}.`,
    next: "Start the Builder's controller on its machine: pnpm builder:controller",
  };
}

export function publicUrlOff(env: Env): string | null {
  const url = env.FERRI_PUBLIC_URL?.trim();
  if (!url) return "FERRI_PUBLIC_URL is not set.";
  try {
    if (isLocal(url)) return `FERRI_PUBLIC_URL is ${url}, which only this machine can reach.`;
  } catch {
    return `FERRI_PUBLIC_URL is not a valid address: ${url}.`;
  }
  return null;
}

const emailDomain = (from: string) => /@([^>\s]+)>?\s*$/.exec(from)?.[1]?.toLowerCase() ?? null;

/**
 * Run every check. `env` is usually `process.env` (the root .env loaded by
 * tsx or Next). Takes a few seconds at most: checks run in parallel.
 */
export async function runDoctor(env: Env = process.env, deps: DoctorDeps = {}): Promise<DoctorReport> {
  const f = deps.fetch ?? fetch;
  const ms = deps.timeoutMs ?? DEFAULT_TIMEOUT;
  const cmd = deps.command ?? "./ferri";
  const get = (url: string, init: RequestInit = {}) => f(url, { ...init, signal: AbortSignal.timeout(ms) });
  const switchUrl = (env.SWITCH_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  const checks: DoctorCheck[] = [];
  const core = (id: string, name: string, status: CheckStatus, detail: string, next: string | null) =>
    checks.push({ id, area: "core", name, status, detail, next });

  // ── Switch ──────────────────────────────────────────────────────────────
  let switchUp = false;
  try {
    const res = await get(`${switchUrl}/health`);
    switchUp = res.ok;
    core("switch", "Switch", res.ok ? "on" : "broken", res.ok ? `Reachable at ${switchUrl}.` : `${switchUrl}/health answered HTTP ${res.status}.`, res.ok ? null : `Check Switch's logs: ${cmd} logs switch`);
  } catch (e) {
    core("switch", "Switch", "broken", `Not reachable at ${switchUrl}: ${errText(e)}.`, `Start the stack: ${cmd} up (or set SWITCH_URL in .env)`);
  }

  let gw: GatewayClient | null = null;
  const password = env.SWITCH_ADMIN_PASSWORD?.trim();
  const email = env.SWITCH_ADMIN_EMAIL?.trim() || "admin@switch.local";
  if (!password) {
    core("admin", "Switch admin sign-in", "broken", "SWITCH_ADMIN_PASSWORD is not set.", "Set SWITCH_ADMIN_PASSWORD in .env (the same value as GATEWAY_ADMIN_PASSWORD).");
  } else if (!switchUp) {
    core("admin", "Switch admin sign-in", "broken", "Not tried: Switch is not reachable.", "Fix the Switch check first.");
  } else {
    const client = new GatewayClient(switchUrl, email, password, { fetch: f, timeoutMs: ms });
    try {
      await client.login();
      gw = client;
      core("admin", "Switch admin sign-in", "on", `Signed in as ${email}.`, null);
    } catch (e) {
      const m = errText(e);
      core("admin", "Switch admin sign-in", "broken", `Sign-in as ${email} failed: ${m}.`, "Check SWITCH_ADMIN_EMAIL and SWITCH_ADMIN_PASSWORD in .env (the same values as GATEWAY_ADMIN_EMAIL and GATEWAY_ADMIN_PASSWORD).");
    }
  }

  // Everything else that reads Switch as the admin, in parallel.
  const settle = async <T>(p: Promise<T>): Promise<{ value: T | null; error: { status: number | null; message: string } | null }> => {
    try {
      return { value: await p, error: null };
    } catch (e) {
      return { value: null, error: { status: (e as { status?: number }).status ?? null, message: errText(e) } };
    }
  };
  const agentId = env.FERRI_AGENT_ID?.trim();
  const agentKey = env.FERRI_AGENT_KEY?.trim();
  const noGw = Promise.reject(new Error("Switch admin sign-in failed"));
  noGw.catch(() => {});
  const [agentsR, detailR, bridgesR, trustR, managedR, roomsR, dbR, anthropicR] = await Promise.all([
    settle(gw ? gw.call<{ id: string; name: string }[]>("GET", "/gateway/agents") : noGw),
    settle(gw && agentId ? gw.call<AgentDetail>("GET", `/gateway/agents/${encodeURIComponent(agentId)}`) : noGw),
    settle(gw ? gw.call<BridgeInfo[]>("GET", "/gateway/collaborations") : noGw),
    settle(gw ? gw.call<TrustSettings>("GET", "/gateway/trust-settings") : noGw),
    settle(gw ? gw.call<ManagedAgent[]>("GET", "/gateway/management/agents") : noGw),
    settle(
      switchUp && agentId && agentKey
        ? get(`${switchUrl}/agents/${encodeURIComponent(agentId)}/ops/list_rooms`, {
            method: "POST",
            headers: { authorization: `Bearer ${agentKey}`, "content-type": "application/json" },
            body: "{}",
          }).then(async (r) => {
            if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
            return ((await r.json()) as { result: { room_id: string; name: string }[] }).result ?? [];
          })
        : noGw,
    ),
    settle(
      (async () => {
        const url = env.DATABASE_URL?.trim();
        if (!url) throw new Error("DATABASE_URL is not set");
        const check = deps.checkDb ?? defaultCheckDb;
        return await Promise.race([check(url), new Promise<never>((_, no) => setTimeout(() => no(Object.assign(new Error("no answer in time"), { name: "TimeoutError" })), ms + 1000).unref?.())]);
      })(),
    ),
    settle(
      env.ANTHROPIC_API_KEY?.trim()
        ? get("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": env.ANTHROPIC_API_KEY.trim(), "anthropic-version": "2023-06-01" } })
        : noGw,
    ),
  ]);

  // ── Ferri in Switch ─────────────────────────────────────────────────────
  if (!agentId || !agentKey) {
    core("ferri", "Ferri registered", "broken", `${!agentId ? "FERRI_AGENT_ID" : "FERRI_AGENT_KEY"} is not set.`, `${cmd} setup:switch`);
  } else if (!gw) {
    core("ferri", "Ferri registered", "broken", "Not checked: Switch admin sign-in failed.", "Fix the checks above first.");
  } else if (!agentsR.value) {
    core("ferri", "Ferri registered", "broken", `Cannot list Switch's agents: ${agentsR.error?.message}.`, "Fix the checks above first.");
  } else if (!agentsR.value.some((a) => a.id === agentId)) {
    core("ferri", "Ferri registered", "broken", `Switch has no agent with FERRI_AGENT_ID ${agentId}.`, `${cmd} setup:switch`);
  } else if (roomsR.error) {
    core(
      "ferri",
      "Ferri registered",
      "broken",
      roomsR.error.status === 401 || roomsR.error.status === 403 ? "Switch refused FERRI_AGENT_KEY." : `Ferri's key could not be checked: ${roomsR.error.message}.`,
      roomsR.error.status === 401 || roomsR.error.status === 403 ? `Clear FERRI_AGENT_KEY in .env, then ${cmd} setup:switch (it registers Ferri again)` : "Run the doctor again in a minute.",
    );
  } else {
    core("ferri", "Ferri registered", "on", `Agent ferri (${agentId}) is registered and its key works.`, null);
  }

  if (agentId && gw && detailR.value) {
    const sessions = detailR.value.sessions ?? [];
    const live = sessions.some((s) => s.lifecycle === "connection" && s.state === "live");
    core(
      "ferri-online",
      "Ferri running",
      live ? "on" : "broken",
      live ? "Ferri is connected to Switch now." : "Ferri is registered but not connected to Switch now, so nobody gets answers.",
      live ? null : `Start Ferri: ${cmd} up (on the host: pnpm dev), then see ${cmd} logs ferri`,
    );
  }

  // ── Database ────────────────────────────────────────────────────────────
  if (dbR.value) {
    const n = dbR.value.communities;
    core("db", "Ferri database", n ? "on" : "broken", n ? `Reachable, ${n} communit${n === 1 ? "y" : "ies"}.` : "Reachable, but no community is seeded.", n ? null : `${cmd} kb seed`);
  } else {
    const m = dbR.error?.message ?? "unknown error";
    core("db", "Ferri database", "broken", m.includes("DATABASE_URL") ? "DATABASE_URL is not set." : `Cannot reach it: ${m}.`, m.includes("DATABASE_URL") ? "Set DATABASE_URL in .env." : `Start it: ${cmd} up (on the host: pnpm db:up), and check DATABASE_URL in .env`);
  }

  // ── Anthropic ───────────────────────────────────────────────────────────
  if (!env.ANTHROPIC_API_KEY?.trim()) {
    core("anthropic", "Anthropic key", "broken", "ANTHROPIC_API_KEY is not set.", "Set ANTHROPIC_API_KEY in .env (from console.anthropic.com).");
  } else if (anthropicR.value) {
    const r = anthropicR.value;
    if (r.ok) core("anthropic", "Anthropic key", "on", "The key works.", null);
    else if (r.status === 401 || r.status === 403) core("anthropic", "Anthropic key", "broken", `Anthropic refused the key (HTTP ${r.status}).`, "Put a valid ANTHROPIC_API_KEY in .env.");
    else core("anthropic", "Anthropic key", "broken", `Anthropic answered HTTP ${r.status}.`, "Run the doctor again in a minute.");
  } else {
    core("anthropic", "Anthropic key", "broken", `Cannot reach Anthropic: ${anthropicR.error?.message}.`, "Check this machine's internet connection.");
  }

  // ── Rooms ───────────────────────────────────────────────────────────────
  for (const [id, name, key, what] of [
    ["crew-room", "Crew room", "FERRI_CREW_ROOM_ID", "question cards go here"],
    ["lab-room", "Lab room", "FERRI_LAB_ROOM_ID", "the test room"],
  ] as const) {
    const roomId = env[key]?.trim();
    if (!roomId) core(id, name, "broken", `${key} is not set (${what}).`, `${cmd} setup:switch`);
    else if (!roomsR.value) core(id, name, "broken", "Not checked: Ferri's rooms could not be read.", "Fix the Ferri checks first.");
    else {
      const room = roomsR.value.find((r) => r.room_id === roomId);
      core(id, name, room ? "on" : "broken", room ? `"${room.name}": Ferri is in it.` : `Ferri is not in the room ${key} names (${roomId}).`, room ? null : `${cmd} setup:switch`);
    }
  }

  // ── Integrations ────────────────────────────────────────────────────────
  const bridges = bridgesR.value;
  const bridgeErr = bridgesR.error?.message ?? null;
  const profiles = (env.COMPOSE_PROFILES ?? "").split(",").map((s) => s.trim());
  const mm = bridgeCheck(
    {
      id: "mattermost",
      name: "Mattermost",
      type: "mattermost",
      cmd,
      next: profiles.includes("mattermost") ? `${cmd} up` : `Add mattermost to COMPOSE_PROFILES in .env, then ${cmd} up`,
      offDetail: profiles.includes("mattermost") ? "COMPOSE_PROFILES has mattermost, but Switch has no Mattermost connection yet." : "Mattermost is not part of this stack.",
    },
    bridges,
    bridgeErr,
  );
  if (mm.status === "off" && profiles.includes("mattermost")) mm.status = "broken";
  if (mm.status === "on" && env.MATTERMOST_URL?.trim()) {
    const mmUrl = env.MATTERMOST_URL.trim().replace(/\/+$/, "");
    try {
      const r = await get(`${mmUrl}/api/v4/system/ping`);
      if (!r.ok) Object.assign(mm, { status: "broken", detail: `${mm.detail} ${mmUrl} answered HTTP ${r.status}.`, next: `${cmd} logs mattermost` });
      else mm.detail = `${mm.detail} Open ${(env.MATTERMOST_SITE_URL?.trim() || mmUrl).replace(/\/+$/, "")}.`;
    } catch (e) {
      Object.assign(mm, { status: "broken", detail: `${mm.detail} But ${mmUrl} is not reachable: ${errText(e)}.`, next: `Check MATTERMOST_URL in .env, or ${cmd} logs mattermost` });
    }
  }
  checks.push(mm);

  checks.push(
    bridgeCheck(
      { id: "telegram", name: "Telegram", type: "telegram", cmd, next: env.TELEGRAM_BOT_TOKEN?.trim() ? `${cmd} connect telegram (uses TELEGRAM_BOT_TOKEN from .env)` : `${cmd} connect telegram --token <bot token from BotFather>` },
      bridges,
      bridgeErr,
    ),
    bridgeCheck(
      {
        id: "slack",
        name: "Slack",
        type: "slack",
        cmd,
        next: env.SLACK_BOT_TOKEN?.trim() && env.SLACK_APP_TOKEN?.trim() ? `${cmd} connect slack (uses SLACK_BOT_TOKEN and SLACK_APP_TOKEN from .env)` : `${cmd} connect slack --bot-token xoxb-... --app-token xapp-...`,
      },
      bridges,
      bridgeErr,
    ),
    bridgeCheck(
      {
        id: "discord",
        name: "Discord",
        type: "discord",
        cmd,
        next: env.DISCORD_BOT_TOKEN?.trim() && env.DISCORD_GUILD_ID?.trim() ? `${cmd} connect discord (uses DISCORD_BOT_TOKEN and DISCORD_GUILD_ID from .env)` : `${cmd} connect discord --token <bot token> --guild <server id>`,
      },
      bridges,
      bridgeErr,
    ),
    bridgeCheck({ id: "whatsapp", name: "WhatsApp", type: "whatsapp_web", cmd, next: `${cmd} whatsapp:pair` }, bridges, bridgeErr),
    shieldCheck(env, trustR.value, trustR.error?.message ?? null, cmd),
    pushCheck(env, cmd),
  );

  const optional = async (check: Omit<DoctorCheck, "area">, probe: () => Promise<DoctorCheck | null>): Promise<DoctorCheck> => {
    try {
      return (await probe()) ?? { ...check, area: "integration" };
    } catch (e) {
      return { ...check, area: "integration", status: "broken", detail: `${check.detail} Check failed: ${errText(e)}.`, next: check.next ?? "Run the doctor again in a minute." };
    }
  };
  const integ = (id: string, name: string, status: CheckStatus, detail: string, next: string | null): DoctorCheck => ({ id, area: "integration", name, status, detail, next });

  const [emailC, socialC, postersC, publicC, lumaC] = await Promise.all([
    // Email (spec 15)
    (async (): Promise<DoctorCheck> => {
      const key = env.RESEND_API_KEY?.trim();
      const from = env.FERRI_EMAIL_FROM?.trim();
      const setup = `${cmd} email:setup`;
      if (!key) return integ("email", "Email", "off", "No RESEND_API_KEY.", `Set RESEND_API_KEY and FERRI_EMAIL_FROM in .env, then ${setup}`);
      if (!from) return integ("email", "Email", "broken", "RESEND_API_KEY is set, but FERRI_EMAIL_FROM is not.", `Set FERRI_EMAIL_FROM in .env (an address at your Resend domain), then ${setup}`);
      return optional({ id: "email", name: "Email", status: "broken", detail: "Resend could not be reached.", next: null }, async () => {
        const r = await get("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` } });
        if (r.status === 401 || r.status === 403) return integ("email", "Email", "broken", `Resend refused RESEND_API_KEY (HTTP ${r.status}); it needs full access.`, "Put a full-access RESEND_API_KEY in .env.");
        if (!r.ok) return integ("email", "Email", "broken", `Resend answered HTTP ${r.status}.`, "Run the doctor again in a minute.");
        const domains = ((await r.json()) as { data?: { name: string; status: string }[] }).data ?? [];
        const want = emailDomain(from);
        const d = domains.find((x) => x.name.toLowerCase() === want);
        if (!d) return integ("email", "Email", "broken", `${want ?? from} is not a domain in this Resend account.`, `Add and verify ${want ?? "the domain"} in Resend, or change FERRI_EMAIL_FROM, then ${setup}`);
        if (d.status !== "verified") return integ("email", "Email", "broken", `${d.name} is ${d.status} in Resend.`, `Add its DNS records in Resend, then ${setup}`);
        if (!env.RESEND_WEBHOOK_SECRET?.trim()) return integ("email", "Email", "broken", `Sending from ${from} works, but replies and delivery reports are off (no RESEND_WEBHOOK_SECRET).`, setup);
        return integ("email", "Email", "on", `Sends from ${from}; replies come back through the webhook.`, null);
      });
    })(),
    // Social (spec 18)
    (async (): Promise<DoctorCheck> => {
      const key = env.BUFFER_API_KEY?.trim();
      if (!key) return integ("social", "Social", "off", "No BUFFER_API_KEY.", "Set BUFFER_API_KEY in .env (Buffer > Settings > API; scopes account:read, posts:read, posts:write).");
      return optional({ id: "social", name: "Social", status: "broken", detail: "Buffer could not be reached.", next: null }, async () => {
        const r = await get("https://api.buffer.com", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ query: "query Orgs { account { organizations { id name } } }" }),
        });
        const body = (await r.json().catch(() => null)) as { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] } | null;
        const first = body?.errors?.[0];
        if (r.status === 429 || /rate.?limit|too many requests/i.test(`${first?.extensions?.code ?? ""} ${first?.message ?? ""}`)) {
          return integ("social", "Social", "on", "BUFFER_API_KEY is set. Buffer is rate-limiting it right now, so the key was not checked.", "Run the doctor again in a few minutes.");
        }
        if (!r.ok || body?.errors?.length || !body?.data) {
          return integ("social", "Social", "broken", `Buffer refused BUFFER_API_KEY: ${body?.errors?.[0]?.message ?? `HTTP ${r.status}`}.`, "Put a valid BUFFER_API_KEY in .env.");
        }
        const media = env.FERRI_MEDIA_URL?.trim() && env.FERRI_MEDIA_SECRET?.trim();
        return integ(
          "social",
          "Social",
          "on",
          media ? "Buffer key works; images go through the media host." : "Buffer key works, but posts go without images: the media host is not set.",
          media ? null : "Deploy infra/media-worker, then set FERRI_MEDIA_URL and FERRI_MEDIA_SECRET in .env.",
        );
      });
    })(),
    // Posters (spec 13)
    (async (): Promise<DoctorCheck> => {
      const key = env.OPENAI_API_KEY?.trim();
      if (!key) return integ("posters", "Posters", "off", "No OPENAI_API_KEY: posters use the kit's own background.", "Set OPENAI_API_KEY in .env, then pnpm builder:setup on the Builder's machine");
      return optional({ id: "posters", name: "Posters", status: "broken", detail: "OpenAI could not be reached.", next: null }, async () => {
        const r = await get("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
        if (r.status === 401 || r.status === 403) return integ("posters", "Posters", "broken", `OpenAI refused OPENAI_API_KEY (HTTP ${r.status}).`, "Put a valid OPENAI_API_KEY in .env.");
        if (!r.ok) return integ("posters", "Posters", "broken", `OpenAI answered HTTP ${r.status}.`, "Run the doctor again in a minute.");
        return integ("posters", "Posters", "on", "The image key works. Posters are made by the Builder.", null);
      });
    })(),
    // Public URL (Pocket on a phone, the event site's hook, email webhooks)
    (async (): Promise<DoctorCheck> => {
      const off = publicUrlOff(env);
      const next = "Set FERRI_PUBLIC_URL in .env to Desk's public https address (a tunnel such as cloudflared).";
      if (off) return integ("public-url", "Public URL", "off", `${off} Phones, webhooks and the event site cannot reach Desk.`, next);
      const url = env.FERRI_PUBLIC_URL!.trim().replace(/\/+$/, "");
      return optional({ id: "public-url", name: "Public URL", status: "broken", detail: `${url} is not reachable.`, next: "Start the tunnel, or fix FERRI_PUBLIC_URL in .env." }, async () => {
        const r = await get(url, { redirect: "manual" });
        if (r.status === 530) return integ("public-url", "Public URL", "broken", `${url} answered HTTP 530: Cloudflare cannot reach the tunnel.`, "Start the tunnel (cloudflared) and Desk.");
        if (r.status >= 500) return integ("public-url", "Public URL", "broken", `${url} answered HTTP ${r.status}: Desk or the tunnel in front of it is not answering.`, `Start Desk, then check ${cmd} logs desk`);
        return integ("public-url", "Public URL", "on", `${url} reaches Desk.`, null);
      });
    })(),
    // Luma (optional, needs Luma Plus)
    (async (): Promise<DoctorCheck> => {
      const key = env.LUMA_API_KEY?.trim();
      if (!key) return integ("luma", "Luma API", "off", "Optional. Without it the Builder lists events on Luma through its own browser.", "Only with Luma Plus: set LUMA_API_KEY in .env.");
      return optional({ id: "luma", name: "Luma API", status: "broken", detail: "Luma could not be reached.", next: null }, async () => {
        const r = await get("https://public-api.luma.com/v1/users/get-self", { headers: { "x-luma-api-key": key } });
        if (!r.ok) return integ("luma", "Luma API", "broken", `Luma refused LUMA_API_KEY (HTTP ${r.status}). The API needs Luma Plus.`, "Fix LUMA_API_KEY in .env, or remove it to use the browser.");
        return integ("luma", "Luma API", "on", "The key works.", null);
      });
    })(),
  ]);
  checks.push(emailC, socialC, postersC, builderCheck(env, managedR.value, gw ? managedR.error : { status: null, message: "Switch admin sign-in failed" }, cmd), publicC, lumaC);

  return { at: new Date().toISOString(), checks, ok: !checks.some((c) => c.area === "core" && c.status === "broken"), bridges: bridgesR.value };
}

async function defaultCheckDb(url: string): Promise<{ communities: number }> {
  const { db, close } = createDb(url);
  try {
    await db.execute(sql`select 1`);
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(communities);
    return { communities: Number(rows[0]?.n ?? 0) };
  } finally {
    void close().catch(() => {});
  }
}

const MARK: Record<CheckStatus, string> = { on: "on", off: "off", broken: "BROKEN" };

/** The report as plain text for a terminal: core first, then integrations, each with its next step. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  const groups: [CheckArea, string][] = [
    ["core", "Core"],
    ["integration", "Integrations"],
  ];
  const nameW = Math.max(...report.checks.map((c) => c.name.length), 4);
  for (const [area, title] of groups) {
    const list = report.checks.filter((c) => c.area === area);
    if (!list.length) continue;
    lines.push(title);
    for (const c of list) {
      lines.push(`  ${MARK[c.status].padEnd(6)}  ${c.name.padEnd(nameW)}  ${c.detail}`);
      if (c.next && c.status !== "on") lines.push(`  ${"".padEnd(6)}  ${"".padEnd(nameW)}  Next: ${c.next}`);
      else if (c.next) lines.push(`  ${"".padEnd(6)}  ${"".padEnd(nameW)}  Tip: ${c.next}`);
    }
    lines.push("");
  }
  const broken = report.checks.filter((c) => c.status === "broken");
  const coreBroken = broken.filter((c) => c.area === "core").length;
  const on = report.checks.filter((c) => c.area === "integration" && c.status === "on").length;
  const total = report.checks.filter((c) => c.area === "integration").length;
  lines.push(
    coreBroken
      ? `${coreBroken} core check${coreBroken === 1 ? " is" : "s are"} broken. Fix ${coreBroken === 1 ? "it" : "them"} first, in order.`
      : `Core is healthy. ${on} of ${total} integrations are on${broken.length ? `, ${broken.length} broken` : ""}.`,
  );
  return lines.join("\n");
}
