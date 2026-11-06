import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { announcementVersions, announcements, eventSpaces, spaces, type Db, type SwitchMedia } from "@ferri/db";
import type { CrewMember } from "./crew.ts";
import type { RecentAnnouncement } from "./intent.ts";
import { shortAnnouncementIds } from "./intent.ts";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import type { LiveKnowledge } from "./store.ts";
import type { ChatLine } from "./triage.ts";

/**
 * Launch, and inside to outside (spec 09): what the crew decides becomes an
 * announcement on every space of the event after one approval.
 */

// ── Time ──────────────────────────────────────────────────────────────────

/** "Friday 6 November 2026, 3:10 am (Asia/Kolkata, GMT+05:30)", for resolving "at 6 PM". */
export function localNow(timeZone: string, now = new Date()): string {
  const when = now.toLocaleString("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  const offset = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "UTC";
  return `${when} (${timeZone}, ${offset})`;
}

/** A model's ISO time, accepted only when it is a real time from (almost) now up to 60 days ahead. */
export function parseWhen(iso: string | null | undefined, now = new Date()): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return null;
  const t = d.getTime() - now.getTime();
  if (t < -2 * 60_000 || t > 60 * 86400_000) return null;
  return d;
}

/** "6:00 PM, Fri 6 Nov" in the community's zone. */
export function formatWhen(d: Date, timeZone: string): string {
  const time = d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" });
  return `${time}, ${day}`;
}

// ── Where an announcement goes ────────────────────────────────────────────

export interface TargetSpace {
  spaceId: string;
  roomId: string;
  name: string;
  platform: string | null;
  mode: "approve" | "auto";
}

/**
 * The spaces an announcement for this event goes to: attached as Auto or
 * Approve, members (not the crew room), not archived. Listen spaces never
 * get posts. `only` narrows it to the spaces an organizer picked.
 */
export async function announcementTargets(db: Db, eventId: string | null, only?: string[] | null): Promise<TargetSpace[]> {
  if (!eventId) return [];
  const rows = await db
    .select({ spaceId: spaces.id, roomId: spaces.switchRoomId, name: spaces.name, platform: spaces.platform, mode: eventSpaces.mode })
    .from(eventSpaces)
    .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
    .where(and(eq(eventSpaces.eventId, eventId), eq(eventSpaces.role, "members"), eq(spaces.archived, false), inArray(eventSpaces.mode, ["approve", "auto"])))
    .orderBy(spaces.platform, spaces.name);
  const out = rows.map((r) => ({ ...r, mode: r.mode as "approve" | "auto" }));
  return only?.length ? out.filter((t) => only.includes(t.spaceId)) : out;
}

/** "4 spaces: Slack build-night, Discord build-night, Telegram Lantern Build Night, Mattermost ferri-lab". */
export function describeTargets(targets: { name: string; platform: string | null }[]): string {
  if (!targets.length) return "no spaces";
  return `${targets.length} ${targets.length === 1 ? "space" : "spaces"}: ${targets.map(spaceLabel).join(", ")}`;
}

/** "Slack build-night": the platform, then the chat's own name. */
export function spaceLabel(t: { name: string; platform: string | null }): string {
  const short = t.name.includes(": ") ? t.name.slice(t.name.indexOf(": ") + 2) : t.name;
  const p = t.platform ? `${t.platform.charAt(0).toUpperCase()}${t.platform.slice(1)}` : "Switch";
  return `${p} ${short}`;
}

/** Announcements the crew may refer to ("change the lunch announcement"): the latest 8, newest first. */
export async function recentAnnouncements(db: Db, communityId: string, eventId: string | null): Promise<RecentAnnouncement[]> {
  const rows = await db
    .select({ id: announcements.id, title: announcements.title, text: announcements.text, status: announcements.status })
    .from(announcements)
    .where(and(eq(announcements.communityId, communityId), eventId ? eq(announcements.eventId, eventId) : undefined))
    .orderBy(desc(announcements.createdAt))
    .limit(8);
  return rows
    .filter((r) => ["requested", "waiting", "scheduled", "sent"].includes(r.status))
    .map((r) => ({ id: r.id, title: r.title, text: r.text ?? r.title, status: r.status }));
}

