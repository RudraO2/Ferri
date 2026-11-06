import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import YAML from "yaml";
import { z } from "zod";
import { deskRows, desks, guests, skillRevisions, skills, type Db } from "@ferri/db";
import { foldHandle, sameHandle, type CrewMember } from "./crew.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import { skillText, splitFrontMatter } from "./skills.ts";
import { TOPICS } from "./triage.ts";

// ── Desks (spec 20): rooms from templates plus a desk skill ───────────────

export type Desk = typeof desks.$inferSelect;
export type DeskRow = typeof deskRows.$inferSelect;
export type DeskValue = string | number | null;

/** The desk kinds Ferri ships, one skill file each in `skills/desks/<kind>.md`. */
export const DESK_KINDS = ["help", "judging", "mentors", "volunteers", "checkin", "speakers", "sponsors", "food", "safety", "tables", "lost-found"] as const;
/** The packs Ferri ships, one file each in `skills/packs/<type>.md`. */
export const PACK_TYPES = ["hackathon", "meetup", "game-night", "festival", "workshop", "conference"] as const;
export const DESK_MODES = ["auto", "approve", "listen"] as const;
export const DESK_CARE = ["normal", "off", "help"] as const;
export type DeskMode = (typeof DESK_MODES)[number];
export type DeskCare = (typeof DESK_CARE)[number];

/** The skill key of a desk kind ("judging" is "desks/judging", "custom-rangoli" is "desks/custom-rangoli"). */
export const deskSkillKey = (kind: string) => `desks/${kind}`;
export const packSkillKey = (type: string) => `packs/${type}`;

/** Card options on a desk card. */
export const DESK_MAKE_OPTION = "make";

/** "Rangoli Judges!" is "rangoli-judges": plain names for channels and skill keys. */
export function deskSlug(text: string, max = 40): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** A sheet column as code uses it: "Where found" is "where_found". */
export function columnName(text: string): string {
  const c = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return c === "row_ref" ? "row_ref_" : c;
}

// ── The desk skill file ───────────────────────────────────────────────────

export interface DeskSheet {
  name: string;
  columns: string[];
  /** What one entry is, in words ("A judge gives a team a score for one criterion"). */
  add: string;
  /** Per group: the sum or average of a column, or a count of rows; ranked. */
  summary: { by: string; op: "sum" | "count" | "average"; value: string | null } | null;
  /**
   * "guests.checkin": each row marks a guest of the event checked in.
   * "care": an entry is also read by care (unsafe goes to the on-duty person and the leads).
   */
  link: "none" | "guests.checkin" | "care";
}

export type WhoPart = { kind: "topic"; topic: string } | { kind: "crew" } | { kind: "leads" } | { kind: "named" };

export interface DeskSkill {
  kind: string;
  title: string;
  /** The channel name without the event's short name ("judging"). */
  room: string;
  visibility: "private" | "public";
  mode: DeskMode;
  who: WhoPart[];
  topic: string;
  care: DeskCare;
  sheet: DeskSheet | null;
  kickoff: string;
  /** How Ferri behaves there (the part that goes into its prompt). */
  body: string;
}

const SummarySchema = z.object({
  by: z.string().min(1),
  total: z.string().optional(),
  count: z.boolean().optional(),
  average: z.string().optional(),
});

const SheetSchema = z.object({
  name: z.string().min(1),
  columns: z.array(z.string()).min(1).max(12),
  add: z.string().default(""),
  summary: SummarySchema.nullish(),
  link: z.enum(["none", "guests.checkin", "care"]).default("none"),
});

const DeskFrontSchema = z.object({
  kind: z.string().min(1),
  title: z.string().min(1),
  room: z.string().min(1),
  visibility: z.enum(["private", "public"]).default("private"),
  mode: z.enum(DESK_MODES).default("auto"),
  who: z.string().default("named"),
  topic: z.string().default("other"),
  care: z.enum(DESK_CARE).default("normal"),
  sheet: SheetSchema.nullish(),
  kickoff: z.string().default(""),
});

