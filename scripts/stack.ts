/**
 * The one-command stack's own steps. Run inside the Ferri image by `./ferri` and compose.yml:
 *   pnpm stack init      make or complete .env: copy .env.example, ask for ANTHROPIC_API_KEY, generate secrets
 *   pnpm stack setup     one-shot after Switch is up: register Ferri, rooms, test people, demo knowledge
 *   pnpm stack summary   print the addresses, the logins and the first messages to try
 *
 * Idempotent: every step keeps what is already set.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { randomBytes, randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

type EnvMap = Map<string, string>;

export function parseEnv(text: string): EnvMap {
  const map: EnvMap = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) map.set(m[1]!, m[2]!.trim());
  }
  return map;
}

function readEnvFile(): EnvMap {
  return fs.existsSync(envPath) && fs.statSync(envPath).isFile() ? parseEnv(fs.readFileSync(envPath, "utf8")) : new Map();
}

/**
 * Write the file in place (truncate and write, never rename): inside Docker .env is a
 * single-file bind mount, and a rename would break it.
 */
function writeEnvText(text: string): void {
  fs.writeFileSync(envPath, text.endsWith("\n") ? text : `${text}\n`);
}

/** Set keys in .env text: replace an existing `KEY=` line, else append. */
export function setEnvValues(text: string, updates: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    out = re.test(out) ? out.replace(re, () => `${key}=${value}`) : `${out.trimEnd()}\n${key}=${value}\n`;
  }
  return out;
}

/** Keys of .env.example missing from .env, appended with their comment lines. */
export function missingFromExample(example: string, current: EnvMap): string {
  const lines = example.split(/\r?\n/);
  const out: string[] = [];
  let comments: string[] = [];
  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      comments.push(line);
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m && !current.has(m[1]!)) out.push(...comments, line);
    comments = [];
  }
  return out.join("\n");
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

/** A password people type: three groups of four, no look-alike characters. */
export function typeablePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

/** Secrets `init` fills when empty. */
function generated(env: EnvMap): Record<string, string> {
  const want: Record<string, () => string> = {
    DB_PASSWORD: () => hex(24),
    DB_OWNER_PASSWORD: () => hex(24),
    AGENT_REGISTRATION_TOKEN: () => hex(24),
    SECRET_KEYS: () => `ferri:${hex(32)}`,
    CONTROLLER_TOKEN_SECRET: () => hex(32),
    GATEWAY_ADMIN_PASSWORD: typeablePassword,
    MATTERMOST_ADMIN_PASSWORD: typeablePassword,
    MATTERMOST_USER_PASSWORD: typeablePassword,
    MM_TEST_PASSWORD: typeablePassword,
    DESK_SESSION_SECRET: () => hex(32),
    WAHA_API_KEY: () => hex(24),
  };
  const out: Record<string, string> = {};
  for (const [key, make] of Object.entries(want)) if (!env.get(key)) out[key] = make();
  return out;
}

async function init(): Promise<void> {
  const example = fs.readFileSync(examplePath, "utf8");
  let text = readEnvFile().size ? fs.readFileSync(envPath, "utf8") : "";
  if (!text.trim()) {
    text = example;
    console.log("Created .env from .env.example.");
  } else {
    const missing = missingFromExample(example, parseEnv(text));
    if (missing.trim()) {
      text = `${text.trimEnd()}\n\n# Added by \`./ferri up\` from .env.example\n${missing}\n`;
      console.log("Added new settings from .env.example to .env.");
    }
  }
  let env = parseEnv(text);
  const secrets = generated(env);
  if (Object.keys(secrets).length) {
    text = setEnvValues(text, secrets);
    console.log(`Generated ${Object.keys(secrets).length} secret(s): ${Object.keys(secrets).join(", ")}.`);
  }
  env = parseEnv(text);
  // Ferri's own admin sign-in is the Switch admin.
  if (!env.get("SWITCH_ADMIN_PASSWORD")) text = setEnvValues(text, { SWITCH_ADMIN_PASSWORD: env.get("GATEWAY_ADMIN_PASSWORD")! });
  // Pocket's Web Push keys; made once.
  if (!env.get("VAPID_PUBLIC_KEY")) {
    const { generateVapidKeys } = await import("@ferri/push");
    const keys = generateVapidKeys();
    text = setEnvValues(text, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey });
  }
  // Host-side addresses follow the chosen ports.
  env = parseEnv(text);
  const apiPort = env.get("API_HOST_PORT") || "8800";
  const dbPort = env.get("FERRI_DB_HOST_PORT") || "5433";
  const mmPort = env.get("MATTERMOST_HOST_PORT") || "8065";
  const follow: Record<string, string> = {};
  if (env.get("SWITCH_URL") === "http://localhost:8800" && apiPort !== "8800") follow.SWITCH_URL = `http://localhost:${apiPort}`;
  if (env.get("DATABASE_URL") === "postgres://ferri:ferri@localhost:5433/ferri" && dbPort !== "5433")
    follow.DATABASE_URL = `postgres://ferri:ferri@localhost:${dbPort}/ferri`;
  if (env.get("MATTERMOST_SITE_URL") === "http://localhost:8065" && mmPort !== "8065") follow.MATTERMOST_SITE_URL = `http://localhost:${mmPort}`;
  if (Object.keys(follow).length) text = setEnvValues(text, follow);

  // The one required value.
  const key = process.env.ANTHROPIC_API_KEY?.trim() || parseEnv(text).get("ANTHROPIC_API_KEY");
  if (!key) {
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log("\nFerri needs an Anthropic API key (console.anthropic.com > API keys).");
      const answer = (await rl.question("ANTHROPIC_API_KEY: ")).trim();
      rl.close();
      if (!answer) {
        writeEnvText(text);
        fail("No key given. Put ANTHROPIC_API_KEY in .env and run `./ferri up` again.");
      }
      text = setEnvValues(text, { ANTHROPIC_API_KEY: answer });
    } else {
      writeEnvText(text);
      fail("ANTHROPIC_API_KEY is empty. Put it in .env (or pass it in the environment) and run `./ferri up` again.");
    }
  } else if (!parseEnv(text).get("ANTHROPIC_API_KEY")) {
    text = setEnvValues(text, { ANTHROPIC_API_KEY: key });
  }
  writeEnvText(text);
  const k = parseEnv(text).get("ANTHROPIC_API_KEY")!;
  if (!k.startsWith("sk-ant-")) console.log("Note: ANTHROPIC_API_KEY does not look like an Anthropic key (sk-ant-...).");
  console.log(".env is ready.");
}

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

