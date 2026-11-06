import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentState,
  announcementPosts,
  announcementVersions,
  announcements,
  builderJobs,
  cards,
  careCases,
  contactEvents,
  contactMessages,
  contacts,
  crewMembers,
  deskRows,
  desks,
  eventRecaps,
  eventSpaces,
  events,
  guestMails,
  guestSends,
  guests,
  knowledgeEntries,
  planItems,
  questions,
  shieldEvents,
  spaces,
  starterKits,
  type Db,
} from "@ferri/db";
import { loadCrew } from "./crew.ts";
import { createEntry } from "./edit.ts";
import { slugify } from "./markdown.ts";
import { structuredCall, type ModelChoice } from "./model.ts";
import { setContactStatus, upsertContact } from "./outreach.ts";
import { latestAgenda } from "./plan.ts";

// ── Wrap (spec 19): the recap, partners, the starter kit, closing ─────────

export type EventRow = typeof events.$inferSelect;
export type EventRecap = typeof eventRecaps.$inferSelect;
export type StarterKit = typeof starterKits.$inferSelect;

const n = (v: unknown) => Number(v ?? 0) || 0;
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

// ── The numbers (no model) ────────────────────────────────────────────────

/**
 * Every number in the recap, computed from Ferri's own tables. Definitions
 * (so each line can be checked with one SQL count):
 * - questions: rows in `questions` for the event whose outcome is not "chat".
 *   answeredByFerri: outcome "answered"; answeredByCrew: resolution "answered"
 *   (a card); unanswered: outcome "unknown" and not resolved as answered;
 *   listened: outcome "listened" (Listen spaces). Medians: Ferri's latency_ms,
 *   the crew's resolved_at minus asked_at.
 * - knowledge.crewAnswers: the event's knowledge entries with source kind crew_answer.
 * - cards: rows in `cards` for the event, by kind and status.
 * - announcements: status sent; spaces: distinct rooms with a post; edits: approved versions after the first.
 * - care: cases for the event; byBuilder: solved by "the Builder"; open: open, helping or builder.
 * - guests: the event's guest list; guestEmails: sends with status sent, their mails sent or delivered.
 * - outreach: contact messages tagged with the event (emailed: distinct contacts with a sent email),
 *   and contacts for the event (by contacts.event_id or a message) by status.
 * - listings: Builder listing jobs done with a live address; builder: jobs done by kind.
 * - shield: checks in the event's rooms between the event's creation and its close (or now).
 */
export interface RecapStats {
  event: { name: string; startsAt: string | null; endsAt: string | null };
  questions: {
    asked: number;
    people: number;
    answeredByFerri: number;
    answeredByCrew: number;
    unanswered: number;
    listened: number;
    medianFerriSeconds: number | null;
    medianCrewMinutes: number | null;
    platforms: string[];
  };
  knowledge: { crewAnswers: number };
  cards: { opened: number; byKind: Record<string, number>; answered: number; expired: number; dismissed: number };
  announcements: { sent: number; spaces: number; edits: number };
  care: { cases: number; solved: number; byBuilder: number; open: number };
  guests: {
    registered: number;
    going: number;
    waitlist: number;
    pending: number;
    notGoing: number;
    checkedIn: number;
    confirmed: number;
    freed: number;
    reoffered: number;
    sources: Record<string, number>;
  };
  guestEmails: { sends: number; mails: number; delivered: number };
  outreach: { emailed: number; replies: number; interested: number; declined: number };
  listings: { platform: string; url: string }[];
  builder: { done: number; byKind: Record<string, number> };
  shield: { checks: number; blocked: number; redacted: number };
  spaces: { count: number; platforms: string[] };
  computedAt: string;
}

/** A space as the kit keeps it: where it was and how Ferri worked there. */
export interface KitSpace {
  spaceId: string;
  roomId: string;
  name: string;
  platform: string | null;
  mode: "listen" | "approve" | "auto";
  role: "members" | "crew";
}

/** The event's attached spaces now (empty once it is closed). */
export async function eventSpacesNow(db: Db, eventId: string): Promise<KitSpace[]> {
  const rows = await db
    .select({ spaceId: spaces.id, roomId: spaces.switchRoomId, name: spaces.name, platform: spaces.platform, mode: eventSpaces.mode, role: eventSpaces.role })
    .from(eventSpaces)
    .innerJoin(spaces, eq(spaces.id, eventSpaces.spaceId))
    .where(eq(eventSpaces.eventId, eventId))
    .orderBy(asc(spaces.name));
  return rows;
}

export async function eventById(db: Db, eventId: string): Promise<EventRow | null> {
  const [e] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  return e ?? null;
}

/** The event's newest starter kit (one per event). */
export async function kitForEvent(db: Db, eventId: string): Promise<StarterKit | null> {
  const [k] = await db.select().from(starterKits).where(eq(starterKits.fromEventId, eventId)).limit(1);
  return k ?? null;
}

export async function kitById(db: Db, id: string): Promise<StarterKit | null> {
  const [k] = await db.select().from(starterKits).where(eq(starterKits.id, id)).limit(1);
  return k ?? null;
}

export async function listKits(db: Db, communityId: string): Promise<StarterKit[]> {
  return db.select().from(starterKits).where(eq(starterKits.communityId, communityId)).orderBy(desc(starterKits.updatedAt));
}

export async function latestRecap(db: Db, eventId: string): Promise<EventRecap | null> {
  const [r] = await db.select().from(eventRecaps).where(eq(eventRecaps.eventId, eventId)).orderBy(desc(eventRecaps.createdAt)).limit(1);
  return r ?? null;
}

/** The spaces an event used: attached now, else the ones its kit saved. */
export async function eventSpacesEver(db: Db, eventId: string): Promise<KitSpace[]> {
  const now = await eventSpacesNow(db, eventId);
  if (now.length) return now;
  const kit = await kitForEvent(db, eventId);
  return ((kit?.content as Partial<StarterKitContent> | undefined)?.spaces ?? []) as KitSpace[];
}

