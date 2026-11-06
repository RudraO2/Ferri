import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { contactMessages, contacts, type Db } from "@ferri/db";
import { structuredCall, type ModelChoice, type Usage } from "./model.ts";
import { renderInstructions, renderKnowledge } from "./render.ts";
import type { LiveKnowledge } from "./store.ts";

// ── Partner outreach (spec 15): contacts, drafts, replies ─────────────────

export type Contact = typeof contacts.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;

export const CONTACT_KINDS = ["college", "company", "community", "venue", "media", "sponsor", "other"] as const;
export const CONTACT_STATUSES = ["prospect", "drafted", "emailed", "replied", "interested", "declined", "partner", "bounced", "do_not_contact"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  prospect: "prospect",
  drafted: "draft waiting",
  emailed: "emailed",
  replied: "replied",
  interested: "interested",
  declined: "declined",
  partner: "partner",
  bounced: "bounced",
  do_not_contact: "do not contact",
};

/** The last line of every outreach email. */
export const OPT_OUT_LINE = "If this isn't for you, just reply \"no thanks\" and we won't write again.";

/** A short code for a contact's reply-to address (partners+<code>@domain). */
export function contactCode(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...randomBytes(7)].map((b) => alphabet[b % alphabet.length]).join("");
}

const normalEmail = (e: string | null | undefined) => {
  const s = String(e ?? "").trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) ? s : null;
};

/** Why Ferri may not write to this contact, or null when it may. */
export function cannotEmail(c: Pick<Contact, "status" | "email" | "org">): string | null {
  if (!c.email) return `${c.org} has no email address in contacts yet. Add one in Desk, or give it to me: "email ${c.org} at name@example.org".`;
  if (c.status === "do_not_contact") return `${c.org} asked not to be contacted again, so I won't email them.`;
  if (c.status === "bounced") return `Email to ${c.email} bounced before. Check the address in Desk first.`;
  return null;
}

// ── Contacts ──────────────────────────────────────────────────────────────

/** A contact by address, else by organization or person name (case-insensitive, closest first). */
export async function findContact(db: Db, communityId: string, q: { email?: string | null; name?: string | null }): Promise<Contact | null> {
  const email = normalEmail(q.email);
  if (email) {
    const [c] = await db.select().from(contacts).where(and(eq(contacts.communityId, communityId), eq(contacts.email, email))).limit(1);
    if (c) return c;
  }
  const name = q.name?.trim().replace(/[%_]/g, "");
  if (!name) return null;
  const [exact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.communityId, communityId), sql`lower(${contacts.org}) = lower(${name})`))
    .limit(1);
  if (exact) return exact;
  const [like] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.communityId, communityId), sql`(${contacts.org} ilike ${`%${name}%`} or ${contacts.person} ilike ${`%${name}%`})`))
    .orderBy(desc(contacts.updatedAt))
    .limit(1);
  return like ?? null;
}

export async function contactByCode(db: Db, code: string): Promise<Contact | null> {
  const [c] = await db.select().from(contacts).where(eq(contacts.code, code)).limit(1);
  return c ?? null;
}

/** Add a contact, or fill in what an existing one (same address, or same name without one) lacks. */
export async function upsertContact(
  db: Db,
  input: {
    communityId: string;
    eventId: string | null;
    org: string;
    person?: string | null;
    email?: string | null;
    kind?: string | null;
    website?: string | null;
    source?: string | null;
    why?: string | null;
    addedBy: string;
    jobId?: string | null;
  },
): Promise<{ contact: Contact; created: boolean }> {
  const email = normalEmail(input.email);
  const kind = CONTACT_KINDS.includes((input.kind ?? "") as (typeof CONTACT_KINDS)[number]) ? input.kind! : "other";
  const existing =
    (email && (await findContact(db, input.communityId, { email }))) ||
    (
      await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.communityId, input.communityId), sql`lower(${contacts.org}) = lower(${input.org.trim()})`))
        .limit(1)
    )[0] ||
    null;
  if (existing) {
    const [updated] = await db
      .update(contacts)
      .set({
        email: existing.email ?? email,
        person: existing.person ?? input.person ?? null,
        website: existing.website ?? input.website ?? null,
        source: existing.email ? existing.source : (input.source ?? existing.source),
        why: existing.why ?? input.why ?? null,
        eventId: existing.eventId ?? input.eventId,
        kind: existing.kind === "other" ? kind : existing.kind,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id))
      .returning();
    return { contact: updated!, created: false };
  }
  for (let i = 0; i < 3; i++) {
    const [c] = await db
      .insert(contacts)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        code: contactCode(),
        org: input.org.trim().slice(0, 160),
        person: input.person?.trim() || null,
        email,
        kind,
        website: input.website?.trim() || null,
        source: input.source?.trim() || null,
        why: input.why?.trim().slice(0, 300) || null,
        addedBy: input.addedBy,
        jobId: input.jobId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (c) return { contact: c, created: true };
  }
  throw new Error("could not add the contact");
}

