import { and, eq, isNull } from "drizzle-orm";
import { eventSpaces, events, spaces, type Db } from "@ferri/db";
import {
  SETTING_INFO,
  SPACE_KEYS,
  cleanSettings,
  explainSettings,
  matchSpace,
  normalizeSettingInput,
  parseSetting,
  settingLevels,
  showValue,
  spaceLabel,
  writeSettings,
  type FerriSettings,
  type SettingKey,
  type SettingLevel,
  type SettingsTarget,
} from "@ferri/knowledge";
import { config } from "./config.ts";
import type { CrewAsk } from "./crew-ask.ts";
import type { RoomInfo } from "./loop.ts";
import { envSettings, type Prompts } from "./prompts.ts";

export interface SettingsDeps {
  db: Db;
  prompts: Prompts;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

interface EventRef {
  id: string;
  name: string;
}

interface SpaceRef {
  spaceId: string;
  eventId: string;
  eventName: string;
  name: string;
  platform: string | null;
  role: string;
  settings: Record<string, unknown>;
}

/** Where a change goes, with the words for it. */
interface Place {
  target: SettingsTarget;
  /** "for the whole community", "for Build Night", "in WhatsApp Lantern Build Night". */
  where: string;
  /** How to name it in an undo line ("for Build Night", "in the WhatsApp group"). */
  say: string;
  /** Where Desk shows it. */
  desk: string;
  scope: { communityId: string; eventId: string | null; spaceId: string | null };
}

const LEVEL_WORDS: Record<SettingLevel, string> = {
  default: "the default",
  env: "Ferri's start-up setting",
  community: "the community's setting",
  event: "the event's setting",
  space: "this space's setting",
};

const infoOf = (key: SettingKey) => SETTING_INFO.find((i) => i.key === key)!;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Customization (spec 21) from chat: "@ferri reply in Hindi in the WhatsApp
 * group", "@ferri be more playful on Discord", "@ferri turn off care for
 * Build Night", "@ferri what are the settings?". Inside only and reversible,
 * so it changes at once (no card) and says how to undo it. Who changed what
 * is kept in the level's jsonb under `_by` (Desk shows it).
 */
export function createSettings(deps: SettingsDeps) {
  const { db, log } = deps;

  async function liveEvents(communityId: string): Promise<(EventRef & { slug: string })[]> {
    return db.select({ id: events.id, name: events.name, slug: events.slug }).from(events).where(and(eq(events.communityId, communityId), isNull(events.closedAt)));
  }

  /** The event they named in the message ("Build Night" for "Lantern Build Night"), else the room's event. */
  async function eventFor(ask: CrewAsk): Promise<EventRef | null> {
    const all = await liveEvents(ask.communityId);
    const body = ` ${ask.body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    const forms = (e: { name: string; slug: string }) => {
      const words = e.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
      const out = [words.join(" "), e.slug.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()];
      // The community's own name often leads ("Lantern Build Night"): people say "Build Night".
      if (words.length >= 3) out.push(words.slice(1).join(" "));
      return out.filter((f) => f.length >= 4);
    };
    const hits = all
      .map((e) => ({ e, n: Math.max(0, ...forms(e).filter((f) => body.includes(` ${f} `)).map((f) => f.length)) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    if (hits[0]) return hits[0].e;
    return all.find((e) => e.id === ask.eventId) ?? null;
  }

  /** Attached spaces of an event (or of every open event when there is none). */
  async function spacesFor(communityId: string, eventId: string | null): Promise<SpaceRef[]> {
    const rows = await db
      .select({
        spaceId: spaces.id,
        eventId: eventSpaces.eventId,
        eventName: events.name,
        name: spaces.name,
        platform: spaces.platform,
        role: eventSpaces.role,
        settings: eventSpaces.settings,
      })
      .from(eventSpaces)
      .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
      .innerJoin(events, eq(events.id, eventSpaces.eventId))
      .where(and(eq(spaces.communityId, communityId), eq(spaces.archived, false), isNull(events.closedAt), eventId ? eq(eventSpaces.eventId, eventId) : undefined));
    return rows.map((r) => ({ ...r, role: String(r.role), settings: r.settings ?? {} }));
  }

  /** Resolve the place a change is for. A string is the question to ask back. */
  async function placeFor(ask: CrewAsk, key: SettingKey | ""): Promise<Place | string> {
    const s = ask.intent.settings;
    const community = { target: { level: "community", communityId: ask.communityId } as SettingsTarget, where: "for the whole community", say: "for the community", desk: "Desk › Community › Settings", scope: { communityId: ask.communityId, eventId: null, spaceId: null } };
    if (s.scope === "community") return community;
    const ev = await eventFor(ask);
    if (s.scope === "space") {
      const list = await spacesFor(ask.communityId, ev?.id ?? null);
      const { match, candidates } = matchSpace(s.space || ask.body, list);
      if (!match) {
        const names = (candidates.length ? candidates : list).map((c) => spaceLabel(c));
        if (!names.length) return "There are no spaces attached to an event yet, so there is no space to set that for. Attach spaces in Desk first.";
        return `Which space do you mean? I can set it for ${names.slice(0, 8).join(", ")}${names.length > 8 ? ", ..." : ""}.`;
      }
      const label = spaceLabel(match);
      if (key && !SPACE_KEYS.includes(key)) {
        // Only tone and language are per space: the rest goes to the space's event.
        return {
          target: { level: "event", eventId: match.eventId },
          where: `for ${match.eventName} (only tone and language can differ per space, so this is for the whole event)`,
          say: `for ${match.eventName}`,
          desk: `Desk › Events › ${match.eventName} › Settings`,
          scope: { communityId: ask.communityId, eventId: match.eventId, spaceId: null },
        };
      }
      return {
        target: { level: "space", eventId: match.eventId, spaceId: match.spaceId },
        where: `in ${label}`,
        say: `in ${s.space.trim().replace(/^(in|on|for)\s+/i, "") || label}`,
        desk: "Desk › Spaces",
        scope: { communityId: ask.communityId, eventId: match.eventId, spaceId: match.spaceId },
      };
    }
    if (!ev) return "This room is not part of an event. Say which event (\"for Build Night\"), or say \"for the community\".";
    return {
      target: { level: "event", eventId: ev.id },
      where: `for ${ev.name}`,
      say: `for ${ev.name}`,
      desk: `Desk › Events › ${ev.name} › Settings`,
      scope: { communityId: ask.communityId, eventId: ev.id, spaceId: null },
    };
  }

  async function explainAt(scope: Place["scope"]) {
    return explainSettings({ base: envSettings(), ...(await settingLevels(db, scope)) });
  }

  /** What a value does, in a few words, for the reply. */
  function effect(key: SettingKey, value: FerriSettings[SettingKey]): string {
    switch (key) {
      case "language":
        return value ? `I answer there in ${value}, with the source line too.` : "I answer each person in the language they write in.";
      case "tone":
        return value ? "Answers, announcements and emails use that voice from the next one." : "I'm back to my usual voice.";
      case "stepInSeconds":
        return `For a question said to the room, I wait ${value} seconds so a person can answer first.`;
      case "ladderLiveMinutes":
      case "ladderBeforeMinutes":
        return `New cards nudge their owner after ${value} minutes and the whole crew after ${Number(value) * 2}.`;
      case "care":
        return value === "off" ? "I stop reading members' mood and open no new cases. Open cases stay open." : "I read members' mood again and open cases for people who need someone.";
      case "autoHelp":
        return value === "never" ? "The Builder helps stuck members only when you tap Send the Builder." : value === "always" ? "The Builder helps stuck members in Auto spaces at any stage, without a tap." : "The Builder helps stuck members without a tap during Live, in Auto spaces.";
      case "guestReminderHours":
        return value ? `I propose the guest reminder ${value} hours before the start.` : "I won't propose the guest reminder myself.";
      case "guestNudgeDays":
        return value ? `I propose the free-your-spot nudge ${value} days before, when there's a waitlist.` : "I won't propose the free-your-spot nudge myself.";
      case "decisionWatcher":
        return value ? "I offer announcements for decisions I spot in the crew room." : "I stop offering announcements from crew chat. Ask me with @ferri announce ... instead.";
      case "planReader":
        return value ? "I keep the living plan from crew chat." : "I stop reading crew chat into the plan. Add items with @ferri add to the plan ...";
      default:
        return "";
    }
  }

