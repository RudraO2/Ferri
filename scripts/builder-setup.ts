/**
 * Ferri Builder setup (spec 11). Safe to re-run.
 *
 *   1. Enroll this machine as a Switch agent controller (a one-time code from the
 *      Gateway), unless it already is.
 *   2. Seed the Builder's own working folder from `builder/` and write the
 *      controller's env file (the Builder's own Claude home and API key).
 *   3. Wait until the controller is online (`pnpm builder:controller` in another terminal).
 *   4. Turn on agent management for Ferri; Ferri then creates the Builder on this
 *      machine through Switch (`create_agent`), or the definition is updated.
 *   5. Addressing: the owner, the owner's agents (Ferri) and the people in the crew room.
 *   6. The Builder's own budget in Switch.
 *
 * Model: FERRI_BUILDER_MODEL (default claude-haiku-5-5) at FERRI_BUILDER_EFFORT (default low).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createDb, crewMembers } from "@ferri/db";
import fs from "node:fs";
import path from "node:path";
import { GatewayClient, GatewayError, SwitchAgent, gatewayFromEnv } from "@ferri/switch";
import { builderPaths, controllerCli, readEnvFile } from "./builder-paths.ts";

const root = path.resolve(import.meta.dirname, "..");
const env = { ...readEnvFile(path.join(root, ".env")), ...process.env } as Record<string, string | undefined>;
const switchUrl = env.SWITCH_URL ?? "http://localhost:8000";
const name = env.FERRI_BUILDER_NAME ?? "builder";
const model = env.FERRI_BUILDER_MODEL ?? "claude-haiku-5-5";
const effort = env.FERRI_BUILDER_EFFORT ?? "low";
const budgetOutput = Number(env.FERRI_BUILDER_BUDGET_OUTPUT ?? 400_000);
const budgetTurns = Number(env.FERRI_BUILDER_BUDGET_TURNS ?? 60);
const machineName = env.FERRI_BUILDER_MACHINE ?? "ferri-laptop";
const paths = builderPaths(env);

function need(key: string): string {
  const v = env[key];
  if (!v) throw new Error(`${key} is not set in .env (run \`pnpm setup:switch\` first).`);
  return v;
}

const gw = (await gatewayFromEnv(path.join(root, "..", "switch", ".env"), env as NodeJS.ProcessEnv)) as GatewayClient;
if (!gw) throw new Error("No Switch admin password: set SWITCH_ADMIN_PASSWORD in .env.");
const ferri = new SwitchAgent({ baseUrl: switchUrl, agentId: need("FERRI_AGENT_ID"), apiKey: need("FERRI_AGENT_KEY"), connectionId: "" });
const crewRoomId = need("FERRI_CREW_ROOM_ID");

function cli(args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, ["--no-warnings", controllerCli(root, env), ...args], { encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// ── 1. The machine ───────────────────────────────────────────────────────
if (!fs.existsSync(controllerCli(root, env))) {
  throw new Error(
    `The Switch agent controller is not built: ${controllerCli(root, env)}\n` +
      "Build it in ../switch/console: npx pnpm@10.28.2 install --filter \"@switch-console/agent-controller...\" && " +
      "npx pnpm@10.28.2 -r --filter \"@switch-console/agent-controller...\" run build",
  );
}
const status = cli(["status"]);
let controllerId = /Controller:\s+([0-9a-f-]{36})/.exec(status.out)?.[1];
if (!controllerId) {
  const code = await gw.call<{ code: string }>("POST", "/gateway/management/enrollment-codes", {});
  const enrolled = cli([
    "enroll",
    "--server",
    switchUrl,
    "--code",
    code.code,
    "--name",
    machineName,
    "--description",
    "The organizer's laptop: runs Ferri Builder",
  ]);
  controllerId = /controller ([0-9a-f-]{36})/.exec(enrolled.out)?.[1];
  if (!controllerId) throw new Error(`enroll failed:\n${enrolled.out}`);
  console.log(`Enrolled this machine as "${machineName}" (${controllerId}).`);
} else {
  console.log(`This machine is Switch controller ${controllerId}.`);
}

// ── 2. The Builder's own folder and env ──────────────────────────────────
const template = path.join(root, "builder");
fs.mkdirSync(path.join(paths.dir, "jobs"), { recursive: true });
fs.mkdirSync(paths.claudeHome, { recursive: true });
const skip = [`${path.sep}jobs${path.sep}`, `${path.sep}node_modules`, `${path.sep}.next`, `${path.sep}.vercel`];
fs.cpSync(template, paths.dir, { recursive: true, force: true, filter: (src) => !skip.some((s) => src.includes(s)) });

// What the ship-event-site skill needs that the controller does not pass to sessions
// (only provider keys reach them): where to create the database, which Vercel scope,
// Ferri's hook on Desk's public hostname, and who is an organizer on the site.
let hookSecret = env.FERRI_SITE_HOOK_SECRET;
if (!hookSecret) {
  hookSecret = randomBytes(24).toString("base64url");
  fs.appendFileSync(path.join(root, ".env"), `\n# The event site's hook into Ferri (spec 12), written by pnpm builder:setup.\nFERRI_SITE_HOOK_SECRET=${hookSecret}\n`);
}
const publicUrl = (env.FERRI_PUBLIC_URL ?? "https://ferri.rudratechie.xyz").replace(/\/+$/, "");
const { db, close } = createDb(env.DATABASE_URL);
const crewEmails = (await db.select({ handles: crewMembers.handles }).from(crewMembers))
  .map((c) => (c.handles as Record<string, string> | null)?.switch)
  .filter((e): e is string => !!e && e.includes("@"));
await close();
const admins = [...new Set([...crewEmails, ...(env.FERRI_SITE_ADMINS ?? "").split(","), env.SWITCH_ADMIN_EMAIL ?? "admin@switch.local"].map((e) => e.trim().toLowerCase()).filter(Boolean))];
const siteSettings = {
  supabase: { orgId: env.FERRI_SITE_SUPABASE_ORG ?? null, region: env.FERRI_SITE_SUPABASE_REGION ?? "ap-south-1" },
  vercel: { scope: env.FERRI_SITE_VERCEL_SCOPE ?? null },
  hook: { url: `${publicUrl}/api/site`, secret: hookSecret },
  admins,
};
fs.mkdirSync(path.join(paths.dir, ".ferri"), { recursive: true });
fs.writeFileSync(path.join(paths.dir, ".ferri", "site.json"), JSON.stringify(siteSettings, null, 2), { mode: 0o600 });
if (!siteSettings.supabase.orgId) console.warn("FERRI_SITE_SUPABASE_ORG is not set: the Builder cannot create the event site's database.");
console.log(`Site settings: Supabase org ${siteSettings.supabase.orgId ?? "unset"} (${siteSettings.supabase.region}), Vercel ${siteSettings.vercel.scope ?? "default scope"}, hook ${siteSettings.hook.url}, ${admins.length} admin(s).`);

const apiKey = need("ANTHROPIC_API_KEY");
fs.writeFileSync(
  paths.envFile,
  [
    "# Written by `pnpm builder:setup`. The Builder's own Claude home and key; never commit.",
    `ANTHROPIC_API_KEY=${apiKey}`,
    `CLAUDE_CONFIG_DIR=${paths.claudeHome}`,
    "SWITCH_CONTROLLER_SELF_UPDATE=off",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`Builder folder: ${paths.dir}\nController env: ${paths.envFile}`);

// ── 3. Online? ───────────────────────────────────────────────────────────
interface Controller {
  id: string;
  name: string;
  state: string;
  status: { providers?: { provider: string; installed: boolean; auth?: string }[] } | null;
}
async function controller(): Promise<Controller | undefined> {
  const list = await gw.call<Controller[]>("GET", "/gateway/management/controllers");
  return list.find((c) => c.id === controllerId);
}
// Online, and its first report already says whether Claude Code is installed there
// (Switch refuses to place an agent on a machine that has not reported the provider).
const ready = (m: Controller | undefined) =>
  m?.state === "online" && !!m.status?.providers?.some((p) => p.provider === "claude" && p.installed);
let machine = await controller();
if (!ready(machine)) {
  console.log("Waiting for the controller. Start it in another terminal: pnpm builder:controller");
  for (let i = 0; i < 90 && !ready(machine); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    machine = await controller();
  }
  if (machine?.state !== "online") throw new Error("The controller did not come online. Is `pnpm builder:controller` running?");
  if (!ready(machine)) throw new Error("The controller reports no Claude Code. Install it (`npm i -g @anthropic-ai/claude-code`) and restart the controller.");
}
console.log(`Machine "${machine!.name}" is online with Claude Code.`);

// ── 4. Ferri creates the Builder through Switch agent management ─────────
await gw.call("PUT", `/gateway/agents/${need("FERRI_AGENT_ID")}/can-manage-agents`, { enabled: true });
const definition = {
  provider: "claude",
  model,
  advanced_config: { effort },
  instructions:
    "You are Ferri Builder. Your working folder's CLAUDE.md says how jobs go, how to report to ferri, and that every public step needs a yes on a card first.",
  auto_mode: true,
  auto_approve: false,
  directory: paths.dir,
  isolation: "shared",
};
interface Managed {
  agent_id: string;
  name: string;
  model: string | null;
  machine: { id: string; name: string; state: string } | null;
}
const managed = await ferri.op<Managed[]>("list_managed_agents");
let builder = managed.find((a) => a.name === name);
if (!builder) {
  const created = await ferri.op<{ agent_id: string; name: string }>("create_agent", {
    name,
    description: "Ferri's hands: makes pages, checklists, sites and posters for the crew, and asks before anything goes public.",
    display_name: "Ferri Builder",
    machine: controllerId,
    provider: definition.provider,
    model: definition.model,
    advanced_config: definition.advanced_config,
    instructions: definition.instructions,
    directory: definition.directory,
    auto_mode: definition.auto_mode,
    auto_approve: definition.auto_approve,
    start: true,
  });
  builder = { agent_id: created.agent_id, name: created.name, model, machine: null };
  console.log(`Ferri created its Builder "${name}" (${created.agent_id}) on ${machineName}.`);
} else {
  await gw.call("PATCH", `/gateway/management/agents/${builder.agent_id}`, {
    definition,
    desired_state: "running",
    controller_id: controllerId,
  });
  console.log(`Updated the Builder "${name}" (${builder.agent_id}): ${model}, effort ${effort}.`);
}

// ── 5. Who may direct it and answer its cards ────────────────────────────
await gw.call("PUT", `/gateway/agents/${builder.agent_id}/addressing-policy`, {
  policy: {
    rules: [
      { owner: true, owner_agents: true, users: [], agents: [] },
      { rooms: [crewRoomId], users: "*", agents: [] },
    ],
  },
});
console.log("Addressing: the owner, the owner's agents and the people in the crew room.");

// ── 6. Its own budget ────────────────────────────────────────────────────
const tenant = await gw.call<{ id: string }>("GET", "/gateway/tenants/current");
interface Budget {
  id: string;
  agent_id: string | null;
  metric: string;
  model: string | null;
}
const budgets = await gw.call<Budget[]>("GET", `/gateway/tenants/${tenant.id}/budgets`);
for (const [metric, limit] of [
  ["output_tokens", budgetOutput],
  ["turns", budgetTurns],
] as const) {
  const have = budgets.find((b) => b.agent_id === builder!.agent_id && b.metric === metric && !b.model);
  const body = { amount_limit: limit, period_hours: 24 };
  try {
    if (have) await gw.call("PUT", `/gateway/tenants/${tenant.id}/budgets/${have.id}`, body);
    else await gw.call("POST", `/gateway/tenants/${tenant.id}/budgets`, { agent_id: builder.agent_id, metric, model: "", ...body });
  } catch (e) {
    if (!(e instanceof GatewayError)) throw e;
    throw new Error(`budget ${metric}: ${e.message}`);
  }
}
console.log(`Budget: ${budgetOutput.toLocaleString()} output tokens and ${budgetTurns} turns per 24 h.`);
console.log("\nDone. Keep `pnpm builder:controller` running; Ferri hands jobs to the Builder in the crew room.");
