import { and, eq } from "drizzle-orm";
import { communities, eventSpaces, events, type Db } from "@ferri/db";

/**
 * Customization (spec 21): the settings a community changes for itself, an
 * event or one space. Each level stores only the keys it changed; the
 * effective value is the default, then the community, then the event, then
 * (tone and language only) the space. Safety rules are not settings: the
 * citation check, the cards and the pause stay in code.
 */
export interface FerriSettings {
  /** A preset (warm, playful, professional, brief) or the crew's own words; "" keeps the persona's default. */
  tone: string;
  /** "" matches the person's language (the default); else a language name ("Hindi"). */
  language: string;
  /** How long Ferri waits before answering a question said to the room, so a person can answer first. */
  stepInSeconds: number;
  /** The card ladder's T: nudge at T, escalate at 2T (during Live, and before it). */
  ladderLiveMinutes: number;
  ladderBeforeMinutes: number;
  /** Care (spec 16): read members' mood at all. */
  care: "on" | "off";
  /** When technical cases go to the Builder without a tap: during Live (the default), at any stage, or never. */
  autoHelp: "live" | "always" | "never";
  checkInLiveMinutes: number;
  checkInBeforeMinutes: number;
  /** RSVP (spec 17): Ferri's own day-before reminder (hours before the start; 0 = off), the free-your-spot nudge (days before; 0 = off), the daily cap. */
  guestReminderHours: number;
  guestNudgeDays: number;
  guestDailyCap: number;
  /** Wrap (spec 19): Ferri moves the event to Wrap and proposes the recap and close itself, this long after the end. */
  autoWrap: boolean;
  wrapAfterMinutes: number;
  /** Crew room watchers: decisions to announce (spec 09) and the living plan (spec 08). */
  decisionWatcher: boolean;
  planReader: boolean;
}

export const DEFAULT_SETTINGS: FerriSettings = {
  tone: "",
  language: "",
  stepInSeconds: 20,
  ladderLiveMinutes: 10,
  ladderBeforeMinutes: 120,
  care: "on",
  autoHelp: "live",
  checkInLiveMinutes: 30,
  checkInBeforeMinutes: 240,
  guestReminderHours: 30,
  guestNudgeDays: 3,
  guestDailyCap: 80,
  autoWrap: true,
  wrapAfterMinutes: 60,
  decisionWatcher: true,
  planReader: true,
};

export type SettingKey = keyof FerriSettings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as [SettingKey, ...SettingKey[]];
/** The keys a single space can set for itself. */
export const SPACE_KEYS: SettingKey[] = ["tone", "language"];

export interface SettingInfo {
  key: SettingKey;
  label: string;
  help: string;
  type: "text" | "number" | "bool" | "choice";
  choices?: string[];
  min?: number;
  max?: number;
}

export const SETTING_INFO: SettingInfo[] = [
  { key: "tone", label: "Tone", help: "warm, playful, professional, brief, or your own words. Empty keeps Ferri's default voice.", type: "text" },
  { key: "language", label: "Language", help: "Empty: Ferri answers in the language each person writes in. Or a language name, like Hindi.", type: "text" },
  { key: "stepInSeconds", label: "Wait before stepping in (seconds)", help: "For a question said to the room, so a person can answer first.", type: "number", min: 0, max: 600 },
  { key: "ladderLiveMinutes", label: "Card nudge during Live (minutes)", help: "Nudge the owner after this, the whole crew after twice this.", type: "number", min: 1, max: 720 },
  { key: "ladderBeforeMinutes", label: "Card nudge before Live (minutes)", help: "The same ladder before the event.", type: "number", min: 1, max: 1440 },
  { key: "care", label: "Care", help: "Read members' mood and open cases for people who need someone.", type: "choice", choices: ["on", "off"] },
  { key: "autoHelp", label: "Builder helps without a tap", help: "live: during Live in Auto spaces; always: at any stage; never: only on the crew's tap.", type: "choice", choices: ["live", "always", "never"] },
  { key: "checkInLiveMinutes", label: "Case check-in during Live (minutes)", help: "A case with no news gets a line in the crew room after this.", type: "number", min: 5, max: 720 },
  { key: "checkInBeforeMinutes", label: "Case check-in before Live (minutes)", help: "The same before the event.", type: "number", min: 5, max: 2880 },
  { key: "guestReminderHours", label: "Day-before reminder (hours before)", help: "Ferri proposes the guest reminder this long before the start. 0 turns it off.", type: "number", min: 0, max: 240 },
  { key: "guestNudgeDays", label: "Free-your-spot nudge (days before)", help: "When there is a waitlist. 0 turns it off.", type: "number", min: 0, max: 30 },
  { key: "guestDailyCap", label: "Guest emails per day", help: "A bigger send goes out in daily parts.", type: "number", min: 1, max: 5000 },
  { key: "autoWrap", label: "Wrap by itself", help: "After the end, Ferri moves the event to Wrap and proposes the recap and closing.", type: "bool" },
  { key: "wrapAfterMinutes", label: "Wrap after the end (minutes)", help: "How long after the end.", type: "number", min: 0, max: 10080 },
  { key: "decisionWatcher", label: "Offer announcements from crew decisions", help: "Ferri watches the crew room for decisions members should hear about.", type: "bool" },
  { key: "planReader", label: "Keep the living plan from crew chat", help: "Ferri reads the crew room into the event plan.", type: "bool" },
];

