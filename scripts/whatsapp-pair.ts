/**
 * Link a WhatsApp account to Switch (spec 10). Safe to re-run.
 *
 *   pnpm whatsapp:pair                 QR code: saved as a PNG to scan on the phone
 *   pnpm whatsapp:pair --code 9198...  pairing code to type on the phone instead
 *
 * 1. Adds the `whatsapp_web` connection in Switch through the Gateway, if there
 *    is none: the WAHA sidecar at http://waha:3000 (as switch-core reaches it),
 *    the sidecar key (WAHA_API_KEY from .env, else ../switch/.env), and the chats to bridge
 *    (FERRI_WHATSAPP_CHATS, comma separated; default "me" and the event group).
 * 2. Waits for the sidecar's session, then shows the QR code (or pairing code)
 *    until the phone links it, and says which account linked.
 *
 * The sidecar runs with the fork's compose file:
 *   docker compose -f deploy/local/standalone-docker-compose.yml -f deploy/local/ferri/compose.override.yml --profile whatsapp --project-directory . up -d waha
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gatewayFromEnv, type GatewayClient } from "@ferri/switch";
import { readEnvFile } from "./builder-paths.ts";

const root = path.resolve(import.meta.dirname, "..");
const switchDir = path.join(root, "..", "switch");
const env = { ...readEnvFile(path.join(root, ".env")), ...process.env } as Record<string, string | undefined>;
const switchEnv = readEnvFile(path.join(switchDir, ".env"));
const apiKey = env.WAHA_API_KEY ?? switchEnv.WAHA_API_KEY;
if (!apiKey) throw new Error("No WAHA_API_KEY: set it in .env (the same value the WAHA sidecar uses) and start the sidecar first (see the header of this script).");
const sidecar = (env.FERRI_WAHA_URL ?? "http://127.0.0.1:3010").replace(/\/+$/, "");
const session = env.FERRI_WHATSAPP_SESSION ?? "default";
const chats = (env.FERRI_WHATSAPP_CHATS ?? "me,Lantern Build Night")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
const codeArg = process.argv.indexOf("--code");
const phone = codeArg >= 0 ? (process.argv[codeArg + 1] ?? "").replace(/\D/g, "") : null;
if (codeArg >= 0 && !phone) throw new Error("--code needs the phone number in international format, digits only.");

async function waha<T>(method: string, route: string, body?: unknown, accept = "application/json"): Promise<{ status: number; data: T | null; bytes?: Buffer }> {
  const res = await fetch(`${sidecar}${route}`, {
    method,
    headers: { "X-Api-Key": apiKey!, accept, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (accept.startsWith("image/") && res.ok) return { status: res.status, data: null, bytes: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as T) : null };
}

// ── 1. The connection in Switch ──────────────────────────────────────────
const gw = (await gatewayFromEnv(path.join(switchDir, ".env"), env as NodeJS.ProcessEnv)) as GatewayClient;
if (!gw) throw new Error("No Switch admin password: set SWITCH_ADMIN_PASSWORD in .env.");
const bridges = await gw.bridges();
let bridge = bridges.find((b) => b.bridge_type === "whatsapp_web");
if (!bridge) {
  const created = await gw.call<{ bridge_id: string; bridge_type: string; display_name: string }>("POST", "/gateway/collaborations", {
    bridge_type: "whatsapp_web",
    display_name: "WhatsApp",
    channel_creation_enabled: false,
    connection_config: {
      waha_url: "http://waha:3000",
      api_key: apiKey,
      session,
      chats,
      direct_chats: false,
      ...(phone ? { pairing_phone: phone } : {}),
    },
  });
  bridge = created;
  console.log(`Added the WhatsApp connection in Switch (${created.bridge_id}); it bridges: ${chats.join(", ")}.`);
} else {
  console.log(`Switch already has the WhatsApp connection (${bridge.bridge_id}).`);
}

// ── 2. Link the phone ────────────────────────────────────────────────────
interface Session {
  status: string;
  me?: { id: string; pushName?: string } | null;
}
// In the Docker stack FERRI_QR_DIR is a folder shared with the host (.ferri-state in the repo).
const qrFile = path.join(env.FERRI_QR_DIR || os.tmpdir(), "ferri-whatsapp-qr.png");
let shown = "";
for (let i = 0; i < 180; i++) {
  const s = await waha<Session>("GET", `/api/sessions/${session}`);
  const status = s.data?.status ?? `HTTP ${s.status}`;
  if (status === "WORKING") {
    console.log(`Linked: ${s.data?.me?.pushName ?? "?"} (${s.data?.me?.id ?? "?"}). WhatsApp is connected to Switch.`);
    process.exit(0);
  }
  if (status === "SCAN_QR_CODE") {
    if (phone) {
      if (shown !== "code") {
        const out = await waha<{ code: string }>("POST", `/api/${session}/auth/request-code`, { phoneNumber: phone });
        console.log(`Pairing code: ${out.data?.code ?? "(none)"}. On the phone: WhatsApp, Linked devices, Link a device, Link with phone number instead.`);
        shown = "code";
      }
    } else {
      // The QR code changes every ~20 s; keep the file current.
      const qr = await waha<null>("GET", `/api/${session}/auth/qr`, undefined, "image/png");
      if (qr.bytes) {
        fs.writeFileSync(qrFile, qr.bytes);
        if (shown !== "qr") {
          console.log(`QR code: ${env.FERRI_QR_DIR ? ".ferri-state/shared/ferri-whatsapp-qr.png in the repo" : qrFile} (refreshed every few seconds). On the phone: WhatsApp, Linked devices, Link a device, then scan it.`);
          shown = "qr";
        }
      }
    }
  } else if (status !== shown) {
    console.log(`Session: ${status}`);
    shown = status;
  }
  await new Promise((r) => setTimeout(r, 5000));
}
throw new Error("The phone did not link within 15 minutes. Run it again.");