/** `topic:judging`, `crew`, `leads`, `named`, or several joined with commas. */
export function parseWho(text: string): WhoPart[] | null {
  const parts = text
    .split(/[,+]|\s+and\s+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return [{ kind: "named" }];
  const out: WhoPart[] = [];
  for (const p of parts) {
    const m = /^topic\s*:\s*([a-z0-9_-]+)$/.exec(p);
    if (m) out.push({ kind: "topic", topic: m[1]! });
    else if (p === "crew" || p === "leads" || p === "named") out.push({ kind: p });
    else return null;
  }
  return out;
}

export function whoText(who: WhoPart[]): string {
  return who.map((w) => (w.kind === "topic" ? `topic:${w.topic}` : w.kind)).join(", ");
}

function yamlError(err: unknown): string {
  return (err as Error).message.split("\n")[0] ?? "the front matter is not valid YAML";
}

function zodError(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join(".") || "front matter"}: ${i.message}` : "invalid front matter";
}

/** Read and check a desk skill file (front matter plus behavior). */
export function parseDeskSkill(text: string): { ok: true; skill: DeskSkill } | { ok: false; error: string } {
  const { front, body } = splitFrontMatter(text);
  if (!front) return { ok: false, error: "no front matter (--- ... ---) at the top" };
  let raw: unknown;
  try {
    raw = YAML.parse(front);
  } catch (err) {
    return { ok: false, error: yamlError(err) };
  }
  const parsed = DeskFrontSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const f = parsed.data;
  const kind = deskSlug(f.kind, 60);
  const room = deskSlug(f.room, 40);
  if (!kind) return { ok: false, error: "kind: needs letters or digits" };
  if (!room) return { ok: false, error: "room: needs letters or digits" };
  const who = parseWho(f.who);
  if (!who) return { ok: false, error: `who: "${f.who}" is not topic:<topic>, crew, leads or named` };
  let sheet: DeskSheet | null = null;
  if (f.sheet) {
    const columns = f.sheet.columns.map(columnName);
    if (columns.some((c) => !c)) return { ok: false, error: "sheet.columns: every column needs a name" };
    if (new Set(columns).size !== columns.length) return { ok: false, error: "sheet.columns: two columns have the same name" };
    let summary: DeskSheet["summary"] = null;
    const s = f.sheet.summary;
    if (s) {
      const by = columnName(s.by);
      if (!columns.includes(by)) return { ok: false, error: `sheet.summary.by: "${s.by}" is not one of the columns` };
      const total = s.total ? columnName(s.total) : null;
      const average = s.average ? columnName(s.average) : null;
      const value = total ?? average;
      if (value && !columns.includes(value)) return { ok: false, error: `sheet.summary: "${s.total ?? s.average}" is not one of the columns` };
      if (!value && !s.count) return { ok: false, error: "sheet.summary needs total, average or count: true" };
      summary = { by, op: total ? "sum" : average ? "average" : "count", value };
    }
    sheet = { name: f.sheet.name.trim(), columns, add: f.sheet.add.trim(), summary, link: f.sheet.link };
  }
  const topic = deskSlug(f.topic, 30) || "other";
  return {
    ok: true,
    skill: {
      kind,
      title: f.title.trim(),
      room,
      visibility: f.visibility,
      mode: f.mode,
      who,
      topic,
      care: f.care,
      sheet,
      kickoff: f.kickoff.trim(),
      body,
    },
  };
}

/** Write a desk skill file back (the custom-desk writer and Desk use it). */
export function renderDeskSkill(skill: Omit<DeskSkill, "body"> & { body: string }): string {
  const front: Record<string, unknown> = {
    kind: skill.kind,
    title: skill.title,
    room: skill.room,
    visibility: skill.visibility,
    mode: skill.mode,
    who: whoText(skill.who),
    topic: skill.topic,
    care: skill.care,
  };
  if (skill.sheet) {
    const s = skill.sheet;
    const sheet: Record<string, unknown> = { name: s.name, columns: s.columns, add: s.add };
    if (s.summary) {
      sheet.summary =
        s.summary.op === "count" ? { by: s.summary.by, count: true } : { by: s.summary.by, [s.summary.op === "sum" ? "total" : "average"]: s.summary.value };
    }
    sheet.link = s.link;
    front.sheet = sheet;
  }
  front.kickoff = skill.kickoff;
  return `---\n${YAML.stringify(front, { lineWidth: 0 }).trim()}\n---\n${skill.body.trim()}\n`;
}

// ── Packs ─────────────────────────────────────────────────────────────────

export interface DeskPack {
  type: string;
  title: string;
  desks: string[];
  /** Added to the event's instructions when the pack is set up. */
  instructions: string;
  /** Starter tasks, added to the event's plan. */
  tasks: string[];
  body: string;
}

const PackFrontSchema = z.object({
  type: z.string().optional(),
  title: z.string().min(1),
  desks: z.array(z.string()).min(1).max(12),
  instructions: z.string().default(""),
  tasks: z.array(z.string()).default([]),
});

export function parsePack(text: string, type = ""): { ok: true; pack: DeskPack } | { ok: false; error: string } {
  const { front, body } = splitFrontMatter(text);
  if (!front) return { ok: false, error: "no front matter (--- ... ---) at the top" };
  let raw: unknown;
  try {
    raw = YAML.parse(front);
  } catch (err) {
    return { ok: false, error: yamlError(err) };
  }
  const parsed = PackFrontSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const f = parsed.data;
  const desksList = [...new Set(f.desks.map((d) => deskSlug(d, 60)).filter(Boolean))];
  if (!desksList.length) return { ok: false, error: "desks: name at least one desk kind" };
  return {
    ok: true,
    pack: {
      type: deskSlug(f.type ?? type, 40) || type,
      title: f.title.trim(),
      desks: desksList,
      instructions: f.instructions.trim(),
      tasks: f.tasks.map((t) => t.trim()).filter(Boolean),
      body,
    },
  };
}

/** A desk skill as the community runs it (an edit in Desk wins over the file). */
export async function loadDeskSkill(db: Db, dir: string, communityId: string, key: string): Promise<{ skill: DeskSkill; text: string; version: number; edited: boolean } | { error: string } | null> {
  const t = await skillText(db, dir, communityId, key);
  if (!t) return null;
  const p = parseDeskSkill(t.text);
  return p.ok ? { skill: p.skill, text: t.text, version: t.version, edited: t.edited } : { error: p.error };
}

export async function loadPack(db: Db, dir: string, communityId: string, type: string): Promise<{ pack: DeskPack; version: number } | { error: string } | null> {
  const t = await skillText(db, dir, communityId, packSkillKey(type));
  if (!t) return null;
  const p = parsePack(t.text, type);
  return p.ok ? { pack: p.pack, version: t.version } : { error: p.error };
}

/** "a board game night" is game-night; Diwali, a party or a fair is festival. Null when no pack fits. */
export function packTypeFor(text: string): string | null {
  const t = text.toLowerCase();
  const slug = deskSlug(t);
  if ((PACK_TYPES as readonly string[]).includes(slug)) return slug;
  if (/hack|build ?night|game ?jam|buildathon/.test(t)) return "hackathon";
  if (/board ?game|game ?night|games? evening|tabletop|quiz night/.test(t)) return "game-night";
  if (/festival|fest\b|diwali|holi|party|fair|mela|carnival|celebration|concert/.test(t)) return "festival";
  if (/workshop|bootcamp|class|training|hands-on/.test(t)) return "workshop";
  if (/conference|summit|conf\b|convention/.test(t)) return "conference";
  if (/meetup|meet-up|talk|tech night|community night/.test(t)) return "meetup";
  return null;
}

/** "Lost and found", "check-in", "lost & found desk" as a shipped kind, or null. */
export function deskKindFor(text: string): string | null {
  const t = text.toLowerCase().replace(/\bdesk\b/g, "").trim();
  const slug = deskSlug(t);
  if ((DESK_KINDS as readonly string[]).includes(slug)) return slug;
  const map: [RegExp, string][] = [
    [/lost|found/, "lost-found"],
    [/check ?-?in|registration|door|entry/, "checkin"],
    [/judg|scor/, "judging"],
    [/mentor/, "mentors"],
    [/volunteer|shift/, "volunteers"],
    [/speaker|talk|stage/, "speakers"],
    [/sponsor|partner/, "sponsors"],
    [/food|lunch|dinner|catering|snack/, "food"],
    [/safety|security|incident|first aid|medical/, "safety"],
    [/table|seat/, "tables"],
    [/help|support|tech/, "help"],
  ];
  return map.find(([re]) => re.test(t))?.[1] ?? null;
}

// ── Names, templates and who is invited ───────────────────────────────────

/** The event's short name for channel names: "build-night" is "bn", "diwali" stays "diwali". */
export function eventShortName(event: { slug?: string | null; name?: string | null } | null | undefined): string {
  if (!event) return "";
  const base = deskSlug(event.slug || event.name || "", 60);
  const parts = base.split("-").filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 8);
  return parts.map((p) => p[0]).join("").slice(0, 6);
}

/** `<event short name>-<room>`, as the channel is named ("bn-judging"). */
export function deskRoomName(event: { slug?: string | null; name?: string | null } | null | undefined, room: string): string {
  const r = deskSlug(room, 40) || "desk";
  const short = eventShortName(event);
  return short && !r.startsWith(`${short}-`) ? `${short}-${r}` : r;
}

const yq = (s: string) => JSON.stringify(s);

/** The kickoff post: the skill's text with {event} and {agent} filled in, or a plain welcome. */
export function deskKickoff(input: { kickoff: string; title: string; eventName: string; agentName: string }): string {
  const text = input.kickoff.trim() || `Welcome to the ${input.title} for {event}! Ask @{agent} anything here.`;
  return text.replace(/\{event\}/g, input.eventName).replace(/\{agent\}/g, input.agentName).replace(/\s+\n/g, "\n").trim();
}

/**
 * A Switch template (version 2) that makes one desk channel on a bridge, with
 * the invited people, Ferri and the kickoff (like `teamRoomsTemplate`).
 * `channel_private` is invited only; `channel_public` lets members join.
 */
export function deskTemplate(input: {
  bridge: string;
  agentName: string;
  eventName: string;
  desk: { title: string; roomName: string; visibility: "private" | "public"; members: string[]; kickoff: string };
}): string {
  const d = input.desk;
  return (
    [
      "version: 2",
      "resources:",
      "  desk_1:",
      "    type: room",
      `    name: ${yq(d.roomName)}`,
      `    description: ${yq(`${d.title}, ${input.eventName}`)}`,
      `    bridge: ${yq(input.bridge)}`,
      `    channel_type: ${d.visibility === "public" ? "channel_public" : "channel_private"}`,
      `    agents: [${yq(input.agentName)}]`,
      `    users: [${d.members.map(yq).join(", ")}]`,
      `    kickoff: ${yq(d.kickoff)}`,
    ].join("\n") + "\n"
  );
}

/**
 * Who is invited to a desk, as usernames on its platform. People named in the
 * ask are exactly who the crew wants; with nobody named, the skill's `who`
 * decides (the topic's owners, the crew, the leads). A crew member is named by
 * their name or any handle and invited by their handle on that platform.
 */
export function deskInvitees(input: { who: WhoPart[]; crew: CrewMember[]; named: string[]; platform: string | null }): { users: string[]; names: string[]; missing: string[] } {
  const users: string[] = [];
  const names: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const add = (user: string, name: string) => {
    const k = foldHandle(user);
    if (!k || seen.has(k)) return;
    seen.add(k);
    users.push(user);
    names.push(name);
  };
  const crewHandle = (c: CrewMember) => (input.platform ? c.handles[input.platform]?.trim().replace(/^@/, "") : undefined);
  const named = input.named.map((n) => n.trim().replace(/^@/, "")).filter(Boolean);
  if (named.length) {
    for (const n of named) {
      const lower = n.toLowerCase();
      const c =
        input.crew.find((m) => m.name.toLowerCase() === lower || m.name.toLowerCase().split(/\s+/)[0] === lower) ??
        input.crew.find((m) => Object.entries(m.handles).some(([p, h]) => p !== "switch" && sameHandle(h, n)));
      if (c) {
        const h = crewHandle(c);
        if (h) add(h, c.name);
        else add(n, c.name);
      } else add(n, n);
    }
    return { users, names, missing };
  }
  const picked: CrewMember[] = [];
  for (const w of input.who) {
    if (w.kind === "crew") picked.push(...input.crew);
    else if (w.kind === "leads") picked.push(...input.crew.filter((c) => c.lead));
    else if (w.kind === "topic") picked.push(...input.crew.filter((c) => c.topics.includes(w.topic)));
  }
  for (const c of picked) {
    const h = crewHandle(c);
    if (h) add(h, c.name);
    else if (!missing.includes(c.name)) missing.push(c.name);
  }
  return { users, names, missing };
}

// ── Finding desks ─────────────────────────────────────────────────────────

/** The live desk in a Switch room, or null. */
export async function deskForRoom(db: Db, roomId: string): Promise<Desk | null> {
  const [d] = await db
    .select()
    .from(desks)
    .where(and(eq(desks.switchRoomId, roomId), eq(desks.status, "created")))
    .orderBy(desc(desks.createdAt))
    .limit(1);
  return d ?? null;
}

/** The live desk a space is, or null. */
export async function deskForSpace(db: Db, spaceId: string): Promise<Desk | null> {
  const [d] = await db
    .select()
    .from(desks)
    .where(and(eq(desks.spaceId, spaceId), eq(desks.status, "created")))
    .orderBy(desc(desks.createdAt))
    .limit(1);
  return d ?? null;
}

/** Every desk of an event (null: community level), newest last; removed and dismissed ones only when asked. */
export async function desksForEvent(db: Db, communityId: string, eventId: string | null, opts: { all?: boolean } = {}): Promise<Desk[]> {
  const rows = await db
    .select()
    .from(desks)
    .where(and(eq(desks.communityId, communityId), eventId ? eq(desks.eventId, eventId) : isNull(desks.eventId)))
    .orderBy(asc(desks.createdAt));
  return opts.all ? rows : rows.filter((d) => d.status === "created" || d.status === "planned" || d.status === "failed");
}

/** A desk of the event by kind, name or room ("judging", "rangoli judges", "bn-judging"). */
export function findDesk(list: Desk[], ref: { kind?: string; name?: string }): Desk | null {
  const live = list.filter((d) => d.status === "created");
  const kind = ref.kind?.trim() ? (deskKindFor(ref.kind) ?? deskSlug(ref.kind)) : "";
  const name = deskSlug(ref.name ?? "");
  return (
    (kind && live.find((d) => d.kind === kind)) ||
    (name && live.find((d) => d.kind === `custom-${name}` || deskSlug(d.title).includes(name) || d.roomName.endsWith(name))) ||
    (kind && live.find((d) => d.kind.includes(kind) || d.roomName.includes(kind) || deskSlug(d.title).includes(kind))) ||
    null
  );
}

/** A space's desk with its skill (for the prompt, care and topic routing), or null when it is not a desk. */
export async function deskWithSkill(db: Db, dir: string, spaceId: string): Promise<{ desk: Desk; skill: DeskSkill } | null> {
  const desk = await deskForSpace(db, spaceId);
  if (!desk) return null;
  const s = await loadDeskSkill(db, dir, desk.communityId, desk.skillKey);
  return s && "skill" in s ? { desk, skill: s.skill } : null;
}

/** How care works in a space that is a desk ("help", "off", "normal"), or null when it is not a desk. */
export async function deskCare(db: Db, dir: string, spaceId: string): Promise<DeskCare | null> {
  return (await deskWithSkill(db, dir, spaceId).catch(() => null))?.skill.care ?? null;
}

/**
 * A help desk (`care: help`) sends technical problems to the Builder at any
 * stage, still never during the pause or in Listen.
 */
export function deskAutoHelp(care: DeskCare | null, input: { technical: boolean; kind: string; mode: string | null; paused: boolean }): boolean {
  return care === "help" && input.technical && (input.kind === "stuck" || input.kind === "confused") && (input.mode === "auto" || input.mode === "approve") && !input.paused;
}

/** The block a desk adds to Ferri's answer prompt in its room. */
export function deskPromptBlock(input: { desk: Pick<Desk, "title" | "roomName">; skill: DeskSkill; eventName: string | null }): string {
  const s = input.skill;
  const lines = [`# This room: ${input.desk.title} (#${input.desk.roomName}${input.eventName ? `, ${input.eventName}` : ""})`];
  if (s.sheet) {
    lines.push(
      `This desk keeps a sheet, "${s.sheet.name}" (${s.sheet.columns.join(", ")}). Ferri records entries people post here itself and confirms them; to see it, people say "show the ${s.sheet.name.toLowerCase()}".`,
    );
  }
  lines.push("", s.body);
  return lines.join("\n").trim();
}