// ── Drafting ──────────────────────────────────────────────────────────────

export const DraftSchema = z.strictObject({ title: z.string(), text: z.string() });
export type Draft = z.infer<typeof DraftSchema>;

const DRAFT_SYSTEM = `You write announcements for Ferri, the AI teammate of a community that runs events. The organizing crew decided something and wants every member told, on every platform the event uses (Telegram, Slack, Discord, WhatsApp and others). One post goes everywhere, so it must read well anywhere.

Rules:
- Use only the facts in "What to tell" (and the current post, for a revision). You may name the event; take nothing else from the community and event blocks: no venue, address, date or time that "What to tell" does not give. Never add a time, date, place, name, price, link or rule that is not there.
- Lead with the news. One to four short sentences. Plain text: no markdown headings, no tables, no hashtags.
- Never write @everyone, @channel, @here or any @mention.
- Follow the community and event instructions on tone, language and sign-off. Write in the language the instructions use; English when they do not say.
- For a revision, write the whole post as it should read now: keep what is still true from the current post and change what the request changes. When people may already have acted on the old version, say what changed ("Lunch is now at 1:45 PM, not 1:30.").
- title: 3 to 8 words naming the news, for the crew's lists ("Lunch moves to 1:30 PM").`;

/**
 * The organizers' instructions for tone, language and sign-off, and the event's
 * name. No venue, dates or times: the drafter must take facts only from the request.
 */
function toneOnly(kb: LiveKnowledge): string {
  const lines = [`<community name="${kb.community.name}">`, kb.community.instructions || "(no central instructions)", "</community>"];
  for (const e of kb.events) lines.push(`<event name="${e.name}">`, e.instructions || "(no event instructions)", "</event>");
  return lines.join("\n");
}

export async function draftAnnouncement(input: {
  choice: ModelChoice;
  kb: LiveKnowledge;
  what: string;
  /** Set for a revision: the post as it reads now. */
  current?: string | null;
  sender: string;
}): Promise<{ draft: Draft | null; usage: Usage; latencyMs: number }> {
  const user = [
    toneOnly(input.kb),
    input.current ? `Current post:\n${input.current}` : null,
    `What to tell (from ${input.sender}, on the crew):\n${input.what}`,
    input.current ? "Write the revised post." : "Write the announcement.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: DRAFT_SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: DraftSchema,
    maxTokens: 3000,
  });
  const d = out.data;
  const draft = d && d.text.trim() ? { title: d.title.trim().slice(0, 120) || d.text.trim().slice(0, 60), text: stripRoomWide(d.text.trim()).slice(0, 3000) } : null;
  return { draft, usage: out.usage, latencyMs: out.latencyMs };
}

/** An announcement never pages a whole channel. */
export function stripRoomWide(text: string): string {
  return text.replace(/(^|\s)@(everyone|channel|here|all)\b[:,]?\s*/gi, "$1").trim();
}

// ── Decisions in crew chatter ─────────────────────────────────────────────

export const DecisionSchema = z.strictObject({
  decision: z.boolean(),
  for_members: z.boolean(),
  final: z.boolean(),
  what: z.string(),
  changes: z.string().nullable(),
  duplicate_of: z.string().nullable(),
});
export type CrewDecision = z.infer<typeof DecisionSchema>;