/** Every number of the recap, from the tables. */
export async function recapStats(db: Db, eventId: string, now = new Date()): Promise<RecapStats> {
  const event = await eventById(db, eventId);
  if (!event) throw new Error("no such event");
  const evq = eq(questions.eventId, eventId);

  const [q] = await db
    .select({
      asked: sql<number>`count(*) filter (where ${questions.outcome} <> 'chat')::int`,
      people: sql<number>`count(distinct ${questions.askerId}) filter (where ${questions.outcome} <> 'chat')::int`,
      ferri: sql<number>`count(*) filter (where ${questions.outcome} = 'answered')::int`,
      crew: sql<number>`count(*) filter (where ${questions.resolution} = 'answered')::int`,
      unanswered: sql<number>`count(*) filter (where ${questions.outcome} = 'unknown' and ${questions.resolution} is distinct from 'answered')::int`,
      listened: sql<number>`count(*) filter (where ${questions.outcome} = 'listened')::int`,
      medFerri: sql<number | null>`percentile_cont(0.5) within group (order by ${questions.latencyMs}) filter (where ${questions.outcome} = 'answered' and ${questions.latencyMs} is not null)`,
      medCrew: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${questions.resolvedAt} - ${questions.askedAt}))) filter (where ${questions.resolution} = 'answered' and ${questions.resolvedAt} is not null)`,
    })
    .from(questions)
    .where(evq);
  const qPlatforms = await db
    .selectDistinct({ platform: spaces.platform })
    .from(questions)
    .innerJoin(spaces, eq(spaces.id, questions.spaceId))
    .where(and(evq, sql`${questions.outcome} <> 'chat'`, isNotNull(spaces.platform)));

  const [k] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(knowledgeEntries)
    .where(and(eq(knowledgeEntries.eventId, eventId), eq(knowledgeEntries.sourceKind, "crew_answer")));

  const cardRows = await db
    .select({ kind: cards.kind, status: cards.status, c: sql<number>`count(*)::int` })
    .from(cards)
    .where(eq(cards.eventId, eventId))
    .groupBy(cards.kind, cards.status);
  const byKind: Record<string, number> = {};
  let opened = 0;
  const byStatus: Record<string, number> = {};
  for (const r of cardRows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + n(r.c);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + n(r.c);
    opened += n(r.c);
  }

  const [a] = await db
    .select({ sent: sql<number>`count(*) filter (where ${announcements.status} = 'sent')::int` })
    .from(announcements)
    .where(eq(announcements.eventId, eventId));
  const [ap] = await db
    .select({ c: sql<number>`count(distinct ${announcementPosts.roomId})::int` })
    .from(announcementPosts)
    .innerJoin(announcements, eq(announcements.id, announcementPosts.announcementId))
    .where(and(eq(announcements.eventId, eventId), inArray(announcementPosts.status, ["posted", "edited", "reposted"])));
  const [av] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(announcementVersions)
    .innerJoin(announcements, eq(announcements.id, announcementVersions.announcementId))
    .where(and(eq(announcements.eventId, eventId), eq(announcementVersions.status, "approved"), sql`${announcementVersions.version} > 1`));

  const [cc] = await db
    .select({
      cases: sql<number>`count(*)::int`,
      solved: sql<number>`count(*) filter (where ${careCases.status} = 'solved')::int`,
      byBuilder: sql<number>`count(*) filter (where ${careCases.status} = 'solved' and ${careCases.closedBy} = 'the Builder')::int`,
      open: sql<number>`count(*) filter (where ${careCases.status} in ('open', 'helping', 'builder'))::int`,
    })
    .from(careCases)
    .where(eq(careCases.eventId, eventId));

  const [g] = await db
    .select({
      registered: sql<number>`count(*)::int`,
      going: sql<number>`count(*) filter (where ${guests.status} = 'going')::int`,
      waitlist: sql<number>`count(*) filter (where ${guests.status} = 'waitlist')::int`,
      pending: sql<number>`count(*) filter (where ${guests.status} = 'pending')::int`,
      notGoing: sql<number>`count(*) filter (where ${guests.status} = 'not_going')::int`,
      checkedIn: sql<number>`count(*) filter (where ${guests.checkedInAt} is not null)::int`,
      confirmed: sql<number>`count(*) filter (where ${guests.confirmedAt} is not null)::int`,
      freed: sql<number>`count(*) filter (where ${guests.freedAt} is not null)::int`,
      reoffered: sql<number>`count(*) filter (where ${guests.offeredAt} is not null)::int`,
    })
    .from(guests)
    .where(eq(guests.eventId, eventId));
  const sourceRows = (await db.execute(
    sql`select s as source, count(*)::int as c from ${guests}, unnest(${guests.sources}) as s where ${guests.eventId} = ${eventId} group by s order by s`,
  )) as unknown as { source: string; c: number }[];

  const [gs] = await db
    .select({ sends: sql<number>`count(*)::int` })
    .from(guestSends)
    .where(and(eq(guestSends.eventId, eventId), eq(guestSends.status, "sent")));
  const [gm] = await db
    .select({
      mails: sql<number>`count(*) filter (where ${guestMails.status} in ('sent', 'delivered'))::int`,
      delivered: sql<number>`count(*) filter (where ${guestMails.status} = 'delivered')::int`,
    })
    .from(guestMails)
    .innerJoin(guestSends, eq(guestSends.id, guestMails.sendId))
    .where(eq(guestSends.eventId, eventId));

  const [om] = await db
    .select({
      emailed: sql<number>`count(distinct ${contactMessages.contactId}) filter (where ${contactMessages.direction} = 'out' and ${contactMessages.sentAt} is not null)::int`,
      replies: sql<number>`count(*) filter (where ${contactMessages.direction} = 'in')::int`,
    })
    .from(contactMessages)
    .where(eq(contactMessages.eventId, eventId));
  const [oc] = await db
    .select({
      interested: sql<number>`count(*) filter (where ${contacts.status} in ('interested', 'partner'))::int`,
      declined: sql<number>`count(*) filter (where ${contacts.status} in ('declined', 'do_not_contact'))::int`,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.communityId, event.communityId),
        or(eq(contacts.eventId, eventId), sql`${contacts.id} in (select ${contactMessages.contactId} from ${contactMessages} where ${contactMessages.eventId} = ${eventId})`),
      ),
    );

  const jobs = await db
    .select({ kind: builderJobs.kind, url: builderJobs.url })
    .from(builderJobs)
    .where(and(eq(builderJobs.eventId, eventId), eq(builderJobs.status, "done")))
    .orderBy(asc(builderJobs.number));
  const jobKinds: Record<string, number> = {};
  for (const j of jobs) jobKinds[j.kind] = (jobKinds[j.kind] ?? 0) + 1;
  const listings = jobs
    .filter((j) => j.kind === "listing" && j.url && /^https:\/\//.test(j.url))
    .map((j) => ({ platform: listingPlatform(j.url!), url: j.url! }));

  const used = await eventSpacesEver(db, eventId);
  const questionRooms = await db.selectDistinct({ roomId: questions.roomId }).from(questions).where(evq);
  const rooms = [...new Set([...used.map((s) => s.roomId), ...questionRooms.map((r) => r.roomId)])];
  const until = event.closedAt ?? now;
  const [sh] = rooms.length
    ? await db
        .select({
          checks: sql<number>`count(*)::int`,
          blocked: sql<number>`count(*) filter (where ${shieldEvents.outcome} = 'blocked')::int`,
          redacted: sql<number>`count(*) filter (where ${shieldEvents.outcome} = 'redacted')::int`,
        })
        .from(shieldEvents)
        .where(and(inArray(shieldEvents.roomId, rooms), gte(shieldEvents.createdAt, event.createdAt), lte(shieldEvents.createdAt, until)))
    : [{ checks: 0, blocked: 0, redacted: 0 }];

  const medFerri = q?.medFerri === null || q?.medFerri === undefined ? null : Math.round(Number(q.medFerri) / 100) / 10;
  const medCrew = q?.medCrew === null || q?.medCrew === undefined ? null : Math.max(1, Math.round(Number(q.medCrew) / 60));
  return {
    event: { name: event.name, startsAt: event.startsAt?.toISOString() ?? null, endsAt: event.endsAt?.toISOString() ?? null },
    questions: {
      asked: n(q?.asked),
      people: n(q?.people),
      answeredByFerri: n(q?.ferri),
      answeredByCrew: n(q?.crew),
      unanswered: n(q?.unanswered),
      listened: n(q?.listened),
      medianFerriSeconds: n(q?.ferri) ? medFerri : null,
      medianCrewMinutes: n(q?.crew) ? medCrew : null,
      platforms: qPlatforms.map((p) => p.platform!).sort(),
    },
    knowledge: { crewAnswers: n(k?.c) },
    cards: { opened, byKind, answered: byStatus.answered ?? 0, expired: byStatus.expired ?? 0, dismissed: byStatus.dismissed ?? 0 },
    announcements: { sent: n(a?.sent), spaces: n(ap?.c), edits: n(av?.c) },
    care: { cases: n(cc?.cases), solved: n(cc?.solved), byBuilder: n(cc?.byBuilder), open: n(cc?.open) },
    guests: {
      registered: n(g?.registered),
      going: n(g?.going),
      waitlist: n(g?.waitlist),
      pending: n(g?.pending),
      notGoing: n(g?.notGoing),
      checkedIn: n(g?.checkedIn),
      confirmed: n(g?.confirmed),
      freed: n(g?.freed),
      reoffered: n(g?.reoffered),
      sources: Object.fromEntries(sourceRows.map((r) => [r.source, n(r.c)])),
    },
    guestEmails: { sends: n(gs?.sends), mails: n(gm?.mails), delivered: n(gm?.delivered) },
    outreach: { emailed: n(om?.emailed), replies: n(om?.replies), interested: n(oc?.interested), declined: n(oc?.declined) },
    listings,
    builder: { done: jobs.length, byKind: jobKinds },
    shield: { checks: n(sh?.checks), blocked: n(sh?.blocked), redacted: n(sh?.redacted) },
    spaces: { count: used.length, platforms: [...new Set(used.map((s) => s.platform).filter((p): p is string => !!p))].sort() },
    computedAt: now.toISOString(),
  };
}

/** "Luma" for lu.ma or luma.com, else the host without www. */
export function listingPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (/(^|\.)lu\.ma$|(^|\.)luma\.com$/.test(host)) return "Luma";
    if (/meetup\.com$/.test(host)) return "Meetup";
    if (/eventbrite\./.test(host)) return "Eventbrite";
    if (/devfolio\.co$/.test(host)) return "Devfolio";
    return host;
  } catch {
    return url;
  }
}

const PLATFORM_NAME: Record<string, string> = {
  mattermost: "Mattermost",
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  teams: "Teams",
  whatsapp_web: "WhatsApp",
  whatsapp: "WhatsApp",
};
export const wrapPlatformName = (p: string) => PLATFORM_NAME[p] ?? p;

const kindList = (m: Record<string, number>, label: Record<string, string> = {}) =>
  Object.entries(m)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([key, v]) => `${v} ${label[key] ?? key}`)
    .join(", ");

const CARD_KIND_LABEL: Record<string, string> = {
  question: "question",
  reply: "reply",
  announce: "announcement",
  plan: "plan",
  outreach: "email",
  care: "care",
  guests: "guest email",
  spot: "spot",
  wrap: "wrap",
  desk: "desk",
  social: "social",
};

/** The recap's number lines: only lines with something to say. */
export function recapLines(s: RecapStats): string[] {
  const out: string[] = [];
  const q = s.questions;
  if (q.asked) {
    const parts = [`${plural(q.asked, "question")} from ${plural(q.people, "person", "people")}${q.platforms.length ? ` on ${q.platforms.map(wrapPlatformName).join(", ")}` : ""}`];
    if (q.answeredByFerri) parts.push(`Ferri answered ${q.answeredByFerri} at once${q.medianFerriSeconds !== null ? ` (median ${q.medianFerriSeconds} s)` : ""}`);
    if (q.answeredByCrew) parts.push(`the crew answered ${q.answeredByCrew} on cards${q.medianCrewMinutes !== null ? ` (median ${q.medianCrewMinutes} min)` : ""}`);
    if (q.unanswered) parts.push(`${q.unanswered} still unanswered`);
    if (q.listened) parts.push(`${q.listened} heard in Listen spaces`);
    out.push(`Questions: ${parts.join("; ")}.`);
  }
  if (s.knowledge.crewAnswers) out.push(`Knowledge learned: ${plural(s.knowledge.crewAnswers, "crew answer")} saved for next time.`);
  if (s.cards.opened) {
    const settled = [s.cards.answered ? `${s.cards.answered} answered` : "", s.cards.expired ? `${s.cards.expired} expired` : "", s.cards.dismissed ? `${s.cards.dismissed} dismissed` : ""].filter(Boolean);
    out.push(`Cards: ${s.cards.opened} opened (${kindList(s.cards.byKind, CARD_KIND_LABEL)})${settled.length ? `; ${settled.join(", ")}` : ""}.`);
  }
  if (s.announcements.sent) {
    out.push(
      `Announcements: ${s.announcements.sent} sent${s.announcements.spaces ? ` to ${plural(s.announcements.spaces, "space")}` : ""}${s.announcements.edits ? `, ${plural(s.announcements.edits, "edit")}` : ""}.`,
    );
  }
  if (s.care.cases) {
    const parts = [`${plural(s.care.cases, "case")}`];
    if (s.care.solved) parts.push(`${s.care.solved} solved${s.care.byBuilder ? ` (${s.care.byBuilder} by the Builder)` : ""}`);
    if (s.care.open) parts.push(`${s.care.open} still open`);
    out.push(`Care: ${parts.join(", ")}.`);
  }
  const g = s.guests;
  if (g.registered) {
    const status = [g.going ? `${g.going} going` : "", g.waitlist ? `${g.waitlist} on the waitlist` : "", g.pending ? `${g.pending} pending` : "", g.notGoing ? `${g.notGoing} not going` : ""].filter(Boolean);
    const more = [
      g.checkedIn ? `${g.checkedIn} checked in` : "",
      g.confirmed ? `${g.confirmed} confirmed on their RSVP link` : "",
      g.freed ? `${plural(g.freed, "spot")} freed${g.reoffered ? `, ${g.reoffered} re-offered` : ""}` : "",
    ].filter(Boolean);
    const sources = kindList(g.sources, { site: "from the site", luma: "from Luma", import: "imported", desk: "added in Desk" });
    out.push(`Guests: ${g.registered} registered (${status.join(", ")})${more.length ? `; ${more.join("; ")}` : ""}${sources ? `. Sources: ${sources}` : ""}.`);
  }
  if (s.guestEmails.sends) {
    out.push(`Guest emails: ${plural(s.guestEmails.sends, "send")}, ${plural(s.guestEmails.mails, "email")} out${s.guestEmails.delivered ? `, ${s.guestEmails.delivered} delivered` : ""}.`);
  }
  const o = s.outreach;
  if (o.emailed || o.replies || o.interested) {
    const parts = [o.emailed ? `${plural(o.emailed, "partner")} emailed` : "", o.replies ? `${plural(o.replies, "reply", "replies")}` : "", o.interested ? `${o.interested} interested or partner` : "", o.declined ? `${o.declined} declined` : ""].filter(Boolean);
    out.push(`Outreach: ${parts.join(", ")}.`);
  }
  if (s.listings.length) out.push(`Listings: ${s.listings.map((l) => `${l.platform} (${l.url})`).join(", ")}.`);
  if (s.builder.done) out.push(`Builder: ${plural(s.builder.done, "job")} done (${kindList(s.builder.byKind)}).`);
  if (s.shield.checks) {
    const parts = [s.shield.blocked ? `${s.shield.blocked} blocked` : "", s.shield.redacted ? `${s.shield.redacted} redacted` : ""].filter(Boolean);
    out.push(`Shield: ${plural(s.shield.checks, "message")} checked${parts.length ? `, ${parts.join(", ")}` : ", nothing blocked"}.`);
  }
  return out;
}

// ── Lessons (one Haiku call) with the number guard ────────────────────────

export interface Lessons {
  wentWell: string[];
  toFix: string[];
  answerEarly: string[];
}
export const EMPTY_LESSONS: Lessons = { wentWell: [], toFix: [], answerEarly: [] };

export const LessonsSchema = z.strictObject({
  wentWell: z.array(z.string()),
  toFix: z.array(z.string()),
  answerEarly: z.array(z.string()),
});

/** Every number the stats hold, as text ("42", "3.5"): the only numbers a lesson may use. */
export function allowedNumbers(stats: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(stats);
  return out;
}

const NUMBER_WORDS: Record<string, string> = {
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", hundred: "100", dozen: "12",
};

/** The numbers written in a sentence, as plain digits ("1,200" is "1200", "twelve" is "12"). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = m[0];
    // "1,200" is a thousands separator; "3.5" a decimal.
    const clean = /^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(/,/g, ".");
    out.push(String(Number(clean)));
  }
  for (const m of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) if (NUMBER_WORDS[m[0]]) out.push(NUMBER_WORDS[m[0]]!);
  return out;
}

/**
 * The model's lines with every sentence that names a number not in the stats
 * dropped (code, not the model, keeps the recap's numbers real). Names that
 * carry digits ("Build Night 2") are ignored.
 */
export function dropInventedNumbers(lines: string[], allowed: Set<string>, ignore: string[] = []): string[] {
  const out: string[] = [];
  for (const line of lines) {
    // Sentences end at . ! ? followed by a space, so "3.5" stays whole.
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => {
      let t = s;
      for (const name of ignore) if (name) t = t.split(name).join(" ");
      return numbersIn(t).every((x) => allowed.has(x));
    });
    const text = kept.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

/** The qualitative record the lessons are read from. */
export interface WrapRecord {
  unanswered: string[];
  topAsked: { question: string; count: number }[];
  caseReasons: string[];
  expiredCards: string[];
  replySummaries: string[];
  announcements: string[];
}

export async function wrapRecord(db: Db, eventId: string): Promise<WrapRecord> {
  const qs = await topAndUnanswered(db, eventId);
  const cases = await db
    .select({ kind: careCases.kind, reason: careCases.reason, status: careCases.status })
    .from(careCases)
    .where(eq(careCases.eventId, eventId))
    .orderBy(asc(careCases.createdAt))
    .limit(20);
  const expired = await db
    .select({ kind: cards.kind, question: cards.question })
    .from(cards)
    .where(and(eq(cards.eventId, eventId), eq(cards.status, "expired")))
    .orderBy(asc(cards.createdAt))
    .limit(20);
  const replies = await db
    .select({ reading: contactMessages.reading })
    .from(contactMessages)
    .where(and(eq(contactMessages.eventId, eventId), eq(contactMessages.direction, "in")))
    .orderBy(asc(contactMessages.createdAt))
    .limit(12);
  const anns = await db
    .select({ title: announcements.title })
    .from(announcements)
    .where(and(eq(announcements.eventId, eventId), eq(announcements.status, "sent")))
    .orderBy(asc(announcements.createdAt))
    .limit(15);
  return {
    unanswered: qs.unanswered.map((u) => u.question),
    topAsked: qs.top.map((t) => ({ question: t.question, count: t.count })),
    caseReasons: cases.map((c) => `${c.kind} (${c.status}): ${c.reason}`),
    expiredCards: expired.map((c) => `${c.kind}: ${c.question}`),
    replySummaries: replies.map((r) => r.reading?.summary ?? "").filter(Boolean),
    announcements: anns.map((a) => a.title),
  };
}

const LESSONS_SYSTEM = `You help the organizing crew of a community event look back on it. Ferri, their AI teammate, gives you the event's numbers (computed by code, always right) and the record: questions nobody answered, the questions members asked most, care cases, cards that expired, what partners replied, the announcements sent.

