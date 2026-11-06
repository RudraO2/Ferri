#!/usr/bin/env node
// Link the Vercel project and set its production environment, without
// printing any value.
//   node scripts/vercel-env.mjs <slug> <path to .ferri/site.json> <job id>
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const [slug, settingsPath, jobId] = process.argv.slice(2);
if (!slug || !settingsPath || !jobId) {
  console.error("usage: node scripts/vercel-env.mjs <slug> <path to .ferri/site.json> <job id>");
  process.exit(2);
}
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const scope = settings.vercel?.scope;
const local = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const ref = local.SUPABASE_PROJECT_REF;
if (!ref) throw new Error("No SUPABASE_PROJECT_REF in .env.local: run scripts/supabase-up.mjs first.");

const shell = process.platform === "win32";
function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell, input });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const scopeArgs = scope ? ["--scope", scope] : [];

// The project's keys, read straight into memory.
const keys = run("supabase", ["projects", "api-keys", "--project-ref", ref, "-o", "json"]);
if (!keys.ok) throw new Error(`supabase projects api-keys failed:\n${keys.out.slice(-800)}`);
const list = JSON.parse(keys.out.slice(keys.out.indexOf("[")));
const pick = (...names) => list.find((k) => names.includes(k.name) || names.includes(k.type))?.api_key;
const anon = pick("anon", "publishable");
const service = pick("service_role", "secret");
if (!anon || !service) throw new Error("Could not find the anon and service_role keys.");

const link = run("npx", ["vercel", "link", "--yes", "--project", slug, ...scopeArgs]);
if (!link.ok) throw new Error(`vercel link failed:\n${link.out.slice(-800)}`);

const vars = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  ADMIN_EMAILS: (settings.admins ?? []).join(","),
  FERRI_HOOK_URL: settings.hook?.url ?? "",
  FERRI_HOOK_SECRET: settings.hook?.secret ?? "",
  FERRI_SITE_ID: jobId,
};
for (const [name, value] of Object.entries(vars)) {
  if (!value) {
    console.log(`skip ${name} (empty)`);
    continue;
  }
  run("npx", ["vercel", "env", "rm", name, "production", "--yes", ...scopeArgs]);
  const add = run("npx", ["vercel", "env", "add", name, "production", ...scopeArgs], value);
  if (!add.ok) throw new Error(`vercel env add ${name} failed:\n${add.out.replaceAll(value, "***").slice(-800)}`);
  console.log(`set ${name}`);
}
console.log(`Vercel project ${slug} is linked and its production environment is set.`);
