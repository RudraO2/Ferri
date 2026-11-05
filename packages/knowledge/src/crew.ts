import { and, eq, isNull, or } from "drizzle-orm";
import { crewMembers, type Db } from "@ferri/db";

export interface CrewMember {
  id: string;
  eventId: string | null;
  name: string;
  handles: Record<string, string>;
  topics: string[];
  lead: boolean;
  onDuty: boolean;
}

export interface SenderIdentity {
  /** "mattermost", "slack", "telegram", ... or null when the id has another shape. */
  platform: string | null;
  username: string;
}

// `@switch-<platform>-<bridge uuid>-<username>:<server>`, how Switch names a platform person.
const PLATFORM_ID =
  /^@switch-([a-z0-9_]+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+):[^:]+$/i;

export function parseSender(sender: string, senderName?: string): SenderIdentity {
  const m = PLATFORM_ID.exec(sender);
  if (m) return { platform: m[1]!.toLowerCase(), username: m[2]! };
  return { platform: null, username: senderName ?? sender };
}

/** The event's crew plus the community-wide crew, event crew first. */
export async function loadCrew(db: Db, communityId: string, eventId: string | null): Promise<CrewMember[]> {
  const rows = await db
    .select()
    .from(crewMembers)
    .where(
      and(
        eq(crewMembers.communityId, communityId),
        eventId ? or(eq(crewMembers.eventId, eventId), isNull(crewMembers.eventId)) : isNull(crewMembers.eventId),
      ),
    );
  return rows
    .map((r) => ({
      id: r.id,
      eventId: r.eventId,
      name: r.name,
      handles: r.handles,
      topics: r.topics,
      lead: r.lead,
      onDuty: r.onDuty,
    }))
    .sort((a, b) => Number(b.eventId !== null) - Number(a.eventId !== null) || a.name.localeCompare(b.name));
}

/** The crew member a message came from, or null for everyone else. */
export function findCrewMember(crew: CrewMember[], sender: string, senderName?: string): CrewMember | null {
  const who = parseSender(sender, senderName);
  const name = who.username.toLowerCase();
  return (
    crew.find((c) =>
      Object.entries(c.handles).some(
        ([platform, handle]) => handle.toLowerCase() === name && (who.platform === null || platform === who.platform),
      ),
    ) ?? null
  );
}

/**
 * Who a card on this topic goes to first: the topic owners, else whoever is
 * on duty, else the whole crew. The first answer from anyone still wins.
 */
export function routeCard(crew: CrewMember[], topic: string): { owners: CrewMember[]; reason: "owner" | "on_duty" | "everyone" } {
  const owners = crew.filter((c) => c.topics.includes(topic));
  if (owners.length) return { owners, reason: "owner" };
  const duty = crew.filter((c) => c.onDuty);
  if (duty.length) return { owners: duty, reason: "on_duty" };
  return { owners: crew, reason: "everyone" };
}

/** `@handle` for the platform, or the plain name when the person has no handle there. */
export function mention(member: CrewMember, platform: string | null): string {
  const handle = platform ? member.handles[platform] : undefined;
  return handle ? `@${handle}` : member.name;
}