  async function set(ask: CrewAsk): Promise<string> {
    const s = ask.intent.settings;
    const name = ask.member.name;
    if (!s.key) return `Which setting, ${name}? I can change: ${SETTING_INFO.map((i) => lower(i.label)).join("; ")}.`;
    const key = s.key as SettingKey;
    const info = infoOf(key);
    const raw = normalizeSettingInput(key, s.value);
    const value = parseSetting(key, raw);
    if (value === undefined) {
      const allowed =
        info.type === "choice"
          ? `one of ${info.choices!.join(", ")}`
          : info.type === "bool"
            ? "on or off"
            : info.type === "number"
              ? `a number from ${info.min ?? 0} to ${info.max ?? "any"}`
              : "some text";
      return `I could not use “${s.value}” for ${lower(info.label)}: it needs ${allowed}. ${info.help}`;
    }
    const place = await placeFor(ask, key);
    if (typeof place === "string") return place;
    const before = (await explainAt(place.scope))[key];
    const done = await writeSettings(db, place.target, { set: { [key]: value } as Partial<FerriSettings>, by: name });
    if (!done) return "I could not find where to save that. Is the space still attached to the event?";
    const after = (await explainAt(place.scope))[key];
    log(`settings: ${name} set ${key}=${JSON.stringify(value)} ${place.where}`);
    const was = before.value === value ? " (it already was)" : ` (was ${showValue(key, before.value)})`;
    const shadow =
      after.value !== value ? ` Note: ${LEVEL_WORDS[after.from]} (${showValue(key, after.value)}) still wins there.` : "";
    return (
      `Done, ${name}: ${lower(info.label)} ${place.where} is now ${showValue(key, value)}${was}. ${effect(key, value)}${shadow}` +
      ` To undo, say “@${config.agentName} reset the ${lower(info.label)} ${place.say}”, or change it in ${place.desk}.`
    ).replace(/\s+/g, " ");
  }