/** One line per desk for "what desks do we have?". */
export function deskLine(d: Pick<Desk, "title" | "roomName" | "platform" | "visibility" | "status" | "members" | "error">, rows?: number): string {
  const where = `#${d.roomName}${d.platform ? ` on ${platformName(d.platform)}` : ""}`;
  const state = d.status === "created" ? "" : d.status === "planned" ? " (waiting on its card)" : d.status === "failed" ? ` (failed${d.error ? `: ${d.error.slice(0, 80)}` : ""})` : ` (${d.status})`;
  const extra = [d.visibility === "public" ? "public" : "private", d.members.length ? d.members.join(", ") : null, rows !== undefined ? `${rows} ${rows === 1 ? "row" : "rows"}` : null].filter(Boolean).join(", ");
  return `${d.title}: ${where}${extra ? ` (${extra})` : ""}${state}`;
}

const PLATFORMS: Record<string, string> = { whatsapp: "WhatsApp", whatsapp_web: "WhatsApp", mattermost: "Mattermost", slack: "Slack", discord: "Discord", telegram: "Telegram", teams: "Teams" };
export const platformName = (p: string) => PLATFORMS[p] ?? `${p.charAt(0).toUpperCase()}${p.slice(1)}`;

/** The platform a crew member named ("Discord", "the slack") as Switch's bridge type, or null. */
export function platformFor(text: string): string | null {
  const t = text.toLowerCase();
  for (const p of ["mattermost", "slack", "discord", "telegram", "teams"]) if (t.includes(p)) return p;
  if (t.includes("whatsapp")) return "whatsapp_web";
  return null;
}

