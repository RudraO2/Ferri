import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { community, db } from "@/lib/db";
import { builderJobs, siteEvents } from "@/lib/ferri";

const TYPES = new Set(["registration", "pool_low", "pool_refilled"]);

function authorized(req: Request): boolean {
  const secret = process.env.FERRI_SITE_HOOK_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/**
 * The event site the Builder shipped reports here (spec 12): a registration, a
 * sponsor's credit pool running low or refilled. Ferri tells the crew.
 * Public (the site calls it over the tunnel), so it takes only small, known
 * events with the shared secret.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  const raw = await req.text();
  if (raw.length > 2000) return new Response("too large", { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const type = String(body.type ?? "");
  const site = String(body.site ?? "").slice(0, 40);
  if (!TYPES.has(type) || !site) return new Response("unknown event", { status: 400 });
  const c = await community();
  const n = /^B(\d+)$/i.exec(site)?.[1];
  const [job] = n
    ? await db().select({ id: builderJobs.id }).from(builderJobs).where(and(eq(builderJobs.communityId, c.id), eq(builderJobs.number, Number(n)))).limit(1)
    : [];
  const pick = (k: string, max = 120) => (body[k] === undefined || body[k] === null ? undefined : typeof body[k] === "number" ? body[k] : String(body[k]).slice(0, max));
  const payload = Object.fromEntries(
    Object.entries({ count: pick("count"), name: pick("name"), sponsor: pick("sponsor"), left: pick("left"), lowAt: pick("lowAt"), at: pick("at", 40) }).filter(([, v]) => v !== undefined),
  );
  await db().insert(siteEvents).values({ communityId: c.id, site, jobId: job?.id ?? null, type, payload });
  return Response.json({ ok: true });
}