  async function reset(ask: CrewAsk): Promise<string> {
    const s = ask.intent.settings;
    const name = ask.member.name;
    const key = (s.key || "") as SettingKey | "";
    const place = await placeFor(ask, key);
    if (typeof place === "string") return place;
    const keys: SettingKey[] = key ? [key] : place.target.level === "space" ? SPACE_KEYS : (SETTING_INFO.map((i) => i.key) as SettingKey[]);
    const before = await explainAt(place.scope);
    const done = await writeSettings(db, place.target, { remove: keys, by: name });
    if (!done) return "I could not find where that setting lives. Is the space still attached to the event?";
    const had = Object.keys(cleanSettings(done.before)).filter((k) => keys.includes(k as SettingKey)) as SettingKey[];
    log(`settings: ${name} reset ${key || "everything"} ${place.where}`);
    if (!had.length) {
      return key
        ? `Nothing to reset, ${name}: ${lower(infoOf(key).label)} was not set ${place.where}. It is ${showValue(key, before[key].value)} (${LEVEL_WORDS[before[key].from]}).`
        : `Nothing to reset, ${name}: no settings were changed ${place.where}.`;
    }
    const after = await explainAt(place.scope);
    const lines = had.map((k) => `${lower(infoOf(k).label)}: ${showValue(k, after[k].value)} (${LEVEL_WORDS[after[k].from]})`);
    return `Done, ${name}: back to what applies above ${place.where}. Now ${lines.join("; ")}.`;
  }

  async function show(ask: CrewAsk): Promise<string> {
    const s = ask.intent.settings;
    const ev = s.scope === "community" ? null : await eventFor(ask);
    let spaceRef: SpaceRef | null = null;
    if (s.scope === "space") {
      const list = await spacesFor(ask.communityId, ev?.id ?? null);
      spaceRef = matchSpace(s.space || ask.body, list).match;
    }
    const scope = { communityId: ask.communityId, eventId: spaceRef?.eventId ?? ev?.id ?? null, spaceId: spaceRef?.spaceId ?? null };
    const e = await explainAt(scope);
    const where = spaceRef ? `in ${spaceLabel(spaceRef)}` : ev ? `for ${ev.name}` : "for the community";
    const changed = SETTING_INFO.filter((i) => e[i.key].from !== "default");
    const lines = changed.map((i) => {
      const x = e[i.key];
      const from = x.from === "community" ? "community" : x.from === "event" ? (ev?.name ?? "event") : x.from === "space" ? "this space" : "start-up";
      return `- ${i.label}: ${showValue(i.key, x.value)} (${from}${x.by ? `, set by ${x.by.by}` : ""})`;
    });
    // Tone and language set for single spaces of the event.
    if (!spaceRef && scope.eventId) {
      for (const sp of await spacesFor(ask.communityId, scope.eventId)) {
        const own = cleanSettings(sp.settings, SPACE_KEYS);
        const parts = SPACE_KEYS.filter((k) => k in own).map((k) => `${lower(infoOf(k).label)} ${showValue(k, own[k])}`);
        if (parts.length) lines.push(`- In ${spaceLabel(sp)}: ${parts.join(", ")}`);
      }
    }
    const defaults =
      `I wait ${e.stepInSeconds.value}s before stepping in, cards nudge after ${e.ladderLiveMinutes.value} min during Live (${e.ladderBeforeMinutes.value} min before), ` +
      `care is ${e.care.value}, the Builder helps without a tap: ${e.autoHelp.value}.`;
    if (!lines.length) return `Everything ${where} is at the defaults. ${defaults} Change any of it here (“@${config.agentName} be more playful on Discord”) or in Desk.`;
    return `Settings ${where}:\n${lines.join("\n")}\nEverything else is at the default. ${defaults} “@${config.agentName} reset ...” undoes a change; Desk shows them all.`;
  }

  async function intent(ask: CrewAsk): Promise<string | null> {
    const s = ask.intent.settings;
    try {
      if (s.action === "set") return await set(ask);
      if (s.action === "reset") return await reset(ask);
      return await show(ask);
    } catch (err) {
      log(`settings: ${s.action} failed: ${(err as Error).message}`);
      return "I could not change that setting just now. Try again, or change it in Desk.";
    }
  }

  return { intent };
}

export type SettingsModule = ReturnType<typeof createSettings>;
