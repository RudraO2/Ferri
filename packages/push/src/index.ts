import { and, eq, inArray, lt, sql } from "drizzle-orm";
import webpush from "web-push";
import { crewMembers, deskUsers, pushLog, pushSubscriptions, type Db } from "@ferri/db";

/**
 * Web Push for Ferri Pocket (spec 06). Pocket subscribes a browser for a Switch
 * user; Ferri pushes to crew members through the Switch account linked to them
 * (`handles.switch` is the account's email). Every push is logged, so a card
 * that gets settled can replace the notifications it caused.
 */

export type PushKind = "open" | "nudge" | "escalate" | "expire" | "settled" | "test" | "reminder" | "shield" | "builder" | "email" | "care";

export interface PushPayload {
  kind: PushKind;
  title: string;
  body: string;
  /** Opened when the notification is tapped (a Pocket path such as /m/c/<id>). */
  url: string;
  /** Same tag: the new notification replaces the old one on the device. */
  tag: string;
  /** Buzz again even when replacing (false for quiet "it's settled" updates). */
  renotify: boolean;
  cardId?: string | null;
}

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidFromEnv(env: NodeJS.ProcessEnv = process.env): Vapid | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || "mailto:ferri@localhost" };
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribe(db: Db, switchUserId: string, sub: BrowserSubscription, userAgent: string | null): Promise<void> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("not a push subscription");
  await db
    .insert(pushSubscriptions)
    .values({ switchUserId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { switchUserId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, failures: 0, updatedAt: new Date() },
    });
}

export async function unsubscribe(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function subscriptionCount(db: Db, switchUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.switchUserId, switchUserId));
  return row?.n ?? 0;
}

/** The Switch users linked to these crew members (by `handles.switch` email, via Desk sign-ins). */
export async function switchUsersForCrew(db: Db, crewIds: string[]): Promise<string[]> {
  if (!crewIds.length) return [];
  const crew = await db.select({ handles: crewMembers.handles }).from(crewMembers).where(inArray(crewMembers.id, crewIds));
  const emails = [...new Set(crew.map((c) => c.handles.switch?.trim().toLowerCase()).filter((e): e is string => !!e))];
  if (!emails.length) return [];
  const users = await db
    .select({ id: deskUsers.switchUserId })
    .from(deskUsers)
    .where(inArray(sql`lower(${deskUsers.email})`, emails));
  return users.map((u) => u.id);
}

/** Who was pushed about a card (to replace those notifications once it is settled). */
export async function pushedAboutCard(db: Db, cardId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: pushLog.switchUserId })
    .from(pushLog)
    .where(and(eq(pushLog.cardId, cardId), eq(pushLog.status, "sent")));
  return rows.map((r) => r.id);
}

export interface PushResult {
  users: number;
  sent: number;
  gone: number;
  failed: number;
}

/**
 * Push one notice to every device of these Switch users. Subscriptions the push
 * service reports gone (404, 410) are removed. Never throws: a push is a
 * courtesy next to the crew-room post, not the only signal.
 */
export async function pushToUsers(db: Db, switchUserIds: string[], payload: PushPayload, vapid = vapidFromEnv()): Promise<PushResult> {
  const users = [...new Set(switchUserIds)];
  const result: PushResult = { users: users.length, sent: 0, gone: 0, failed: 0 };
  if (!vapid || !users.length) return result;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.switchUserId, users));
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      let status: "sent" | "gone" | "failed" = "sent";
      let error: string | null = null;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: vapid,
          TTL: payload.kind === "settled" ? 3600 : 24 * 3600,
          urgency: payload.kind === "settled" ? "normal" : "high",
          topic: topicFor(payload.tag),
        });
        await db.update(pushSubscriptions).set({ lastOkAt: new Date(), failures: 0 }).where(eq(pushSubscriptions.id, s.id));
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        error = `${code ?? ""} ${(err as Error).message}`.trim().slice(0, 300);
        if (code === 404 || code === 410) {
          status = "gone";
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          status = "failed";
          await db
            .update(pushSubscriptions)
            .set({ failures: sql`${pushSubscriptions.failures} + 1` })
            .where(eq(pushSubscriptions.id, s.id));
        }
      }
      result[status]++;
      await db.insert(pushLog).values({ cardId: payload.cardId ?? null, switchUserId: s.switchUserId, kind: payload.kind, title: payload.title, status, error });
    }),
  );
  // A subscription that keeps failing for days is dead weight.
  await db.delete(pushSubscriptions).where(and(sql`${pushSubscriptions.failures} >= 20`, lt(pushSubscriptions.updatedAt, new Date(Date.now() - 3 * 86400_000))));
  return result;
}

