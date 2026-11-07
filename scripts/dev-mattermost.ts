/**
 * Local test people in the Mattermost that ships with Switch's standalone compose.
 * Creates (or reuses) them with the Mattermost admin account from .env and puts
 * them in the right channels:
 *   meera, arjun   community members      -> ferri-lab
 *   priya          crew (food, venue, ...) -> ferri-lab, ferri-crew
 *   user           the Switch admin, crew lead (exists already) -> ferri-crew
 * They share one password, MM_TEST_PASSWORD in .env (generated on first run).
 *
 *   pnpm dev:mattermost
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

function readEnv(file: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) map.set(m[1]!, m[2]!);
  }
  return map;
}

// The process environment wins, then this repo's .env (the one-command stack keeps Switch's values
// there too), then a sibling Switch checkout's .env (the older two-repo setup).
const switchEnv = readEnv(path.join(root, "..", "switch", ".env"));
const ferriEnv = readEnv(envPath);
const setting = (key: string) => process.env[key] || ferriEnv.get(key) || switchEnv.get(key) || "";
const base = `${setting("MATTERMOST_URL") || `http://localhost:${setting("MATTERMOST_HOST_PORT") || "8065"}`}/api/v4`;
const adminUser = setting("MATTERMOST_ADMIN_USER");
const adminPassword = setting("MATTERMOST_ADMIN_PASSWORD");
const teamName = setting("MATTERMOST_TEAM_NAME") || "switch";
if (!adminUser || !adminPassword) throw new Error("MATTERMOST_ADMIN_USER / MATTERMOST_ADMIN_PASSWORD missing in .env");

let password = setting("MM_TEST_PASSWORD");
if (!password) {
  password = `Tm-${randomBytes(9).toString("hex")}`;
  fs.appendFileSync(envPath, `\n# Password of the local Mattermost test people (pnpm dev:mattermost).\nMM_TEST_PASSWORD=${password}\n`);
  console.log("generated MM_TEST_PASSWORD in .env");
}

async function login(loginId: string, pw: string): Promise<string> {
  const res = await fetch(`${base}/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_id: loginId, password: pw }),
  });
  if (!res.ok) throw new Error(`Mattermost login ${loginId}: HTTP ${res.status}`);
  return res.headers.get("token")!;
}

const token = await login(adminUser, adminPassword);
async function mm<T>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : {}) as T };
}

const team = await mm<{ id: string }>("GET", `/teams/name/${teamName}`);
if (team.status !== 200) throw new Error(`team ${teamName} not found`);
const teamId = team.data.id;

async function channelId(name: string): Promise<string> {
  const r = await mm<{ id: string }>("GET", `/teams/${teamId}/channels/name/${name}`);
  if (r.status !== 200) throw new Error(`channel ${name} not found; run \`pnpm setup:switch\` first`);
  return r.data.id;
}

async function ensureUser(username: string, first: string): Promise<string> {
  const found = await mm<{ id: string }>("GET", `/users/username/${username}`);
  if (found.status === 200) {
    // Keep the shared password in step with .env.
    await mm("PUT", `/users/${found.data.id}/password`, { new_password: password });
    return found.data.id;
  }
  const made = await mm<{ id: string; message?: string }>("POST", "/users", {
    username,
    email: `${username}@example.com`,
    password,
    first_name: first,
  });
  if (made.status >= 300) throw new Error(`create ${username}: ${made.data.message ?? made.status}`);
  console.log(`created Mattermost user ${username}`);
  return made.data.id;
}

async function join(userId: string, channel: string): Promise<void> {
  await mm("POST", `/teams/${teamId}/members`, { team_id: teamId, user_id: userId });
  const r = await mm<{ message?: string }>("POST", `/channels/${await channelId(channel)}/members`, { user_id: userId });
  if (r.status >= 300) throw new Error(`add to ${channel}: ${r.data.message ?? r.status}`);
}

const people: { username: string; first: string; channels: string[] }[] = [
  { username: "meera", first: "Meera", channels: ["ferri-lab"] },
  { username: "arjun", first: "Arjun", channels: ["ferri-lab"] },
  { username: "priya", first: "Priya", channels: ["ferri-lab", "ferri-crew"] },
];
for (const p of people) {
  const id = await ensureUser(p.username, p.first);
  for (const ch of p.channels) await join(id, ch);
  console.log(`${p.username}: ${p.channels.join(", ")}`);
}
const leadName = setting("MATTERMOST_USER") || "user";
const lead = await mm<{ id: string }>("GET", `/users/username/${leadName}`);
if (lead.status === 200) {
  await join(lead.data.id, "ferri-crew");
  console.log(`${leadName}: ferri-crew`);
}
console.log("done");