/** Tone presets: the words Ferri is given for each. Anything else is the crew's own description. */
export const TONE_PRESETS: Record<string, string> = {
  warm: "Warm and friendly, like a helpful teammate. Short sentences.",
  playful: "Playful and upbeat, with light humour and the odd emoji, never at anyone's expense. Still short and clear.",
  professional: "Professional and polite, no slang, no emoji. Clear and complete.",
  brief: "As brief as possible: the answer in one sentence, no greeting, no filler.",
};

/** Keep only known keys with valid values (what Desk, chat or a stored row may hold). */
export function cleanSettings(raw: unknown, only?: SettingKey[]): Partial<FerriSettings> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object") return out as Partial<FerriSettings>;
  const src = raw as Record<string, unknown>;
  for (const info of SETTING_INFO) {
    if (only && !only.includes(info.key)) continue;
    if (!(info.key in src)) continue;
    const v = parseSetting(info.key, src[info.key]);
    if (v !== undefined) out[info.key] = v;
  }
  return out as Partial<FerriSettings>;
}

/** One value from text or JSON, or undefined when it is not valid for the key. */
export function parseSetting(key: SettingKey, value: unknown): FerriSettings[SettingKey] | undefined {
  const info = SETTING_INFO.find((s) => s.key === key);
  if (!info) return undefined;
  if (info.type === "text") return typeof value === "string" ? value.trim().slice(0, 400) : undefined;
  if (info.type === "bool") {
    if (typeof value === "boolean") return value;
    const t = String(value ?? "").trim().toLowerCase();
    if (["on", "true", "yes", "1"].includes(t)) return true;
    if (["off", "false", "no", "0"].includes(t)) return false;
    return undefined;
  }
  if (info.type === "choice") {
    const t = String(value ?? "").trim().toLowerCase();
    return info.choices!.includes(t) ? (t as FerriSettings[SettingKey]) : undefined;
  }
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  if ((info.min !== undefined && r < info.min) || (info.max !== undefined && r > info.max)) return undefined;
  return r;
}

/** The effective settings: defaults, then each level's changes in order. `base` overrides the defaults (env, tests). */
export function effectiveSettings(levels: {
  base?: Partial<FerriSettings>;
  community?: unknown;
  event?: unknown;
  space?: unknown;
}): FerriSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(levels.base ?? {}),
    ...cleanSettings(levels.community),
    ...cleanSettings(levels.event),
    ...cleanSettings(levels.space, SPACE_KEYS),
  };
}

/** The settings that apply in one place, read fresh from the database. */
export async function settingsFor(
  db: Db,
  scope: { communityId: string; eventId?: string | null; spaceId?: string | null },
  base?: Partial<FerriSettings>,
): Promise<FerriSettings> {
  const [c] = await db.select({ settings: communities.settings }).from(communities).where(eq(communities.id, scope.communityId)).limit(1);
  let ev: unknown = null;
  let sp: unknown = null;
  if (scope.eventId) {
    const [e] = await db.select({ settings: events.settings }).from(events).where(eq(events.id, scope.eventId)).limit(1);
    ev = e?.settings ?? null;
    if (scope.spaceId) {
      const [a] = await db
        .select({ settings: eventSpaces.settings })
        .from(eventSpaces)
        .where(and(eq(eventSpaces.spaceId, scope.spaceId), eq(eventSpaces.eventId, scope.eventId)))
        .limit(1);
      sp = a?.settings ?? null;
    }
  }
  return effectiveSettings({ base, community: c?.settings, event: ev, space: sp });
}

