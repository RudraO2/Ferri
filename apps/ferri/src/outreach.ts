import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { cards, communities, contactMessages, contacts, emailEvents, type Db } from "@ferri/db";
import { codeFrom, newPart, parseAddress, replyAddress, resend, textToHtml, type Resend } from "@ferri/email";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  approvers,
  builderPaths,
  cannotEmail,
  contactByCode,
  contactsSummary,
  draftOutreachEmail,
  finalEmailText,
  findContact,
  jobRef,
  listContacts,
  loadCrew,
  loadLiveKnowledge,
  mention,
  parseProspects,
  readReply,
  reSubject,
  sentToday,
  setContactStatus,
  statusForReply,
  STATUS_LABEL,
  switchExpiry,
  upsertContact,
  withoutOptOut,
  type BuilderJob,
  type Contact,
  type ContactMessage,
  type CrewIntent,
  type CrewMember,
} from "@ferri/knowledge";
import { pushToUsers, switchUsersForCrew } from "@ferri/push";
import type { SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { AnnounceHooks, Loop, RoomInfo } from "./loop.ts";

type CardRow = typeof cards.$inferSelect;

export const OUTREACH_SEND_OPTION = "send";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface OutreachDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
  /** For tests: a stand-in for Resend. */
  mail?: Resend | null;
}

/**
 * Partner outreach (spec 15). Every email waits on its own Switch card
 * ("outreach" kind); one OK sends it through Resend from the community's
 * mailbox with a reply-to that names the contact. Replies and delivery
 * events arrive through Desk's webhook (`email_events`); the tick reads them,
 * keeps them on the contact's timeline, tells the crew and drafts the answer.
 */
