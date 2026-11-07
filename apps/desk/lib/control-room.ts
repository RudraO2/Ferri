import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { community, db } from "./db";
import { announcements, cards, careCases, questions, shieldEvents, spaces } from "./ferri";

/** Outcomes that count as a member question Ferri had to decide on. */
const DECIDED = ["answered", "unknown", "held"] as const;

export type HourPoint = { hour: string; label: string; asked: number; alone: number; share: number | null };
export type FeedItem = { at: Date; kind: "answered" | "asked-crew" | "crew-answered" | "announced" | "shield" | "care"; text: string; platform?: string | null; who?: string | null };

/**
 * Read-only numbers for the Overview control room: Ferri's self-answer share by hour,
 * questions per platform, Shield blocks and a live feed. The window is the 12 hours
 * up to the latest question (or now), in the community's time zone.
 */
export async function controlRoom() {
  const c = await community();
  const tz = c.timezone || "Asia/Kolkata";
  const [latest] = await db()
    .select({ at: sql<Date>`max(${questions.askedAt})` })
    .from(questions)
    .where(eq(questions.communityId, c.id));
  const end = latest?.at ? new Date(Math.max(new Date(latest.at).getTime(), Date.now() - 12 * 3600_000)) : new Date();
  const since = new Date(end.getTime() - 12 * 3600_000);
  const day = new Date(Date.now() - 24 * 3600_000);

  const hourExpr = sql<string>`to_char(date_trunc('hour', ${questions.askedAt} at time zone ${tz}), 'YYYY-MM-DD"T"HH24')`;
  const rows = await db()
    .select({
      hour: hourExpr,
      asked: sql<number>`count(*)::int`,
      alone: sql<number>`count(*) filter (where ${questions.outcome} = 'answered')::int`,
    })
    .from(questions)
    .where(and(eq(questions.communityId, c.id), gte(questions.askedAt, since), inArray(questions.outcome, [...DECIDED])))
    .groupBy(sql`1`);
  const byHour = new Map(rows.map((r) => [r.hour, r]));

  // Every hour in the window, empty ones too, so the line has a stable x axis.
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const fmtLabel = new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", hour12: true });
  const hours: HourPoint[] = [];
  for (let t = since.getTime() + 3600_000; t <= end.getTime() + 1; t += 3600_000) {
    const parts = Object.fromEntries(fmtKey.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const key = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`;
    const r = byHour.get(key);
    const asked = r?.asked ?? 0;
    const alone = r?.alone ?? 0;
    hours.push({ hour: key, label: fmtLabel.format(new Date(t)).replace(" ", "").toLowerCase(), asked, alone, share: asked ? alone / asked : null });
  }

  const totals = hours.reduce((a, h) => ({ asked: a.asked + h.asked, alone: a.alone + h.alone }), { asked: 0, alone: 0 });
  const firstWithData = hours.find((h) => h.share !== null);
  const lastWithData = [...hours].reverse().find((h) => h.share !== null);

  const platformRows = await db()
    .select({ platform: spaces.platform, n: sql<number>`count(*)::int` })
    .from(questions)
    .leftJoin(spaces, eq(spaces.id, questions.spaceId))
    .where(and(eq(questions.communityId, c.id), gte(questions.askedAt, since), inArray(questions.outcome, [...DECIDED])))
    .groupBy(spaces.platform);
  const platforms = platformRows
    .map((r) => ({ platform: r.platform === "whatsapp_web" ? "whatsapp" : (r.platform ?? "switch"), n: r.n }))
    .reduce<{ platform: string; n: number }[]>((acc, r) => {
      const hit = acc.find((x) => x.platform === r.platform);
      if (hit) hit.n += r.n;
      else acc.push({ ...r });
      return acc;
    }, [])
    .sort((a, b) => b.n - a.n);

  const [shieldBlocks] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(shieldEvents)
    .where(and(gte(shieldEvents.createdAt, day), inArray(shieldEvents.outcome, ["blocked", "redacted"])));

  return {
    tz,
    hours,
    totals,
    shareNow: lastWithData?.share ?? null,
    shareStart: firstWithData?.share ?? null,
    startLabel: firstWithData?.label ?? null,
    platforms,
    shieldBlocks: shieldBlocks?.n ?? 0,
    feed: await feed(c.id),
  };
}

async function feed(communityId: string): Promise<FeedItem[]> {
  const [qs, answeredCards, posted, blocked, cases] = await Promise.all([
    db()
      .select({ at: questions.askedAt, outcome: questions.outcome, who: questions.askerName, text: questions.text, platform: spaces.platform })
      .from(questions)
      .leftJoin(spaces, eq(spaces.id, questions.spaceId))
      .where(and(eq(questions.communityId, communityId), inArray(questions.outcome, ["answered", "unknown"])))
      .orderBy(desc(questions.askedAt))
      .limit(8),
    db()
      .select({ at: cards.answeredAt, who: cards.answeredBy, text: cards.question })
      .from(cards)
      .where(and(eq(cards.communityId, communityId), eq(cards.status, "answered"), eq(cards.kind, "question"), isNotNull(cards.answeredAt)))
      .orderBy(desc(cards.answeredAt))
      .limit(6),
    db()
      .select({ at: announcements.sentAt, text: announcements.title })
      .from(announcements)
      .where(and(eq(announcements.communityId, communityId), isNotNull(announcements.sentAt)))
      .orderBy(desc(announcements.sentAt))
      .limit(4),
    db()
      .select({ at: shieldEvents.createdAt, platform: spaces.platform, space: spaces.name })
      .from(shieldEvents)
      .leftJoin(spaces, eq(spaces.id, shieldEvents.spaceId))
      .where(inArray(shieldEvents.outcome, ["blocked"]))
      .orderBy(desc(shieldEvents.createdAt))
      .limit(4),
    db()
      .select({ at: careCases.createdAt, n: careCases.number, reason: careCases.reason, platform: careCases.platform, who: careCases.personName })
      .from(careCases)
      .where(eq(careCases.communityId, communityId))
      .orderBy(desc(careCases.createdAt))
      .limit(4),
  ]);
  const items: FeedItem[] = [
    ...qs.map((q) => ({
      at: q.at,
      kind: q.outcome === "answered" ? ("answered" as const) : ("asked-crew" as const),
      text: q.outcome === "answered" ? `answered ${q.who}: “${q.text}”` : `asked the crew for ${q.who}: “${q.text}”`,
      platform: q.platform,
      who: q.who,
    })),
    ...answeredCards.map((x) => ({ at: x.at as Date, kind: "crew-answered" as const, text: `answered “${x.text}”, saved for next time`, who: x.who })),
    ...posted.map((x) => ({ at: x.at as Date, kind: "announced" as const, text: `Announced “${x.text}” on every app` })),
    ...blocked.map((x) => ({ at: x.at, kind: "shield" as const, text: `Shield blocked a risky message${x.space ? ` in ${x.space}` : ""}`, platform: x.platform })),
    ...cases.map((x) => ({ at: x.at, kind: "care" as const, text: `Case ${x.n} opened for ${x.who}: ${x.reason}`, platform: x.platform, who: x.who })),
  ];
  return items.filter((i) => i.at).sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);
}