/**
 * The voice block that goes after the skills in every prompt that writes for
 * people (answers, announcements, emails). Empty when nothing was changed.
 */
export function voiceBlock(s: Pick<FerriSettings, "tone" | "language">): string {
  const lines: string[] = [];
  const tone = s.tone.trim();
  if (tone) lines.push(`Tone: ${TONE_PRESETS[tone.toLowerCase()] ?? tone}`);
  const lang = s.language.trim();
  if (lang) lines.push(`Language: write in ${lang}, whatever language the person used, unless they ask for another one. Names, links, times and codes stay exactly as written.`);
  if (!lines.length) return "";
  return `## The crew's settings for this place (they come before the style rules above)\n${lines.join("\n")}`;
}

/** "Source" in a few common languages, for the line Ferri adds under an answer. */
const SOURCE_LABELS: Record<string, [string, string]> = {
  hindi: ["स्रोत", "स्रोत"],
  kannada: ["ಮೂಲ", "ಮೂಲಗಳು"],
  tamil: ["ஆதாரம்", "ஆதாரங்கள்"],
  telugu: ["మూలం", "మూలాలు"],
  marathi: ["स्रोत", "स्रोत"],
  bengali: ["উৎস", "উৎস"],
  spanish: ["Fuente", "Fuentes"],
  french: ["Source", "Sources"],
  german: ["Quelle", "Quellen"],
  portuguese: ["Fonte", "Fontes"],
};

/** The source label for a language setting ("" or unknown: English). */
export function sourceLabel(language: string, many: boolean): string {
  const pair = SOURCE_LABELS[language.trim().toLowerCase()];
  return pair ? pair[many ? 1 : 0] : many ? "Sources" : "Source";
}

/** One line per changed setting, for "@ferri what are the settings?" and Desk. */
export function describeSettings(s: FerriSettings): string[] {
  return SETTING_INFO.filter((i) => s[i.key] !== DEFAULT_SETTINGS[i.key]).map((i) => `${i.label}: ${showValue(i.key, s[i.key])}`);
}

// ── Who changed what, and writing a level ─────────────────────────────────

/**
 * Inside each level's jsonb, `_by` records who last set each key and when
 * (`{ "_by": { "tone": { "by": "Rudra", "at": "2026-11-06T..." } } }`).
 * `cleanSettings` only reads known keys, so `_by` never becomes a setting.
 */
export const SETTINGS_BY_KEY = "_by";

export interface SettingChange {
  by: string;
  at: string;
}

export type SettingLevel = "default" | "env" | "community" | "event" | "space";

/** Who last changed each key of one level's jsonb. */
export function changedBy(raw: unknown): Partial<Record<SettingKey, SettingChange>> {
  if (!raw || typeof raw !== "object") return {};
  const by = (raw as Record<string, unknown>)[SETTINGS_BY_KEY];
  if (!by || typeof by !== "object") return {};
  const out: Partial<Record<SettingKey, SettingChange>> = {};
  for (const [k, v] of Object.entries(by as Record<string, unknown>)) {
    if (!SETTING_KEYS.includes(k as SettingKey) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.by === "string") out[k as SettingKey] = { by: o.by, at: typeof o.at === "string" ? o.at : "" };
  }
  return out;
}

/**
 * One level's jsonb after a change: `set` adds or replaces keys (already
 * valid values), `remove` deletes keys (a reset to the level above). Unknown
 * keys are dropped, and `_by` follows the keys.
 */
export function applySettingChange(
  raw: unknown,
  change: { set?: Partial<FerriSettings>; remove?: SettingKey[]; by: string; at?: Date },
): Record<string, unknown> {
  const kept = cleanSettings(raw) as Record<string, unknown>;
  const by = changedBy(raw) as Record<string, SettingChange>;
  const at = (change.at ?? new Date()).toISOString();
  for (const k of change.remove ?? []) {
    delete kept[k];
    delete by[k];
  }
  for (const [k, v] of Object.entries(change.set ?? {})) {
    if (!SETTING_KEYS.includes(k as SettingKey) || v === undefined) continue;
    kept[k] = v;
    by[k] = { by: change.by, at };
  }
  return Object.keys(by).length ? { ...kept, [SETTINGS_BY_KEY]: by } : kept;
}

