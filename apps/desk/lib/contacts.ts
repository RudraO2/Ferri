import { and, desc, eq, inArray } from "drizzle-orm";
import { parseAddress } from "@ferri/email";
import { community, db } from "./db";
import { cards, contactEventLines, contactMessages, contacts, listContacts, type Contact, type ContactMessage } from "./ferri";

/** The outreach mailbox Ferri sends from (FERRI_EMAIL_FROM), or null while email is off. */
export function outreachMailbox(): string | null {
  const from = process.env.FERRI_EMAIL_FROM?.trim();
  if (!from || !process.env.RESEND_API_KEY?.trim()) return null;
  return parseAddress(from)?.email ?? null;
}

/** What Desk and Pocket say while outreach email is off. */
export const EMAIL_OFF_NOTE = "Email is off: set FERRI_EMAIL_FROM and RESEND_API_KEY, then run pnpm email:setup.";

export interface EmailWaiting {
  cardId: string;
  createdAt: Date;
  contact: Pick<Contact, "id" | "org" | "person" | "email">;
  subject: string | null;
  draft: string;
  reply: boolean;
  askedBy: string | null;
}

/** Outreach cards waiting for an OK (spec 15), newest first. */
export async function emailsWaiting(): Promise<EmailWaiting[]> {
  const c = await community();
  const rows = await db()
    .select({ card: cards, msg: contactMessages, contact: contacts })
    .from(cards)
    .innerJoin(contactMessages, eq(contactMessages.id, cards.contactMessageId))
    .innerJoin(contacts, eq(contacts.id, contactMessages.contactId))
    .where(and(eq(cards.communityId, c.id), eq(cards.kind, "outreach"), eq(cards.status, "open")))
    .orderBy(desc(cards.createdAt));
  return rows.map((r) => ({
    cardId: r.card.id,
    createdAt: r.card.createdAt,
    contact: { id: r.contact.id, org: r.contact.org, person: r.contact.person, email: r.contact.email },
    subject: r.msg.subject,
    draft: r.card.draftText ?? r.msg.text ?? "",
    reply: !!r.msg.inReplyToId,
    askedBy: r.msg.requestedBy,
  }));
}

export interface ContactView extends Contact {
  messages: ContactMessage[];
  /** Spec 19: the events they worked with us on, newest first. */
  worked: { eventName: string; role: string; note: string | null }[];
}

/** Contacts with their timelines (oldest message first). */
export async function contactsWithTimeline(status?: string | null): Promise<ContactView[]> {
  const c = await community();
  const list = await listContacts(db(), c.id, status ? [status] : undefined);
  if (!list.length) return [];
  const msgs = await db()
    .select()
    .from(contactMessages)
    .where(inArray(contactMessages.contactId, list.map((x) => x.id)))
    .orderBy(contactMessages.createdAt);
  const by = new Map<string, ContactMessage[]>();
  for (const m of msgs) by.set(m.contactId, [...(by.get(m.contactId) ?? []), m]);
  const worked = await contactEventLines(db(), list.map((x) => x.id));
  return list.map((x) => ({ ...x, messages: by.get(x.id) ?? [], worked: worked.get(x.id) ?? [] }));
}

export async function contactCounts(): Promise<Record<string, number>> {
  const c = await community();
  const list = await listContacts(db(), c.id);
  const out: Record<string, number> = { all: list.length };
  for (const x of list) out[x.status] = (out[x.status] ?? 0) + 1;
  return out;
}

export const MESSAGE_LABEL: Record<string, string> = {
  requested: "drafting",
  drafting: "drafting",
  waiting: "waiting for an OK",
  sent: "sent",
  delivered: "delivered",
  bounced: "bounced",
  complained: "marked as spam",
  dismissed: "not sent",
  expired: "not approved in time",
  failed: "failed",
  refused: "refused",
  received: "received",
};