export function createOutreach(deps: OutreachDeps) {
  const { db, agent, loop, log } = deps;
  const mail = deps.mail !== undefined ? deps.mail : config.resendApiKey ? resend({ apiKey: config.resendApiKey }) : null;
  const mailbox = parseAddress(config.emailFrom)?.email ?? "partners@rudratechie.xyz";

  async function fromLine(communityId: string): Promise<string> {
    const named = parseAddress(config.emailFrom);
    if (named?.name) return config.emailFrom;
    const [c] = await db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId)).limit(1);
    return `${(c?.name ?? "Ferri").replace(/[<>"]/g, "")} <${mailbox}>`;
  }

  // ── What the crew asks ─────────────────────────────────────────────────

  /** "@ferri email CloudCo ...", "find partners ...", "who replied?". Returns Ferri's reply in the room. */
  async function intent(input: {
    communityId: string;
    eventId: string | null;
    member: CrewMember;
    messageId: string;
    roomId: string | null;
    outreach: NonNullable<CrewIntent["outreach"]>;
    body: string;
    startBuild: (b: { kind: "outreach"; title: string; brief: string }) => Promise<string | null>;
  }): Promise<string | null> {
    const o = input.outreach;
    if (o.action === "find") {
      return input.startBuild({ kind: "outreach", title: "Find partners", brief: o.what || input.body });
    }
    if (o.action === "status") {
      if (o.who) {
        const c = await findContact(db, input.communityId, { name: o.who, email: o.email });
        if (!c) return `I don't have ${o.who} in contacts.`;
        const [last] = await db.select().from(contactMessages).where(eq(contactMessages.contactId, c.id)).orderBy(desc(contactMessages.createdAt)).limit(1);
        const lastLine = last
          ? last.direction === "in"
            ? ` Their last email${last.reading?.summary ? `: ${last.reading.summary}` : "."}${last.reading?.next ? ` Next: ${last.reading.next}` : ""}`
            : ` Our last email (${last.status}) was “${last.subject ?? ""}”.`
          : "";
        return `${c.org}${c.email ? ` (${c.email})` : ""} is ${STATUS_LABEL[c.status] ?? c.status}.${lastLine}`;
      }
      return `Outreach so far: ${contactsSummary(await listContacts(db, input.communityId))}`;
    }
    // email
    if (!mail) return "Email isn't set up yet (no RESEND_API_KEY), so I can't send anything.";
    let contact = await findContact(db, input.communityId, { email: o.email, name: o.who });
    if (!contact && o.email) {
      const addr = parseAddress(o.email);
      if (!addr) return `“${o.email}” doesn't look like an email address.`;
      contact = (
        await upsertContact(db, {
          communityId: input.communityId,
          eventId: input.eventId,
          org: o.who?.trim() || addr.email.split("@")[1]!,
          email: addr.email,
          source: `given by ${input.member.name}`,
          addedBy: input.member.name,
        })
      ).contact;
    } else if (contact && o.email && !contact.email) {
      contact = (await upsertContact(db, { communityId: input.communityId, eventId: input.eventId, org: contact.org, email: o.email, source: `given by ${input.member.name}`, addedBy: input.member.name })).contact;
    }
    if (!contact) return `I don't have ${o.who ?? "them"} in contacts. Give me their address ("email ${o.who ?? "them"} at name@example.org ..."), or add them in Desk.`;
    const why = cannotEmail(contact);
    if (why) return why;
    // A reply when they wrote to us last.
    const [lastIn] = await db
      .select()
      .from(contactMessages)
      .where(and(eq(contactMessages.contactId, contact.id), eq(contactMessages.direction, "in")))
      .orderBy(desc(contactMessages.createdAt))
      .limit(1);
    const [msg] = await db
      .insert(contactMessages)
      .values({
        communityId: input.communityId,
        contactId: contact.id,
        eventId: input.eventId ?? contact.eventId,
        direction: "out",
        status: "requested",
        ask: o.what || input.body,
        requestedBy: input.member.name,
        requestedById: input.member.id,
        sourceMessageId: input.messageId,
        inReplyToId: lastIn?.id ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!msg) return null;
    const opened = await draftAndOpen(msg, input.roomId);
    return opened ? null : `I couldn't draft the email to ${contact.org}. Try again in a moment.`;
  }

  // ── Drafting, the card, sending ────────────────────────────────────────

  /** Draft the email and open its card. False when it could not be drafted. */
  async function draftAndOpen(m: ContactMessage, roomHint: string | null = null): Promise<boolean> {
    const [claimed] = await db
      .update(contactMessages)
      .set({ status: "drafting", updatedAt: new Date() })
      .where(and(eq(contactMessages.id, m.id), eq(contactMessages.status, "requested")))
      .returning();
    if (!claimed) return true;
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, m.contactId)).limit(1);
    if (!contact) return false;
    const refuse = cannotEmail(contact);
    const crewRoomId = roomHint ?? (await loop.crewRoomFor(m.eventId ?? contact.eventId));
    if (refuse || !crewRoomId) {
      await db.update(contactMessages).set({ status: "refused", error: refuse ?? "no crew room", updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      if (refuse && crewRoomId) await loop.post(m.communityId, crewRoomId, refuse);
      return true;
    }
    const kb = await loadLiveKnowledge(db, config.community, { eventId: m.eventId ?? contact.eventId });
    const theirs = m.inReplyToId ? (await db.select().from(contactMessages).where(eq(contactMessages.id, m.inReplyToId)).limit(1))[0] : undefined;
    let subject: string | null = null;
    let text: string | null = null;
    let missing: string[] = [];
    if (kb) {
      try {
        const { draft } = await draftOutreachEmail({
          choice: config.modelMain,
          kb,
          eventId: m.eventId ?? contact.eventId,
          contact,
          ask: m.ask ?? "Introduce the event and ask if they would like to partner.",
          sender: m.requestedBy ?? "the crew",
          replyTo: theirs ? { subject: theirs.subject, text: theirs.text ?? "" } : null,
        });
        if (draft) {
          subject = theirs ? reSubject(theirs.subject) : draft.subject;
          text = draft.text;
          missing = draft.missing;
        }
      } catch (err) {
        log(`outreach: drafting for ${contact.org} failed: ${(err as Error).message}`);
      }
    }
    if (!subject || !text) {
      await db.update(contactMessages).set({ status: "requested", updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      return false;
    }
    // A cold email (nothing sent to them yet) ends with the opt-out line.
    const [sentBefore] = await db
      .select({ id: contactMessages.id })
      .from(contactMessages)
      .where(and(eq(contactMessages.contactId, contact.id), eq(contactMessages.direction, "out"), inArray(contactMessages.status, ["sent", "delivered"])))
      .limit(1);
    const body = finalEmailText(text, !sentBefore && !theirs);
    const crew = await loadCrew(db, m.communityId, m.eventId ?? contact.eventId);
    const route = approvers(crew);
    const asker = m.requestedById ? crew.find((c) => c.id === m.requestedById) : undefined;
    const owners = asker ? [asker] : route.owners;
    const times = loop.ladder(null, null);
    const id = randomUUID();
    const head = `Email · to ${contact.org} <${contact.email}> · `;
    await db.insert(cards).values({
      id,
      communityId: m.communityId,
      eventId: m.eventId ?? contact.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "outreach",
      topic: "outreach",
      question: clip(`${contact.org}: ${subject}`, 300),
      ownerIds: owners.map((o) => o.id),
      draftText: body,
      contactMessageId: m.id,
      ...times,
    });
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: `${clip(head, 300)}“${clip(subject, 180)}”`,
        detail: "Every email needs one approval. Nothing is sent until someone on the crew says so.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: theirs ? "Send this reply?" : "Send this email?",
            prompt:
              `To: ${contact.person ? `${contact.person}, ` : ""}${contact.org} <${contact.email}>\n` +
              `From: ${await fromLine(m.communityId)} (replies come back here)\n` +
              `Subject: ${subject}\n\n${body.slice(0, 3500)}\n\n` +
              (missing.length ? `Not in the knowledge, so left out: ${missing.join("; ")}.\n\n` : "") +
              "Pick Send it or Don't send, or write your own version in quotes after the card code to send that instead.",
            options: [
              { id: OUTREACH_SEND_OPTION, label: "Send it", description: null },
              { id: CARD_SKIP_OPTION, label: "Don't send", description: null },
            ],
            multi_select: false,
            allow_custom_answer: true,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      await db.update(contactMessages).set({ status: "failed", error: `card: ${(err as Error).message}`, updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      log(`outreach: opening the card for ${contact.org} failed: ${(err as Error).message}`);
      return false;
    }
    await db.update(contactMessages).set({ status: "waiting", subject, text: body, cardId: id, toAddress: contact.email, updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
    if (contact.status === "prospect") await setContactStatus(db, contact.id, "drafted");
    const { platform } = await deps.room(crewRoomId);
    const who = owners.map((o) => mention(o, platform)).join(" ") || "Crew";
    await loop.post(m.communityId, crewRoomId, `${who}, ${theirs ? "a reply to" : "an email to"} ${contact.org} needs your OK: “${subject}”. It's on the card above.`);
    const [opened] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (opened) loop.pocketNotify("open", opened, owners.map((o) => o.id), { roomName: contact.org });
    log(`outreach: card ${id} for an email to ${contact.org} <${contact.email}>`);
    return true;
  }

  async function messageFor(card: CardRow): Promise<{ m: ContactMessage; c: Contact } | null> {
    if (!card.contactMessageId) return null;
    const [m] = await db.select().from(contactMessages).where(eq(contactMessages.id, card.contactMessageId)).limit(1);
    if (!m) return null;
    const [c] = await db.select().from(contacts).where(eq(contacts.id, m.contactId)).limit(1);
    return c ? { m, c } : null;
  }

  /** Someone answered an email card: send it (or their version), or drop it. */
  async function outcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const found = await messageFor(card);
    if (!found) return;
    const { m, c } = found;
    if (answer.selected.includes(CARD_SKIP_OPTION) && !answer.written) {
      const claimed = await loop.claim(card.id, { status: "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
      if (!claimed) return;
      await db.update(contactMessages).set({ status: "dismissed", updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      if (c.status === "drafted") await setContactStatus(db, c.id, "prospect");
      loop.pocketSettled(claimed, "dismissed", by);
      await loop.post(card.communityId, card.crewRoomId, `Okay ${by}, I won't send the email to ${c.org}.`);
      log(`outreach: email to ${c.org} dropped by ${by}`);
      return;
    }
    if (!answer.written && !answer.selected.includes(OUTREACH_SEND_OPTION)) return;
    const cold = /\n\nIf this isn't for you, just reply/.test(m.text ?? "");
    const text = answer.written ? finalEmailText(withoutOptOut(answer.written), cold) : (m.text ?? "");
    const claimed = await loop.claim(card.id, { status: "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: text });
    if (!claimed) return;
    const sent = await send(m, c, text, by);
    loop.pocketSettled(claimed, sent ? "answered" : "dismissed", by);
  }

  async function send(m: ContactMessage, c: Contact, text: string, by: string): Promise<boolean> {
    const crewRoomId = (await db.select({ room: cards.crewRoomId }).from(cards).where(eq(cards.id, m.cardId ?? "")).limit(1))[0]?.room ?? (await loop.crewRoomFor(m.eventId));
    const say = (t: string) => (crewRoomId ? loop.post(m.communityId, crewRoomId, t) : Promise.resolve(null));
    const [fresh] = await db.select().from(contacts).where(eq(contacts.id, c.id)).limit(1);
    const refuse = fresh ? cannotEmail(fresh) : "The contact is gone.";
    if (refuse || !mail) {
      await db.update(contactMessages).set({ status: "refused", error: refuse ?? "email is not set up", updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      await say(refuse ?? "Email isn't set up, so nothing was sent.");
      return false;
    }
    if ((await sentToday(db, m.communityId)) >= config.emailDailyCap) {
      await db.update(contactMessages).set({ status: "refused", error: "daily cap", updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      await say(`I've sent ${config.emailDailyCap} outreach emails in the last 24 hours, the most I send in a day, so the email to ${c.org} was not sent. Ask me again tomorrow.`);
      return false;
    }
    const theirs = m.inReplyToId ? (await db.select().from(contactMessages).where(eq(contactMessages.id, m.inReplyToId)).limit(1))[0] : undefined;
    const theirId = (theirs?.reading as { messageId?: string } | null)?.messageId ?? null;
    const from = await fromLine(m.communityId);
    const replyTo = replyAddress(mailbox, c.code);
    try {
      const r = await mail.send({
        from,
        to: fresh!.email!,
        subject: m.subject ?? "Hello",
        text,
        html: textToHtml(text),
        replyTo,
        headers: theirId ? { "In-Reply-To": theirId, References: theirId } : undefined,
        tags: [
          { name: "kind", value: "outreach" },
          { name: "contact", value: c.code },
        ],
        idempotencyKey: `ferri-outreach-${m.id}`,
      });
      await db
        .update(contactMessages)
        .set({ status: "sent", text, resendId: r.id, fromAddress: from, replyTo, sentAt: new Date(), updatedAt: new Date() })
        .where(eq(contactMessages.id, m.id));
      const next = ["prospect", "drafted"].includes(fresh!.status) ? "emailed" : (fresh!.status as Parameters<typeof setContactStatus>[2]);
      await setContactStatus(db, c.id, next, { lastEmailAt: new Date() });
      await say(`Sent to ${c.org} (${fresh!.email}), approved by ${by}. Replies come back to me, and I'll tell you here.`);
      log(`outreach: sent ${r.id} to ${c.org} <${fresh!.email}>`);
      return true;
    } catch (err) {
      await db.update(contactMessages).set({ status: "failed", error: (err as Error).message.slice(0, 500), updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
      await say(`Sending the email to ${c.org} failed: ${(err as Error).message.slice(0, 200)}`);
      log(`outreach: sending to ${c.org} failed: ${(err as Error).message}`);
      return false;
    }
  }

  async function expired(card: CardRow): Promise<void> {
    const found = await messageFor(card);
    if (!found) return;
    await db.update(contactMessages).set({ status: "expired", updatedAt: new Date() }).where(eq(contactMessages.id, found.m.id));
    if (found.c.status === "drafted") await setContactStatus(db, found.c.id, "prospect");
    await loop.post(card.communityId, card.crewRoomId, `Nobody approved the email to ${found.c.org} in time, so it was not sent.`);
  }

  const hooks: AnnounceHooks = { outcome, expired };

  // ── Prospects from the Builder ─────────────────────────────────────────

  /** A find-partners job is done: its prospects.json goes into contacts, and the crew gets the list. */
  async function prospectsReady(job: BuilderJob): Promise<void> {
    if (!job.folder) return;
    const dir = path.join(builderPaths().dir, "jobs", job.folder);
    const file = ["prospects.json", "out/prospects.json"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
    const roomId = job.roomId ?? (await loop.crewRoomFor(job.eventId));
    if (!file) {
      log(`outreach: ${jobRef(job)} is done but left no prospects.json`);
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      if (roomId) await loop.post(job.communityId, roomId, `The Builder's prospect list for ${jobRef(job)} isn't valid JSON, so I added nobody: ${(err as Error).message}`);
      return;
    }
    const { ok, dropped } = parseProspects(raw);
    const added: Contact[] = [];
    const known: Contact[] = [];
    for (const p of ok) {
      const { contact, created } = await upsertContact(db, {
        communityId: job.communityId,
        eventId: job.eventId,
        org: p.org,
        person: p.person,
        email: p.email,
        kind: p.kind,
        website: p.website,
        source: p.source,
        why: p.why,
        addedBy: "Ferri Builder",
        jobId: job.id,
      });
      (created ? added : known).push(contact);
    }
    log(`outreach: ${jobRef(job)} added ${added.length} prospects (${known.length} known, ${dropped.length} notes)`);
    if (!roomId) return;
    const line = (c: Contact) => `- ${c.org}${c.kind !== "other" ? ` (${c.kind})` : ""}${c.email ? `: ${c.email}` : ": no published address"}`;
    const withEmail = added.filter((c) => c.email).length;
    await loop.post(
      job.communityId,
      roomId,
      [
        `I added ${plural(added.length, "prospect", "prospects")} to contacts from the Builder's search${known.length ? ` (${known.length} were there already)` : ""}. Nobody has been emailed.`,
        ...added.slice(0, 12).map(line),
        added.length > 12 ? `...and ${added.length - 12} more in Desk.` : "",
        withEmail ? `To write to one, say "@${config.agentName} email <name> about ...", and I'll put the draft on a card.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  // ── Webhook events: replies and delivery ───────────────────────────────

  async function tick(): Promise<void> {
    try {
      // Emails Desk asked for.
      const requested = await db.select().from(contactMessages).where(eq(contactMessages.status, "requested")).orderBy(contactMessages.createdAt).limit(3);
      for (const m of requested) await draftAndOpen(m);
      const open = await db.select().from(emailEvents).where(isNull(emailEvents.handledAt)).orderBy(emailEvents.createdAt).limit(10);
      for (const e of open) {
        const [claimed] = await db
          .update(emailEvents)
          .set({ handledAt: new Date() })
          .where(and(eq(emailEvents.id, e.id), isNull(emailEvents.handledAt)))
          .returning();
        if (!claimed) continue;
        try {
          await handle(claimed.type, claimed.payload);
        } catch (err) {
          await db.update(emailEvents).set({ error: (err as Error).message.slice(0, 500) }).where(eq(emailEvents.id, e.id));
          log(`outreach: handling ${e.type} failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      log(`outreach tick failed: ${(err as Error).message}`);
    }
  }

  async function handle(type: string, payload: Record<string, unknown>): Promise<void> {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const emailId = typeof data.email_id === "string" ? data.email_id : null;
    if (!emailId) return;
    if (type === "email.received") return received(emailId, data);
    const status = type === "email.delivered" ? "delivered" : type === "email.bounced" ? "bounced" : type === "email.complained" ? "complained" : null;
    if (!status) return;
    const [m] = await db.select().from(contactMessages).where(eq(contactMessages.resendId, emailId)).limit(1);
    if (!m) return;
    // A later event never moves "delivered" back to "sent".
    await db.update(contactMessages).set({ status, updatedAt: new Date() }).where(eq(contactMessages.id, m.id));
    if (status === "delivered") return;
    const [c] = await db.select().from(contacts).where(eq(contacts.id, m.contactId)).limit(1);
    if (!c) return;
    await setContactStatus(db, c.id, status === "bounced" ? "bounced" : "do_not_contact");
    const roomId = await loop.crewRoomFor(m.eventId ?? c.eventId);
    if (roomId) {
      await loop.post(
        m.communityId,
        roomId,
        status === "bounced"
          ? `The email to ${c.org} (${c.email}) bounced, so the address doesn't work. Check it in Desk before writing again.`
          : `${c.org} marked our email as spam. I won't write to them again.`,
      );
    }
  }

  async function received(emailId: string, data: Record<string, unknown>): Promise<void> {
    if (!mail) return;
    const [seen] = await db.select({ id: contactMessages.id }).from(contactMessages).where(eq(contactMessages.resendId, emailId)).limit(1);
    if (seen) return;
    const email = await mail.received(emailId);
    const sender = parseAddress(email.from);
    const to = [...(email.to ?? []), ...(email.cc ?? []), ...((data.received_for as string[] | undefined) ?? [])];
    const forUs = to.some((a) => {
      const e = parseAddress(a)?.email ?? "";
      return e === mailbox || e.startsWith(`${mailbox.split("@")[0]}+`) && e.endsWith(`@${mailbox.split("@")[1]}`);
    });
    if (!forUs || !sender || sender.email === mailbox) {
      log(`outreach: email ${emailId} to ${to.join(", ")} is not for the partners mailbox; skipped`);
      return;
    }
    const code = codeFrom(to, mailbox);
    let contact = (code && (await contactByCode(db, code))) || null;
    const [community] = await db.select().from(communities).orderBy(communities.createdAt).limit(1);
    const communityId = contact?.communityId ?? community?.id;
    if (!communityId) return;
    if (!contact) contact = await findContact(db, communityId, { email: sender.email });
    if (!contact) {
      contact = (
        await upsertContact(db, {
          communityId,
          eventId: null,
          org: sender.name ?? sender.email.split("@")[1]!,
          person: sender.name,
          email: sender.email,
          source: `wrote to ${mailbox}`,
          addedBy: "email",
        })
      ).contact;
    }
    const [lastOut] = await db
      .select()
      .from(contactMessages)
      .where(and(eq(contactMessages.contactId, contact.id), eq(contactMessages.direction, "out"), inArray(contactMessages.status, ["sent", "delivered"])))
      .orderBy(desc(contactMessages.sentAt))
      .limit(1);
    const text = newPart(email.text ?? (email.html ?? "").replace(/<[^>]+>/g, " ")) || (email.text ?? "").trim();
    const { reading } = await readReply({
      choice: config.modelFast,
      org: contact.org,
      ours: lastOut ? { subject: lastOut.subject, text: lastOut.text } : null,
      theirs: { subject: email.subject, text, from: email.from },
    }).catch((err) => {
      log(`outreach: reading the reply from ${contact!.org} failed: ${(err as Error).message}`);
      return { reading: null };
    });
    const [inMsg] = await db
      .insert(contactMessages)
      .values({
        communityId,
        contactId: contact.id,
        eventId: lastOut?.eventId ?? contact.eventId,
        direction: "in",
        status: "received",
        subject: email.subject,
        text,
        fromAddress: email.from,
        toAddress: to.join(", "),
        resendId: emailId,
        inReplyToId: lastOut?.id ?? null,
        reading: reading ? { ...reading, messageId: email.message_id ?? (data.message_id as string | undefined) ?? null } : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!inMsg) return;
    const status = reading ? statusForReply(reading.want, contact.status) : "replied";
    await setContactStatus(db, contact.id, status, { lastReplyAt: new Date(), person: contact.person ?? sender.name ?? null });
    const eventId = lastOut?.eventId ?? contact.eventId;
    const roomId = await loop.crewRoomFor(eventId);
    log(`outreach: reply from ${contact.org} <${sender.email}>: ${reading?.want ?? "?"}`);
    if (!roomId) return;
    const head = `${contact.org} replied${sender.name ? ` (${sender.name})` : ""} to “${lastOut?.subject ?? email.subject}”`;
    const body = reading
      ? `${head}: ${reading.summary}\nNext: ${reading.next}${reading.want === "unsubscribe" ? " They are now marked do not contact." : reading.want === "declined" ? " Marked declined." : ""}`
      : `${head}. I couldn't read it; it's on their timeline in Desk.`;
    await loop.post(communityId, roomId, body);
    const crew = await loadCrew(db, communityId, eventId);
    const notify = [...new Set([...(lastOut?.requestedById ? [lastOut.requestedById] : []), ...crew.filter((c) => c.lead).map((c) => c.id)])];
    await pushToUsers(db, await switchUsersForCrew(db, notify), {
      kind: "email",
      title: `${contact.org} replied`,
      body: clip(reading?.summary ?? email.subject ?? "A reply", 180),
      url: "/m",
      tag: `email-${contact.id}`,
      renotify: true,
      cardId: null,
    });
    // An answer to draft: they are interested or asked something.
    if (reading && (reading.want === "interested" || reading.want === "question") && !cannotEmail({ ...contact, status })) {
      const [m] = await db
        .insert(contactMessages)
        .values({
          communityId,
          contactId: contact.id,
          eventId,
          direction: "out",
          status: "requested",
          ask: `Answer their email. ${reading.next}`,
          requestedBy: lastOut?.requestedBy ?? "the crew",
          requestedById: lastOut?.requestedById ?? null,
          inReplyToId: inMsg.id,
        })
        .returning();
      if (m) await draftAndOpen(m, roomId);
    }
  }

  return { intent, hooks, tick, prospectsReady, draftAndOpen, enabled: !!mail, mailbox };
}

export type Outreach = ReturnType<typeof createOutreach>;