/** Each key's effective value and the level it comes from (for Desk and "what are the settings?"). */
export function explainSettings(levels: {
  base?: Partial<FerriSettings>;
  community?: unknown;
  event?: unknown;
  space?: unknown;
}): Record<SettingKey, { value: FerriSettings[SettingKey]; from: SettingLevel; by: SettingChange | null }> {
  const steps: { level: SettingLevel; values: Partial<FerriSettings>; by: Partial<Record<SettingKey, SettingChange>> }[] = [
    { level: "env", values: levels.base ?? {}, by: {} },
    { level: "community", values: cleanSettings(levels.community), by: changedBy(levels.community) },
    { level: "event", values: cleanSettings(levels.event), by: changedBy(levels.event) },
    { level: "space", values: cleanSettings(levels.space, SPACE_KEYS), by: changedBy(levels.space) },
  ];
  const out = {} as Record<SettingKey, { value: FerriSettings[SettingKey]; from: SettingLevel; by: SettingChange | null }>;
  for (const key of SETTING_KEYS) {
    let cur: { value: FerriSettings[SettingKey]; from: SettingLevel; by: SettingChange | null } = { value: DEFAULT_SETTINGS[key], from: "default", by: null };
    for (const s of steps) {
      if (key in s.values && s.values[key] !== undefined) {
        // The env base only counts when it differs from the default (FERRI_ROOM_GRACE_SECONDS in tests).
        if (s.level === "env" && s.values[key] === DEFAULT_SETTINGS[key]) continue;
        cur = { value: s.values[key] as FerriSettings[SettingKey], from: s.level, by: s.by[key] ?? null };
      }
    }
    out[key] = cur;
  }
  return out;
}

/** A value as people read it: "on"/"off" for switches, "(each person's own)" for an empty language. */
export function showValue(key: SettingKey, value: unknown): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (key === "language" && !String(value ?? "").trim()) return "each person's own language";
  if (key === "tone" && !String(value ?? "").trim()) return "Ferri's default";
  return String(value);
}

