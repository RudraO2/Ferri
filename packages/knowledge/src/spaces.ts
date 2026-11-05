import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import { communities, eventSpaces, events, mutedPeople, spaces, type Db } from "@ferri/db";
import { sameHandle } from "./crew.ts";
import type { SpaceMode, SpaceRole, SpaceSetting } from "./policy.ts";

export interface RoomSeen {
  roomId: string;
  name: string;
  platform: string | null;
}

export interface ResolvedSpace {
  spaceId: string;
  communityId: string;
  name: string;
  platform: string | null;
  archived: boolean;
  /** The live event this space is attached to, with its mode and role; null means Off. */
  eventId: string | null;
  setting: SpaceSetting | null;
}

/** Record a room Ferri is in (new ones start in Discovered, Off). Returns the space id. */
export async function recordSpace(db: Db, communityId: string, room: RoomSeen, messageAt?: Date): Promise<string> {
  const now = new Date();
  const [row] = await db
    .insert(spaces)
    .values({
      communityId,
      switchRoomId: room.roomId,
      name: room.name,
      platform: room.platform,
      lastMessageAt: messageAt ?? null,
    })
    .onConflictDoUpdate({
      target: spaces.switchRoomId,
      set: {
        name: room.name,
        ...(room.platform ? { platform: room.platform } : {}),
        archived: false,
        lastSeenAt: now,
        ...(messageAt ? { lastMessageAt: messageAt } : {}),
        updatedAt: now,
      },
    })
    .returning({ id: spaces.id });
  return row!.id;
}

/**
 * Bring the spaces table in line with the rooms Ferri is in: new rooms are
 * added (Discovered, Off), rooms Ferri left are archived.
 */
export async function syncSpaces(db: Db, communityId: string, rooms: RoomSeen[]): Promise<{ added: string[]; archived: number }> {
  const known = new Set(
    (await db.select({ roomId: spaces.switchRoomId }).from(spaces).where(eq(spaces.communityId, communityId))).map((r) => r.roomId),
  );
  const added: string[] = [];
  for (const room of rooms) {
    if (!known.has(room.roomId)) added.push(room.name);
    await recordSpace(db, communityId, room);
  }
  const ids = rooms.map((r) => r.roomId);
  const gone = await db
    .update(spaces)
    .set({ archived: true, updatedAt: new Date() })
    .where(
      and(
        eq(spaces.communityId, communityId),
        eq(spaces.archived, false),
        ids.length ? notInArray(spaces.switchRoomId, ids) : undefined,
      ),
    )
    .returning({ id: spaces.id });
  return { added, archived: gone.length };
}

/** The space for a Switch room and its attachment to a live (not wrapped) event. */
export async function resolveSpace(db: Db, roomId: string): Promise<ResolvedSpace | null> {
  const [space] = await db.select().from(spaces).where(eq(spaces.switchRoomId, roomId)).limit(1);
  if (!space) return null;
  const [att] = await db
    .select({ eventId: eventSpaces.eventId, mode: eventSpaces.mode, role: eventSpaces.role })
    .from(eventSpaces)
    .innerJoin(events, eq(events.id, eventSpaces.eventId))
    .where(and(eq(eventSpaces.spaceId, space.id), ne(events.stage, "wrap")))
    .limit(1);
  return {
    spaceId: space.id,
    communityId: space.communityId,
    name: space.name,
    platform: space.platform,
    archived: space.archived,
    eventId: att?.eventId ?? null,
    setting: att ? { mode: att.mode, role: att.role } : null,
  };
}

/** The Switch room where an event's cards go: its space attached with role crew. */
export async function crewRoomForEvent(db: Db, eventId: string | null): Promise<string | null> {
  if (!eventId) return null;
  const [row] = await db
    .select({ roomId: spaces.switchRoomId })
    .from(eventSpaces)
    .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
    .where(and(eq(eventSpaces.eventId, eventId), eq(eventSpaces.role, "crew"), eq(spaces.archived, false)))
    .limit(1);
  return row?.roomId ?? null;
}

