#!/usr/bin/env node
// Real email for the site (spec 15): Supabase Auth sends its emails (sign-in
// links, confirmations) through Resend's SMTP from the community's domain.
//   node scripts/supabase-email.mjs <site url> <path to .ferri/site.json> "<sender name>"
// Sets only the site address, the allowed redirect, and SMTP. The other auth
// settings are written with the platform's own defaults, so nothing else
// changes (the diff is printed; the SMTP password shows only as a hash).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [siteUrl, settingsPath, senderName] = process.argv.slice(2);
if (!siteUrl || !settingsPath) {
  console.error('usage: node scripts/supabase-email.mjs <site url> <path to .ferri/site.json> "<sender name>"');
  process.exit(2);
}
if (!/^https:\/\//.test(siteUrl)) throw new Error("The site address must start with https://");
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const email = settings.email ?? {};
if (!email.smtpPass || !email.from) {
  console.log("No email settings in site.json (email.from, email.smtpPass): the site keeps creating confirmed accounts and sends no email.");
  process.exit(3);
}
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
const site = siteUrl.replace(/\/+$/, "");
const q = (s) => JSON.stringify(String(s));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-auth-"));
fs.mkdirSync(path.join(dir, "supabase"));
fs.writeFileSync(
  path.join(dir, "supabase", "config.toml"),
  `project_id = "event-site"

[auth]
site_url = ${q(site)}
additional_redirect_urls = [${q(`${site}/**`)}, "http://localhost:3000/**"]

[auth.rate_limit]
# Supabase allows 2 auth emails an hour until a project has its own SMTP.
email_sent = 60

[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = true
max_frequency = "1m0s"
otp_length = 8
otp_expiry = 3600

[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(SUPABASE_SMTP_PASS)"
admin_email = ${q(email.from)}
sender_name = ${q(senderName || email.senderName || "Event")}
`,
);
try {
  const r = spawnSync("supabase", ["config", "push", "--project-ref", ref, "--workdir", dir], {
    encoding: "utf8",
    shell: process.platform === "win32",
    input: "y\ny\ny\n",
    env: { ...process.env, SUPABASE_SMTP_PASS: email.smtpPass },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replaceAll(email.smtpPass, "***");
  console.log(out.trim());
  if (r.status !== 0) throw new Error("supabase config push failed (see above).");
  console.log(`Auth emails for ${site} now go out from ${email.from} through Resend.`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