/** A crew member's words for a value, tidied: "hindi" is "Hindi", "Playful" is the preset "playful". */
export function normalizeSettingInput(key: SettingKey, value: string): string {
  const v = value.trim().replace(/^["“']|["”']$/g, "").trim();
  if (key === "language") {
    if (/^(default|none|auto|any|match|each person'?s? own( language)?|their own( language)?|whatever they write)$/i.test(v)) return "";
    return v.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  }
  if (key === "tone") return TONE_PRESETS[v.toLowerCase()] ? v.toLowerCase() : /^(default|normal|none)$/i.test(v) ? "" : v;
  if (key === "stepInSeconds") {
    const m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)$/i.exec(v);
    if (m) return String(Math.round(Number(m[1]) * 60));
    if (/^(a|one) minute$/i.test(v)) return "60";
    return v.replace(/\s*(s|sec|secs|second|seconds)$/i, "");
  }
  return v;
}

/** Where a setting is changed: the row and its level. */
export type SettingsTarget =
  | { level: "community"; communityId: string }
  | { level: "event"; eventId: string }
  | { level: "space"; eventId: string; spaceId: string };

/** Change one level's settings in the database (only the changed keys are stored). Returns the jsonb before and after. */
export async function writeSettings(
  db: Db,
  target: SettingsTarget,
  change: { set?: Partial<FerriSettings>; remove?: SettingKey[]; by: string },
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> } | null> {
  return db.transaction(async (tx) => {
    if (target.level === "community") {
      const [row] = await tx.select({ settings: communities.settings }).from(communities).where(eq(communities.id, target.communityId)).for("update");
      if (!row) return null;
      const after = applySettingChange(row.settings, change);
      await tx.update(communities).set({ settings: after, updatedAt: new Date() }).where(eq(communities.id, target.communityId));
      return { before: row.settings ?? {}, after };
    }
    if (target.level === "event") {
      const [row] = await tx.select({ settings: events.settings }).from(events).where(eq(events.id, target.eventId)).for("update");
      if (!row) return null;
      const after = applySettingChange(row.settings, change);
      await tx.update(events).set({ settings: after, updatedAt: new Date() }).where(eq(events.id, target.eventId));
      return { before: row.settings ?? {}, after };
    }
    const only = { ...change, set: cleanSettings(change.set ?? {}, SPACE_KEYS), remove: (change.remove ?? []).filter((k) => SPACE_KEYS.includes(k)) };
    const where = and(eq(eventSpaces.eventId, target.eventId), eq(eventSpaces.spaceId, target.spaceId));
    const [row] = await tx.select({ settings: eventSpaces.settings }).from(eventSpaces).where(where).for("update");
    if (!row) return null;
    const after = applySettingChange(row.settings, only);
    await tx.update(eventSpaces).set({ settings: after, updatedAt: new Date() }).where(where);
    return { before: row.settings ?? {}, after };
  });
}

/** The raw settings of each level for one place, for `explainSettings`. */
export async function settingLevels(
  db: Db,
  scope: { communityId: string; eventId?: string | null; spaceId?: string | null },
): Promise<{ community: unknown; event: unknown; space: unknown }> {
  const [c] = await db.select({ settings: communities.settings }).from(communities).where(eq(communities.id, scope.communityId)).limit(1);
  let ev: unknown = null;
  let sp: unknown = null;
  if (scope.eventId) {
    const [e] = await db.select({ settings: events.settings }).from(events).where(eq(events.id, scope.eventId)).limit(1);
    ev = e?.settings ?? null;
    if (scope.spaceId) {
      const [a] = await db
        .select({ settings: eventSpaces.settings })
        .from(eventSpaces)
        .where(and(eq(eventSpaces.spaceId, scope.spaceId), eq(eventSpaces.eventId, scope.eventId)))
        .limit(1);
      sp = a?.settings ?? null;
    }
  }
  return { community: c?.settings ?? null, event: ev, space: sp };
}

// ── Naming a space in chat ("the WhatsApp group", "Discord") ──────────────

const PLATFORM_WORDS: [RegExp, string[]][] = [
  [/whats\s?app/i, ["whatsapp", "whatsapp_web"]],
  [/discord/i, ["discord"]],
  [/slack/i, ["slack"]],
  [/telegram/i, ["telegram"]],
  [/mattermost/i, ["mattermost"]],
  [/\bteams\b/i, ["teams"]],
];

const NAME_STOP = new Set(["the", "a", "an", "in", "on", "group", "channel", "chat", "space", "room", "server", "our", "my", "for", "of"]);

/**
 * The space a crew member means, among the spaces they could mean (for
 * example an event's attached spaces). A platform word narrows by platform;
 * words of the space's own name pick among the rest. `match` is null when
 * nothing fits or several fit equally (`candidates` then lists them).
 */
export function matchSpace<T extends { name: string; platform: string | null; role?: string }>(text: string, spacesIn: T[]): { match: T | null; candidates: T[] } {
  const t = text.trim();
  if (!t || !spacesIn.length) return { match: null, candidates: [] };
  let pool = spacesIn;
  const platform = PLATFORM_WORDS.find(([re]) => re.test(t));
  if (platform) pool = pool.filter((s) => s.platform && platform[1].includes(s.platform.toLowerCase()));
  // Words of the platform itself do not count as name words.
  const words = t
    .toLowerCase()
    .replace(/whats\s?app|discord|slack|telegram|mattermost/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !NAME_STOP.has(w));
  const score = (s: T) => {
    const name = s.name.toLowerCase();
    return words.filter((w) => name.includes(w)).length;
  };
  if (!platform && !words.length) return { match: null, candidates: spacesIn };
  const scored = pool.map((s) => ({ s, n: score(s) }));
  const best = Math.max(0, ...scored.map((x) => x.n));
  let top = best > 0 ? scored.filter((x) => x.n === best).map((x) => x.s) : platform ? pool : [];
  // Members spaces before the crew room when a platform has both.
  if (top.length > 1) {
    const members = top.filter((s) => s.role !== "crew");
    if (members.length >= 1) top = members;
  }
  return top.length === 1 ? { match: top[0]!, candidates: top } : { match: null, candidates: top.length ? top : pool };
}
