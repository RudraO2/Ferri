/**
 * Email setup (spec 15). Safe to re-run.
 *
 *   1. RESEND_API_KEY must be in .env.
 *   2. The outreach mailbox's domain (FERRI_EMAIL_FROM, for example partners@your-domain.org)
 *      must be verified in Resend for sending and receiving.
 *   3. Resend's webhook points at Desk's public `/api/email` (FERRI_PUBLIC_URL) for
 *      received, delivered, bounced and complained; its signing secret goes to .env
 *      as RESEND_WEBHOOK_SECRET (Desk checks every call with it).
 *
 * Never prints a key or a secret. Restart Desk and Ferri afterwards: they read .env at start.
 */
import fs from "node:fs";
import path from "node:path";
import { parseAddress, resend } from "@ferri/email";
import { readEnvFile } from "./builder-paths.ts";

const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env");
const env = { ...readEnvFile(envFile), ...process.env } as Record<string, string | undefined>;
const key = env.RESEND_API_KEY;
if (!key) throw new Error("RESEND_API_KEY is not set in .env. Make a key at https://resend.com/api-keys and add it.");
const from = env.FERRI_EMAIL_FROM?.trim();
if (!from) throw new Error("FERRI_EMAIL_FROM is not set. Set it in .env to the outreach mailbox on your Resend domain (for example partners@your-domain.org), then run pnpm email:setup again.");
const mailbox = parseAddress(from);
if (!mailbox) throw new Error(`FERRI_EMAIL_FROM is not an address: ${from}`);
const domainName = mailbox.email.split("@")[1]!;
const publicUrlRaw = env.FERRI_PUBLIC_URL?.trim();
if (!publicUrlRaw) throw new Error("FERRI_PUBLIC_URL is not set. Set it in .env to Desk's public https address (Resend posts to <FERRI_PUBLIC_URL>/api/email), then run pnpm email:setup again.");
const publicUrl = publicUrlRaw.replace(/\/+$/, "");
const endpoint = `${publicUrl}/api/email`;
const EVENTS = ["email.received", "email.delivered", "email.bounced", "email.complained"];
const r = resend({ apiKey: key });

function setEnv(name: string, value: string, comment: string) {
  let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  if (new RegExp(`^${name}=`, "m").test(text)) text = text.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`);
  else text += `${text.endsWith("\n") ? "" : "\n"}# ${comment}\n${name}=${value}\n`;
  fs.writeFileSync(envFile, text);
}

// 2. The domain.
const domains = await r.call<{ data: { id: string; name: string; status: string; capabilities?: { sending?: string; receiving?: string } }[] }>("GET", "/domains");
const domain = domains.data.find((d) => d.name === domainName);
if (!domain) throw new Error(`${domainName} is not a domain in Resend yet. Add it (with receiving on) and its DNS records, then re-run.`);
const detail = await r.call<{ status: string; capabilities?: { sending?: string; receiving?: string }; records: { record: string; status: string }[] }>("GET", `/domains/${domain.id}`);
const pending = detail.records.filter((x) => x.status !== "verified").map((x) => x.record);
if (detail.status !== "verified" || pending.length) throw new Error(`${domainName} is ${detail.status} in Resend (waiting: ${pending.join(", ") || "none"}). Add its DNS records, then re-run.`);
if (detail.capabilities?.receiving !== "enabled") throw new Error(`${domainName} does not receive email in Resend. Turn on receiving for it, then re-run.`);
console.log(`Domain: ${domainName} verified for sending and receiving.`);

// 3. The webhook (Resend's free plan allows one endpoint).
interface Hook {
  id: string;
  endpoint: string;
  events: string[];
  signing_secret?: string;
}
const hooks = await r.call<{ data: Hook[] }>("GET", "/webhooks");
let hook = hooks.data.find((h) => h.endpoint === endpoint);
if (hook && EVENTS.some((e) => !hook!.events.includes(e))) {
  await r.call("PATCH", `/webhooks/${hook.id}`, { endpoint, events: EVENTS });
  console.log("Webhook: events updated.");
}
if (!hook) {
  const created = await r.call<Hook>("POST", "/webhooks", { endpoint, events: EVENTS });
  hook = created;
  console.log(`Webhook: created for ${endpoint}.`);
} else console.log(`Webhook: already points at ${endpoint}.`);
const secret = hook.signing_secret ?? (await r.call<Hook>("GET", `/webhooks/${hook.id}`)).signing_secret;
if (!secret) throw new Error("Resend did not return the webhook's signing secret.");
setEnv("RESEND_WEBHOOK_SECRET", secret, "Resend's webhook signing secret (spec 15), written by pnpm email:setup.");
console.log(`Mailbox: ${mailbox.email} (replies to ${mailbox.email.replace("@", "+<contact>@")}). Secret saved to .env.`);
console.log("Done. Restart Desk and Ferri so they read the new .env.");