// ── Sheets ────────────────────────────────────────────────────────────────

/** The active rows of a desk's sheet, oldest first. */
export async function deskRowsOf(db: Db, deskId: string): Promise<DeskRow[]> {
  return db
    .select()
    .from(deskRows)
    .where(and(eq(deskRows.deskId, deskId), eq(deskRows.status, "active")))
    .orderBy(asc(deskRows.createdAt));
}

/** Active rows per desk. */
export async function deskRowCounts(db: Db, deskIds: string[]): Promise<Map<string, number>> {
  if (!deskIds.length) return new Map();
  const rows = await db
    .select({ deskId: deskRows.deskId, n: sql<number>`count(*)::int` })
    .from(deskRows)
    .where(and(inArray(deskRows.deskId, deskIds), eq(deskRows.status, "active")))
    .groupBy(deskRows.deskId);
  return new Map(rows.map((r) => [r.deskId, r.n]));
}

/** A value as the sheet keeps it: digits become numbers, blanks become null. */
export function cellValue(v: unknown): DeskValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || /^(n\/a|none|null|-)$/i.test(s)) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

const groupKey = (v: DeskValue) => (v === null ? "" : String(v).trim().replace(/\s+/g, " ").toLowerCase());

export interface SheetGroup {
  key: string;
  value: number;
  rows: number;
}

