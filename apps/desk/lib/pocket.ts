import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { community, db } from "./db";
import { cards, crewForSwitchEmail, crewMembers, events, questions, spaces } from "./ferri";
import type { DeskUser } from "./session";

/** The crew rows linked to this Switch account (by `handles.switch`). Empty: not linked yet. */
export async function myCrew(user: DeskUser) {
  const c = await community();
  return crewForSwitchEmail(db(), c.id, user.email);
}

/** Every crew member of the community and its live events, one entry per name (for "I am ..."). */
export async function crewToPick() {
  const c = await community();
  const rows = await db()
    .select({ id: crewMembers.id, name: crewMembers.name, topics: crewMembers.topics, handles: crewMembers.handles, eventName: events.name })
    .from(crewMembers)
    .leftJoin(events, eq(events.id, crewMembers.eventId))
    .where(eq(crewMembers.communityId, c.id))
    .orderBy(asc(crewMembers.name));
  const byName = new Map<string, (typeof rows)[number] & { topicsAll: string[] }>();
  for (const r of rows) {
    const k = r.name.toLowerCase();
    const prev = byName.get(k);
    if (prev) prev.topicsAll = [...new Set([...prev.topicsAll, ...r.topics])];
    else byName.set(k, { ...r, topicsAll: r.topics });
  }
  return [...byName.values()];
}

type Waiting = {
  questionId: string;
  cardId: string | null;
  askerName: string;
  text: string;
  askedAt: Date;
  roomId: string;
  spaceName: string | null;
  platform: string | null;
};

async function waitingOn(cardIds: string[]): Promise<Map<string, Waiting[]>> {
  const out = new Map<string, Waiting[]>();
  if (!cardIds.length) return out;
  const rows = await db()
    .select({
      questionId: questions.id,
      cardId: questions.cardId,
      askerName: questions.askerName,
      text: questions.text,
      askedAt: questions.askedAt,
      roomId: questions.roomId,
      spaceName: spaces.name,
      platform: spaces.platform,
    })
    .from(questions)
    .leftJoin(spaces, eq(spaces.id, questions.spaceId))
    .where(and(inArray(questions.cardId, cardIds), isNull(questions.resolvedAt)))
    .orderBy(asc(questions.askedAt));
  for (const r of rows) out.set(r.cardId!, [...(out.get(r.cardId!) ?? []), r]);
  return out;
}

export type PocketCard = Awaited<ReturnType<typeof openCards>>[number];

/** Open cards with who waits on them, and whether each one needs this person. */
export async function openCards(user: DeskUser) {
  const c = await community();
  const mine = await myCrew(user);
  const myIds = new Set(mine.map((m) => m.id));
  const rows = await db()
    .select()
    .from(cards)
    .where(and(eq(cards.communityId, c.id), eq(cards.status, "open")))
    .orderBy(asc(cards.createdAt));
  const waiting = await waitingOn(rows.filter((r) => r.kind === "question").map((r) => r.id));
  const ownerRows = await db().select({ id: crewMembers.id, name: crewMembers.name }).from(crewMembers).where(eq(crewMembers.communityId, c.id));
  const ownerName = new Map(ownerRows.map((o) => [o.id, o.name]));
  // The room a reply card would post in, for its label.
  const targetIds = rows.map((r) => r.targetRoomId).filter((x): x is string => !!x);
  const targets = targetIds.length
    ? await db().select({ roomId: spaces.switchRoomId, name: spaces.name, platform: spaces.platform }).from(spaces).where(inArray(spaces.switchRoomId, targetIds))
    : [];
  const targetBy = new Map(targets.map((t) => [t.roomId, t]));
  return rows.map((r) => {
    const owners = r.ownerIds.map((id) => ownerName.get(id) ?? "?");
    const forMe = !myIds.size || r.ownerIds.some((id) => myIds.has(id)) || !!r.escalatedAt || !r.ownerIds.length;
    const why = !myIds.size
      ? "open"
      : r.ownerIds.some((id) => myIds.has(id))
        ? r.kind === "reply"
          ? "your OK"
          : `you own ${r.topic}`
        : r.escalatedAt
          ? "escalated to everyone"
          : "for the crew";
    return { ...r, owners, forMe, why, waiting: waiting.get(r.id) ?? [], target: r.targetRoomId ? (targetBy.get(r.targetRoomId) ?? null) : null };
  });
}

