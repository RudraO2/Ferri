/**
 * One-time setup against a running Switch server:
 *   1. sign in to the Gateway as the admin,
 *   2. mint a personal registration key (so the admin owns Ferri, not the bootstrap account),
 *   3. register Ferri as an always-on custom agent,
 *   4. open its addressing policy so anyone in a room can talk to it,
 *   5. create the `ferri-lab` room on the default bridge (Mattermost locally) with Ferri in it,
 *   6. write FERRI_AGENT_ID, FERRI_AGENT_KEY and FERRI_LAB_ROOM_ID into .env.
 *
 * Safe to re-run: an existing agent and room are reused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) fs.copyFileSync(path.join(root, ".env.example"), envPath);

function readEnv(file: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) map.set(m[1]!, m[2]!);
  }
  return map;
}

function writeEnv(updates: Record<string, string>): void {
  let text = fs.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, text);
}

const env = readEnv(envPath);
const switchUrl = env.get("SWITCH_URL") || "http://localhost:8000";
const email = env.get("SWITCH_ADMIN_EMAIL") || "admin@switch.local";
// Fall back to the sibling Switch checkout's .env (the local standalone setup).
const password =
  env.get("SWITCH_ADMIN_PASSWORD") || readEnv(path.join(root, "..", "switch", ".env")).get("GATEWAY_ADMIN_PASSWORD");
if (!password) throw new Error("Set SWITCH_ADMIN_PASSWORD in .env (the Switch GATEWAY_ADMIN_PASSWORD).");

let cookie = "";
async function call<T>(method: string, url: string, body?: unknown, bearer?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${switchUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  return { status: res.status, data };
}

function must<T>(r: { status: number; data: T }, what: string): T {
  if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 400)}`);
  return r.data;
}

const health = await call("GET", "/health");
if (health.status !== 200) throw new Error(`Switch is not reachable at ${switchUrl}/health`);

must(await call("POST", "/gateway/auth/login", { email, password }), "sign in");
console.log(`signed in to ${switchUrl} as ${email}`);

let agentId = env.get("FERRI_AGENT_ID") || "";
let agentKey = env.get("FERRI_AGENT_KEY") || "";

const agents = must(await call<any[]>("GET", "/gateway/agents"), "list agents");
const existing = (Array.isArray(agents) ? agents : (agents as any).agents ?? []).find((a: any) => a.name === "ferri");

if (existing && agentKey && existing.id === agentId) {
  console.log(`agent ferri already registered (${agentId})`);
} else {
  const key = must(
    await call<{ key: string }>("POST", "/gateway/api-keys", { label: "ferri-registration" }),
    "mint registration key",
  );
  const reg = must(
    await call<{ id: string; api_key: string }>(
      "POST",
      "/agents",
      {
        name: "ferri",
        display_name: "Ferri",
        description: "The community teammate: answers outside, asks inside, carries decisions across.",
        connector_type: "external",
        integration_profile: {
          connection_model: "always_on",
          message_exchange: true,
          pre_invocation_mediation: [],
          post_invocation_mediation: [],
          event_reporting: [],
        },
        // Re-registering rotates the key; only happens when ours is missing.
        overwrite: Boolean(existing),
      },
      key.key,
    ),
    "register ferri",
  );
  agentId = reg.id;
  agentKey = reg.api_key;
  writeEnv({ FERRI_AGENT_ID: agentId, FERRI_AGENT_KEY: agentKey });
  console.log(`registered agent ferri (${agentId})`);
}

must(await call("PUT", `/gateway/agents/${agentId}/addressing-policy`, { policy: null }), "open addressing policy");
console.log("addressing policy open: anyone in a room can talk to Ferri");

const rooms = must(await call<any>("GET", "/gateway/rooms"), "list rooms");
const roomList: any[] = Array.isArray(rooms) ? rooms : rooms.rooms ?? [];
let lab = roomList.find((r) => r.name === "ferri-lab");
if (!lab) {
  lab = must(
    await call<any>("POST", "/gateway/rooms", {
      name: "ferri-lab",
      description: "Smoke-test room for Ferri.",
      agent_ids: [agentId],
    }),
    "create ferri-lab room",
  );
  console.log(`created room ferri-lab (${lab.id})`);
} else {
  const ids: string[] = (lab.agents ?? []).map((a: any) => a.id ?? a.agent_id);
  if (!ids.includes(agentId)) {
    must(await call("POST", `/gateway/rooms/${lab.id}/agents`, { agent_ids: [agentId] }), "add ferri to ferri-lab");
  }
  console.log(`room ferri-lab exists (${lab.id})`);
}
writeEnv({ FERRI_LAB_ROOM_ID: lab.id });
console.log("done. .env updated.");