Write three short lists, each 1 to 4 items, each item one plain sentence (no markdown, no emoji):
- wentWell: what worked, grounded in the numbers and the record.
- toFix: what to do differently next time, grounded in the record (expired cards, unanswered questions, care cases, slow answers).
- answerEarly: questions members asked that the crew should answer in the knowledge before the next event, written as the question or topic ("Where can teams sit after 10 PM?").

Numbers: use only numbers that appear in the numbers block, written as digits, never a percentage or a number you worked out yourself. When in doubt, leave the number out. Never invent a fact, name or number that is not in what you were given. An empty list is fine when there is nothing to say.`;

export async function writeLessons(input: { choice: ModelChoice; eventName: string; stats: RecapStats; record: WrapRecord }): Promise<Lessons> {
  const r = input.record;
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x.replace(/\s+/g, " ").slice(0, 300)}`).join("\n") : "(none)");
  const user = [
    `Event: ${input.eventName}`,
    `Numbers:\n${recapLines(input.stats).join("\n") || "(nothing happened that Ferri could count)"}`,
    `Questions nobody answered:\n${list(r.unanswered)}`,
    `Asked most (with how many times):\n${list(r.topAsked.map((t) => `${t.question} (${t.count})`))}`,
    `Care cases:\n${list(r.caseReasons)}`,
    `Cards that expired:\n${list(r.expiredCards)}`,
    `Partner replies:\n${list(r.replySummaries)}`,
    `Announcements sent:\n${list(r.announcements)}`,
  ].join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: LESSONS_SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: LessonsSchema,
    maxTokens: 1500,
  });
  if (!out.data) return EMPTY_LESSONS;
  return guardLessons(out.data, input.stats, [input.eventName]);
}

