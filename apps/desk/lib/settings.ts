import "server-only";
import { db } from "./db";
import {
  SETTING_INFO,
  SPACE_KEYS,
  changedBy,
  cleanSettings,
  explainSettings,
  settingLevels,
  type FerriSettings,
  type SettingInfo,
  type SettingKey,
  type SettingLevel,
} from "./ferri";

/**
 * Customization (spec 21) in Desk: every setting at one level (community,
 * event or one space), with what that level set, what it inherits and from
 * where, and who changed it.
 */

/** The values Ferri starts with from its environment (the same env Desk reads), under every level. */
export function deskBase(env: Record<string, string | undefined> = process.env): Partial<FerriSettings> {
  const n = (v: string | undefined) => (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);
  const out: Partial<FerriSettings> = {};
  const step = n(env.FERRI_ROOM_GRACE_SECONDS);
  const cap = n(env.FERRI_GUEST_EMAIL_DAILY_CAP);
  if (step !== undefined) out.stepInSeconds = step;
  if (cap !== undefined) out.guestDailyCap = cap;
  return out;
}

export type SettingsLevelName = "community" | "event" | "space";

export interface SettingRow {
  info: SettingInfo;
  /** What this level stores ("" text is a real value; undefined: not set here). */
  own: FerriSettings[SettingKey] | undefined;
  /** What applies here without this level's own value, and where it comes from. */
  inherited: { value: FerriSettings[SettingKey]; from: SettingLevel };
  /** Who set this level's value, and when. */
  by: { by: string; at: string } | null;
}

const ABOVE: Record<SettingsLevelName, ("community" | "event" | "space")[]> = {
  community: [],
  event: ["community"],
  space: ["community", "event"],
};

/** The rows of a settings form for one level. */
export async function settingRows(level: SettingsLevelName, scope: { communityId: string; eventId?: string | null; spaceId?: string | null }): Promise<SettingRow[]> {
  const raw = await settingLevels(db(), scope);
  const mine = raw[level];
  const own = cleanSettings(mine, level === "space" ? SPACE_KEYS : undefined);
  const by = changedBy(mine);
  // What applies from the levels above (and the env base, and the defaults).
  const above = explainSettings({
    base: deskBase(),
    community: ABOVE[level].includes("community") ? raw.community : null,
    event: ABOVE[level].includes("event") ? raw.event : null,
  });
  return SETTING_INFO.filter((i) => level !== "space" || SPACE_KEYS.includes(i.key)).map((info) => ({
    info,
    own: own[info.key],
    inherited: { value: above[info.key].value, from: above[info.key].from },
    by: info.key in own ? (by[info.key] ?? null) : null,
  }));
}

export const LEVEL_LABEL: Record<SettingLevel, string> = {
  default: "default",
  env: "Ferri's environment",
  community: "community",
  event: "event",
  space: "space",
};