export async function setContactStatus(db: Db, id: string, status: ContactStatus, extra: Partial<typeof contacts.$inferInsert> = {}) {
  await db.update(contacts).set({ status, ...extra, updatedAt: new Date() }).where(eq(contacts.id, id));
}

/** Outreach emails sent today (a day is 24 hours back), for the daily cap. */
export async function sentToday(db: Db, communityId: string): Promise<number> {
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(
      and(
        eq(contactMessages.communityId, communityId),
        eq(contactMessages.direction, "out"),
        isNotNull(contactMessages.sentAt),
        gte(contactMessages.sentAt, new Date(Date.now() - 24 * 3600_000)),
      ),
    )) as [{ n: number }];
  return n;
}

export async function contactTimeline(db: Db, contactId: string): Promise<ContactMessage[]> {
  return db.select().from(contactMessages).where(eq(contactMessages.contactId, contactId)).orderBy(contactMessages.createdAt);
}

export async function listContacts(db: Db, communityId: string, statuses?: string[]): Promise<Contact[]> {
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.communityId, communityId), statuses?.length ? inArray(contacts.status, statuses) : undefined))
    .orderBy(desc(contacts.updatedAt))
    .limit(300);
}

export async function searchContacts(db: Db, communityId: string, q: string): Promise<Contact[]> {
  const s = `%${q.replace(/[%_]/g, "")}%`;
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.communityId, communityId), sql`(${ilike(contacts.org, s)} or ${ilike(contacts.email, s)} or ${ilike(contacts.person, s)})`))
    .limit(50);
}

/** "3 interested (CloudCo, ...), 2 emailed, 1 declined": the crew's "who have we heard back from?". */
export function contactsSummary(list: Pick<Contact, "org" | "status">[]): string {
  if (!list.length) return "There are no contacts yet. Ask me to find partners, or add one in Desk.";
  const order: string[] = ["interested", "replied", "partner", "emailed", "drafted", "prospect", "declined", "bounced", "do_not_contact"];
  const groups = new Map<string, string[]>();
  for (const c of list) groups.set(c.status, [...(groups.get(c.status) ?? []), c.org]);
  return order
    .filter((s) => groups.has(s))
    .map((s) => {
      const names = groups.get(s)!;
      return `${names.length} ${STATUS_LABEL[s]} (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""})`;
    })
    .join("; ")
    .concat(".");
}

// ── Prospects from the Builder (find-partners) ────────────────────────────

export const ProspectSchema = z.object({
  org: z.string().min(1),
  kind: z.string().optional().nullable(),
  why: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  person: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  /** The page that publishes the address (or describes the organization when there is none). */
  source: z.string().optional().nullable(),
});
export type Prospect = z.infer<typeof ProspectSchema>;