/** The number guard over every list, plus tidying (trim, at most 4 each). Only numbers in the stats are allowed. */
export function guardLessons(l: Lessons, stats: RecapStats, ignore: string[] = []): Lessons {
  const allowed = allowedNumbers(stats);
  const tidy = (xs: string[]) => dropInventedNumbers(xs.map((x) => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean), allowed, ignore).slice(0, 4);
  return { wentWell: tidy(l.wentWell), toFix: tidy(l.toFix), answerEarly: tidy(l.answerEarly) };
}

/** The recap as Ferri posts it in the crew room: plain lines. */
export function renderRecapText(eventName: string, stats: RecapStats, lessons: Lessons): string {
  const lines = recapLines(stats);
  const out = [`How ${eventName} went:`];
  out.push(...(lines.length ? lines : ["Nothing Ferri can count happened at this event yet."]));
  const section = (title: string, xs: string[]) => {
    if (xs.length) out.push("", title, ...xs.map((x) => `- ${x}`));
  };
  section("What went well:", lessons.wentWell);
  section("To fix next time:", lessons.toFix);
  section("Answer early next time:", lessons.answerEarly);
  return out.join("\n");
}

/** The recap document for the Switch library. */
export function renderRecapDocument(eventName: string, stats: RecapStats, lessons: Lessons, timeZone: string): string {
  const out = [`# ${eventName}: recap`, "", `Numbers from Ferri's own records, computed ${new Date(stats.computedAt).toLocaleString("en-GB", { timeZone })}.`, ""];
  out.push("## Numbers", "", ...(recapLines(stats).map((l) => `- ${l}`) || []), "");
  const section = (title: string, xs: string[]) => out.push(`## ${title}`, "", ...(xs.length ? xs.map((x) => `- ${x}`) : ["(none)"]), "");
  section("What went well", lessons.wentWell);
  section("To fix next time", lessons.toFix);
  section("Answer early next time", lessons.answerEarly);
  return out.join("\n");
}

/** Make and store a fresh recap (null when this message already made one). */
export async function makeRecap(
  db: Db,
  input: { eventId: string; choice: ModelChoice; origin: "chat" | "desk" | "ferri" | "close"; by: string; sourceMessageId?: string | null },
): Promise<EventRecap | null> {
  const event = await eventById(db, input.eventId);
  if (!event) return null;
  if (input.sourceMessageId) {
    const [done] = await db.select({ id: eventRecaps.id }).from(eventRecaps).where(eq(eventRecaps.sourceMessageId, input.sourceMessageId)).limit(1);
    if (done) return null;
  }
  const stats = await recapStats(db, event.id);
  const record = await wrapRecord(db, event.id);
  const lessons = await writeLessons({ choice: input.choice, eventName: event.name, stats, record }).catch(() => EMPTY_LESSONS);
  const [row] = await db
    .insert(eventRecaps)
    .values({
      communityId: event.communityId,
      eventId: event.id,
      stats: stats as unknown as Record<string, unknown>,
      lessons,
      text: renderRecapText(event.name, stats, lessons),
      origin: input.origin,
      requestedBy: input.by,
      sourceMessageId: input.sourceMessageId ?? null,
    })
    .onConflictDoNothing({ target: eventRecaps.sourceMessageId })
    .returning();
  return row ?? null;
}

// ── Questions: asked most and never answered ──────────────────────────────

export interface KitQuestion {
  question: string;
  topic: string;
  count: number;
}

/** The questions members asked most (cards by how many joined, entries by how often cited) and the ones nobody answered. */
export async function topAndUnanswered(db: Db, eventId: string): Promise<{ top: KitQuestion[]; unanswered: KitQuestion[] }> {
  const byCard = await db
    .select({ question: cards.question, topic: cards.topic, status: cards.status, c: sql<number>`count(${questions.id})::int` })
    .from(cards)
    .leftJoin(questions, eq(questions.cardId, cards.id))
    .where(and(eq(cards.eventId, eventId), eq(cards.kind, "question")))
    .groupBy(cards.id)
    .orderBy(desc(sql`count(${questions.id})`), asc(cards.createdAt))
    .limit(40);
  const cited = (await db.execute(
    sql`select e.heading as heading, count(*)::int as c from (select unnest(${questions.entryIds}) as id from ${questions} where ${questions.eventId} = ${eventId} and ${questions.outcome} = 'answered') x join ${knowledgeEntries} e on e.id = x.id group by e.heading order by count(*) desc, e.heading limit 8`,
  )) as unknown as { heading: string; c: number }[];
  const loose = await db
    .select({ text: questions.text })
    .from(questions)
    .where(and(eq(questions.eventId, eventId), eq(questions.outcome, "unknown"), isNull(questions.cardId), isNull(questions.resolution)))
    .orderBy(asc(questions.askedAt))
    .limit(15);
  const top: KitQuestion[] = [
    ...byCard.filter((c) => n(c.c) > 0).map((c) => ({ question: c.question, topic: c.topic, count: n(c.c) })),
    ...cited.map((c) => ({ question: c.heading, topic: "other", count: n(c.c) })),
  ]
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);
  const unanswered: KitQuestion[] = [
    ...byCard.filter((c) => c.status === "expired" || c.status === "dismissed").map((c) => ({ question: c.question, topic: c.topic, count: Math.max(1, n(c.c)) })),
    ...loose.map((q) => ({ question: q.text.replace(/\s+/g, " ").trim().slice(0, 240), topic: "other", count: 1 })),
  ].slice(0, 15);
  return { top, unanswered };
}

// ── Partners: from contacts, the knowledge and the plan ───────────────────

export const PARTNER_ROLES = ["sponsor", "venue", "food", "community", "college", "media", "judge", "prize", "partner", "other"] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

