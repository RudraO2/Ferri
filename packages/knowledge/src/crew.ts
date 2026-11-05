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
  /**
   * The person's own platform username ("rudra.pratap.12233", "Priya_K"), as
   * the bridge saw it. Switch's bridges turn `@<this>` into a native mention
   * (Slack `<@U…>`, Discord `<@id>`, Telegram `tg://user`), so mentions use it.
   */
  username: string;
}

// `@switch-<platform>-<bridge uuid>-<username>:<server>`, how Switch names a platform person.
// The username segment is folded (lowercase, anything outside [a-z0-9_-] becomes "-",
// collaboration_core.py), so it is only good for matching, not for writing a mention.
const PLATFORM_ID =
  /^@switch-([a-z0-9_]+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+):[^:]+$/i;

/** Switch's folding of a platform username into its id: `Jo.Ann` and `jo-ann` are the same person. */
export function foldHandle(name: string): string {
  return name
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseSender(sender: string, senderName?: string): SenderIdentity {
  const m = PLATFORM_ID.exec(sender);
  if (m) {
    const folded = m[2]!;
    // Prefer the real username when it is the one the id was folded from (it
    // can carry dots and capitals); anything else falls back to the id. Switch
    // appends an 8-hex digest when two names fold alike.
    const fromName = senderName ? foldHandle(senderName) : null;
    const matches = fromName !== null && (fromName === folded || fromName === folded.replace(/-[0-9a-f]{8}$/, ""));
    return { platform: m[1]!.toLowerCase(), username: matches ? senderName! : folded };
  }
  return { platform: null, username: senderName ?? sender };
}

/** Whether a stored handle names this sender (same folding as Switch, `@` optional). */
export function sameHandle(handle: string, username: string): boolean {
  return foldHandle(handle) === foldHandle(username);
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
  return (
    crew.find((c) =>
      Object.entries(c.handles).some(
        ([platform, handle]) => sameHandle(handle, who.username) && (who.platform === null || platform === who.platform),
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
  const handle = platform ? member.handles[platform]?.trim().replace(/^@/, "") : undefined;
  return handle ? `@${handle}` : member.name;
}
