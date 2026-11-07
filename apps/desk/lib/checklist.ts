import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { FirstRunFacts } from "@ferri/knowledge";
import { liveEvents, spacesWithSettings } from "./data";
import { community, db } from "./db";
import { crewMembers, deskUsers, knowledgeEntries, pushSubscriptions } from "./ferri";

// The ticks themselves are decided in @ferri/knowledge (pure, unit-tested).
export { firstRunChecklist, type FirstRunChecklist, type FirstRunPage, type FirstRunStatus, type FirstRunTick } from "@ferri/knowledge";

/** Any failure (the database down, a bad query) becomes null: the checklist then says "Can't check". */
async function safe<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/**
 * Crew rows of the community and of each live event, with their Pocket link: `handles.switch`
 * (the Switch account's email), and whether that account has a phone with notices on
 * (a push subscription, matched through Desk's sign-ins as Ferri's pushes are).
 */
async function crewOnPocket(communityId: string, eventIds: string[]): Promise<NonNullable<FirstRunFacts["crew"]>> {
  const rows = await db()
    .select({ name: crewMembers.name, eventId: crewMembers.eventId, handles: crewMembers.handles })
    .from(crewMembers)
    .where(and(eq(crewMembers.communityId, communityId), eventIds.length ? or(isNull(crewMembers.eventId), inArray(crewMembers.eventId, eventIds)) : isNull(crewMembers.eventId)));
  const emailOf = (handles: Record<string, string>) => handles.switch?.trim().toLowerCase() || null;
  const emails = [...new Set(rows.map((r) => emailOf(r.handles)).filter((e): e is string => !!e))];
  const withPush = new Set<string>();
  if (emails.length) {
    const subs = await db()
      .selectDistinct({ email: sql<string>`lower(${deskUsers.email})` })
      .from(pushSubscriptions)
      .innerJoin(deskUsers, eq(deskUsers.switchUserId, pushSubscriptions.switchUserId))
      .where(inArray(sql`lower(${deskUsers.email})`, emails));
    for (const s of subs) withPush.add(s.email);
  }
  return rows.map((r) => {
    const email = emailOf(r.handles);
    return { name: r.name, eventId: r.eventId, linked: !!email, push: !!email && withPush.has(email) };
  });
}

/**
 * What the first-run checklist (spec 25) reads from Ferri's own tables: the spaces and
 * their attachments as Spaces shows them, the live events, the live knowledge and the
 * crew's Pocket links. Switch's connections come from the doctor report, so the page
 * runs this next to `runDoctor` and joins the two.
 */
export async function firstRunFacts(): Promise<Omit<FirstRunFacts, "bridges">> {
  const c = await safe(() => community());
  if (!c) return { spaces: null, liveEvents: null, knowledge: null, crew: null };
  const [spaces, events] = await Promise.all([safe(() => spacesWithSettings(c.id)), safe(() => liveEvents(c.id))]);
  const [knowledge, crew] = await Promise.all([
    safe(() =>
      db()
        .select({ eventId: knowledgeEntries.eventId, sourceKind: knowledgeEntries.sourceKind, sourceTitle: knowledgeEntries.sourceTitle })
        .from(knowledgeEntries)
        .where(and(eq(knowledgeEntries.communityId, c.id), isNull(knowledgeEntries.archivedAt))),
    ),
    safe(() => crewOnPocket(c.id, (events ?? []).map((e) => e.id))),
  ]);
  return {
    spaces:
      spaces?.map((s) => ({
        name: s.name,
        platform: s.platform,
        archived: s.archived,
        attachment: s.attachment ? { eventId: s.attachment.eventId, eventName: s.attachment.eventName, role: s.attachment.role } : null,
      })) ?? null,
    liveEvents: events?.map((e) => ({ id: e.id, name: e.name })) ?? null,
    knowledge,
    crew,
  };
}
