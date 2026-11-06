import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { guestMails, guestSends, guests, type Db } from "@ferri/db";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import { renderInstructions, renderKnowledge } from "./render.ts";
import type { LiveKnowledge } from "./store.ts";

// ── RSVP (spec 17): one guest list per event, from every source ───────────

export type Guest = typeof guests.$inferSelect;
export type GuestSend = typeof guestSends.$inferSelect;
export type GuestMail = typeof guestMails.$inferSelect;

export const GUEST_STATUSES = ["going", "waitlist", "pending", "not_going"] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];
export const GUEST_STATUS_LABEL: Record<string, string> = {
  going: "going",
  waitlist: "on the waitlist",
  pending: "waiting for approval",
  not_going: "not going",
};
export const GUEST_SOURCES = ["site", "luma", "import", "desk"] as const;
export type GuestSource = (typeof GUEST_SOURCES)[number];
export const SEND_KINDS = ["reminder", "nudge", "offer"] as const;
export type SendKind = (typeof SEND_KINDS)[number];
export const SEND_KIND_LABEL: Record<string, string> = { reminder: "reminder", nudge: "free-your-spot nudge", offer: "spot offer" };

/** A guest's private code: their RSVP link and reply address. Lowercase, so a reply address keeps it intact. */
export function newGuestCode(): string {
  return randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 8);
}

export const firstName = (name: string) => name.trim().split(/[\s._-]+/)[0] || name.trim();

/** Luma's `approval_status` as a guest status. */
export function lumaToStatus(s: string | null | undefined): GuestStatus {
  switch (s) {
    case "approved":
      return "going";
    case "waitlist":
      return "waitlist";
    case "pending_approval":
    case "invited":
      return "pending";
    default:
      return "not_going";
  }
}

/** The event site's registration status as a guest status. */
export function siteToStatus(s: string | null | undefined): GuestStatus {
  return s === "waitlist" ? "waitlist" : s === "cancelled" ? "not_going" : "going";
}

/** A status written in an imported list ("Going", "approved", "waitlist", "declined", "yes", ...). */
export function importedStatus(s: string | null | undefined): GuestStatus {
  const v = (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!v) return "going";
  if (/^(going|approved|yes|registered|confirmed|accepted|attending|checked_in)$/.test(v)) return "going";
  if (/wait/.test(v)) return "waitlist";
  if (/^(pending|pending_approval|invited|maybe)$/.test(v)) return "pending";
  if (/^(not_going|declined|no|cancelled|canceled|rejected)$/.test(v)) return "not_going";
  return "going";
}

