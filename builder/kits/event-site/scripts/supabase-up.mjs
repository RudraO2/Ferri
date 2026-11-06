#!/usr/bin/env node
// Create (or reuse) the event's Supabase project and apply the schema.
//   node scripts/supabase-up.mjs <slug> <path to .ferri/site.json>
// Secrets (the database password) stay in .env.local; nothing secret is printed.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const [slug, settingsPath] = process.argv.slice(2);
if (!slug || !settingsPath) {
  console.error("usage: node scripts/supabase-up.mjs <slug> <path to .ferri/site.json>");
  process.exit(2);
}
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const { orgId, region } = settings.supabase ?? {};
if (!orgId || !region) throw new Error("site.json has no supabase.orgId / supabase.region");

const envFile = ".env.local";
const env = Object.fromEntries(
  (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const save = () => fs.writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });

/** Run the Supabase CLI; `hide` keeps the arguments out of the log. */
function sb(args, { hide = false, json = false } = {}) {
  const r = spawnSync("supabase", args, { encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) {
    const what = hide ? `supabase ${args[0]} ${args[1] ?? ""}` : `supabase ${args.join(" ")}`;
    throw new Error(`${what} failed:\n${(r.stderr || r.stdout || "").replace(env.SUPABASE_DB_PASSWORD ?? "\u0000", "***").slice(-1500)}`);
  }
  return json ? JSON.parse(r.stdout) : r.stdout;
}

const list = () => sb(["projects", "list", "-o", "json"], { json: true });
let project = list().find((p) => p.name === slug && p.organization_id === orgId);
if (project) {
  console.log(`Reusing Supabase project ${slug} (${project.id}), ${project.status}.`);
  if (!env.SUPABASE_DB_PASSWORD) throw new Error(`Project ${slug} exists but this folder has no SUPABASE_DB_PASSWORD in .env.local (copy it from the earlier job's site folder).`);
} else {
  env.SUPABASE_DB_PASSWORD = randomBytes(24).toString("base64url");
  save();
  console.log(`Creating Supabase project ${slug} in ${region} ...`);
  sb(["projects", "create", slug, "--org-id", orgId, "--region", region, "--db-password", env.SUPABASE_DB_PASSWORD, "-o", "json"], { hide: true });
  project = list().find((p) => p.name === slug && p.organization_id === orgId);
  if (!project) throw new Error("The project was created but does not show in the list yet; run this again in a minute.");
}
env.SUPABASE_PROJECT_REF = project.id;
save();

for (let i = 0; project.status !== "ACTIVE_HEALTHY"; i++) {
  if (i >= 24) throw new Error(`Project ${slug} is still ${project.status} after 8 minutes.`);
  console.log(`Waiting for the database (${project.status}) ...`);
  await new Promise((r) => setTimeout(r, 20_000));
  project = list().find((p) => p.id === env.SUPABASE_PROJECT_REF) ?? project;
}

sb(["link", "--project-ref", env.SUPABASE_PROJECT_REF, "-p", env.SUPABASE_DB_PASSWORD], { hide: true });
// The pooler can take a minute to accept a brand-new project's password.
for (let i = 0; ; i++) {
  try {
    sb(["db", "push", "-p", env.SUPABASE_DB_PASSWORD, "--yes"], { hide: true });
    break;
  } catch (err) {
    if (i >= 5) throw err;
    console.log("The database is not accepting connections yet; trying again in 20 s ...");
    await new Promise((r) => setTimeout(r, 20_000));
  }
}
console.log(`Supabase project ${slug} is ready (ref ${env.SUPABASE_PROJECT_REF}); schema applied.`);