/** Switch room ids of every space attached to a live event (where the mirror document goes). */
export async function attachedRoomIds(db: Db, communityId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ roomId: spaces.switchRoomId })
    .from(eventSpaces)
    .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
    .innerJoin(events, eq(events.id, eventSpaces.eventId))
    .where(and(eq(spaces.communityId, communityId), eq(spaces.archived, false), ne(events.stage, "wrap")));
  return rows.map((r) => r.roomId);
}

/**
 * Attach a space to an event. A space belongs to one live event at a time, so
 * any other live attachment moves here; an event has one crew room, so a new
 * crew room turns the old one into a members space.
 */
export async function attachSpace(
  db: Db,
  input: { spaceId: string; eventId: string; mode: SpaceMode; role: SpaceRole; by: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const others = await tx
      .select({ id: eventSpaces.id })
      .from(eventSpaces)
      .innerJoin(events, eq(events.id, eventSpaces.eventId))
      .where(and(eq(eventSpaces.spaceId, input.spaceId), ne(eventSpaces.eventId, input.eventId), ne(events.stage, "wrap")));
    if (others.length) await tx.delete(eventSpaces).where(inArray(eventSpaces.id, others.map((o) => o.id)));
    if (input.role === "crew") {
      await tx
        .update(eventSpaces)
        .set({ role: "members", updatedAt: new Date() })
        .where(and(eq(eventSpaces.eventId, input.eventId), eq(eventSpaces.role, "crew"), ne(eventSpaces.spaceId, input.spaceId)));
    }
    await tx
      .insert(eventSpaces)
      .values({ eventId: input.eventId, spaceId: input.spaceId, mode: input.mode, role: input.role, attachedBy: input.by })
      .onConflictDoUpdate({
        target: [eventSpaces.eventId, eventSpaces.spaceId],
        set: { mode: input.mode, role: input.role, attachedBy: input.by, updatedAt: new Date() },
      });
    await tx.update(spaces).set({ state: "known", updatedAt: new Date() }).where(eq(spaces.id, input.spaceId));
  });
}

/** Turn a space Off: detach it from every event. */
export async function detachSpace(db: Db, spaceId: string): Promise<void> {
  await db.delete(eventSpaces).where(eq(eventSpaces.spaceId, spaceId));
  await db.update(spaces).set({ state: "known", updatedAt: new Date() }).where(eq(spaces.id, spaceId));
}

export async function isMuted(db: Db, communityId: string, platform: string | null, username: string): Promise<boolean> {
  // Handles are compared the way Switch folds them, so "@Jo.Ann" on the list mutes jo.ann and jo-ann.
  const rows = await db
    .select({ username: mutedPeople.username, platform: mutedPeople.platform })
    .from(mutedPeople)
    .where(eq(mutedPeople.communityId, communityId));
  return rows.some(
    (r) => sameHandle(r.username, username) && (r.platform === "*" || platform === null || r.platform === platform),
  );
}

export async function isPaused(db: Db, communityId: string): Promise<boolean> {
  const [row] = await db.select({ paused: communities.paused }).from(communities).where(eq(communities.id, communityId)).limit(1);
  return row?.paused ?? false;
}

export interface SeedSpaceRequest {
  eventId: string;
  eventSlug: string;
  room: string;
  mode: SpaceMode;
  role: SpaceRole;
}

/**
 * Attach the spaces an event.yaml names (by room name), but only spaces that
 * are not attached to any live event yet, and only for events whose spaces
 * were not set in Desk. Returns what it did, for the seed report.
 */
