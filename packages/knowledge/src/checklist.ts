/**
 * Desk's first-run checklist (spec 25): six ticks for a host making Ferri their own,
 * filled from the doctor's view of Switch (its connections) and from Ferri's tables
 * (spaces, events, knowledge, crew). Pure: Desk reads the facts, this decides each
 * tick, so every case is tested without a network or a database.
 *
 * Honest about the demo: the stack's own Mattermost (and Switch's internal rooms) is
 * the built-in test chat, and the Lantern Labs pages in seed/ are the demo knowledge.
 * Both show as "demo", never as done, so a fresh `./ferri up` starts at 0 of 6 and a
 * tick means the host's own community is set. A fact that could not be read (Switch
 * or the database down) shows as "unknown" ("Can't check") instead of failing.
 */
import type { BridgeInfo } from "./doctor.ts";

export type FirstRunStatus = "done" | "todo" | "demo" | "unknown";
export type FirstRunTickId = "platform" | "group" | "event" | "crew-room" | "knowledge" | "pocket";
/** The Desk page where the step happens (Pocket is /m). */
export type FirstRunPage = "spaces" | "events" | "knowledge" | "pocket";

export interface FirstRunTick {
  id: FirstRunTickId;
  title: string;
  status: FirstRunStatus;
  /** What was found, in one short sentence. */
  detail: string;
  /** The next step in one line; null when done. */
  next: string | null;
  /** A command that goes with the next step, shown as code. */
  cmd: string | null;
  /** Where in Desk to do it; null when it happens outside Desk. */
  page: FirstRunPage | null;
}

export interface FirstRunSpace {
  name: string;
  /** Switch's bridge name ("telegram", "whatsapp_web", ...); null for Switch's own rooms. */
  platform: string | null;
  /** Ferri is no longer in the room. */
  archived: boolean;
  /** Its attachment to a live event; null means Off. */
  attachment: { eventId: string; eventName: string; role: "members" | "crew" } | null;
}

export interface FirstRunFacts {
  /** Switch's connections, as the doctor read them; null when Switch could not be read. */
  bridges: BridgeInfo[] | null;
  /** Every space Ferri knows (what Desk's Spaces page lists); null when the database could not be read. */
  spaces: FirstRunSpace[] | null;
  /** Events that are not closed. */
  liveEvents: { id: string; name: string }[] | null;
  /** Live (not archived) knowledge entries. */
  knowledge: { eventId: string | null; sourceKind: string; sourceTitle: string }[] | null;
  /** Crew rows of the community (eventId null) and of each live event; one person can sit in several. */
  crew: { name: string; eventId: string | null; linked: boolean; push: boolean }[] | null;
}

export interface FirstRunChecklist {
  ticks: FirstRunTick[];
  done: number;
  total: number;
  /** Outside platforms with a working connection (bridge types), for the guide links. */
  connected: string[];
}

const PLATFORM_NAMES: Record<string, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  whatsapp_web: "WhatsApp",
  whatsapp: "WhatsApp",
  teams: "Teams",
  mattermost: "Mattermost",
};

const platformName = (p: string | null | undefined): string => PLATFORM_NAMES[p ?? ""] ?? (p ? p.charAt(0).toUpperCase() + p.slice(1) : "Switch");

/** The stack's own Mattermost and Switch's internal rooms: the built-in test chat, not the community's own apps. */
export const isTestChat = (platform: string | null | undefined): boolean => !platform || platform === "mattermost" || platform === "switch";

const DEMO_TITLE = /\bLantern (Labs|Build Night)\b/i;

/** A page of the Lantern Labs demo in seed/, still as seeded (an entry edited in Desk is no longer "markdown"). */
export const isDemoKnowledge = (entry: { sourceKind: string; sourceTitle: string }): boolean => entry.sourceKind === "markdown" && DEMO_TITLE.test(entry.sourceTitle);

const healthy = (b: BridgeInfo) => (!b.status || b.status === "active") && !b.attention;

