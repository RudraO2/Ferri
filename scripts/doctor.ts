/**
 * Ferri doctor (spec 23): core health and every integration as on, off or
 * broken, with the exact next step for each.
 *
 *   pnpm doctor           a readable table (./ferri doctor in Docker)
 *   pnpm doctor --json    the same report as JSON
 *
 * Exits 1 when any core check is broken. Reads process.env (the root .env is
 * loaded by tsx --env-file-if-exists=.env; real environment variables win).
 */
import fs from "node:fs";
import path from "node:path";
import { formatDoctorReport, runDoctor } from "@ferri/knowledge";

const root = path.resolve(import.meta.dirname, "..");
const env: Record<string, string | undefined> = { ...process.env };

// Silent fallback that exists today: a Switch checkout next to this repo holds the admin password.
if (!env.SWITCH_ADMIN_PASSWORD) {
  const sibling = path.join(root, "..", "switch", ".env");
  if (fs.existsSync(sibling)) {
    const pw = /^GATEWAY_ADMIN_PASSWORD=(.*)$/m.exec(fs.readFileSync(sibling, "utf8"))?.[1]?.trim();
    if (pw) env.SWITCH_ADMIN_PASSWORD = pw;
  }
}

const json = process.argv.includes("--json");
const report = await runDoctor(env);
// Exit once the output is flushed (a pipe on Linux is written asynchronously).
const text = json ? JSON.stringify(report, null, 2) : formatDoctorReport(report);
process.stdout.write(`${text}\n`, () => process.exit(report.ok ? 0 : 1));