const DECISION_SYSTEM = `You watch the organizing crew's own chat room for Ferri, the AI teammate of a community that runs events. When the crew settles something the members (participants, mentors, the community outside the crew) need to know, Ferri offers to announce it. It never posts without an approval, but a wrong offer is noise, so be strict.

Fields:
- decision: this message itself states something settled: a new or changed time, place, rule, deadline, menu, prize or plan ("ok let's push judging to 4pm", "lunch moves to 1:30", "final call: no outside food", "we're doing it in hall B"). False for ideas, questions and proposals ("should we push judging?", "maybe 4?"), even when a later message settles them: that later message is checked on its own. False for status updates ("pizza ordered") and chat. Agreeing with a decision just made ("agreed, 4pm") is not a new decision.
- for_members: the members need to know it or act on it. False for crew-only logistics (who buys tape, volunteer shifts, crew dinner, budgets).
- final: nothing in "Messages after it" walks it back or leaves it open ("wait, let's check with the venue first"). If a later message settles it differently, it is still final: describe the settled version.
- what: the settled decision as one standalone statement for the members, with every fact from the chat that it needs ("Judging moves to 4:00 PM on Saturday."). "" when decision is false.
- changes: the id (A1, A2, ...) of a recent announcement this decision changes, else null.
- duplicate_of: the id of a recent announcement that already says exactly this, else null.`;

export async function checkDecision(input: {
  choice: ModelChoice;
  sender: string;
  message: string;
  before: ChatLine[];
  after?: ChatLine[];
  announcements: RecentAnnouncement[];
}): Promise<{ decision: CrewDecision | null; changes: RecentAnnouncement | null; duplicate: RecentAnnouncement | null; usage: Usage; latencyMs: number }> {
  const recent = shortAnnouncementIds(input.announcements);
  const lines = (l: ChatLine[] | undefined) => (l?.length ? l.map((x) => `${x.sender}: ${x.body}`).join("\n") : "(none)");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: DECISION_SYSTEM, cache_control: { type: "ephemeral" } }],
    user:
      `Recent announcements:\n${recent.text}\n\nMessages before it:\n${lines(input.before.slice(-8))}\n\n` +
      `The message, from ${input.sender} (crew):\n${input.message}\n\nMessages after it:\n${lines(input.after)}`,
    schema: DecisionSchema,
    maxTokens: 1500,
  });
  const d = out.data;
  const pick = (id: string | null | undefined) => (id ? (recent.byShort.get(id.trim().toUpperCase()) ?? null) : null);
  return { decision: d, changes: pick(d?.changes), duplicate: pick(d?.duplicate_of), usage: out.usage, latencyMs: out.latencyMs };
}

/** Whether a decision check says Ferri should offer an announcement. */
export function worthAnnouncing(d: CrewDecision | null): d is CrewDecision {
  return !!d && d.decision && d.for_members && d.final && d.what.trim().length > 0;
}

// ── Team rooms ────────────────────────────────────────────────────────────

/** "Team Alpha" becomes "team-alpha"; Switch and the platforms like plain channel names. */
export function teamRoomName(team: string): string {
  const slug = team
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = slug || "team";
  return base.startsWith("team") ? base : `team-${base}`;
}

/** Quote a string for YAML (double-quoted scalar). */
const yq = (s: string) => JSON.stringify(s);

/**
 * A Switch template (version 2) that makes one private channel per team on a
 * bridge, with the members, Ferri, and a kickoff message.
 */
export function teamRoomsTemplate(input: {
  bridge: string;
  agentName: string;
  eventName: string;
  teams: { name: string; roomName: string; members: string[] }[];
}): string {
  const lines = ["version: 2", "resources:"];
  input.teams.forEach((t, i) => {
    lines.push(
      `  team_${i + 1}:`,
      "    type: room",
      `    name: ${yq(t.roomName)}`,
      `    description: ${yq(`${t.name}, ${input.eventName}`)}`,
      `    bridge: ${yq(input.bridge)}`,
      "    channel_type: channel_private",
      `    agents: [${yq(input.agentName)}]`,
      `    users: [${t.members.map(yq).join(", ")}]`,
      `    kickoff: ${yq(`Welcome, ${t.name}! This is your team room for ${input.eventName}. Ask @${input.agentName} anything about the event here.`)}`,
    );
  });
  return lines.join("\n") + "\n";
}