export const PartnersSchema = z.strictObject({
  partners: z.array(
    z.strictObject({
      org: z.string(),
      role: z.enum(PARTNER_ROLES),
      note: z.string(),
      /** "" unless written in the source. */
      email: z.string(),
      website: z.string(),
      /** The id of the entry or plan item it is written in (K3, P2). */
      where: z.string(),
    }),
  ),
});

export interface PartnerSource {
  /** K1, K2 ... for knowledge, P1, P2 ... for plan items. */
  id: string;
  title: string;
  text: string;
}

export interface FoundPartner {
  org: string;
  role: PartnerRole;
  note: string;
  email: string | null;
  website: string | null;
  /** Where it was written ("Lantern Build Night FAQ: Sponsors"). */
  where: string;
}

const PARTNERS_SYSTEM = `You read the knowledge and the plan of a community event and list every organization the event worked with: sponsors, the venue, food partners, community partners, colleges, a judge's company, prize givers and media. Only organizations the text says took part (gave money, credits, food, prizes or space, judged, hosted, partnered, covered the event). Not the community itself, not a platform the event merely used (Luma, Discord, Zoom), not people without an organization, not prospects the crew only hoped to ask.

For each: org (the organization's name as written), role (sponsor, venue, food, community, college, media, judge, prize, partner, other), note (one short line on what they did, from the text), email and website only when written in the text exactly (else ""), where (the id in brackets of the entry or plan item that names them). One item per organization.`;

export async function extractPartners(input: { choice: ModelChoice; eventName: string; communityName: string; sources: PartnerSource[] }): Promise<FoundPartner[]> {
  if (!input.sources.length) return [];
  const user = [
    `Event: ${input.eventName}. Community (not a partner): ${input.communityName}.`,
    input.sources.map((s) => `[${s.id}] ${s.title}\n${s.text.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n\n"),
  ].join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: PARTNERS_SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: PartnersSchema,
    maxTokens: 2500,
  });
  return cleanPartners(out.data?.partners ?? [], input.sources, input.communityName);
}

/** The model's partners, kept honest in code: an email or website only when written in a source, one per organization. */
export function cleanPartners(raw: z.infer<typeof PartnersSchema>["partners"], sources: PartnerSource[], communityName = ""): FoundPartner[] {
  const all = sources.map((s) => `${s.title}\n${s.text}`).join("\n").toLowerCase();
  const byId = new Map(sources.map((s) => [s.id.toUpperCase(), s]));
  const seen = new Set<string>();
  const out: FoundPartner[] = [];
  for (const p of raw) {
    const org = p.org.replace(/\s+/g, " ").trim().slice(0, 160);
    const key = org.toLowerCase();
    if (!org || seen.has(key) || (communityName && key === communityName.toLowerCase())) continue;
    seen.add(key);
    const email = p.email.trim().toLowerCase();
    const site = p.website.trim();
    const siteHost = site.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
    const src = byId.get(p.where.trim().replace(/^\[|\]$/g, "").toUpperCase());
    out.push({
      org,
      role: (PARTNER_ROLES as readonly string[]).includes(p.role) ? p.role : "other",
      note: p.note.replace(/\s+/g, " ").trim().slice(0, 200),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && all.includes(email) ? email : null,
      website: siteHost && all.includes(siteHost) ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null,
      where: src?.title ?? "the event's notes",
    });
  }
  return out;
}

/** The contact kind for a partner role. */
export function contactKindForRole(role: string): string {
  const map: Record<string, string> = { sponsor: "sponsor", prize: "sponsor", venue: "venue", food: "company", judge: "company", community: "community", college: "college", media: "media" };
  return map[role] ?? "other";
}

/** The role a contact had, from its kind. */
export function roleForContactKind(kind: string): PartnerRole {
  const map: Record<string, PartnerRole> = { sponsor: "sponsor", venue: "venue", community: "community", college: "college", media: "media" };
  return map[kind] ?? "partner";
}

/** The event's knowledge and plan as sources for `extractPartners` (K1..., P1...). */
export async function partnerSources(db: Db, eventId: string): Promise<PartnerSource[]> {
  const entries = await db
    .select({ heading: knowledgeEntries.heading, body: knowledgeEntries.body, sourceTitle: knowledgeEntries.sourceTitle })
    .from(knowledgeEntries)
    .where(and(eq(knowledgeEntries.eventId, eventId), isNull(knowledgeEntries.archivedAt)))
    .orderBy(asc(knowledgeEntries.sourceTitle), asc(knowledgeEntries.position));
  const plan = await db
    .select({ title: planItems.title, text: planItems.text, kind: planItems.kind })
    .from(planItems)
    .where(and(eq(planItems.eventId, eventId), sql`${planItems.status} <> 'dropped'`, inArray(planItems.kind, ["decision", "task"])))
    .orderBy(asc(planItems.createdAt));
  return [
    ...entries.map((e, i) => ({ id: `K${i + 1}`, title: `${e.sourceTitle}: ${e.heading}`, text: e.body })),
    ...plan.map((p, i) => ({ id: `P${i + 1}`, title: `plan ${p.kind}: ${p.title}`, text: p.text })),
  ];
}

export interface SavedPartner {
  contactId: string;
  org: string;
  role: string;
  /** A new contact. */
  created: boolean;
  /** A new "worked with us on" line for this event. */
  added: boolean;
}

/**
 * Save the event's partners to contacts: contacts tied to the event that
 * replied, are interested or are partners, plus the organizations found in
 * the knowledge and plan. Matched by email, then by name; new ones are
 * partners with source "<event> wrap (<where>)". Nobody is emailed. Running
 * it again adds nothing twice.
 */
export async function savePartners(
  db: Db,
  input: { communityId: string; eventId: string; eventName: string; found: FoundPartner[]; by: string },
): Promise<SavedPartner[]> {
  const out: SavedPartner[] = [];
  const link = async (contactId: string, role: string, note: string | null) => {
    const rows = await db
      .insert(contactEvents)
      .values({ contactId, eventId: input.eventId, role, note: note?.slice(0, 200) || null, addedBy: input.by })
      .onConflictDoNothing({ target: [contactEvents.contactId, contactEvents.eventId] })
      .returning({ id: contactEvents.id });
    return rows.length > 0;
  };
  const tied = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.communityId, input.communityId),
        inArray(contacts.status, ["replied", "interested", "partner"]),
        or(eq(contacts.eventId, input.eventId), sql`${contacts.id} in (select ${contactMessages.contactId} from ${contactMessages} where ${contactMessages.eventId} = ${input.eventId})`),
      ),
    );
  for (const c of tied) {
    const role = roleForContactKind(c.kind);
    const added = await link(c.id, role, c.why ?? (c.status === "partner" ? "Partner" : "Answered our outreach"));
    out.push({ contactId: c.id, org: c.org, role, created: false, added });
  }
  for (const p of input.found) {
    if (out.some((o) => o.org.toLowerCase() === p.org.toLowerCase())) continue;
    const { contact, created } = await upsertContact(db, {
      communityId: input.communityId,
      eventId: input.eventId,
      org: p.org,
      email: p.email,
      website: p.website,
      kind: contactKindForRole(p.role),
      source: `${input.eventName} wrap (${p.where})`,
      why: p.note || null,
      addedBy: input.by,
    });
    if (created || contact.status === "prospect") await setContactStatus(db, contact.id, "partner");
    const added = await link(contact.id, p.role, p.note || null);
    if (out.some((o) => o.contactId === contact.id)) continue;
    out.push({ contactId: contact.id, org: contact.org, role: p.role, created, added });
  }
  return out;
}

/** "Worked with us on" lines per contact, newest first. */
export async function contactEventLines(db: Db, contactIds: string[]): Promise<Map<string, { eventName: string; role: string; note: string | null }[]>> {
  const out = new Map<string, { eventName: string; role: string; note: string | null }[]>();
  if (!contactIds.length) return out;
  const rows = await db
    .select({ contactId: contactEvents.contactId, role: contactEvents.role, note: contactEvents.note, eventName: events.name })
    .from(contactEvents)
    .innerJoin(events, eq(events.id, contactEvents.eventId))
    .where(inArray(contactEvents.contactId, contactIds))
    .orderBy(desc(contactEvents.createdAt));
  for (const r of rows) out.set(r.contactId, [...(out.get(r.contactId) ?? []), { eventName: r.eventName, role: r.role, note: r.note }]);
  return out;
}

/** The partners saved for an event. */
export async function eventPartners(db: Db, eventId: string) {
  return db
    .select({ contactId: contacts.id, org: contacts.org, email: contacts.email, website: contacts.website, status: contacts.status, role: contactEvents.role, note: contactEvents.note })
    .from(contactEvents)
    .innerJoin(contacts, eq(contacts.id, contactEvents.contactId))
    .where(eq(contactEvents.eventId, eventId))
    .orderBy(asc(contacts.org));
}

// ── The starter kit ───────────────────────────────────────────────────────

export interface KitEntry {
  heading: string;
  body: string;
  sourceTitle: string;
  /** Check entries: what to confirm for the next event ("Confirm the prizes"). */
  check?: string;
}

export interface StarterKitContent {
  version: 1;
  event: {
    id: string;
    name: string;
    slug: string;
    venue: string | null;
    capacity: number | null;
    startsAt: string | null;
    endsAt: string | null;
    /** How long it ran, in minutes (null when the dates are not set). */
    lengthMinutes: number | null;
    instructions: string;
  };
  crew: { name: string; handles: Record<string, string>; topics: string[]; lead: boolean }[];
  knowledge: { keep: KitEntry[]; check: KitEntry[] };
  questions: { top: KitQuestion[]; unanswered: KitQuestion[] };
  plan: { decisions: { title: string; text: string; topic: string }[]; tasks: { title: string; text: string; topic: string; owner: string | null }[] };
  agenda: string | null;
  spaces: KitSpace[];
  desks: { kind: string; title: string; skillKey: string; roomName: string; platform: string | null; visibility: string; members: string[]; rows: number }[];
  partners: { org: string; role: string; note: string | null; email: string | null; website: string | null }[];
  lessons: Lessons;
  stats: RecapStats | null;
  builtAt: string;
}

export const KitSortSchema = z.strictObject({
  entries: z.array(z.strictObject({ id: z.string(), keep: z.boolean(), check: z.string() })),
});

const KIT_SORT_SYSTEM = `You sort the knowledge of a community event that just ended, so the next event of the same kind can start from it. For each entry (id in brackets), decide:
- keep: true when it stays true for the next event as it is: rules, code of conduct, how things work, venue facts (address, parking, wifi, accessibility), contact channels, FAQs that do not depend on this edition.
- keep: false ("check") when it is specific to this edition and must be confirmed again: dates, times, the schedule, prizes, sponsors, judges, speakers, people, prices, deadlines, numbers of seats.
For a check entry, check is one short imperative line for the crew's plan ("Confirm the prizes", "Set the new schedule", "Ask CloudCo if they sponsor again"). For a keep entry, check is "". Return every id once.`;

/** Apply the model's sorting: unknown or missing ids are "check" (safer to confirm). */
export function applyKitSort(entries: (KitEntry & { id: string })[], read: z.infer<typeof KitSortSchema> | null): { keep: KitEntry[]; check: KitEntry[] } {
  const by = new Map((read?.entries ?? []).map((e) => [e.id.trim().replace(/^\[|\]$/g, "").toUpperCase(), e]));
  const keep: KitEntry[] = [];
  const check: KitEntry[] = [];
  for (const e of entries) {
    const r = by.get(e.id.toUpperCase());
    const { id: _id, ...entry } = e;
    if (r?.keep) keep.push(entry);
    else check.push({ ...entry, check: r?.check.trim() || `Check: ${e.heading}` });
  }
  return { keep, check };
}

export async function sortKitKnowledge(input: { choice: ModelChoice; eventName: string; entries: KitEntry[] }): Promise<{ keep: KitEntry[]; check: KitEntry[] }> {
  const withIds = input.entries.map((e, i) => ({ ...e, id: `E${i + 1}` }));
  if (!withIds.length) return { keep: [], check: [] };
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: KIT_SORT_SYSTEM, cache_control: { type: "ephemeral" } }],
    user: `Event: ${input.eventName}\n\n${withIds.map((e) => `[${e.id}] ${e.sourceTitle}: ${e.heading}\n${e.body.replace(/\s+/g, " ").slice(0, 800)}`).join("\n\n")}`,
    schema: KitSortSchema,
    maxTokens: 3000,
  }).catch(() => null);
  return applyKitSort(withIds, out?.data ?? null);
}