export async function pocketCard(user: DeskUser, id: string) {
  const c = await community();
  const [row] = await db().select().from(cards).where(and(eq(cards.id, id), eq(cards.communityId, c.id))).limit(1);
  if (!row) return null;
  if (row.status === "open") return (await openCards(user)).find((x) => x.id === id) ?? null;
  const asked = await db()
    .select({ askerName: questions.askerName, text: questions.text, resolution: questions.resolution, spaceName: spaces.name, platform: spaces.platform })
    .from(questions)
    .leftJoin(spaces, eq(spaces.id, questions.spaceId))
    .where(eq(questions.cardId, id));
  return { ...row, owners: [] as string[], forMe: false, why: row.status, waiting: [] as Waiting[], asked, target: null };
}

/** Members waiting on the crew right now (longest first), and who never got an answer in the last day. */
export async function stuck() {
  const c = await community();
  const open = await db()
    .select({ id: cards.id, question: cards.question, topic: cards.topic, createdAt: cards.createdAt, ownerIds: cards.ownerIds, escalatedAt: cards.escalatedAt })
    .from(cards)
    .where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "question")));
  const byCard = new Map(open.map((o) => [o.id, o]));
  const waiting = [...(await waitingOn(open.map((o) => o.id))).values()].flat().sort((a, b) => a.askedAt.getTime() - b.askedAt.getTime());

  const replies = await db()
    .select({ id: cards.id, question: cards.question, createdAt: cards.createdAt, targetRoomId: cards.targetRoomId, targetQuestionId: cards.targetQuestionId })
    .from(cards)
    .where(and(eq(cards.communityId, c.id), eq(cards.status, "open"), eq(cards.kind, "reply")));
  const replyAskers = replies.length
    ? await db()
        .select({ id: questions.id, askerName: questions.askerName, askedAt: questions.askedAt, spaceName: spaces.name, platform: spaces.platform })
        .from(questions)
        .leftJoin(spaces, eq(spaces.id, questions.spaceId))
        .where(inArray(questions.id, replies.map((r) => r.targetQuestionId).filter((x): x is string => !!x)))
    : [];
  const replyBy = new Map(replyAskers.map((q) => [q.id, q]));

  const since = new Date(Date.now() - 24 * 3600_000);
  const expired = await db()
    .select({ askerName: questions.askerName, text: questions.text, askedAt: questions.askedAt, spaceName: spaces.name, platform: spaces.platform, cardId: questions.cardId })
    .from(questions)
    .leftJoin(spaces, eq(spaces.id, questions.spaceId))
    .where(and(eq(questions.communityId, c.id), eq(questions.resolution, "expired"), gte(questions.askedAt, since)))
    .orderBy(desc(questions.askedAt));

  return {
    waiting: waiting.map((w) => ({ ...w, card: byCard.get(w.cardId!)! })),
    replies: replies.map((r) => ({ ...r, asker: r.targetQuestionId ? (replyBy.get(r.targetQuestionId) ?? null) : null })),
    expired,
  };
}

/** Counts for the tab bar. */
export async function pocketCounts(user: DeskUser) {
  const all = await openCards(user);
  const people = new Set(all.flatMap((c) => c.waiting.map((w) => `${w.roomId}|${w.askerName}`)));
  return { needsYou: all.filter((c) => c.forMe).length, stuck: people.size + all.filter((c) => c.kind === "reply").length };
}

export function waitedFor(d: Date): string {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${Math.floor(h / 24)} d`;
}

export const PLATFORM_LABEL: Record<string, string> = {
  telegram: "Telegram",
  slack: "Slack",
  discord: "Discord",
  mattermost: "Mattermost",
  whatsapp: "WhatsApp",
  whatsapp_web: "WhatsApp",
};

/** "Lantern Labs Discord: build-night" reads better on a phone as "build-night". */
export function shortSpace(name: string | null | undefined): string {
  if (!name) return "a space";
  const i = name.indexOf(": ");
  return i >= 0 ? name.slice(i + 2) : name;
}

