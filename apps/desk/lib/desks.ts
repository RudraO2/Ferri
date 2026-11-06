import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  DESK_KINDS,
  PACK_TYPES,
  deskRowCounts,
  deskRowsOf,
  cards,
  deskSkillKey,
  desksForEvent,
  eventSpaces,
  events,
  loadDeskSkill,
  loadPack,
  skillsDirFrom,
  spaces,
  type Desk,
  type DeskPack,
  type DeskRow,
  type DeskSkill,
} from "./ferri";

// ── Desks (spec 20): rooms with a desk skill, per event ───────────────────

export const skillsDir = () => skillsDirFrom();

/** Desk's requests go to Ferri's tick through `desks.source_message_id`. Keep in step with apps/ferri/src/desks.ts. */
export const DESK_REQUEST_PREFIX = "desk:";
export const DESK_PACK_PREFIX = "desk-pack:";

export const DESK_PLATFORMS: { value: string; label: string }[] = [
  { value: "", label: "Where the crew room is" },
  { value: "mattermost", label: "Mattermost" },
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp_web", label: "WhatsApp" },
];

export const DESK_STATUS_LABEL: Record<string, string> = {
  planned: "waiting",
  created: "live",
  failed: "failed",
  dismissed: "not made",
  removed: "removed",
};

export interface DeskView extends Desk {
  skill: DeskSkill | null;
  skillError: string | null;
  skillEdited: boolean;
  skillText: string | null;
  mode: string | null;
  rowCount: number;
  rows: DeskRow[];
}

/** A shipped desk kind's skill as the community runs it. */
export async function kindSkill(communityId: string, kind: string): Promise<DeskSkill | null> {
  const s = await loadDeskSkill(db(), skillsDir(), communityId, deskSkillKey(kind));
  return s && "skill" in s ? s.skill : null;
}

export async function kindSkills(communityId: string): Promise<{ kind: string; skill: DeskSkill | null }[]> {
  return Promise.all(DESK_KINDS.map(async (kind) => ({ kind, skill: await kindSkill(communityId, kind) })));
}

/** Every pack with the skills of its desks, for the preview. */
export async function packPreviews(communityId: string): Promise<{ type: string; pack: DeskPack | null; error: string | null; desks: { kind: string; skill: DeskSkill | null }[] }[]> {
  return Promise.all(
    PACK_TYPES.map(async (type) => {
      const p = await loadPack(db(), skillsDir(), communityId, type);
      if (!p || "error" in p) return { type, pack: null, error: p ? p.error : "missing", desks: [] };
      const desks = await Promise.all(p.pack.desks.map(async (kind) => ({ kind, skill: await kindSkill(communityId, kind) })));
      return { type, pack: p.pack, error: null, desks };
    }),
  );
}

/** The event's desks with their skill, mode and sheet rows (the latest 200). */
export async function eventDesks(communityId: string, eventId: string): Promise<DeskView[]> {
  const list = (await desksForEvent(db(), communityId, eventId, { all: true })).filter((d) => d.status !== "dismissed").reverse();
  const counts = await deskRowCounts(db(), list.map((d) => d.id));
  const spaceIds = list.map((d) => d.spaceId).filter((s): s is string => !!s);
  const modes = spaceIds.length
    ? await db()
        .select({ spaceId: eventSpaces.spaceId, mode: eventSpaces.mode })
        .from(eventSpaces)
        .where(and(eq(eventSpaces.eventId, eventId), inArray(eventSpaces.spaceId, spaceIds)))
    : [];
  const modeOf = new Map(modes.map((m) => [m.spaceId, m.mode as string]));
  return Promise.all(
    list.map(async (d) => {
      const s = await loadDeskSkill(db(), skillsDir(), communityId, d.skillKey);
      const rows = d.status === "created" && s && "skill" in s && s.skill.sheet ? (await deskRowsOf(db(), d.id)).slice(-200) : [];
      return {
        ...d,
        skill: s && "skill" in s ? s.skill : null,
        skillError: s ? ("error" in s ? s.error : null) : "the skill is missing",
        skillEdited: !!(s && "skill" in s && s.edited),
        skillText: s && "text" in s ? s.text : null,
        mode: d.spaceId ? (modeOf.get(d.spaceId) ?? null) : null,
        rowCount: counts.get(d.id) ?? 0,
        rows,
      };
    }),
  );
}

/** Members spaces of the event that are not a desk yet (to turn one into a desk). */
export async function spacesForDesk(communityId: string, eventId: string) {
  const rows = await db()
    .select({ id: spaces.id, name: spaces.name, platform: spaces.platform, roomId: spaces.switchRoomId, mode: eventSpaces.mode })
    .from(eventSpaces)
    .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
    .innerJoin(events, eq(events.id, eventSpaces.eventId))
    .where(and(eq(eventSpaces.eventId, eventId), eq(eventSpaces.role, "members"), eq(spaces.archived, false), eq(spaces.communityId, communityId), isNull(events.closedAt)))
    .orderBy(asc(spaces.name));
  const live = (await desksForEvent(db(), communityId, eventId)).filter((d) => d.status === "created" && d.spaceId);
  const taken = new Set(live.map((d) => d.spaceId));
  return rows.filter((r) => !taken.has(r.id));
}

/** Open desk cards of the event (packs and custom desks waiting for an OK). */
export async function openDeskCards(communityId: string, eventId: string) {
  return db()
    .select()
    .from(cards)
    .where(and(eq(cards.communityId, communityId), eq(cards.eventId, eventId), eq(cards.kind, "desk"), eq(cards.status, "open")))
    .orderBy(asc(cards.createdAt));
}

/** "Mattermost: volunteer-desk" is "volunteer-desk". */
export const shortRoomName = (name: string) => (name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name);

export const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v));