/**
 * Pack the event into its starter kit (one per event; refreshed when built
 * again). One Haiku call sorts the knowledge into keep and check. The spaces
 * are the ones attached now; once closed, the kit keeps the spaces it saved.
 */
export async function buildStarterKit(db: Db, input: { eventId: string; choice: ModelChoice; by: string }): Promise<StarterKit> {
  const event = await eventById(db, input.eventId);
  if (!event) throw new Error("no such event");
  const previous = await kitForEvent(db, event.id);
  const crew = (await loadCrew(db, event.communityId, event.id)).filter((c) => c.eventId === event.id);
  const entries = await db
    .select({ heading: knowledgeEntries.heading, body: knowledgeEntries.body, sourceTitle: knowledgeEntries.sourceTitle })
    .from(knowledgeEntries)
    .where(and(eq(knowledgeEntries.eventId, event.id), isNull(knowledgeEntries.archivedAt)))
    .orderBy(asc(knowledgeEntries.sourceTitle), asc(knowledgeEntries.position), asc(knowledgeEntries.key));
  const sorted = await sortKitKnowledge({ choice: input.choice, eventName: event.name, entries });
  const plan = await db
    .select()
    .from(planItems)
    .where(and(eq(planItems.eventId, event.id), sql`${planItems.status} <> 'dropped'`))
    .orderBy(asc(planItems.createdAt));
  const names = new Map(crew.map((c) => [c.id, c.name]));
  const agenda = await latestAgenda(db, event.id);
  const now = await eventSpacesNow(db, event.id);
  const savedSpaces = now.length ? now : (((previous?.content as Partial<StarterKitContent> | undefined)?.spaces ?? []) as KitSpace[]);
  const deskList = await db.select().from(desks).where(and(eq(desks.eventId, event.id), eq(desks.status, "created")));
  const rowCounts = deskList.length
    ? await db
        .select({ deskId: deskRows.deskId, c: sql<number>`count(*)::int` })
        .from(deskRows)
        .where(and(inArray(deskRows.deskId, deskList.map((d) => d.id)), eq(deskRows.status, "active")))
        .groupBy(deskRows.deskId)
    : [];
  const rowsBy = new Map(rowCounts.map((r) => [r.deskId, n(r.c)]));
  const partners = await eventPartners(db, event.id);
  const recap = await latestRecap(db, event.id);
  const content: StarterKitContent = {
    version: 1,
    event: {
      id: event.id,
      name: event.name,
      slug: event.slug,
      venue: event.venue,
      capacity: event.capacity,
      startsAt: event.startsAt?.toISOString() ?? null,
      endsAt: event.endsAt?.toISOString() ?? null,
      lengthMinutes: event.startsAt && event.endsAt ? Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60000) : null,
      instructions: event.instructions,
    },
    crew: crew.map((c) => ({ name: c.name, handles: c.handles, topics: c.topics, lead: c.lead })),
    knowledge: sorted,
    questions: await topAndUnanswered(db, event.id),
    plan: {
      decisions: plan.filter((p) => p.kind === "decision" && p.status === "confirmed").map((p) => ({ title: p.title, text: p.text, topic: p.topic })),
      tasks: plan
        .filter((p) => p.kind === "task" && p.status !== "dropped")
        .map((p) => ({ title: p.title, text: undated(p.text), topic: p.topic, owner: p.ownerId ? (names.get(p.ownerId) ?? null) : null })),
    },
    agenda: agenda?.text ?? null,
    spaces: savedSpaces,
    desks: deskList.map((d) => ({ kind: d.kind, title: d.title, skillKey: d.skillKey, roomName: d.roomName, platform: d.platform, visibility: d.visibility, members: d.members, rows: rowsBy.get(d.id) ?? 0 })),
    partners: partners.map((p) => ({ org: p.org, role: p.role, note: p.note, email: p.email, website: p.website })),
    lessons: (recap?.lessons as Lessons | undefined) ?? EMPTY_LESSONS,
    stats: (recap?.stats as unknown as RecapStats | undefined) ?? null,
    builtAt: new Date().toISOString(),
  };
  const name = `${event.name} kit`;
  const markdown = renderKitMarkdown(content);
  const [row] = await db
    .insert(starterKits)
    .values({ communityId: event.communityId, fromEventId: event.id, name, content: content as unknown as Record<string, unknown>, markdown, createdBy: input.by })
    .onConflictDoUpdate({
      target: starterKits.fromEventId,
      set: { name, content: content as unknown as Record<string, unknown>, markdown, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

const MODE_LABEL: Record<string, string> = { listen: "Listen", approve: "Approve", auto: "Auto" };

/** The kit as markdown (Desk's download and the Switch library document). */
export function renderKitMarkdown(k: StarterKitContent): string {
  const out: string[] = [`# ${k.event.name} kit`, "", `The context of ${k.event.name}, packed by Ferri for the next event to start from. Built ${k.builtAt.slice(0, 10)}.`, ""];
  const section = (title: string, rows: string[]) => out.push(`## ${title}`, "", ...(rows.length ? rows : ["(none)"]), "");
  const hours = k.event.lengthMinutes ? `${Math.round((k.event.lengthMinutes / 60) * 10) / 10} hours` : null;
  section("The event", [
    `- Venue: ${k.event.venue ?? "not set"}`,
    `- Capacity: ${k.event.capacity ?? "not set"}`,
    `- Length: ${hours ?? "not set"}`,
    ...(k.event.startsAt ? [`- Last time: ${k.event.startsAt.slice(0, 10)}`] : []),
    ...(k.event.instructions.trim() ? ["", "Instructions:", "", ...k.event.instructions.trim().split("\n").map((l) => `> ${l}`)] : []),
  ]);
  section("Crew", k.crew.map((c) => `- ${c.name}${c.lead ? " (lead)" : ""}${c.topics.length ? `: ${c.topics.join(", ")}` : ""}`));
  section("Knowledge to keep", k.knowledge.keep.map((e) => `- **${e.heading}** (${e.sourceTitle}): ${e.body.replace(/\s+/g, " ").trim()}`));
  section("Knowledge to check", k.knowledge.check.map((e) => `- **${e.heading}** (${e.sourceTitle}): ${e.body.replace(/\s+/g, " ").trim()}${e.check ? ` *${e.check}*` : ""}`));
  section("Asked most", k.questions.top.map((q) => `- ${q.question} (${q.count})`));
  section("Nobody answered (answer early next time)", k.questions.unanswered.map((q) => `- ${q.question}`));
  section("Plan decisions", k.plan.decisions.map((d) => `- **${d.title}**: ${d.text}`));
  section("Tasks", k.plan.tasks.map((t) => `- ${t.text}${t.owner ? ` (${t.owner})` : ""}`));
  if (k.agenda) out.push("## Agenda", "", "```", k.agenda, "```", "");
  section("Spaces", k.spaces.map((s) => `- ${s.name}${s.platform ? ` (${wrapPlatformName(s.platform)})` : ""}: ${s.role === "crew" ? "crew room" : MODE_LABEL[s.mode]}`));
  if (k.desks.length) section("Desks", k.desks.map((d) => `- ${d.title} (${d.kind})${d.rows ? `, ${plural(d.rows, "row")} in its sheet` : ""}`));
  section("Partners", k.partners.map((p) => `- ${p.org} (${p.role})${p.note ? `: ${p.note}` : ""}${p.email ? ` <${p.email}>` : ""}`));
  section("What went well", k.lessons.wentWell.map((x) => `- ${x}`));
  section("To fix next time", k.lessons.toFix.map((x) => `- ${x}`));
  section("Answer early next time", k.lessons.answerEarly.map((x) => `- ${x}`));
  if (k.stats) section("Numbers", recapLines(k.stats).map((l) => `- ${l}`));
  return out.join("\n");
}

// ── Starting the next event from a kit ────────────────────────────────────

/** The new event's instructions: the kit's, then the lessons. */
export function kitInstructions(k: StarterKitContent): string {
  const lessons = [...k.lessons.toFix, ...k.lessons.answerEarly.map((q) => `Answer early: ${q}`)];
  const base = k.event.instructions.trim();
  if (!lessons.length) return base;
  return `${base}${base ? "\n\n" : ""}Lessons from ${k.event.name}:\n${lessons.map((l) => `- ${l}`).join("\n")}`;
}

/** The source title for copied knowledge: the old event's name becomes the new one's. */
export function renameSource(title: string, oldName: string, newName: string): string {
  return oldName && title.includes(oldName) ? title.split(oldName).join(newName) : title;
}

/** The plan questions a kit gives the next event: check entries, unanswered and top questions (once each). */
export function kitPlanQuestions(k: StarterKitContent): { title: string; text: string; topic: string }[] {
  const out: { title: string; text: string; topic: string }[] = [];
  const seen = new Set<string>();
  const add = (title: string, text: string, topic: string) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ title: title.slice(0, 80), text, topic });
  };
  for (const e of k.knowledge.check) add(e.check ?? `Check: ${e.heading}`, `${e.check ?? `Check: ${e.heading}`} (last time: ${e.body.replace(/\s+/g, " ").trim().slice(0, 200)})`, "other");
  for (const q of k.questions.unanswered) add(`Answer early: ${q.question}`.slice(0, 80), `Answer early: ${q.question}`, q.topic);
  for (const q of k.questions.top.slice(0, 5)) add(`Asked most: ${q.question}`.slice(0, 80), `Make sure the knowledge answers: ${q.question}`, q.topic);
  return out;
}

