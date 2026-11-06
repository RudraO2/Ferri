import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { communities, events, knowledgeEntries, type Db } from "@ferri/db";
import { buildTsQuery } from "./render.ts";

export interface KnowledgeItem {
  id: string;
  key: string;
  eventId: string | null;
  /** Null for community knowledge. */
  eventName: string | null;
  sourceKind: "markdown" | "desk" | "crew_answer";
  sourceTitle: string;
  heading: string;
  body: string;
  version: number;
  updatedAt: Date;
}

export interface LiveEvent {
  id: string;
  slug: string;
  name: string;
  stage: "plan" | "build" | "launch" | "live" | "wrap";
  startsAt: Date | null;
  endsAt: Date | null;
  venue: string | null;
  instructions: string;
}

export interface LiveKnowledge {
  community: { id: string; slug: string; name: string; timezone: string; instructions: string };
  /** Every event that is not in Wrap. */
  events: LiveEvent[];
  /** Community entries first, then each event's, in a fixed order (stable prompt cache). */
  entries: KnowledgeItem[];
}

/** One community per install for now: by slug if given, else the oldest one. */
export async function findCommunity(db: Db, slug?: string) {
  const rows = await db
    .select()
    .from(communities)
    .where(slug ? eq(communities.slug, slug) : undefined)
    .orderBy(asc(communities.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The knowledge Ferri answers from. With `eventId`, only the community's
 * knowledge plus that event's (a question belongs to its space's event);
 * `eventId: null` means community knowledge only. Without it, every live event.
 */
export async function loadLiveKnowledge(
  db: Db,
  communitySlug?: string,
  scope?: { eventId: string | null },
): Promise<LiveKnowledge | null> {
  const community = await findCommunity(db, communitySlug);
  if (!community) return null;

  const allLive = await db
    .select()
    .from(events)
    .where(and(eq(events.communityId, community.id), isNull(events.closedAt)))
    .orderBy(asc(events.startsAt), asc(events.name));
  const liveEvents = scope ? allLive.filter((e) => e.id === scope.eventId) : allLive;
  const eventIds = liveEvents.map((e) => e.id);
  const eventName = new Map(liveEvents.map((e) => [e.id, e.name]));
  const eventOrder = new Map(liveEvents.map((e, i) => [e.id, i]));

  const rows = await db
    .select({
      id: knowledgeEntries.id,
      key: knowledgeEntries.key,
      eventId: knowledgeEntries.eventId,
      sourceKind: knowledgeEntries.sourceKind,
      sourceTitle: knowledgeEntries.sourceTitle,
      heading: knowledgeEntries.heading,
      body: knowledgeEntries.body,
      version: knowledgeEntries.version,
      updatedAt: knowledgeEntries.updatedAt,
      position: knowledgeEntries.position,
    })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.communityId, community.id),
        isNull(knowledgeEntries.archivedAt),
        eventIds.length
          ? or(isNull(knowledgeEntries.eventId), inArray(knowledgeEntries.eventId, eventIds))
          : isNull(knowledgeEntries.eventId),
      ),
    );

  const entries = rows
    .sort((a, b) => {
      const ea = a.eventId === null ? -1 : (eventOrder.get(a.eventId) ?? 0);
      const eb = b.eventId === null ? -1 : (eventOrder.get(b.eventId) ?? 0);
      return (
        ea - eb ||
        a.sourceTitle.localeCompare(b.sourceTitle) ||
        a.position - b.position ||
        a.key.localeCompare(b.key)
      );
    })
    .map(({ position: _p, ...r }) => ({ ...r, eventName: r.eventId ? (eventName.get(r.eventId) ?? null) : null }));

  return {
    community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      timezone: community.timezone,
      instructions: community.instructions,
    },
    events: liveEvents.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      stage: e.stage,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      venue: e.venue,
      instructions: e.instructions,
    })),
    entries,
  };
}

/**
 * Full text search over the live entries, best first. Terms are OR-ed, so any
 * matching word counts; the heading weighs more than the body.
 */
export async function searchKnowledge(db: Db, kb: LiveKnowledge, terms: string[], limit = 12): Promise<KnowledgeItem[]> {
  const query = buildTsQuery(terms);
  if (!query || kb.entries.length === 0) return [];
  const ids = kb.entries.map((e) => e.id);
  const rows = await db
    .select({ id: knowledgeEntries.id })
    .from(knowledgeEntries)
    .where(and(inArray(knowledgeEntries.id, ids), sql`${knowledgeEntries.search} @@ to_tsquery('english', ${query})`))
    .orderBy(sql`ts_rank_cd(${knowledgeEntries.search}, to_tsquery('english', ${query})) desc`)
    .limit(limit);
  const byId = new Map(kb.entries.map((e) => [e.id, e]));
  return rows.map((r) => byId.get(r.id)!).filter(Boolean);
}
