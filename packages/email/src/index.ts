import { createHmac, timingSafeEqual } from "node:crypto";

// ── Email for Ferri (spec 15): Resend for sending and receiving, no SDK ──

export interface SendInput {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  /** Resend tags: ASCII letters, digits, `_` and `-` only. */
  tags?: { name: string; value: string }[];
  /** Resend keeps one email per key for 24 hours, so a retried send is never sent twice. */
  idempotencyKey?: string;
}

/** A received email as `GET /emails/receiving/{id}` returns it. */
export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  reply_to?: string[] | null;
  message_id?: string | null;
  created_at: string;
  authentication?: { spf?: string; dkim?: string; dmarc?: string };
}

export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Resend {
  send(input: SendInput): Promise<{ id: string }>;
  received(id: string): Promise<ReceivedEmail>;
  call<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export function resend(opts: { apiKey: string; baseUrl?: string; fetch?: typeof fetch }): Resend {
  const base = (opts.baseUrl ?? "https://api.resend.com").replace(/\/+$/, "");
  const f = opts.fetch ?? fetch;
  async function call<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const r = await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json", ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!r.ok) {
      const msg = (json as { message?: string } | null)?.message ?? text.slice(0, 200);
      throw new ResendError(r.status, `Resend ${method} ${path}: ${r.status} ${msg}`);
    }
    return json as T;
  }
  return {
    call: (m, p, b) => call(m, p, b),
    send: (i) =>
      call<{ id: string }>(
        "POST",
        "/emails",
        {
          from: i.from,
          to: i.to,
          subject: i.subject,
          text: i.text,
          ...(i.html ? { html: i.html } : {}),
          ...(i.replyTo ? { reply_to: i.replyTo } : {}),
          ...(i.headers ? { headers: i.headers } : {}),
          ...(i.tags?.length ? { tags: i.tags } : {}),
        },
        i.idempotencyKey ? { "Idempotency-Key": i.idempotencyKey.slice(0, 256) } : {},
      ),
    received: (id) => call<ReceivedEmail>("GET", `/emails/receiving/${encodeURIComponent(id)}`),
  };
}

// ── Webhooks (Svix signatures) ────────────────────────────────────────────

/**
 * Check a Resend webhook: `svix-signature` holds `v1,<base64 HMAC-SHA256>` of
 * `${svix-id}.${svix-timestamp}.${raw body}`, keyed with the base64 part of
 * the `whsec_...` secret. Old or future timestamps (over 5 minutes) fail.
 */
export function verifyWebhook(input: { body: string; id: string | null; timestamp: string | null; signature: string | null; secret: string; now?: number; toleranceSeconds?: number }): boolean {
  const { body, id, timestamp, signature, secret } = input;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > (input.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

/** What a test (or a stand-in) signs: the same headers Resend sends. */
export function signWebhook(body: string, secret: string, id = `msg_${Date.now()}`, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${sig}` };
}

// ── Addresses ─────────────────────────────────────────────────────────────

/** "Lantern Labs <partners@x.org>" or "partners@x.org" to its parts (email lowercased). */
export function parseAddress(raw: string): { name: string | null; email: string } | null {
  const s = String(raw ?? "").trim();
  const m = /^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/.exec(s);
  const email = (m ? (m[2] ?? "") : s).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = m?.[1]?.trim() || null;
  return { name, email };
}

export const isEmail = (s: string) => parseAddress(s)?.email === String(s).trim().toLowerCase() && !/[<>\s]/.test(s.trim());

/** `partners+c7f3a9@rudratechie.xyz` for the mailbox `partners@rudratechie.xyz` and the code `c7f3a9`. */
export function replyAddress(mailbox: string, code: string): string {
  const a = parseAddress(mailbox);
  if (!a) throw new Error(`Not an address: ${mailbox}`);
  const [local, domain] = a.email.split("@") as [string, string];
  return `${local.split("+")[0]}+${code}@${domain}`;
}

/** The contact code from the addresses an email was sent to (null when none is ours). */
export function codeFrom(addresses: string[], mailbox: string): string | null {
  const own = parseAddress(mailbox);
  if (!own) return null;
  const [local, domain] = own.email.split("@") as [string, string];
  for (const raw of addresses) {
    const a = parseAddress(raw);
    if (!a) continue;
    const [l, d] = a.email.split("@") as [string, string];
    if (d !== domain) continue;
    const m = new RegExp(`^${local.split("+")[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\+([a-z0-9]{4,16})$`).exec(l);
    if (m) return m[1]!;
  }
  return null;
}

/**
 * The new part of a reply: everything above the quoted earlier message
 * ("On ... wrote:", "-----Original Message-----", lines starting with ">").
 */
export function newPart(text: string): string {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*>/.test(l)) break;
    if (/^\s*-{2,}\s*(original message|forwarded message)\s*-{2,}/i.test(l)) break;
    if (/^\s*On .{4,200}(wrote|écrit|schrieb):\s*$/i.test(l)) break;
    // "On Fri, 6 Nov 2026 at 17:02, X <x@y>" wrapped over two lines.
    if (/^\s*On .{4,200}$/i.test(l) && /wrote:\s*$/i.test(lines[i + 1] ?? "")) break;
    if (/^\s*From: .+/i.test(l) && /^\s*(Sent|Date): /i.test(lines[i + 1] ?? "")) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text to a small, safe HTML body (paragraphs and links). */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>").replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("\n");
}