export async function pushToCrew(db: Db, crewIds: string[], payload: PushPayload): Promise<PushResult> {
  return pushToUsers(db, await switchUsersForCrew(db, crewIds), payload);
}

/** The Web Push `Topic` header: up to 32 URL-safe characters, so a queued notice is replaced, not stacked. */
export function topicFor(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "ferri";
}

// ── What the notifications say ───────────────────────────────────────────

export interface CardFacts {
  id: string;
  /** "announce": `question` is the announcement's title and `roomName` where it goes. */
  kind: "question" | "reply" | "announce" | "plan" | "outreach" | "care";
  question: string;
  topic: string;
  /** People waiting on the answer. */
  waiting: number;
  askerName?: string;
  roomName?: string;
  minutesOpen?: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const people = (n: number) => `${n} ${n === 1 ? "person is" : "people are"} waiting`;

export function cardNotice(kind: Exclude<PushKind, "settled" | "test" | "reminder" | "shield" | "builder" | "email" | "care">, card: CardFacts): PushPayload {
  const q = `“${clip(card.question, 140)}”`;
  const from = card.askerName && card.roomName ? `${card.askerName} in ${card.roomName}` : null;
  const base = { kind, url: `/m/c/${card.id}`, tag: `card-${card.id}`, renotify: true, cardId: card.id };
  if (card.kind === "care") {
    // `question` is the case's plain-language reason; `topic` names it ("Case 3 · stuck").
    switch (kind) {
      case "open":
        return { ...base, title: `${card.topic}: someone needs you`, body: `${clip(card.question, 160)}${card.roomName ? ` · ${card.roomName}` : ""}` };
      case "nudge":
        return { ...base, title: `${card.topic}: nobody has taken it`, body: `${clip(card.question, 140)} · ${card.minutesOpen ?? "?"} min` };
      case "escalate":
        return { ...base, title: `Anyone: ${card.topic} needs a person`, body: `${clip(card.question, 140)} · ${card.minutesOpen ?? "?"} min` };
      case "expire":
        return { ...base, renotify: false, title: `${card.topic} still has nobody on it`, body: `The card expired; the case stays open in Pocket. ${clip(card.question, 110)}` };
    }
  }
  if (card.kind === "announce") {
    const where = card.roomName ? ` · to ${card.roomName}` : "";
    switch (kind) {
      case "open":
        return { ...base, title: "Announcement needs your OK", body: `${q}${where}. Post, edit or drop it.` };
      case "nudge":
        return { ...base, title: "Announcement still waiting for your OK", body: `${q} · ${card.minutesOpen ?? "?"} min` };
      case "escalate":
        return { ...base, title: "Anyone: an announcement needs an OK", body: `${q} has waited ${card.minutesOpen ?? "?"} min.` };
      case "expire":
        return { ...base, renotify: false, title: "Announcement not posted", body: `Nobody approved ${q} in time.` };
    }
  }
  if (card.kind === "outreach") {
    switch (kind) {
      case "open":
        return { ...base, title: "An email needs your OK", body: `${q}. Send, edit or drop Ferri's draft.` };
      case "nudge":
        return { ...base, title: "Email still waiting for your OK", body: `${q} · ${card.minutesOpen ?? "?"} min` };
      case "escalate":
        return { ...base, title: "Anyone: an email needs an OK", body: `${q} has waited ${card.minutesOpen ?? "?"} min.` };
      case "expire":
        return { ...base, renotify: false, title: "Email not sent", body: `Nobody approved ${q} in time.` };
    }
  }
  if (card.kind === "plan") {
    switch (kind) {
      case "open":
        return { ...base, title: "A plan decision needs your OK", body: `${q}. Confirm, change or drop it.` };
      case "nudge":
        return { ...base, title: "Plan decision still waiting", body: `${q} · ${card.minutesOpen ?? "?"} min` };
      case "escalate":
        return { ...base, title: "Anyone: a plan decision needs an OK", body: `${q} has waited ${card.minutesOpen ?? "?"} min.` };
      case "expire":
        return { ...base, renotify: false, title: "Plan decision not confirmed", body: `Nobody confirmed ${q} in time. It stays open.` };
    }
  }
  if (card.kind === "reply") {
    switch (kind) {
      case "open":
        return { ...base, title: "A reply needs your OK", body: `${from ? `${from} asked ` : ""}${q}. Send, edit or drop Ferri's draft.` };
      case "nudge":
        return { ...base, title: "Reply still waiting for your OK", body: `${q} · ${card.minutesOpen ?? "?"} min` };
      case "escalate":
        return { ...base, title: "Anyone: a reply needs an OK", body: `${q} has waited ${card.minutesOpen ?? "?"} min.` };
      case "expire":
        return { ...base, renotify: false, title: "Reply not sent", body: `Nobody approved the reply to ${q} in time.` };
    }
  }
  switch (kind) {
    case "open":
      return { ...base, title: `New ${card.topic} question`, body: `${q}${from ? ` · ${from}` : ""}. Tap to answer.` };
    case "nudge":
      return { ...base, title: "Still waiting on you", body: `${q} · ${people(card.waiting)} · ${card.minutesOpen ?? "?"} min` };
    case "escalate":
      return { ...base, title: "Whole crew: who knows this?", body: `${q} · ${people(card.waiting)} · ${card.minutesOpen ?? "?"} min` };
    case "expire":
      return { ...base, renotify: false, title: "Question went unanswered", body: `${q} expired. It is on the unanswered list.` };
  }
}

export function settledNotice(card: { id: string; question: string; kind: "question" | "reply" | "announce" | "plan" | "outreach" | "care" }, how: "answered" | "dismissed" | "expired", by: string | null, reached?: number): PushPayload {
  const q = `“${clip(card.question, 140)}”`;
  if (card.kind === "care") {
    const title = how === "answered" ? `Case settled${by ? ` · ${by}` : ""}` : how === "dismissed" ? `Not a case${by ? ` · ${by}` : ""}` : "Case still open";
    return { kind: "settled", title, body: clip(card.question, 160), url: `/m/c/${card.id}`, tag: `card-${card.id}`, renotify: false, cardId: card.id };
  }
  if (card.kind === "outreach") {
    const title = how === "answered" ? `Email sent${by ? ` · ${by}` : ""}` : how === "dismissed" ? `Email not sent${by ? ` · ${by}` : ""}` : "Email not sent";
    return { kind: "settled", title, body: q, url: `/m/c/${card.id}`, tag: `card-${card.id}`, renotify: false, cardId: card.id };
  }
  if (card.kind === "plan") {
    const title = how === "answered" ? `Confirmed${by ? ` by ${by}` : ""}` : how === "dismissed" ? `Dropped${by ? ` · ${by}` : ""}` : "Plan decision not confirmed";
    return { kind: "settled", title, body: q, url: `/m/c/${card.id}`, tag: `card-${card.id}`, renotify: false, cardId: card.id };
  }
  if (card.kind === "announce") {
    const title =
      how === "answered" ? `Announcement approved${by ? ` by ${by}` : ""}` : how === "dismissed" ? `Not posted${by ? ` · ${by}` : ""}` : "Announcement not posted";
    const body = how === "answered" && reached !== undefined ? `${q} · ${reached} ${reached === 1 ? "space" : "spaces"}` : q;
    return { kind: "settled", title, body, url: `/m/c/${card.id}`, tag: `card-${card.id}`, renotify: false, cardId: card.id };
  }
  const title =
    how === "answered"
      ? `${card.kind === "reply" ? "Reply sent" : "Answered"}${by ? ` by ${by}` : ""}`
      : how === "dismissed"
        ? `${card.kind === "reply" ? "Not sent" : "Not answered"}${by ? ` · ${by}` : ""}`
        : card.kind === "reply"
          ? "Reply not sent"
          : "Question went unanswered";
  const body = how === "answered" && card.kind === "question" && reached !== undefined ? `${q} · reached ${reached} ${reached === 1 ? "person" : "people"}` : q;
  return { kind: "settled", title, body, url: `/m/c/${card.id}`, tag: `card-${card.id}`, renotify: false, cardId: card.id };
}

/** A crew reminder (spec 09): "Reminder: order the pizza". */
export function reminderNotice(r: { id: string; text: string; by: string }): PushPayload {
  return { kind: "reminder", title: "Reminder", body: `${clip(r.text, 180)}${r.by ? ` · set by ${r.by}` : ""}`, url: "/m", tag: `reminder-${r.id}`, renotify: true, cardId: null };
}
