import { verifyWebhook } from "@ferri/email";
import { db } from "@/lib/db";
import { emailEvents } from "@/lib/ferri";

const TYPES = new Set(["email.received", "email.delivered", "email.bounced", "email.complained", "email.delivery_delayed"]);

/**
 * Resend's webhook (spec 15): replies to outreach emails and delivery events.
 * Public (Resend calls it over the tunnel), so every call must carry a valid
 * Svix signature made with RESEND_WEBHOOK_SECRET. Desk only stores the event;
 * Ferri's tick fetches the email and tells the crew.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const raw = await req.text();
  if (raw.length > 200_000) return new Response("too large", { status: 413 });
  const id = req.headers.get("svix-id");
  const ok = verifyWebhook({ body: raw, id, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"), secret });
  if (!ok) return new Response("unauthorized", { status: 401 });
  let body: { type?: string; data?: Record<string, unknown> };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const type = String(body.type ?? "");
  // Unknown types are acknowledged and dropped, so Resend does not retry them.
  if (!TYPES.has(type)) return Response.json({ ok: true, ignored: type });
  await db()
    .insert(emailEvents)
    .values({ deliveryId: id!, type, payload: body as Record<string, unknown> })
    .onConflictDoNothing({ target: emailEvents.deliveryId });
  return Response.json({ ok: true });
}