/** Desk's public RSVP page for one guest. */
export function rsvpUrl(publicUrl: string, code: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/rsvp/${code}`;
}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i;

export interface GuestInput {
  communityId: string;
  eventId: string;
  email: string;
  name: string;
  source: GuestSource;
  status: GuestStatus;
  /** The source's own status word, kept as the source last reported it. */
  sourceStatus?: string | null;
  siteId?: string | null;
  lumaId?: string | null;
  team?: string | null;
  registeredAt?: Date | null;
  checkedInAt?: Date | null;
}

/**
 * Add or update one guest from a source. The source's status wins for the
 * people it owns, except that a guest who freed their spot with Ferri stays
 * not going until a source says otherwise in a newer way (Ferri changes the
 * source itself after a card). Returns the row and the status change, if any.
 */
export async function upsertGuest(db: Db, input: GuestInput): Promise<{ guest: Guest; created: boolean; from: string | null }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`not an email address: ${input.email}`);
  const [have] = await db.select().from(guests).where(and(eq(guests.eventId, input.eventId), eq(guests.email, email))).limit(1);
  const now = new Date();
  if (!have) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [row] = await db
        .insert(guests)
        .values({
          communityId: input.communityId,
          eventId: input.eventId,
          email,
          name: input.name.trim() || email.split("@")[0]!,
          sources: [input.source],
          siteId: input.siteId ?? null,
          lumaId: input.lumaId ?? null,
          status: input.status,
          lumaStatus: input.source === "luma" ? (input.sourceStatus ?? null) : null,
          siteStatus: input.source === "site" ? (input.sourceStatus ?? null) : null,
          team: input.team ?? null,
          code: newGuestCode(),
          registeredAt: input.registeredAt ?? now,
          checkedInAt: input.checkedInAt ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (row) return { guest: row, created: true, from: null };
      const [again] = await db.select().from(guests).where(and(eq(guests.eventId, input.eventId), eq(guests.email, email))).limit(1);
      if (again) return upsertGuest(db, input);
    }
    throw new Error("could not add the guest");
  }
  const sources = have.sources.includes(input.source) ? have.sources : [...have.sources, input.source];
  const sourceStatusChanged =
    input.source === "luma" ? input.sourceStatus !== undefined && input.sourceStatus !== have.lumaStatus : input.source === "site" ? input.sourceStatus !== undefined && input.sourceStatus !== have.siteStatus : true;
  // A source only moves the status when its own report changed, so a stale report never undoes Ferri's work.
  const status = sourceStatusChanged ? input.status : have.status;
  const [row] = await db
    .update(guests)
    .set({
      name: have.name || input.name,
      sources,
      siteId: input.siteId ?? have.siteId,
      lumaId: input.lumaId ?? have.lumaId,
      status,
      lumaStatus: input.source === "luma" ? (input.sourceStatus ?? have.lumaStatus) : have.lumaStatus,
      siteStatus: input.source === "site" ? (input.sourceStatus ?? have.siteStatus) : have.siteStatus,
      team: input.team ?? have.team,
      registeredAt: have.registeredAt ?? input.registeredAt ?? null,
      checkedInAt: input.checkedInAt ?? have.checkedInAt,
      // A source that shows a going guest as not going: that spot is free now.
      freedAt: have.status === "going" && status === "not_going" ? (have.freedAt ?? now) : status === "going" ? null : have.freedAt,
      spotHandledAt: have.status === "going" && status === "not_going" ? null : have.spotHandledAt,
      updatedAt: now,
    })
    .where(eq(guests.id, have.id))
    .returning();
  return { guest: row!, created: false, from: status !== have.status ? have.status : null };
}

// ── Imported lists (CSV) ──────────────────────────────────────────────────

/** Split one CSV line (quotes, doubled quotes, commas, semicolons or tabs). */
function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * The guests in a CSV export (Luma's own, Tally, Google Forms, a sheet): a
 * header row with an email column and a name (or first and last name)
 * column; an approval_status or status column when there is one.
 */
export function parseGuestCsv(text: string): { rows: { name: string; email: string; status: GuestStatus; team: string | null }[]; skipped: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: ["The file is empty."] };
  const first = lines[0]!;
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  const head = splitCsv(first, sep).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const col = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));
  const iEmail = col(/^e ?mail( address)?$/, /email/);
  const iName = col(/^(full )?name$/, /^your name$/, /^name/);
  const iFirst = col(/^first( name)?$/, /first name/);
  const iLast = col(/^last( name)?$/, /last name|surname/);
  const iStatus = col(/^approval status$/, /^status$/, /rsvp/, /attending/);
  const iTeam = col(/^team( name)?$/, /team/);
  if (iEmail < 0) return { rows: [], skipped: ["No email column in the header."] };
  const rows: { name: string; email: string; status: GuestStatus; team: string | null }[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const c = splitCsv(line, sep);
    const email = (c[iEmail] ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) {
      skipped.push(`No valid email: ${line.slice(0, 80)}`);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const name = (iName >= 0 ? c[iName] : [iFirst >= 0 ? c[iFirst] : "", iLast >= 0 ? c[iLast] : ""].join(" "))?.trim() || email.split("@")[0]!;
    rows.push({ name, email, status: importedStatus(iStatus >= 0 ? c[iStatus] : null), team: iTeam >= 0 ? c[iTeam]?.trim() || null : null });
  }
  return { rows, skipped };
}

// ── Reading the list ──────────────────────────────────────────────────────

export async function listGuests(db: Db, eventId: string, statuses?: string[]): Promise<Guest[]> {
  return db
    .select()
    .from(guests)
    .where(and(eq(guests.eventId, eventId), statuses?.length ? inArray(guests.status, statuses) : undefined))
    .orderBy(asc(guests.registeredAt), asc(guests.createdAt));
}

export async function guestCounts(db: Db, eventId: string): Promise<{ going: number; waitlist: number; pending: number; not_going: number; checked_in: number; total: number }> {
  const rows = await db
    .select({ status: guests.status, n: sql<number>`count(*)::int`, checked: sql<number>`count(${guests.checkedInAt})::int` })
    .from(guests)
    .where(eq(guests.eventId, eventId))
    .groupBy(guests.status);
  const out = { going: 0, waitlist: 0, pending: 0, not_going: 0, checked_in: 0, total: 0 };
  for (const r of rows) {
    if (r.status in out) (out as Record<string, number>)[r.status] = r.n;
    out.checked_in += r.checked;
    out.total += r.n;
  }
  return out;
}

/** "42 going, 3 on the waitlist, 2 not going" */
export function countsLine(c: Awaited<ReturnType<typeof guestCounts>>, capacity: number | null): string {
  const parts = [`${c.going} going${capacity ? ` of ${capacity}` : ""}`];
  if (c.waitlist) parts.push(`${c.waitlist} on the waitlist`);
  if (c.pending) parts.push(`${c.pending} waiting for approval`);
  if (c.not_going) parts.push(`${c.not_going} not going`);
  if (c.checked_in) parts.push(`${c.checked_in} checked in`);
  return parts.join(", ");
}

/** The first person on the waitlist (registered first) who has no open offer. */
export async function nextOnWaitlist(db: Db, eventId: string): Promise<Guest | null> {
  const [row] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.eventId, eventId), eq(guests.status, "waitlist"), sql`(${guests.offerExpiresAt} is null or ${guests.offerExpiresAt} < now())`, sql`${guests.offeredAt} is null`))
    .orderBy(asc(guests.registeredAt), asc(guests.createdAt))
    .limit(1);
  return row ?? null;
}

export async function recentSends(db: Db, eventId: string, limit = 30): Promise<GuestSend[]> {
  return db.select().from(guestSends).where(eq(guestSends.eventId, eventId)).orderBy(desc(guestSends.createdAt)).limit(limit);
}

/** Guest emails sent in the last 24 hours (the daily cap). */
export async function guestMailsToday(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guestMails)
    .where(and(inArray(guestMails.status, ["sent", "delivered", "bounced", "complained"]), sql`${guestMails.sentAt} > now() - interval '24 hours'`));
  return row?.n ?? 0;
}

// ── What the emails say ───────────────────────────────────────────────────

/** The RSVP lines added to every guest email, per guest. */
export function rsvpLines(kind: SendKind, url: string): string {
  if (kind === "offer") return `Will you take the spot? Tap here to say yes: ${url}\nIf you can't make it, tap the same link and say no, so it goes to the next person.`;
  if (kind === "nudge") return `Still coming? Tap here to tell us: ${url}\nIf you can't make it, the same link frees your spot for someone on the waitlist.`;
  return `Your RSVP: ${url} (tap it to tell us if you can't make it any more).`;
}