/** Who approves announcements: the leads, else whoever is on duty, else the whole crew. */
export function approvers(crew: CrewMember[]): { owners: CrewMember[]; reason: "lead" | "on_duty" | "everyone" } {
  const leads = crew.filter((c) => c.lead);
  if (leads.length) return { owners: leads, reason: "lead" };
  const duty = crew.filter((c) => c.onDuty);
  if (duty.length) return { owners: duty, reason: "on_duty" };
  return { owners: crew, reason: "everyone" };
}

/** The new room's id in whatever `create_room_from_yaml` returned. */
export function findRoomId(out: unknown, roomName: string): string | null {
  const seen: { id: string; name?: string }[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const id = o.room_id ?? o.id;
      if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) seen.push({ id, name: typeof o.name === "string" ? o.name : undefined });
      Object.values(o).forEach(walk);
    }
  };
  walk(out);
  return (seen.find((s) => s.name === roomName) ?? seen[0])?.id ?? null;
}

// ── Written by an organizer in Desk or Pocket (Ferri opens the card) ─────

/** The first sentence of a post, as its title in lists. */
export function titleFrom(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0] ?? text;
  const t = first.replace(/[.!?]+$/, "").trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t || "Announcement";
}

/**
 * A new announcement in the organizer's own words. It still needs one OK:
 * Ferri opens the card on its next tick, and the writer may approve it.
 */
export async function createAnnouncementRequest(
  db: Db,
  input: {
    communityId: string;
    eventId: string;
    text: string;
    title?: string | null;
    scheduledAt: Date | null;
    targetSpaceIds: string[] | null;
    by: string;
    origin: "desk" | "pocket" | "builder";
    /** Why it exists, for the card ("the Builder made the poster"). */
    reason?: string;
    /** Images to post with the text (spec 13). */
    media?: SwitchMedia[] | null;
  },
): Promise<string> {
  const text = stripRoomWide(input.text.trim());
  if (!text) throw new Error("Write the announcement first.");
  const title = input.title?.trim() || titleFrom(text);
  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(announcements)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        title,
        status: "requested",
        scheduledAt: input.scheduledAt,
        targetSpaceIds: input.targetSpaceIds?.length ? input.targetSpaceIds : null,
        origin: input.origin,
        requestedBy: input.by,
        media: input.media?.length ? input.media : null,
      })
      .returning({ id: announcements.id });
    const reason = input.reason ?? (input.origin === "builder" ? "the Builder put the site live" : "written in " + (input.origin === "desk" ? "Desk" : "Pocket"));
    await tx.insert(announcementVersions).values({ announcementId: a!.id, version: 1, title, draft: text, reason, proposedBy: input.by });
    return a!.id;
  });
}

/** A new version of an announcement in the organizer's words: edits every post once approved. */
export async function proposeAnnouncementEdit(db: Db, input: { announcementId: string; text: string; by: string }): Promise<number> {
  const text = stripRoomWide(input.text.trim());
  if (!text) throw new Error("Write the new version first.");
  const [a] = await db.select().from(announcements).where(eq(announcements.id, input.announcementId)).limit(1);
  if (!a) throw new Error("No such announcement.");
  if (a.text?.trim() === text) throw new Error("That is the text it already has.");
  const [last] = await db
    .select({ version: announcementVersions.version })
    .from(announcementVersions)
    .where(eq(announcementVersions.announcementId, a.id))
    .orderBy(desc(announcementVersions.version))
    .limit(1);
  const version = (last?.version ?? 0) + 1;
  await db.insert(announcementVersions).values({ announcementId: a.id, version, title: titleFrom(text), draft: text, reason: "edited by an organizer", proposedBy: input.by });
  return version;
}