export async function applySeedSpaces(db: Db, requests: SeedSpaceRequest[]): Promise<string[]> {
  const done: string[] = [];
  for (const r of requests) {
    const [space] = await db.select().from(spaces).where(eq(spaces.name, r.room)).limit(1);
    if (!space) {
      done.push(`${r.room}: not found (is Ferri in that room?)`);
      continue;
    }
    const [current] = await db
      .select({ eventId: eventSpaces.eventId })
      .from(eventSpaces)
      .innerJoin(events, eq(events.id, eventSpaces.eventId))
      .where(and(eq(eventSpaces.spaceId, space.id), ne(events.stage, "wrap")))
      .limit(1);
    if (current) {
      done.push(`${r.room}: already attached, kept`);
      continue;
    }
    await attachSpace(db, { spaceId: space.id, eventId: r.eventId, mode: r.mode, role: r.role, by: "seed" });
    done.push(`${r.room}: attached to ${r.eventSlug} as ${r.role === "crew" ? "crew room" : r.mode}`);
  }
  return done;
}

/** The two Switch operations discovery needs (a SwitchAgent satisfies this). */
export interface RoomOps {
  op<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
}

/** What `get_room_detail` tells an agent about a room's platform. */
export interface RoomDetail {
  name?: string;
  bridge_id?: string | null;
  bridge_display_name?: string | null;
}

/** Looks up a bridge's type ("slack", "discord", ...) by id, or null when it cannot tell. */
export type BridgeTypeLookup = (bridgeId: string) => Promise<string | null>;

const PLATFORMS = ["mattermost", "slack", "discord", "telegram", "teams", "whatsapp"] as const;

/**
 * The platform of a room: the bridge's type when the Gateway can say, else a
 * platform named in the connection's display name ("Pulse Slack" is slack), else
 * the display name itself. Crew handles and the mute list are keyed by it.
 */
export async function roomPlatform(detail: RoomDetail | null | undefined, lookup?: BridgeTypeLookup): Promise<string | null> {
  if (detail?.bridge_id && lookup) {
    const t = await lookup(detail.bridge_id).catch(() => null);
    if (t) return t.toLowerCase();
  }
  const shown = detail?.bridge_display_name?.toLowerCase().trim();
  if (!shown) return null;
  return PLATFORMS.find((p) => new RegExp(`\\b${p}\\b`).test(shown)) ?? shown;
}

/** A cached `BridgeTypeLookup` over the Gateway's connection list (refreshed on a miss). */
export function bridgeTypesFrom(list: () => Promise<{ bridge_id: string; bridge_type: string }[]>): BridgeTypeLookup {
  let cache = new Map<string, string>();
  return async (id) => {
    if (!cache.has(id)) cache = new Map((await list()).map((b) => [b.bridge_id, b.bridge_type]));
    return cache.get(id) ?? null;
  };
}

/**
 * Ask Switch which rooms Ferri is in (`list_rooms`, then `get_room_detail`
 * for the platform) and record them as spaces. New rooms land in Discovered,
 * Off. `known` caches room details between calls.
 */
export async function discoverSpaces(
  db: Db,
  ops: RoomOps,
  communityId: string,
  known: Map<string, RoomSeen> = new Map(),
  bridgeType?: BridgeTypeLookup,
): Promise<{ added: string[]; archived: number; rooms: number }> {
  const rooms = await ops.op<{ room_id: string; name: string; archived?: boolean }[]>("list_rooms", {});
  const seen: RoomSeen[] = [];
  for (const r of rooms ?? []) {
    if (r.archived) continue;
    let info = known.get(r.room_id);
    if (!info) {
      try {
        const d = await ops.op<RoomDetail>("get_room_detail", { room_id: r.room_id });
        info = { roomId: r.room_id, name: d?.name ?? r.name, platform: await roomPlatform(d, bridgeType) };
      } catch {
        info = { roomId: r.room_id, name: r.name, platform: null };
      }
      known.set(r.room_id, info);
    }
    seen.push(info);
  }
  const res = await syncSpaces(db, communityId, seen);
  return { ...res, rooms: seen.length };
}