/** One guest's copy: "Hi Asha," + the body with {first} filled in + their RSVP lines. */
export function personalText(input: { kind: SendKind; text: string; name: string; url: string; eventName: string }): string {
  const first = firstName(input.name);
  const body = input.text.replace(/\{first\}/g, first).trim();
  const greeting = /^(hi|hello|hey|dear)\b/i.test(body) ? "" : `Hi ${first},\n\n`;
  return `${greeting}${body}\n\n${rsvpLines(input.kind, input.url)}\n\nYou're getting this because you registered for ${input.eventName}.`;
}

export const GuestDraftSchema = z.strictObject({
  subject: z.string(),
  text: z.string(),
  missing: z.array(z.string()),
});
export type GuestDraft = z.infer<typeof GuestDraftSchema>;

const DRAFT_SYSTEM = `You write one email that Ferri, the AI teammate of a community's organizing crew, sends to the people registered for one of its events. The crew approves it on a card first.

Kinds:
- reminder: before the event: when and where, what to bring and anything the crew asked to say. Warm, short.
- nudge: the event is full or nearly full and people are waiting for a spot: ask each guest to confirm they are still coming, and to free their spot if they can't make it, so someone on the waitlist can come. Kind, never guilt-tripping.
- offer: a spot opened up for someone on the waitlist: tell them, and ask them to say yes within 24 hours, or the spot goes to the next person.

Rules:
- Use only facts from the knowledge below (date, time, venue, what to bring, schedule). Never invent one. Name the event's date ("Saturday, 21 November"); say "tomorrow" or "this Saturday" only when Now shows it is true, since the email may go out on another day. Anything the crew asked for that the knowledge does not cover goes in missing, and the email leaves it out.
- Start with "Hi {first}," on its own line: {first} is filled with each guest's first name. Write the body for one person.
- Do not add a link, an RSVP line, a sign-off with a person's name, or an unsubscribe line: Ferri adds the guest's own RSVP link and the footer. End with "See you there," and the community's name for reminders and nudges, "Hope to see you there," and the community's name for offers.
- Plain text, under 150 words, no markdown. subject: under 70 characters and names the event.`;