/** Prospects from the Builder's prospects.json: a list, or { prospects: [...] }. Bad rows are dropped with a reason. */
export function parseProspects(raw: unknown): { ok: Prospect[]; dropped: string[] } {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { prospects?: unknown })?.prospects) ? (raw as { prospects: unknown[] }).prospects : [];
  const ok: Prospect[] = [];
  const dropped: string[] = [];
  for (const item of list) {
    const p = ProspectSchema.safeParse(item);
    if (!p.success) {
      dropped.push(`not a prospect: ${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }
    const v = { ...p.data };
    const email = normalEmail(v.email);
    if (v.email && !email) dropped.push(`${v.org}: "${v.email}" is not an address, kept without it`);
    // An address only with the page that publishes it: Ferri never writes to a guessed address.
    if (email && !/^https:\/\//.test(v.source ?? "")) {
      dropped.push(`${v.org}: ${email} has no source page, kept without the address`);
      v.email = null;
    } else v.email = email;
    ok.push(v);
  }
  return { ok, dropped };
}

// ── Drafting an email ─────────────────────────────────────────────────────

export const EmailDraftSchema = z.strictObject({
  subject: z.string(),
  text: z.string(),
  /** Facts the email would want that the knowledge does not have. */
  missing: z.array(z.string()),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

const EMAIL_SYSTEM = `You write emails for Ferri, the AI teammate of a community that runs events (hackathons, meetups, game nights). The organizing crew wants to reach a partner: a college, a company, another community, a venue or the media. A person on the crew approves every email before it is sent, and it goes out from the community's own address.

Rules:
- Use only facts from the knowledge and the crew's request: the event's name, dates, place, who comes, what the partner could do. Never invent a number (audience size, past attendance, budget), a name, a benefit or a promise. If something the email would want is not there, write around it and list it in "missing".
- Short and human: 90 to 180 words, plain text, short paragraphs, no markdown, no bullet symbols other than "- ", no emoji. Lead with who you are and why you are writing to them in particular (use "why" when given).
- One clear ask that matches the request (sponsor, host, spread the word, judge, mentor, partner), and one easy next step ("Could we talk for 15 minutes this week?").
- Greet the person by first name when given, else the team ("Hi CloudCo team,").
- Sign with the sender's name and the community's name, on two lines.
- Never include the line about opting out: Ferri adds it.
- A reply to their email: answer what they said, using the knowledge; keep it shorter.
- subject: under 70 characters, specific, no clickbait ("Sponsoring Lantern Build Night, 21-22 Nov in Bengaluru").
- Follow the community and event instructions on tone and language.`;

export async function draftOutreachEmail(input: {
  choice: ModelChoice;
  kb: LiveKnowledge;
  eventId: string | null;
  contact: Pick<Contact, "org" | "person" | "kind" | "why">;
  ask: string;
  sender: string;
  /** Answering a reply: what they wrote (the new part) and the subject. */
  replyTo?: { subject: string | null; text: string } | null;
}): Promise<{ draft: EmailDraft | null; usage: Usage; latencyMs: number }> {
  const entries = input.kb.entries.filter((e) => e.eventId === input.eventId || e.eventId === null);
  const user = [
    renderInstructions(input.kb),
    renderKnowledge(entries).text,
    `<partner org="${input.contact.org}"${input.contact.person ? ` person="${input.contact.person}"` : ""} kind="${input.contact.kind}">${input.contact.why ?? ""}</partner>`,
    input.replyTo ? `Their email${input.replyTo.subject ? ` ("${input.replyTo.subject}")` : ""}:\n${input.replyTo.text.slice(0, 4000)}` : null,
    `What ${input.sender} (on the crew) wants the email to do:\n${input.ask}`,
    input.replyTo ? "Write the reply." : "Write the email.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: EMAIL_SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: EmailDraftSchema,
    maxTokens: 2000,
  });
  const d = out.data;
  const draft = d && d.text.trim() ? { subject: d.subject.trim().slice(0, 120), text: withoutOptOut(d.text.trim()).slice(0, 6000), missing: d.missing } : null;
  return { draft, usage: out.usage, latencyMs: out.latencyMs };
}

/** The model sometimes adds its own opt-out line: Ferri's is the one that counts. */
export function withoutOptOut(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/reply ["“]?no thanks|won'?t (write|email|contact) (you )?again|unsubscribe/i.test(l))
    .join("\n")
    .trim();
}

/** The email as it is sent: the draft, then the opt-out line on a cold email. */
export function finalEmailText(text: string, cold: boolean): string {
  return cold ? `${text.trim()}\n\n${OPT_OUT_LINE}` : text.trim();
}

// ── Reading a reply ───────────────────────────────────────────────────────

export const ReplyReadingSchema = z.strictObject({
  summary: z.string(),
  want: z.enum(["interested", "question", "declined", "unsubscribe", "auto_reply", "other"]),
  next: z.string(),
});
export type ReplyReading = z.infer<typeof ReplyReadingSchema>;

const REPLY_SYSTEM = `You read an email that a partner (a college, a company, a community, a venue) sent back to a community that runs events. The community wrote to them first; you see that email too. Tell the organizing crew what the reply means.

- summary: one or two plain sentences on what they said, in your words, with any concrete detail (a date, an amount, a person, a condition). No greeting, no "The partner says". The person who wrote the reply is the sender given with the partner; the name that signed our email is the community's own organizer, never the partner.
- want:
  - interested: they want to go ahead or talk (yes, maybe, "send details", "let's set up a call").
  - question: they ask something before deciding, and they are not saying no.
  - declined: no, not this time, no budget, wrong fit.
  - unsubscribe: they ask not to be contacted again ("remove me", "stop emailing", "unsubscribe"). Our first email ends with "If this isn't for you, just reply \"no thanks\" and we won't write again.", so a reply that is just "no thanks" (or "no thank you", "not interested, no thanks") is unsubscribe, not declined.
  - auto_reply: out of office, a ticket number, an automatic acknowledgement.
  - other: anything else (a forward to a colleague with no answer yet, spam).
- next: the crew's next step in one short imperative sentence ("Book a 15-minute call with Asha on Monday.", "Answer their question about the audience size.", "Nothing to do; they will not be emailed again."). For auto_reply, say when to follow up if the reply says when they are back.`;

export async function readReply(input: {
  choice: ModelChoice;
  org: string;
  ours: { subject: string | null; text: string | null } | null;
  theirs: { subject: string | null; text: string; from?: string | null };
}): Promise<{ reading: ReplyReading | null; usage: Usage; latencyMs: number }> {
  const user = [
    `Partner: ${input.org}${input.theirs.from ? ` (the reply is from ${input.theirs.from})` : ""}`,
    input.ours ? `Our email${input.ours.subject ? ` ("${input.ours.subject}")` : ""}:\n${(input.ours.text ?? "").slice(0, 3000)}` : "Our email: (not on record)",
    `Their reply${input.theirs.subject ? ` ("${input.theirs.subject}")` : ""}:\n${input.theirs.text.slice(0, 5000)}`,
  ].join("\n\n");
  const out = await structuredCall({
    choice: input.choice,
    system: [{ type: "text", text: REPLY_SYSTEM, cache_control: { type: "ephemeral" } }],
    user,
    schema: ReplyReadingSchema,
    maxTokens: 600,
  });
  const reading = out.data ? { ...out.data, want: optedOut(input.theirs.text) ? ("unsubscribe" as const) : out.data.want } : null;
  return { reading, usage: out.usage, latencyMs: out.latencyMs };
}

/** "no thanks", "remove me", "unsubscribe": the promise in our opt-out line, kept whatever the model reads. */
export function optedOut(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  const bare = /^(no,?\s*(thanks|thank you)|thanks,? but no thanks)$/;
  const optOut = /\b(unsubscribe|remove me from|stop (emailing|writing to|contacting)|do not (email|contact) (me|us))\b/;
  return bare.test(t) || optOut.test(t);
}

/** "Re: <subject>" once. */
export const reSubject = (s: string | null | undefined) => (s && /^re:/i.test(s.trim()) ? s.trim() : `Re: ${(s ?? "").trim() || "your email"}`);

/** The status a reply moves the contact to. */
export function statusForReply(want: ReplyReading["want"], current: string): ContactStatus {
  if (want === "unsubscribe") return "do_not_contact";
  if (want === "declined") return "declined";
  if (want === "interested") return current === "partner" ? "partner" : "interested";
  if (want === "question") return current === "interested" || current === "partner" ? (current as ContactStatus) : "replied";
  return (CONTACT_STATUSES as readonly string[]).includes(current) && current !== "drafted" && current !== "prospect" ? (current as ContactStatus) : "replied";
}
