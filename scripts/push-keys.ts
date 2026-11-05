/**
 * Writes Web Push (VAPID) keys for Ferri Pocket into .env, once.
 * `pnpm push:keys` (does nothing when the keys exist; `--force` replaces them,
 * which drops every subscribed phone).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateVapidKeys } from "@ferri/push";

const envPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), ".env");
let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
if (/^VAPID_PUBLIC_KEY=.+$/m.test(text) && !process.argv.includes("--force")) {
  console.log("VAPID keys already in .env (use --force to replace them).");
  process.exit(0);
}
const keys = generateVapidKeys();
for (const [k, v] of Object.entries({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })) {
  const re = new RegExp(`^${k}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
}
fs.writeFileSync(envPath, text);
console.log("wrote VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env");