export interface StartedEvent {
  eventId: string;
  slug: string;
  name: string;
  crew: number;
  knowledge: number;
  questions: number;
  tasks: number;
  desks: string[];
}

/**
 * Start the next event from a kit (no model call): a new event in Plan with
 * the kit's instructions plus the lessons, the crew and their topics, the
 * "keep" knowledge copied as the new event's entries (with revisions), every
 * "check" entry and unanswered or top question as a plan question, the kit's
 * tasks as proposed tasks. Nothing is posted outside.
 */
export async function startFromKit(
  db: Db,
  input: { communityId: string; kitId: string; name: string; startsAt: Date | null; by: string },
): Promise<StartedEvent> {
  const kit = await kitById(db, input.kitId);
  if (!kit || kit.communityId !== input.communityId) throw new Error("That starter kit does not exist.");
  const k = kit.content as unknown as StarterKitContent;
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) throw new Error("The new event needs a name.");
  const base = slugify(name);
  const taken = new Set((await db.select({ slug: events.slug }).from(events).where(eq(events.communityId, input.communityId))).map((e) => e.slug));
  const [sameName] = await db.select({ id: events.id }).from(events).where(and(eq(events.communityId, input.communityId), sql`lower(${events.name}) = lower(${name})`)).limit(1);
  if (sameName) throw new Error(`There is already an event called ${name}.`);
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  const endsAt = input.startsAt && k.event.lengthMinutes ? new Date(input.startsAt.getTime() + k.event.lengthMinutes * 60000) : null;
  const [ev] = await db
    .insert(events)
    .values({
      communityId: input.communityId,
      slug,
      name,
      stage: "plan",
      startsAt: input.startsAt,
      endsAt,
      venue: k.event.venue,
      capacity: k.event.capacity,
      instructions: kitInstructions(k),
      crewFromDesk: true,
      deskEditedAt: new Date(),
      fromKitId: kit.id,
    })
    .returning();
  const eventId = ev!.id;
  let crew = 0;
  for (const c of k.crew) {
    await db
      .insert(crewMembers)
      .values({ communityId: input.communityId, eventId, key: `${slug}/${slugify(c.name)}`, name: c.name, handles: c.handles, topics: c.topics, lead: c.lead })
      .onConflictDoNothing();
    crew++;
  }
  let knowledge = 0;
  for (const e of k.knowledge.keep) {
    await createEntry(db, { communityId: input.communityId, eventId, sourceTitle: renameSource(e.sourceTitle, k.event.name, name), heading: e.heading, body: e.body, by: `${input.by} (from ${kit.name})` });
    knowledge++;
  }
  const qs = kitPlanQuestions(k);
  let i = 0;
  for (const q of qs) {
    await db
      .insert(planItems)
      .values({ communityId: input.communityId, eventId, kind: "question", status: "confirmed", topic: q.topic, title: q.title, text: q.text, origin: "kit", decidedBy: kit.name, sourceKey: `kit:${eventId}:q${i++}` })
      .onConflictDoNothing({ target: planItems.sourceKey });
  }
  let t = 0;
  for (const task of k.plan.tasks) {
    await db
      .insert(planItems)
      .values({ communityId: input.communityId, eventId, kind: "task", status: "proposed", topic: task.topic, title: task.title, text: task.text, origin: "kit", decidedBy: null, sourceKey: `kit:${eventId}:t${t++}` })
      .onConflictDoNothing({ target: planItems.sourceKey });
  }
  return { eventId, slug, name, crew, knowledge, questions: qs.length, tasks: t, desks: k.desks.map((d) => d.title) };
}