export async function draftGuestEmail(input: {
  choice: ModelChoice;
  kb: LiveKnowledge;
  eventId: string;
  kind: SendKind;
  ask: string;
  now: string;
}): Promise<{ draft: GuestDraft | null; usage: Usage }> {
  const entries = input.kb.entries.filter((e) => e.eventId === input.eventId || e.eventId === null);
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: DRAFT_SYSTEM, cache_control: { type: "ephemeral" } }],
    user:
      `${renderInstructions(input.kb)}\n\n${renderKnowledge(entries).text}\n\n` +
      `Now: ${input.now}\nEvent: ${input.kb.events.find((e) => e.id === input.eventId)?.name ?? "the event"}\nKind: ${input.kind}\nWhat the crew asked it to say: ${input.ask || "(nothing beyond the kind)"}`,
    schema: GuestDraftSchema,
    maxTokens: 2000,
  });
  return { draft: out.data, usage: out.usage };
}

export const GuestReplySchema = z.strictObject({
  want: z.enum(["coming", "not_coming", "question", "other"]),
  summary: z.string(),
});
export type GuestReply = z.infer<typeof GuestReplySchema>;

/** A guest's reply to one of Ferri's emails: are they coming, not coming, asking something? */
export async function readGuestReply(input: { choice: ModelChoice; eventName: string; ours: string | null; theirs: string; name: string }): Promise<{ reading: GuestReply | null; usage: Usage }> {
  const out = await structuredCall({
    choice: input.choice,
    system: [
      {
        type: "text",
        text:
          "A guest registered for a community event replied to an email from the organizers. Decide what they want. " +
          "coming: they confirm they will come. not_coming: they can't or won't come any more, or ask to cancel or free their spot. " +
          "question: they ask something. other: anything else (thanks, an auto-reply). summary: one line for the crew, naming the guest, in plain words.",
      },
    ],
    user: `Event: ${input.eventName}\nGuest: ${input.name}\nOur email:\n${(input.ours ?? "(unknown)").slice(0, 1500)}\n\nTheir reply:\n${input.theirs.slice(0, 3000)}`,
    schema: GuestReplySchema,
    maxTokens: 800,
  });
  return { reading: out.data, usage: out.usage };
}