/** Values set by compose for the container; they win over .env (which holds the host's view). */
const containerEnv = { ...process.env };

/** Run one repo script with .env as it is now on disk, under the container's own values. */
function run(label: string, args: string[]): void {
  console.log(`\n── ${label}`);
  const file = readEnvFile();
  const env = { ...Object.fromEntries(file), ...containerEnv } as NodeJS.ProcessEnv;
  // An empty container value does not hide a value written to .env since the container started.
  for (const [k, v] of Object.entries(containerEnv)) if (!v && file.get(k)) env[k] = file.get(k);
  const r = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status}). See the lines above; \`./ferri logs ferri-setup\` shows them again.`);
}

async function waitFor(what: string, check: () => Promise<boolean>, seconds = 300): Promise<void> {
  const until = Date.now() + seconds * 1000;
  let said = false;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    if (!said) console.log(`waiting for ${what} ...`);
    said = true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail(`${what} did not come up within ${seconds} s.`);
}

function mattermostOn(env: EnvMap): boolean {
  const profiles = (process.env.COMPOSE_PROFILES ?? env.get("COMPOSE_PROFILES") ?? "").split(",").map((s) => s.trim());
  return profiles.includes("mattermost");
}

async function setup(): Promise<void> {
  const env = readEnvFile();
  if (!env.get("ANTHROPIC_API_KEY") && !process.env.ANTHROPIC_API_KEY) console.log("Note: ANTHROPIC_API_KEY is empty; Ferri cannot answer until it is set.");
  const switchUrl = process.env.SWITCH_URL || "http://switch:8000";
  await waitFor(`Switch at ${switchUrl}`, async () => (await fetch(`${switchUrl}/health`)).ok);
  const mm = mattermostOn(env);
  if (mm) {
    // Switch's seeder made the Mattermost connection; the rooms below must land on it.
    const mmUrl = process.env.MATTERMOST_URL || "http://mattermost:8065";
    await waitFor(`Mattermost at ${mmUrl}`, async () => (await fetch(`${mmUrl}/api/v4/system/ping`)).ok);
  }
  run("Ferri in Switch: agent, addressing, rooms", ["scripts/setup-switch.ts"]);
  if (mm) run("Mattermost test people", ["scripts/dev-mattermost.ts"]);
  run("Demo knowledge (Lantern Labs, Lantern Build Night)", ["scripts/kb.ts", "seed"]);
  console.log("\nSetup done.");
}

function summary(): void {
  const env = readEnvFile();
  const desk = `http://localhost:${env.get("DESK_HOST_PORT") || "3100"}`;
  const mm = env.get("MATTERMOST_SITE_URL") || `http://localhost:${env.get("MATTERMOST_HOST_PORT") || "8065"}`;
  const gw = `http://localhost:${env.get("GATEWAY_HOST_PORT") || "3300"}`;
  const line = "─".repeat(72);
  const out: string[] = [line, "Ferri is running.", ""];
  if (mattermostOn(env)) {
    out.push(
      `Chat (Mattermost)   ${mm}`,
      `  you, crew lead     ${env.get("MATTERMOST_USER") || "user"} / ${env.get("MATTERMOST_USER_PASSWORD")}`,
      `  test people        meera, arjun (members), priya (crew) / ${env.get("MM_TEST_PASSWORD")}`,
      "",
    );
  }
  out.push(
    `Desk and Pocket     ${desk}   (Pocket on a phone: ${desk}/m)`,
    `  sign in            ${env.get("GATEWAY_ADMIN_EMAIL") || "admin@switch.local"} / ${env.get("GATEWAY_ADMIN_PASSWORD")}`,
    `Switch dashboard    ${gw}   (same sign-in)`,
    "",
  );
  if (mattermostOn(env)) {
    out.push(
      "Try it in Mattermost:",
      "  1. In ferri-lab:   @ferri when does hacking start?",
      "     Ferri answers with the time and its source.",
      "  2. In ferri-lab:   @ferri can I bring my dog?",
      "     Ferri does not know, says it is asking the crew, and opens a card in ferri-crew.",
      '  3. In ferri-crew:  type A1 "Yes, dogs are welcome" (the code the card shows)',
      "     Ferri answers the asker in ferri-lab and remembers it for next time.",
      "",
    );
  } else {
    out.push("Mattermost is off. Connect a chat platform: ./ferri connect telegram --token <bot token>", "");
  }
  out.push("Health and optional parts:  ./ferri doctor", "Logs:                       ./ferri logs ferri", line);
  console.log(out.join("\n"));
}

function help(): void {
  console.log("usage: pnpm stack <init|setup|summary>  (normally run by ./ferri)");
}

const cmd = process.argv[2];
if (cmd === "init") await init();
else if (cmd === "setup") await setup();
else if (cmd === "summary") summary();
else help();
