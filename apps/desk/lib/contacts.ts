import { and, desc, eq, inArray } from "drizzle-orm";
import { community, db } from "./db";
import { cards, contactMessages, contacts, listContacts, type Contact, type ContactMessage } from "./ferri";

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
  return list.map((x) => ({ ...x, messages: by.get(x.id) ?? [] }));
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