/** "A", "A and B", "A, B and C" (each name once). */
function listed(names: string[]): string {
  const u = [...new Set(names)];
  if (u.length <= 1) return u[0] ?? "";
  return `${u.slice(0, -1).join(", ")} and ${u[u.length - 1]}`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const isAre = (n: number) => (n === 1 ? "is" : "are");

/** "“build-night” on Discord", unless the name already says the platform. */
function roomLabel(s: FirstRunSpace): string {
  const p = platformName(s.platform);
  return s.name.toLowerCase().includes(p.toLowerCase()) ? `“${s.name}”` : `“${s.name}” on ${p}`;
}

// "unknown" ticks are labelled "Can't check" where they are shown; these say why.
const CANT_SWITCH = "Switch's connections could not be read just now.";
const CANT_DB = "Ferri's database did not answer just now.";
const FIX_CORE = "Fix the Core checks below, then reload this page.";

/**
 * The events the checklist is about: live events with one of the community's own
 * groups attached; else those with any group attached (the test chat); else every live event.
 */
export function firstRunFocus(spaces: FirstRunSpace[], liveEvents: { id: string; name: string }[]): { id: string; name: string }[] {
  const members = spaces.filter((s) => !s.archived && s.attachment?.role === "members");
  const own = new Set(members.filter((s) => !isTestChat(s.platform)).map((s) => s.attachment!.eventId));
  if (own.size) return liveEvents.filter((e) => own.has(e.id));
  const any = new Set(members.map((s) => s.attachment!.eventId));
  if (any.size) return liveEvents.filter((e) => any.has(e.id));
  return liveEvents;
}

function platformTick(bridges: BridgeInfo[] | null, cmd: string): FirstRunTick {
  const base = { id: "platform" as const, title: "Platform connected", page: null };
  if (!bridges) return { ...base, status: "unknown", detail: CANT_SWITCH, next: FIX_CORE, cmd: null };
  const outside = bridges.filter((b) => !isTestChat(b.bridge_type));
  const ok = [...new Set(outside.filter(healthy).map((b) => platformName(b.bridge_type)))];
  const sick = [...new Set(outside.filter((b) => !healthy(b)).map((b) => platformName(b.bridge_type)))];
  if (ok.length) {
    const also = sick.length ? ` ${listed(sick)} ${sick.length === 1 ? "needs" : "need"} attention (see Integrations below).` : "";
    return { ...base, status: "done", detail: `${listed(ok)} ${isAre(ok.length)} connected.${also}`, next: null, cmd: null };
  }
  if (sick.length) {
    const detail = `${listed(sick)} ${isAre(sick.length)} connected but ${sick.length === 1 ? "needs" : "need"} attention.`;
    return { ...base, status: "todo", detail, next: "Its row under Integrations below says how to fix it.", cmd: null };
  }
  const test = bridges.some((b) => isTestChat(b.bridge_type));
  return {
    ...base,
    status: test ? "demo" : "todo",
    detail: test ? "Only the built-in test chat (Mattermost) is connected." : "No chat app is connected yet.",
    next: "Make a bot on Telegram, Discord or Slack, then connect it:",
    cmd: `${cmd} connect telegram --token <bot token>`,
  };
}

function groupTick(spaces: FirstRunSpace[] | null, platform: FirstRunTick): FirstRunTick {
  const base = { id: "group" as const, title: "Ferri in a group", page: "spaces" as const };
  if (!spaces) return { ...base, status: "unknown", detail: CANT_DB, next: FIX_CORE, cmd: null };
  const live = spaces.filter((s) => !s.archived);
  const own = live.filter((s) => !isTestChat(s.platform));
  if (own.length) {
    const per = new Map<string, number>();
    for (const s of own) per.set(platformName(s.platform), (per.get(platformName(s.platform)) ?? 0) + 1);
    const parts = [...per].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const detail =
      parts.length === 1 ? `Ferri is in ${count(own.length, "group")} on ${parts[0]![0]}.` : `Ferri is in ${count(own.length, "group")}: ${listed(parts.map(([p, n]) => `${n} on ${p}`))}.`;
    return { ...base, status: "done", detail, next: null, cmd: null };
  }
  const next =
    platform.status === "done" || platform.status === "unknown"
      ? "Add the bot to your group and post once there, then press Add Ferri on Spaces."
      : "Connect a chat app first (the step above).";
  if (live.length) return { ...base, status: "demo", detail: "Ferri is only in the test chat so far.", next, cmd: null };
  return { ...base, status: "todo", detail: "Ferri is not in any group yet.", next, cmd: null };
}

function eventTick(spaces: FirstRunSpace[] | null, liveEvents: { id: string; name: string }[] | null): FirstRunTick {
  const base = { id: "event" as const, title: "Event attached", page: "spaces" as FirstRunPage };
  if (!spaces || !liveEvents) return { ...base, status: "unknown", detail: CANT_DB, next: FIX_CORE, cmd: null };
  if (!liveEvents.length) return { ...base, status: "todo", detail: "There is no live event yet.", next: "Create your event on Events.", cmd: null, page: "events" };
  const members = spaces.filter((s) => !s.archived && s.attachment?.role === "members");
  const own = members.filter((s) => !isTestChat(s.platform));
  const next = "On Spaces, attach your group to your event as Listen, Approve or Auto.";
  if (own.length) {
    const events = listed(own.map((s) => s.attachment!.eventName));
    return { ...base, status: "done", detail: `${count(own.length, "group")} ${isAre(own.length)} attached to ${events}.`, next: null, cmd: null };
  }
  if (members.length) {
    const names = listed(members.map((s) => `“${s.name}”`));
    return { ...base, status: "demo", detail: `Only the test chat is attached: ${names}, to ${listed(members.map((s) => s.attachment!.eventName))}.`, next, cmd: null };
  }
  return { ...base, status: "todo", detail: "No group is attached to an event yet, so Ferri is Off everywhere.", next, cmd: null };
}

function crewRoomTick(spaces: FirstRunSpace[] | null, liveEvents: { id: string; name: string }[] | null): FirstRunTick {
  const base = { id: "crew-room" as const, title: "Crew room set", page: "spaces" as FirstRunPage };
  if (!spaces || !liveEvents) return { ...base, status: "unknown", detail: CANT_DB, next: FIX_CORE, cmd: null };
  if (!liveEvents.length) return { ...base, status: "todo", detail: "There is no live event yet.", next: "Create your event on Events first.", cmd: null, page: "events" };
  const focus = firstRunFocus(spaces, liveEvents);
  const crewRoom = new Map<string, FirstRunSpace>();
  for (const s of spaces) if (!s.archived && s.attachment?.role === "crew") crewRoom.set(s.attachment.eventId, s);
  const next = "On Spaces, tick crew room on a private group your crew uses.";
  const missing = focus.filter((e) => !crewRoom.has(e.id));
  if (missing.length) {
    const names = listed(missing.map((e) => e.name));
    return { ...base, status: "todo", detail: `${names} ${missing.length === 1 ? "has" : "have"} no crew room, so questions Ferri can't answer reach nobody.`, next, cmd: null };
  }
  const rooms = focus.map((e) => crewRoom.get(e.id)!);
  const test = rooms.filter((s) => isTestChat(s.platform));
  if (test.length) {
    const names = listed(test.map((s) => `“${s.name}”`));
    return { ...base, status: "demo", detail: `The crew room${test.length === 1 ? " is" : "s are"} ${names}, in the test chat.`, next, cmd: null };
  }
  const detail = focus.length === 1 ? `Cards for ${focus[0]!.name} go to ${roomLabel(rooms[0]!)}.` : `Every event has one: ${listed(rooms.map(roomLabel))}.`;
  return { ...base, status: "done", detail, next: null, cmd: null };
}

function knowledgeTick(facts: FirstRunFacts, cmd: string): FirstRunTick {
  const base = { id: "knowledge" as const, title: "Knowledge loaded", page: "knowledge" as const };
  const { knowledge, spaces, liveEvents } = facts;
  if (!knowledge || !spaces || !liveEvents) return { ...base, status: "unknown", detail: CANT_DB, next: FIX_CORE, cmd: null };
  const focus = firstRunFocus(spaces, liveEvents);
  const ids = new Set(focus.map((e) => e.id));
  // Community entries apply to every event; an event's own entries only to it.
  const apply = knowledge.filter((k) => !k.eventId || ids.has(k.eventId));
  if (!apply.length) {
    return { ...base, status: "todo", detail: "No knowledge yet, so Ferri can only ask the crew.", next: "Add your FAQ on Knowledge, or load your markdown files:", cmd: `${cmd} kb seed` };
  }
  const demo = apply.filter(isDemoKnowledge).length;
  const own = apply.length - demo;
  if (!own) {
    return { ...base, status: "demo", detail: "Only the Lantern demo knowledge is loaded.", next: "Make it yours: add your own FAQ, then remove the demo pages.", cmd: null };
  }
  const scope = focus.length ? listed(focus.map((e) => e.name)) : "your community";
  const detail = demo
    ? `${count(apply.length, "entry", "entries")}, ${own} of them yours; the rest is the Lantern demo.`
    : `${count(apply.length, "entry", "entries")} for ${scope}.`;
  return { ...base, status: "done", detail, next: null, cmd: null };
}

function pocketTick(facts: FirstRunFacts): FirstRunTick {
  const base = { id: "pocket" as const, title: "Crew on Pocket", page: "pocket" as FirstRunPage };
  const { crew, spaces, liveEvents } = facts;
  if (!crew) return { ...base, status: "unknown", detail: CANT_DB, next: FIX_CORE, cmd: null };
  // The community's crew and the crew of the events the checklist is about.
  const focus = spaces && liveEvents ? new Set(firstRunFocus(spaces, liveEvents).map((e) => e.id)) : null;
  const rows = crew.filter((c) => !c.eventId || !focus || focus.has(c.eventId));
  // One person often sits in the community crew and an event crew: count people by name.
  const people = new Map<string, { linked: boolean; push: boolean }>();
  for (const c of rows) {
    const key = c.name.trim().toLowerCase();
    const p = people.get(key) ?? { linked: false, push: false };
    people.set(key, { linked: p.linked || c.linked, push: p.push || (c.linked && c.push) });
  }
  const total = people.size;
  const linked = [...people.values()].filter((p) => p.linked).length;
  const push = [...people.values()].filter((p) => p.push).length;
  if (!total) return { ...base, status: "todo", detail: "There is no crew yet.", next: "Add your crew and the topics each person owns on Events.", cmd: null, page: "events" };
  if (!linked) {
    return {
      ...base,
      status: "todo",
      detail: total === 1 ? "Your crew member is not on Pocket yet." : `None of the ${total} crew members is on Pocket yet.`,
      next: "Each crew member opens Pocket (/m) on their phone, signs in and picks their name under Me.",
      cmd: null,
    };
  }
  const on = `${linked} of ${count(total, "crew member")} ${isAre(linked)} on Pocket`;
  const notices = push === linked ? ", with notices on." : push ? `; ${push} get${push === 1 ? "s" : ""} notices.` : ". Notices are not on yet.";
  return { ...base, status: "done", detail: `${on}${notices}`, next: null, cmd: null };
}

/** The six ticks in order, with progress. `cmd` is how commands are shown (default "./ferri", as in the doctor). */
export function firstRunChecklist(facts: FirstRunFacts, cmd = "./ferri"): FirstRunChecklist {
  const platform = platformTick(facts.bridges, cmd);
  const ticks = [platform, groupTick(facts.spaces, platform), eventTick(facts.spaces, facts.liveEvents), crewRoomTick(facts.spaces, facts.liveEvents), knowledgeTick(facts, cmd), pocketTick(facts)];
  const connected = [...new Set((facts.bridges ?? []).filter((b) => !isTestChat(b.bridge_type) && healthy(b)).map((b) => b.bridge_type))];
  return { ticks, done: ticks.filter((t) => t.status === "done").length, total: ticks.length, connected };
}