/** The summary computed in code: sum, count or average per group, ranked (highest first). */
export function sheetSummary(sheet: DeskSheet, rows: { data: Record<string, DeskValue> }[]): SheetGroup[] {
  const s = sheet.summary;
  if (!s) return [];
  const groups = new Map<string, { key: string; sum: number; n: number; rows: number }>();
  for (const r of rows) {
    const raw = r.data[s.by] ?? null;
    const k = groupKey(raw);
    if (!k) continue;
    const g = groups.get(k) ?? { key: String(raw).trim().replace(/\s+/g, " "), sum: 0, n: 0, rows: 0 };
    g.rows += 1;
    if (s.op !== "count") {
      const v = cellValue(r.data[s.value!] ?? null);
      if (typeof v === "number") {
        g.sum += v;
        g.n += 1;
      }
    }
    groups.set(k, g);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return [...groups.values()]
    .map((g) => ({ key: g.key, value: s.op === "count" ? g.rows : s.op === "sum" ? round(g.sum) : g.n ? round(g.sum / g.n) : 0, rows: g.rows }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "Scores" is "score"/"scores"; counts read naturally. */
function rowWord(sheet: DeskSheet, n: number): string {
  const many = sheet.name.trim().toLowerCase() || "rows";
  const one = many.endsWith("ies") ? `${many.slice(0, -3)}y` : many.endsWith("s") ? many.slice(0, -1) : many;
  return plural(n, one, many);
}

export const sheetCount = rowWord;

/** One row as a short line: "Team Alpha, innovation, 8". */
export function rowText(sheet: DeskSheet, data: Record<string, DeskValue>, opts: { skip?: string[] } = {}): string {
  return sheet.columns
    .filter((c) => !opts.skip?.includes(c))
    .map((c) => data[c])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .join(", ");
}

/** What "show the scores" posts: the ranked summary, or the latest rows when the sheet has no summary. */
export function summaryText(sheet: DeskSheet, rows: { data: Record<string, DeskValue>; by: string }[], title?: string): string {
  const head = `${title ? `${title} · ` : ""}${sheet.name}: ${rowWord(sheet, rows.length)} so far.`;
  if (!rows.length) return `${head} Nothing yet.`;
  const s = sheet.summary;
  if (s) {
    const groups = sheetSummary(sheet, rows);
    const how = s.op === "count" ? `by ${s.by.replace(/_/g, " ")}` : `${s.op === "sum" ? "total" : "average"} ${s.value!.replace(/_/g, " ")} by ${s.by.replace(/_/g, " ")}`;
    const lines = groups.slice(0, 20).map((g, i) => `${i + 1}. ${g.key}: ${g.value}${s.op === "count" ? "" : ` (${rowWord(sheet, g.rows)})`}`);
    return [`${head} Ranked, ${how}:`, ...lines, groups.length > 20 ? `…and ${groups.length - 20} more in the sheet document.` : null].filter(Boolean).join("\n");
  }
  const latest = rows.slice(-12).map((r) => `- ${rowText(sheet, r.data)}${r.by ? ` (${r.by})` : ""}`);
  return [`${head}${rows.length > 12 ? " The latest:" : ""}`, ...latest].join("\n");
}

const cell = (v: unknown) =>
  String(v ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();

/** The sheet as a Switch library document (markdown): the summary, then every row. */
export function renderSheetDocument(input: {
  title: string;
  roomName: string;
  eventName: string | null;
  sheet: DeskSheet;
  rows: { data: Record<string, DeskValue>; by: string; createdAt: Date }[];
  timeZone: string;
}): string {
  const { sheet, rows } = input;
  const out: string[] = [
    `# ${input.title}: ${sheet.name}`,
    "",
    `Kept by Ferri from what people post in #${input.roomName}${input.eventName ? ` (${input.eventName})` : ""}. ${sheet.add ? `One row: ${sheet.add}.` : ""}`.trim(),
    "",
  ];
  if (sheet.summary && rows.length) {
    out.push("## Summary", "", summaryText(sheet, rows).split("\n").slice(1).join("\n"), "");
  }
  out.push(`## Rows (${rows.length})`, "");
  if (!rows.length) out.push("Nothing yet.");
  else {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: input.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    out.push(`| # | ${sheet.columns.map((c) => c.replace(/_/g, " ")).join(" | ")} | by | when |`);
    out.push(`|---|${sheet.columns.map(() => "---").join("|")}|---|---|`);
    rows.forEach((r, i) => out.push(`| ${i + 1} | ${sheet.columns.map((c) => cell(r.data[c])).join(" | ")} | ${cell(r.by)} | ${fmt.format(r.createdAt)} |`));
  }
  return out.join("\n").trim() + "\n";
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The sheet as CSV (Desk's download). */
export function sheetCsv(sheet: Pick<DeskSheet, "columns">, rows: { data: Record<string, DeskValue>; by: string; createdAt: Date }[]): string {
  const head = [...sheet.columns, "by", "at"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) lines.push([...sheet.columns.map((c) => r.data[c]), r.by, r.createdAt.toISOString()].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ── The sheet reader: one Haiku call per message in a desk with a sheet ───

export function sheetReadingSchema(columns: string[]) {
  const row = z.strictObject({ row_ref: z.string(), ...Object.fromEntries(columns.map((c) => [c, z.string()])) });
  return z.strictObject({ action: z.enum(["add", "change", "show", "none"]), rows: z.array(row) });
}

export interface SheetReading {
  action: "add" | "change" | "show" | "none";
  rows: { ref: string | null; data: Record<string, DeskValue> }[];
}

const SHEET_SYSTEM = `You keep a live sheet for one desk: a room at a community event where people do one job (judging, check-in, volunteering, lost and found, ...). You read one message posted in that room and decide what it does to the sheet:
- add: it reports one or more new entries for the sheet ("Team Alpha 8 for innovation", "checked in Asha Guest", "found a blue water bottle near the stage", "I can take the 2 to 4 PM shift at registration"). rows has one item per entry, row_ref "".
- change: it corrects or updates entries already on the sheet (listed below with ids S1, S2, ...): "make that a 9", "actually Team Alpha gets 7 for design", "the blue bottle was picked up", "mark the projector request done". rows has one item per changed entry: row_ref is that entry's id, and every column holds the value it should have now (copy the unchanged values from the sheet).
- show: it asks to see the sheet, the totals, the ranking, the count or who or what is on it ("show the scores", "who's winning?", "how many have checked in?", "what's in lost and found?"). rows [].
- none: anything else: a question about the event, a request for help, chat, thanks, a message about something else. rows [].

Rules:
- Fill each column only from the message (and the sender for a person column). Use "" when the message does not say. Never invent a value.
- A person column (judge, volunteer, mentor, logged_by, reported_by, by) that the message leaves unsaid is the sender, when the sender is the one doing it.
- Numbers as digits ("8", not "eight"). Names as written, with their capitals.
- One message can hold several entries ("Team Alpha 8 for innovation and 7 for design" is two rows).
- A question that only mentions a column ("when does judging end?", "where do I check in?") is none.
- A message that repeats an entry already on the sheet with a new value from the same person is change of that entry, not add.`;

/** Read one desk message into a sheet action (add, change, show, none). */
export async function readSheet(input: {
  choice: ModelChoice;
  deskTitle: string;
  sheet: DeskSheet;
  sender: string;
  message: string;
  /** Recent active rows, oldest first, for changes ("make that a 9"). */
  rows: { id: string; data: Record<string, DeskValue>; by: string }[];
  client?: Parameters<typeof structuredCall>[0]["client"];
}): Promise<{ reading: SheetReading | null; refs: Map<string, string>; usage: Usage | null; latencyMs: number }> {
  const recent = input.rows.slice(-30);
  const refs = new Map<string, string>();
  const lines = recent.map((r, i) => {
    const ref = `S${i + 1}`;
    refs.set(ref, r.id);
    return `${ref}: ${input.sheet.columns.map((c) => `${c}=${r.data[c] ?? ""}`).join("; ")} (by ${r.by})`;
  });
  const schema = sheetReadingSchema(input.sheet.columns);
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: SHEET_SYSTEM, cache_control: { type: "ephemeral" } }],
    user:
      `Desk: ${input.deskTitle}\nSheet: ${input.sheet.name}\nColumns: ${input.sheet.columns.join(", ")}\n` +
      `One entry: ${input.sheet.add || "one row of the sheet"}\n\n` +
      `On the sheet now (oldest first):\n${lines.join("\n") || "(empty)"}\n\n` +
      `Message from ${input.sender}:\n${input.message}`,
    schema,
    maxTokens: 1500,
    client: input.client,
  });
  return { reading: out.data ? tidySheetReading(out.data as RawReading, input.sheet, refs) : null, refs, usage: out.usage, latencyMs: out.latencyMs };
}

type RawReading = { action: SheetReading["action"]; rows: Record<string, string>[] };

/** Rules in code: blanks dropped, digits as numbers, empty rows gone, an add with nothing in it is none. */
export function tidySheetReading(raw: RawReading, sheet: DeskSheet, refs: Map<string, string>): SheetReading {
  if (raw.action === "show" || raw.action === "none") return { action: raw.action, rows: [] };
  const rows = raw.rows
    .map((r) => {
      const data: Record<string, DeskValue> = {};
      for (const c of sheet.columns) data[c] = cellValue(r[c]);
      const ref = (r.row_ref ?? "").trim().toUpperCase();
      return { ref: refs.has(ref) ? refs.get(ref)! : null, data };
    })
    .filter((r) => Object.values(r.data).some((v) => v !== null));
  if (!rows.length) return { action: "none", rows: [] };
  return { action: raw.action, rows };
}

/**
 * The row a change without a usable id most likely means: the newest active
 * row whose filled text columns (other than the summary value, status and
 * notes) all match the new data.
 */
export function matchRowForChange(sheet: DeskSheet, rows: { id: string; data: Record<string, DeskValue>; by: string }[], data: Record<string, DeskValue>, by: string): string | null {
  const loose = new Set([sheet.summary?.value ?? "", "status", "note", "notes", "score", "count"]);
  const keys = sheet.columns.filter((c) => !loose.has(c) && typeof data[c] === "string");
  if (!keys.length) return null;
  const hit = [...rows].reverse().find((r) => keys.every((k) => groupKey(r.data[k] ?? null) === groupKey(data[k] ?? null)) && (r.by === by || keys.length >= 2));
  return hit?.id ?? null;
}

/** A change keeps the old values the message did not touch. */
export function mergeRow(before: Record<string, DeskValue>, after: Record<string, DeskValue>): Record<string, DeskValue> {
  const out = { ...before };
  for (const [k, v] of Object.entries(after)) if (v !== null) out[k] = v;
  return out;
}

// ── Check-in: a row marks the guest checked in ────────────────────────────

/** Mark a guest of the event checked in, by email, else by exact name (case-insensitive). Null when nobody matches. */
export async function checkInGuest(db: Db, eventId: string, who: { email?: string | null; name?: string | null }, at = new Date()): Promise<{ id: string; name: string; already: boolean } | null> {
  const email = who.email?.trim().toLowerCase();
  const name = who.name?.trim().replace(/\s+/g, " ").toLowerCase();
  let g: { id: string; name: string; checkedInAt: Date | null } | undefined;
  if (email && email.includes("@")) {
    [g] = await db.select({ id: guests.id, name: guests.name, checkedInAt: guests.checkedInAt }).from(guests).where(and(eq(guests.eventId, eventId), eq(guests.email, email))).limit(1);
  }
  if (!g && name) {
    const found = await db
      .select({ id: guests.id, name: guests.name, checkedInAt: guests.checkedInAt })
      .from(guests)
      .where(and(eq(guests.eventId, eventId), sql`lower(regexp_replace(trim(${guests.name}), '\\s+', ' ', 'g')) = ${name}`))
      .limit(2);
    if (found.length === 1) g = found[0];
  }
  if (!g) return null;
  if (g.checkedInAt) return { id: g.id, name: g.name, already: true };
  await db.update(guests).set({ checkedInAt: at, updatedAt: new Date() }).where(eq(guests.id, g.id));
  return { id: g.id, name: g.name, already: false };
}

/** The guest a check-in row names: the email column, else the name (or guest) column, else the first column. */
export function checkInTarget(sheet: DeskSheet, data: Record<string, DeskValue>): { email: string | null; name: string | null } {
  const str = (c: string | undefined) => (c && typeof data[c] === "string" ? (data[c] as string) : null);
  const emailCol = sheet.columns.find((c) => c.includes("email"));
  const nameCol = sheet.columns.find((c) => c === "name" || c === "guest" || c.endsWith("_name")) ?? sheet.columns[0];
  return { email: str(emailCol), name: str(nameCol) };
}

// ── Custom desks: Ferri writes the skill ──────────────────────────────────

export const CustomDeskSchema = z.strictObject({
  title: z.string(),
  room: z.string(),
  visibility: z.enum(["private", "public"]),
  mode: z.enum(DESK_MODES),
  who: z.enum(["named", "crew", "leads", "topic"]),
  topic: z.enum(TOPICS),
  care: z.enum(DESK_CARE),
  kickoff: z.string(),
  behavior: z.string(),
  has_sheet: z.boolean(),
  sheet_name: z.string(),
  columns: z.array(z.string()),
  add: z.string(),
  summary_by: z.string(),
  summary_op: z.enum(["none", "sum", "count", "average"]),
  summary_value: z.string(),
});
export type CustomDeskDraft = z.infer<typeof CustomDeskSchema>;

const CUSTOM_SYSTEM = `You write a desk skill for Ferri, the AI teammate of a community's organizing crew. A desk is a chat room at an event for one job, and its skill sets how Ferri behaves there. The crew asked for a desk that none of Ferri's ready-made desks fits. Write it from their request.

Fields:
- title: "<Job> desk", 2 to 5 words ("Rangoli judging desk").
- room: a short channel name, lowercase words joined by hyphens, no event name ("rangoli-judging").
- visibility: private (only invited people: judges, the crew, anything with scores or personal details) or public (any member may join and post).
- mode: auto (Ferri replies there itself), approve (replies wait for the crew) or listen (Ferri only records). Usually auto.
- who: named (the people the crew named), crew, leads, or topic (the crew who own the topic below).
- topic: the closest topic for questions from this room: ${TOPICS.join(", ")}.
- care: normal; off only if the room is not about people (a log of photos, say); help if it is a place where people bring technical problems.
- kickoff: the first message in the new room, 1 to 3 short sentences: welcome, what the room is for, and how to post an entry if there is a sheet (an example message). Use {event} for the event's name and @{agent} for Ferri.
- behavior: how Ferri works in this room, as 4 to 8 short markdown bullet lines starting with "- ": who is there, what Ferri does with their messages, what it never does (never makes up results or decisions; private details stay in the room), the tone. Plain English, no headings.
- has_sheet: true when people will post entries Ferri should keep in a table (scores, counts, a log, items, sign-ups).
- sheet_name: the table's name, plural ("Scores", "Entries", "Shots").
- columns: 2 to 7 short lowercase column names (letters and underscores), the person who posts it last if it matters ("entry", "judge", "criterion", "score", "note").
- add: one sentence: what one row is ("A judge gives an entry a score for one criterion").
- summary_by, summary_op, summary_value: how to total the sheet: group by summary_by (a column) and sum (summary_op "sum") or average a number column (summary_value), or count rows ("count", summary_value ""). "none" with both "" when no total makes sense.
When has_sheet is false: sheet_name "", columns [], add "", summary_op "none", summary_by "", summary_value "".
Never put a real person's private details in the skill.`;

/** A safe minimal desk skill, when the writer fails or writes something invalid. */
export function fallbackDeskSkill(input: { what: string; name: string }): string {
  const title = (input.name.trim() ? `${input.name.trim().replace(/\bdesk\b/i, "").trim()} desk` : "Custom desk").replace(/^\w/, (c) => c.toUpperCase());
  const room = deskSlug(input.name || input.what, 30) || "desk";
  return renderDeskSkill({
    kind: `custom-${room}`,
    title,
    room,
    visibility: "private",
    mode: "auto",
    who: [{ kind: "named" }],
    topic: "other",
    care: "normal",
    sheet: null,
    kickoff: `Welcome to the ${title} for {event}! Ask @{agent} anything here.`,
    body: [
      `- This room is for: ${input.what.trim() || title}.`,
      "- Answer questions about the event from the knowledge, short and friendly, with the source.",
      "- When you do not know, say so and pass the question to the crew. Never make up results, decisions or times.",
      "- Keep anything personal people post here inside this room.",
    ].join("\n"),
  });
}

/** The front matter and body from the writer's fields. */
export function customDeskText(d: CustomDeskDraft, input: { name: string }): string {
  const room = deskSlug(d.room || input.name || d.title, 30) || "desk";
  const kind = `custom-${deskSlug(input.name || d.room || d.title, 40) || room}`;
  const columns = [...new Set(d.columns.map(columnName).filter(Boolean))].slice(0, 8);
  let sheet: DeskSheet | null = null;
  if (d.has_sheet && columns.length) {
    const by = columnName(d.summary_by);
    const value = columnName(d.summary_value);
    const summary: DeskSheet["summary"] =
      d.summary_op === "none" || !columns.includes(by)
        ? null
        : d.summary_op === "count"
          ? { by, op: "count", value: null }
          : columns.includes(value)
            ? { by, op: d.summary_op, value }
            : null;
    sheet = { name: d.sheet_name.trim() || "Entries", columns, add: d.add.trim(), summary, link: "none" };
  }
  const body = d.behavior
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-*•]\s*/, "")}`))
    .join("\n");
  return renderDeskSkill({
    kind,
    title: d.title.trim() || "Custom desk",
    room,
    visibility: d.visibility,
    mode: d.mode,
    who: d.who === "topic" ? [{ kind: "topic", topic: d.topic }] : [{ kind: d.who }],
    topic: d.topic,
    care: d.care,
    sheet,
    kickoff: d.kickoff.trim(),
    body: body || "- Help the people here with their job at the event.",
  });
}

/**
 * One Haiku call writes a desk skill from the crew's request; the result is
 * checked with the same parser as the shipped skills, and a safe minimal skill
 * stands in when it is not valid.
 */
export async function writeCustomDesk(input: {
  choice: ModelChoice;
  what: string;
  name: string;
  eventName: string | null;
  sender: string;
  client?: Parameters<typeof structuredCall>[0]["client"];
}): Promise<{ text: string; skill: DeskSkill; fallback: boolean; error: string | null; usage: Usage | null }> {
  let text: string | null = null;
  let error: string | null = null;
  let usage: Usage | null = null;
  try {
    const out = await structuredCall({
      choice: input.choice,
      system: [{ type: "text", text: CUSTOM_SYSTEM, cache_control: { type: "ephemeral" } }],
      user: `Event: ${input.eventName ?? "(not set)"}\nAsked by: ${input.sender} (crew)\nName they gave: ${input.name || "(none)"}\nWhat the desk is for, in their words:\n${input.what}`,
      schema: CustomDeskSchema,
      maxTokens: 2500,
      client: input.client,
    });
    usage = out.usage;
    if (out.data) text = customDeskText(out.data, { name: input.name });
    else error = out.refused ? "the model declined" : "the model's answer did not fit the schema";
  } catch (err) {
    error = (err as Error).message;
  }
  if (text) {
    const p = parseDeskSkill(text);
    if (p.ok) return { text, skill: p.skill, fallback: false, error: null, usage };
    error = p.error;
  }
  const fb = fallbackDeskSkill({ what: input.what, name: input.name });
  const p = parseDeskSkill(fb);
  if (!p.ok) throw new Error(`fallback desk skill is invalid: ${p.error}`);
  return { text: fb, skill: p.skill, fallback: true, error, usage };
}

/** A skill key not taken yet in the community ("desks/custom-rangoli", then "desks/custom-rangoli-2"). */
export async function freeSkillKey(db: Db, communityId: string, key: string): Promise<string> {
  const taken = await db
    .select({ key: skills.key })
    .from(skills)
    .where(and(eq(skills.communityId, communityId), sql`${skills.key} like ${`${key}%`}`));
  const set = new Set(taken.map((t) => t.key));
  if (!set.has(key)) return key;
  for (let i = 2; i < 100; i++) if (!set.has(`${key}-${i}`)) return `${key}-${i}`;
  return `${key}-${Date.now()}`;
}

/** Save a skill Ferri wrote (a custom desk): a `skills` row, origin "ferri", with revision 1 "created". */
export async function saveFerriSkill(db: Db, input: { communityId: string; key: string; body: string; by: string }): Promise<{ id: string; version: number }> {
  const [row] = await db
    .insert(skills)
    .values({ communityId: input.communityId, key: input.key, body: input.body, version: 1, origin: "ferri", editedBy: input.by })
    .onConflictDoNothing({ target: [skills.communityId, skills.key] })
    .returning({ id: skills.id, version: skills.version });
  if (row) {
    await db.insert(skillRevisions).values({ skillId: row.id, version: 1, body: input.body, editedBy: input.by, change: "created" }).onConflictDoNothing();
    return row;
  }
  const [have] = await db.select({ id: skills.id, version: skills.version }).from(skills).where(and(eq(skills.communityId, input.communityId), eq(skills.key, input.key))).limit(1);
  if (!have) throw new Error(`could not save the skill ${input.key}`);
  return have;
}
