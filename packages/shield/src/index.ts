import { and, desc, eq, gte, sql } from "drizzle-orm";
import { shieldEvents, shieldRules, spaces, type Db } from "@ferri/db";
import type { Link, Rules, Verdict } from "./engine.ts";

export * from "./engine.ts";

// ── Community rules (allow and block domains), cached briefly ────────────

const cache = new Map<string, { rules: Rules; at: number }>();

/** The community's allow and block lists. Kept 5 s, so a Desk change applies within seconds. */
export async function loadRules(db: Db, communityId: string): Promise<Rules> {
  const hit = cache.get(communityId);
  if (hit && Date.now() - hit.at < 5000) return hit.rules;
  const rows = await db.select({ kind: shieldRules.kind, domain: shieldRules.domain }).from(shieldRules).where(eq(shieldRules.communityId, communityId));
  const rules = { allow: rows.filter((r) => r.kind === "allow").map((r) => r.domain), block: rows.filter((r) => r.kind === "block").map((r) => r.domain) };
  cache.set(communityId, { rules, at: Date.now() });
  return rules;
}

/** "https://www.Example.com/x" or "example.com" becomes "example.com"; null when it is not a domain. */
export function normalizeDomain(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0] ?? "";
  return /^[a-z0-9¡-￿-]+(\.[a-z0-9¡-￿-]+)+$/.test(s) ? s : null;
}

export async function setRule(db: Db, input: { communityId: string; kind: "allow" | "block"; domain: string; note?: string | null; by: string }): Promise<string> {
  const domain = normalizeDomain(input.domain);
  if (!domain) throw new Error("That is not a domain (for example: lu.ma or example.com).");
  await db
    .insert(shieldRules)
    .values({ communityId: input.communityId, kind: input.kind, domain, note: input.note ?? null, addedBy: input.by })
    .onConflictDoUpdate({ target: [shieldRules.communityId, shieldRules.domain], set: { kind: input.kind, note: input.note ?? null, addedBy: input.by } });
  cache.delete(input.communityId);
  return domain;
}

export async function removeRule(db: Db, communityId: string, id: string): Promise<void> {
  await db.delete(shieldRules).where(and(eq(shieldRules.id, id), eq(shieldRules.communityId, communityId)));
  cache.delete(communityId);
}

export async function listRules(db: Db, communityId: string) {
  return db.select().from(shieldRules).where(eq(shieldRules.communityId, communityId)).orderBy(shieldRules.kind, shieldRules.domain);
}

// ── The log ───────────────────────────────────────────────────────────────

/** Record a check. Findings keep only category, detector, severity and the defanged reason. */
export async function logCheck(db: Db, input: { roomId: string; spaceId: string | null; role: string; verdict: Verdict; latencyMs: number }): Promise<string> {
  const [row] = await db
    .insert(shieldEvents)
    .values({
      roomId: input.roomId,
      spaceId: input.spaceId,
      role: input.role,
      outcome: input.verdict.outcome,
      findings: input.verdict.findings.map((f) => ({ category: f.category, detector_name: f.detector_name, severity: f.severity, reason: f.reason })),
      latencyMs: input.latencyMs,
    })
    .returning({ id: shieldEvents.id });
  return row!.id;
}

export async function shieldStats(db: Db, since: Date) {
  const rows = await db
    .select({ outcome: shieldEvents.outcome, n: sql<number>`count(*)::int`, p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${shieldEvents.latencyMs}), 0)::int`, max: sql<number>`coalesce(max(${shieldEvents.latencyMs}), 0)::int` })
    .from(shieldEvents)
    .where(gte(shieldEvents.createdAt, since))
    .groupBy(shieldEvents.outcome);
  const by = Object.fromEntries(rows.map((r) => [r.outcome, r.n])) as Record<string, number>;
  const all = await db
    .select({ p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${shieldEvents.latencyMs}), 0)::int`, max: sql<number>`coalesce(max(${shieldEvents.latencyMs}), 0)::int` })
    .from(shieldEvents)
    .where(gte(shieldEvents.createdAt, since));
  return {
    checked: rows.reduce((n, r) => n + r.n, 0),
    ok: by.ok ?? 0,
    alerted: by.alerted ?? 0,
    redacted: by.redacted ?? 0,
    blocked: by.blocked ?? 0,
    p95Ms: all[0]?.p95 ?? 0,
    maxMs: all[0]?.max ?? 0,
  };
}

/** Everything Shield did that was not a plain OK, newest first. */
export async function shieldLog(db: Db, limit = 50) {
  return db
    .select({
      id: shieldEvents.id,
      roomId: shieldEvents.roomId,
      role: shieldEvents.role,
      outcome: shieldEvents.outcome,
      findings: shieldEvents.findings,
      latencyMs: shieldEvents.latencyMs,
      alertedCrewAt: shieldEvents.alertedCrewAt,
      createdAt: shieldEvents.createdAt,
      spaceName: spaces.name,
      platform: spaces.platform,
    })
    .from(shieldEvents)
    .leftJoin(spaces, eq(spaces.id, shieldEvents.spaceId))
    .where(sql`${shieldEvents.outcome} <> 'ok'`)
    .orderBy(desc(shieldEvents.createdAt))
    .limit(limit);
}

// ── Optional reputation lookup (Google Safe Browsing v4) ─────────────────

/**
 * Links Google Safe Browsing knows as malware, phishing or unwanted, within
 * `timeoutMs`. Empty when no key is set, on a timeout, or on any error: the
 * deterministic checks stand on their own.
 */
export async function safeBrowsing(links: Link[], opts: { apiKey?: string; timeoutMs?: number } = {}): Promise<Link[]> {
  const key = opts.apiKey ?? process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!key || !links.length) return [];
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 700),
      body: JSON.stringify({
        client: { clientId: "ferri-shield", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: links.map((l) => ({ url: /^https?:\/\//i.test(l.raw) ? l.raw : `http://${l.raw}` })),
        },
      }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { matches?: { threat?: { url?: string } }[] };
    const bad = new Set((body.matches ?? []).map((m) => m.threat?.url ?? ""));
    return links.filter((l) => bad.has(l.raw) || bad.has(`http://${l.raw}`));
  } catch {
    return [];
  }
}