// ── Finding an event by what someone wrote ────────────────────────────────

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, " ")
    .split(" ")
    .filter((w) => w && !["the", "kit", "starter", "event", "our", "last", "from", "of", "a"].includes(w));

/**
 * The event someone means ("build night", "the Build Night kit",
 * "lantern-build-night"): exact name or slug, then every word matching,
 * then the most words in common. Ties go to the newest. Null when nothing fits.
 */
export function matchEvent<E extends { name: string; slug: string; startsAt: Date | null; createdAt: Date }>(list: E[], text: string): E | null {
  const t = text.trim().toLowerCase().replace(/\s+kit$/, "").trim();
  if (!t) return null;
  const newest = (xs: E[]) => [...xs].sort((a, b) => (b.startsAt ?? b.createdAt).getTime() - (a.startsAt ?? a.createdAt).getTime())[0] ?? null;
  const exact = list.filter((e) => e.name.toLowerCase() === t || e.slug === t || e.slug === slugify(t));
  if (exact.length) return newest(exact);
  const want = words(t);
  if (!want.length) return null;
  const scored = list
    .map((e) => {
      const have = new Set([...words(e.name), ...words(e.slug.replace(/-/g, " "))]);
      const hit = want.filter((w) => have.has(w)).length;
      // A number in the text ("Build Night 2") must be in the name.
      const numbersOk = want.filter((w) => /^\d+$/.test(w)).every((w) => have.has(w));
      const extraNumbers = [...have].filter((w) => /^\d+$/.test(w) && !want.includes(w)).length;
      return { e, hit, all: hit === want.length && numbersOk, extraNumbers };
    })
    .filter((x) => x.hit > 0);
  const full = scored.filter((x) => x.all);
  if (full.length) {
    const fewest = Math.min(...full.map((x) => x.extraNumbers));
    return newest(full.filter((x) => x.extraNumbers === fewest).map((x) => x.e));
  }
  const best = Math.max(0, ...scored.map((x) => x.hit));
  if (best * 2 < want.length) return null;
  return newest(scored.filter((x) => x.hit === best).map((x) => x.e));
}

// ── The wrap card and Desk's requests ─────────────────────────────────────

export const WRAP_OFF_OPTION = "off";
export const WRAP_MOVE_OPTION = "move";

export interface WrapCardPayload {
  action: "close";
  eventId: string;
  /** The event the spaces move to (null: Off). */
  moveTo: string | null;
  moveToName?: string | null;
  [key: string]: unknown;
}

/** The close card's options: Off, move (only when there is another live event), Not yet. */
export function wrapOptions(moveToName: string | null, skipId: string) {
  return [
    { id: WRAP_OFF_OPTION, label: "Close, spaces Off", description: null },
    ...(moveToName ? [{ id: WRAP_MOVE_OPTION, label: `Close and move the spaces to ${moveToName}`.slice(0, 120), description: null }] : []),
    { id: skipId, label: "Not yet", description: null },
  ];
}

/** The newest other live event (the one the spaces would move to). */
export async function nextLiveEvent(db: Db, communityId: string, notId: string): Promise<EventRow | null> {
  const list = await db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), isNull(events.closedAt), sql`${events.id} <> ${notId}`))
    .orderBy(desc(events.createdAt));
  return list[0] ?? null;
}

/** What Desk asks Ferri's wrap tick to do (Desk cannot post in Switch itself). */
export interface WrapRequest {
  action: "close" | "reopen" | "recap" | "kit" | "partners";
  eventId: string;
  /** close: the event the spaces move to (null: Off). */
  moveTo: string | null;
  by: string;
  at: string;
}

export const WRAP_REQUEST_PREFIX = "wrap_request:";

/** Leave a request for Ferri (one per event and action; a newer one replaces it). */
export async function requestWrap(db: Db, req: Omit<WrapRequest, "at">): Promise<void> {
  const value: WrapRequest = { ...req, at: new Date().toISOString() };
  await db
    .insert(agentState)
    .values({ key: `${WRAP_REQUEST_PREFIX}${req.eventId}:${req.action}`, value })
    .onConflictDoUpdate({ target: agentState.key, set: { value, updatedAt: new Date() } });
}

/** Requests still waiting for Ferri, oldest first (Desk shows them as "in a moment"). */
export async function pendingWrapRequests(db: Db, eventId?: string): Promise<WrapRequest[]> {
  const rows = await db
    .select({ value: agentState.value })
    .from(agentState)
    .where(like(agentState.key, `${WRAP_REQUEST_PREFIX}${eventId ?? ""}%`))
    .orderBy(asc(agentState.updatedAt));
  return rows.map((r) => r.value as WrapRequest);
}

/** Take every waiting request (each is handed out once). */
export async function takeWrapRequests(db: Db, eventId?: string): Promise<WrapRequest[]> {
  const rows = await db
    .delete(agentState)
    .where(like(agentState.key, `${WRAP_REQUEST_PREFIX}${eventId ?? ""}%`))
    .returning({ value: agentState.value, updatedAt: agentState.updatedAt });
  return rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()).map((r) => r.value as WrapRequest);
}

// ── What Ferri says ───────────────────────────────────────────────────────

/** The goodbye line in the crew room when an event closes. */
export function closeLine(input: { eventName: string; spaces: number; movedTo: string | null; crewRoomOff: boolean; openCases: number }): string {
  const its = input.spaces === 1 ? "Its 1 space" : `Its ${input.spaces} spaces`;
  const where = !input.spaces
    ? "It had no spaces attached"
    : input.movedTo
      ? `${its} ${input.spaces === 1 ? "moves" : "move"} to ${input.movedTo} with the same modes${input.crewRoomOff ? ` (this crew room goes Off: ${input.movedTo} has its own)` : ""}`
      : `${its} ${input.spaces === 1 ? "is" : "are"} Off now`;
  const cases = input.openCases ? ` ${input.openCases === 1 ? "1 care case stays" : `${input.openCases} care cases stay`} open in Desk.` : "";
  return `${input.eventName} is closed. ${where}; the recap and the starter kit are in Desk.${cases}`;
}

/** What Ferri asks the announcement drafter for: a thank-you from the recap's member-facing highlights. */
/** A task's text without its old deadline ("... by 11:59 AM today" becomes "..."): the next event sets its own dates. */
export function undated(text: string): string {
  const out = text
    .replace(/\s*,?\s*\b(?:by|before|until|on)\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*)?(?:today|tonight|tomorrow|this \w+|next \w+|(?:mon|tues|wednes|thurs|fri|satur|sun)day|\d{1,2}(?:st|nd|rd|th)?\s+\w+|\w+\s+\d{1,2}(?:st|nd|rd|th)?)\b[^.]*?(?=[.;]|$)/gi, "")
    .replace(/\s*,?\s*\b(?:by|before|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .trim();
  return out || text;
}

export function thankYouRequest(eventName: string, stats: RecapStats, lessons: Lessons): string {
  const highlights: string[] = [];
  const g = stats.guests;
  if (g.checkedIn) highlights.push(`${g.checkedIn} people checked in`);
  else if (g.going) highlights.push(`${g.going} people registered as going`);
  const answered = stats.questions.answeredByFerri + stats.questions.answeredByCrew;
  if (answered) highlights.push(`${answered} questions from members answered in all (by Ferri and the crew together)`);
  if (stats.care.solved) highlights.push(`${stats.care.solved} people helped when they got stuck`);
  void lessons;
  return [
    `Thank everyone who came to ${eventName}, and everyone who helped run it.`,
    highlights.length ? `Highlights members will like: ${highlights.join("; ")}.` : "",
    "Keep it short and warm. Use each number exactly as written here, once; add no other numbers and do not split them up.",
  ]
    .filter(Boolean)
    .join(" ");
}
