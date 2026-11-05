/**
 * Point Switch Trust at Shield (spec 07).
 *
 *   pnpm shield:connect          writes SHIELD_API_KEY to .env once, then stores
 *                                endpoint, policy and key in Switch
 *   pnpm shield:connect --off    removes the Trust settings (Switch stops checking)
 *   pnpm shield:connect --status shows what Switch has
 *
 * Switch reaches Shield from its container at http://host.docker.internal:<SHIELD_PORT>
 * (override with SHIELD_ENDPOINT). Restart Ferri after the first run so it reads the key.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gatewayFromEnv } from "@ferri/switch";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

interface TrustSettings {
  endpoint: string;
  policy_id: string | null;
  has_api_key: boolean;
  api_key_last4: string | null;
  enabled: boolean;
}

const gateway = await gatewayFromEnv(path.join(root, "..", "switch", ".env"));
if (!gateway) {
  console.error("No Switch admin password: set SWITCH_ADMIN_PASSWORD or keep ../switch/.env next to this repo.");
  process.exit(1);
}

const show = (s: TrustSettings) =>
  console.log(`Switch Trust: ${s.enabled ? "on" : "off"} · endpoint ${s.endpoint} · policy ${s.policy_id ?? "-"} · key ${s.has_api_key ? `…${s.api_key_last4}` : "none"}`);

if (process.argv.includes("--status")) {
  show(await gateway.call<TrustSettings>("GET", "/gateway/trust-settings"));
  process.exit(0);
}
if (process.argv.includes("--off")) {
  show(await gateway.call<TrustSettings>("DELETE", "/gateway/trust-settings"));
  process.exit(0);
}

let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
let key = /^SHIELD_API_KEY=(.+)$/m.exec(text)?.[1]?.trim();
if (!key) {
  key = randomBytes(24).toString("hex");
  text = `${text.trimEnd()}\nSHIELD_API_KEY=${key}\n`;
  fs.writeFileSync(envPath, text);
  console.log("wrote SHIELD_API_KEY to .env (restart Ferri so Shield starts)");
}
const port = process.env.SHIELD_PORT ?? "3200";
const endpoint = process.env.SHIELD_ENDPOINT ?? `http://host.docker.internal:${port}`;
const policy = process.env.SHIELD_POLICY_ID ?? "ferri-shield";
show(await gateway.call<TrustSettings>("PUT", "/gateway/trust-settings", { endpoint, policy_id: policy, api_key: key }));
