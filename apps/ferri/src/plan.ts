import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { cards, events, planAgendas, planItems, type Db } from "@ferri/db";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  crewByName,
  draftAgenda,
  formatWhen,
  isPaused,
  latestAgenda,
  loadCrew,
  loadLiveKnowledge,
  loadPlan,
  localNow,
  mention,
  parseWhen,
  planSummary,
  publishLibraryDocument,
  readPlanChat,
  renderPlanDocument,
  routeCard,
  saveCrewEntry,
  setEntryArchived,
  shortPlanIds,
  switchExpiry,
  type ChatLine,
  type CrewIntent,
  type CrewMember,
  type PlanItem,
} from "@ferri/knowledge";
import { pushToUsers, switchUsersForCrew } from "@ferri/push";
import type { GatewayClient, SwitchAgent } from "@ferri/switch";
import { config } from "./config.ts";
import type { Loop, RoomInfo } from "./loop.ts";

/** Plan-card option: confirm Ferri's proposal as it stands. */
export const PLAN_CONFIRM_OPTION = "confirm";

/** A deadline reminder later than this (Ferri was down, or paused) is not sent. */
const LATE_LIMIT_MS = 6 * 3600_000;

export interface PlanDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  gateway: GatewayClient | null;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

type CardRow = typeof cards.$inferSelect;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const noDot = (s: string) => s.trim().replace(/[.。]\s*$/, "");

/**
 * The Plan stage (spec 08): the living plan Ferri keeps from the crew's own
 * chat, the agenda draft with one card per key decision, owners that feed the
 * routing, deadline reminders, and the plan as a Switch document.
 */
export function createPlan(deps: PlanDeps) {
  const { db, agent, loop, gateway, log } = deps;

  async function eventOf(eventId: string) {
    const [e] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return e ?? null;
  }

  async function timeZone(): Promise<string> {
    const kb = await loadLiveKnowledge(db, config.community);
    return kb?.community.timezone ?? "Asia/Kolkata";
  }

  function itemLine(i: { kind: string; title: string; text: string }, owner: CrewMember | null, due: Date | null, tz: string): string {
    if (i.kind === "owner") return `${owner?.name ?? "someone"} owns ${i.title.toLowerCase()}`;
    if (i.kind === "task") return `task “${noDot(i.text)}” (${owner?.name ?? "nobody yet"}${due ? `, due ${formatWhen(due, tz)}` : ""})`;
    if (i.kind === "question") return `still open: ${noDot(i.text)}`;
    return `decided: ${noDot(i.text)}`;
  }

  // ── Reading the crew's own chat ────────────────────────────────────────

  /**
   * One crew message in the crew room, after the grace: whatever it settles,
   * assigns or leaves open goes into the plan, confirmed (the crew said it).
   * Returns the line Ferri posts, or null when nothing changed.
   */
  async function fromChat(input: {
    communityId: string;
    eventId: string;
    member: CrewMember;
    messageId: string;
    body: string;
    before: ChatLine[];
    after: ChatLine[];
  }): Promise<string | null> {
    const plan = await loadPlan(db, input.eventId);
    const crew = await loadCrew(db, input.communityId, input.eventId);
    const tz = await timeZone();
    const r = await readPlanChat({
      choice: config.modelFast,
      sender: input.member.name,
      message: input.body,
      before: input.before,
      after: input.after,
      plan,
      crew,
      now: localNow(tz),
    });
    if (!r.read) return null;
    const lines: string[] = [];
    const routing: string[] = [];
    const strangers: string[] = [];
    let n = 0;
    for (const i of r.read.items) {
      const owner = crewByName(crew, i.owner) ?? (i.kind === "owner" && /^(i|me|myself)$/i.test(i.owner ?? "") ? input.member : null);
      if (i.kind === "owner" && !owner) {
        if (i.owner) strangers.push(`${i.owner} is not on the crew list yet, so ${i.topic} stays where it was (add them in Desk, under the event's crew)`);
        continue;
      }
      const due = i.kind === "task" ? parseWhen(i.due) : null;
      const title = i.kind === "owner" ? i.topic : i.title.trim().slice(0, 80);
      const [row] = await db
        .insert(planItems)
        .values({
          communityId: input.communityId,
          eventId: input.eventId,
          kind: i.kind,
          status: "confirmed",
          topic: i.topic,
          title,
          text: i.text.trim(),
          ownerId: owner?.id ?? null,
          dueAt: due,
          forMembers: i.kind === "decision" && i.for_members,
          origin: "chat",
          decidedBy: input.member.name,
          sourceKey: `${input.messageId}#${n++}`,
        })
        .onConflictDoNothing({ target: planItems.sourceKey })
        .returning();
      if (!row) continue;
      lines.push(itemLine({ ...i, title }, owner, due, tz));
      if (i.kind === "owner" && owner && i.topic !== "other") routing.push(`Cards about ${i.topic} go to ${owner.name} first now`);
    }
    for (const old of r.replaces) {
      await db.update(planItems).set({ status: "dropped", updatedAt: new Date() }).where(eq(planItems.id, old.id));
      await forget(old);
    }
    for (const d of r.done) {
      if (d.status === "done") continue;
      await db.update(planItems).set({ status: "done", updatedAt: new Date() }).where(eq(planItems.id, d.id));
      lines.push(d.kind === "question" ? `settled: ${noDot(d.title)}` : `done: ${noDot(d.title)}`);
    }
    if (!lines.length && !strangers.length) return null;
    log(`plan from ${input.member.name}'s message: ${[...lines, ...strangers].join("; ")}`);
    await saveDecisions(input.eventId);
    const head = lines.length ? `Plan updated: ${lines.join("; ")}.` : "";
    const tail = [routing.length ? `${routing.join("; ")}.` : "", strangers.length ? `${strangers.join("; ")}.` : ""];
    return [head, ...tail].filter(Boolean).join(" ");
  }

  // ── What a crew member asks of the plan ────────────────────────────────

  async function planContext(communityId: string, eventId: string | null) {
    if (!eventId) return undefined;
    const crew = await loadCrew(db, communityId, eventId);
    return shortPlanIds(await loadPlan(db, eventId), crew);
  }

  async function intent(input: {
    communityId: string;
    eventId: string | null;
    member: CrewMember;
    messageId: string;
    body: string;
    intent: CrewIntent;
    item: PlanItem | null;
    crewRoomId: string | null;
  }): Promise<string | null> {
    const p = input.intent.plan;
    if (!input.eventId || !p) return "This room is not attached to an event, so there is no plan to work on.";
    const tz = await timeZone();
    const crew = await loadCrew(db, input.communityId, input.eventId);
    if (p.action === "show") {
      return planSummary({ items: await loadPlan(db, input.eventId), crew, timeZone: tz });
    }
    if (p.action === "draft") {
      return draft({ communityId: input.communityId, eventId: input.eventId, by: input.member.name, request: p.what || input.body, messageId: input.messageId, crewRoomId: input.crewRoomId });
    }
    if (p.action === "done") {
      if (!input.item) return "I could not tell which item in the plan that is. Say “what's the plan?” to see it.";
      if (input.item.status === "done") return `“${input.item.title}” is already marked done.`;
      await db.update(planItems).set({ status: "done", updatedAt: new Date() }).where(eq(planItems.id, input.item.id));
      log(`plan: ${input.member.name} marked ${input.item.id} done`);
      return `Marked done: ${noDot(input.item.title)}.`;
    }
    const owner = crewByName(crew, p.owner) ?? (/^(i|me|myself)$/i.test(p.owner ?? "") ? input.member : null);
    if (p.action === "owner") {
      if (!owner) return `I could not tell who that is. Use a crew member's name, like “Arjun owns registration”.`;
      const [row] = await db
        .insert(planItems)
        .values({
          communityId: input.communityId,
          eventId: input.eventId,
          kind: "owner",
          status: "confirmed",
          topic: p.topic,
          title: p.topic,
          text: `${owner.name} owns ${p.topic}.`,
          ownerId: owner.id,
          origin: "chat",
          decidedBy: input.member.name,
          sourceKey: `${input.messageId}#0`,
        })
        .onConflictDoNothing({ target: planItems.sourceKey })
        .returning();
      if (!row) return null;
      return `Noted: ${owner.name} owns ${p.topic}. ${p.topic === "other" ? "" : `Cards about ${p.topic} go to ${owner.name} first now.`}`.trim();
    }
    // add
    const due = p.kind === "task" ? parseWhen(p.due) : null;
    const text = p.what.trim() || input.body;
    const [row] = await db
      .insert(planItems)
      .values({
        communityId: input.communityId,
        eventId: input.eventId,
        kind: p.kind,
        status: "confirmed",
        topic: p.topic,
        title: clip(noDot(text), 60),
        text,
        ownerId: owner?.id ?? null,
        dueAt: due,
        forMembers: p.kind === "decision",
        origin: "chat",
        decidedBy: input.member.name,
        sourceKey: `${input.messageId}#0`,
      })
      .onConflictDoNothing({ target: planItems.sourceKey })
      .returning();
    if (!row) return null;
    await saveDecisions(input.eventId);
    return `Added to the plan: ${itemLine({ kind: p.kind, title: row.title, text }, owner, due, tz)}.`;
  }

  // ── The agenda draft, with a card per key decision ─────────────────────

  async function draft(input: { communityId: string; eventId: string; by: string; request: string; messageId: string; crewRoomId: string | null }): Promise<string | null> {
    const kb = await loadLiveKnowledge(db, config.community, { eventId: input.eventId });
    if (!kb) return null;
    const crew = await loadCrew(db, input.communityId, input.eventId);
    const plan = await loadPlan(db, input.eventId);
    const { draft: d } = await draftAgenda({
      choice: config.modelMain,
      kb,
      eventId: input.eventId,
      request: input.request,
      plan,
      crew,
      now: localNow(kb.community.timezone),
    });
    if (!d) return "I could not draft the agenda this time. Try asking again.";
    const [agenda] = await db
      .insert(planAgendas)
      .values({ eventId: input.eventId, text: d.agenda, requestedBy: input.by, sourceMessageId: input.messageId })
      .onConflictDoNothing({ target: planAgendas.sourceMessageId })
      .returning();
    if (!agenda) return null;
    // A new draft replaces proposals still waiting from the last one.
    for (const old of plan.filter((i) => i.status === "proposed")) await dropProposal(old, "a newer draft");
    let n = 0;
    for (const x of d.decisions) {
      await db.insert(planItems).values({
        communityId: input.communityId,
        eventId: input.eventId,
        kind: "decision",
        status: "proposed",
        topic: x.topic,
        title: x.title.trim().slice(0, 80),
        text: x.proposal.trim(),
        forMembers: x.for_members,
        origin: "draft",
        decidedBy: null,
        sourceKey: `${input.messageId}#draft${n++}`,
      });
    }
    log(`plan: agenda drafted for ${input.by} with ${d.decisions.length} decision(s)`);
    // The cards open on the next tick, so they land below this reply.
    const head = `${d.summary || "Here is a draft agenda."}\n\n${clip(d.agenda, 2600)}\n\nThe agenda is in the plan document in this room.`;
    return d.decisions.length ? `${head} ${plural(d.decisions.length, "decision needs", "decisions need")} an OK: the cards follow.` : head;
  }

  /** Open a card for every proposed item that has none. Returns how many opened. */
  async function openCards(eventId: string): Promise<number> {
    const event = await eventOf(eventId);
    if (!event) return 0;
    if (await isPaused(db, event.communityId)) return 0;
    const crewRoomId = await loop.crewRoomFor(eventId);
    if (!crewRoomId) return 0;
    const proposed = await db
      .select()
      .from(planItems)
      .where(and(eq(planItems.eventId, eventId), eq(planItems.status, "proposed"), isNull(planItems.cardId)))
      .orderBy(asc(planItems.createdAt));
    if (!proposed.length) return 0;
    const crew = await loadCrew(db, event.communityId, eventId);
    const { platform } = await deps.room(crewRoomId);
    const pings = new Map<string, { member: CrewMember; titles: string[] }>();
    let opened = 0;
    for (const item of proposed) {
      const route = routeCard(crew, item.topic);
      const times = await loop.ladderFor(event.communityId, event);
      const id = randomUUID();
      await db.insert(cards).values({
        id,
        communityId: event.communityId,
        eventId,
        crewRoomId,
        switchSessionId: CARD_SESSION,
        kind: "plan",
        topic: item.topic,
        question: clip(`${item.title}: ${noDot(item.text)}`, 300),
        draftText: item.text,
        ownerIds: route.owners.map((o) => o.id),
        ...times,
      });
      try {
        await agent.openQuestionsCard(CARD_SESSION, {
          request_id: id,
          turn_id: id,
          title: clip(`Plan decision · ${item.title}: “${noDot(item.text)}”`, 500),
          detail: "Ferri proposed this in the agenda draft. Nothing is decided until someone on the crew confirms it.",
          questions: [
            {
              id: CARD_QUESTION_ID,
              title: `Confirm: ${clip(item.title, 120)}?`,
              prompt: `Ferri's proposal: ${item.text}\n\nPick Confirm or Drop, or write the decision your way in quotes after the card code to confirm that instead.`,
              options: [
                { id: PLAN_CONFIRM_OPTION, label: "Confirm", description: null },
                { id: CARD_SKIP_OPTION, label: "Drop", description: null },
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
        log(`plan item ${item.id}: opening the card failed: ${(err as Error).message}`);
        continue;
      }
      await db.update(planItems).set({ cardId: id, updatedAt: new Date() }).where(eq(planItems.id, item.id));
      for (const o of route.owners) {
        const p = pings.get(o.id) ?? { member: o, titles: [] };
        p.titles.push(item.title);
        pings.set(o.id, p);
      }
      const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
      if (row) loop.pocketNotify("open", row, route.owners.map((o) => o.id));
      opened++;
    }
    if (pings.size) {
      // Switch draws the cards on the platform a moment after the call returns; ping below them.
      await new Promise((r) => setTimeout(r, 2000));
      const lines = [...pings.values()].map((p) => `${mention(p.member, platform)}: ${p.titles.join(", ")}`);
      await loop.post(event.communityId, crewRoomId, `Plan decisions waiting for your OK (cards above). ${lines.join("; ")}.`);
    }
    log(`plan: ${opened} card(s) opened for event ${eventId}`);
    return opened;
  }

  async function dropProposal(item: PlanItem, why: string): Promise<void> {
    await db.update(planItems).set({ status: "dropped", updatedAt: new Date() }).where(eq(planItems.id, item.id));
    if (!item.cardId) return;
    const closed = await loop.claim(item.cardId, { status: "closed" });
    if (closed) {
      await agent.closeCard(closed.switchSessionId, closed.id).catch(() => {});
      loop.pocketSettled(closed, "dismissed", why);
    }
  }

  async function itemFor(card: CardRow): Promise<PlanItem | null> {
    const [i] = await db.select().from(planItems).where(eq(planItems.cardId, card.id)).limit(1);
    return i ?? null;
  }

  /** Someone answered a plan card: confirm (as proposed or their way) or drop. */
  async function outcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const item = await itemFor(card);
    if (!item) return;
    if (answer.selected.includes(CARD_SKIP_OPTION) && !answer.written) {
      const claimed = await loop.claim(card.id, { status: "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
      if (!claimed) return;
      await db.update(planItems).set({ status: "dropped", decidedBy: by, updatedAt: new Date() }).where(eq(planItems.id, item.id));
      loop.pocketSettled(claimed, "dismissed", by);
      await loop.post(card.communityId, card.crewRoomId, `Okay ${by}, dropped “${item.title}” from the plan.`);
      log(`plan item ${item.id} dropped by ${by}`);
      return;
    }
    if (!answer.written && !answer.selected.includes(PLAN_CONFIRM_OPTION)) return;
    const text = answer.written ?? item.text;
    const claimed = await loop.claim(card.id, { status: "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: text });
    if (!claimed) return;
    await db.update(planItems).set({ status: "confirmed", text, decidedBy: by, updatedAt: new Date() }).where(eq(planItems.id, item.id));
    loop.pocketSettled(claimed, "answered", by);
    const saved = item.forMembers ? await saveDecisions(item.eventId) : 0;
    await loop.post(
      card.communityId,
      card.crewRoomId,
      `Confirmed by ${by}: ${item.title}: ${noDot(text)}.${item.forMembers && saved ? " Members who ask will get this answer now." : ""}`,
    );
    log(`plan item ${item.id} confirmed by ${by}${answer.written ? " (their version)" : ""}`);
  }

  /** The card expired: the decision stays open in the plan, as a question. */
  async function expired(card: CardRow): Promise<void> {
    const item = await itemFor(card);
    if (!item || item.status !== "proposed") return;
    await db
      .update(planItems)
      .set({ kind: "question", status: "confirmed", cardId: null, text: `Still to decide: ${item.title} (Ferri proposed: ${noDot(item.text)}).`, updatedAt: new Date() })
      .where(eq(planItems.id, item.id));
    await loop.post(card.communityId, card.crewRoomId, `Nobody confirmed “${item.title}” in time, so it stays open in the plan.`);
    log(`plan item ${item.id}: card expired; kept as an open question`);
  }

  // ── Knowledge: confirmed decisions members need ────────────────────────

  async function saveDecisions(eventId: string): Promise<number> {
    const rows = await db
      .select()
      .from(planItems)
      .where(and(eq(planItems.eventId, eventId), eq(planItems.kind, "decision"), eq(planItems.status, "confirmed"), eq(planItems.forMembers, true), isNull(planItems.entryId)));
    if (!rows.length) return 0;
    const event = await eventOf(eventId);
    let saved = 0;
    for (const i of rows) {
      try {
        const entryId = await saveCrewEntry(db, {
          communityId: i.communityId,
          eventId,
          key: `plan/${i.id}`,
          sourceRef: i.id,
          sourceTitle: `${event?.name ?? "Event"} plan`,
          heading: i.title,
          body: i.text,
          by: i.decidedBy ?? "the crew",
        });
        await db.update(planItems).set({ entryId }).where(eq(planItems.id, i.id));
        saved++;
      } catch (err) {
        log(`plan item ${i.id}: saving it as knowledge failed: ${(err as Error).message}`);
      }
    }
    return saved;
  }

  /** A decision that was replaced stops being an answer. */
  async function forget(item: PlanItem): Promise<void> {
    if (!item.entryId) return;
    await setEntryArchived(db, { entryId: item.entryId, archived: true, by: "Ferri (plan changed)" }).catch((err) =>
      log(`plan item ${item.id}: archiving its knowledge failed: ${(err as Error).message}`),
    );
  }

  // ── The clock: deadlines, Desk changes, the plan document ──────────────

  let ticking = false;
  const docSignature = new Map<string, string>();

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      const now = Date.now();
      // Deadlines: one reminder to the owner (or the crew) when a task falls due.
      const due = await db
        .select()
        .from(planItems)
        .where(and(eq(planItems.kind, "task"), eq(planItems.status, "confirmed"), isNull(planItems.remindedAt), lte(planItems.dueAt, new Date(now))));
      for (const t of due) {
        if (await isPaused(db, t.communityId)) continue;
        const [claimed] = await db
          .update(planItems)
          .set({ remindedAt: new Date() })
          .where(and(eq(planItems.id, t.id), isNull(planItems.remindedAt)))
          .returning();
        if (!claimed) continue;
        if (now - (t.dueAt?.getTime() ?? now) > LATE_LIMIT_MS) continue;
        const crewRoomId = await loop.crewRoomFor(t.eventId);
        if (!crewRoomId) continue;
        const crew = await loadCrew(db, t.communityId, t.eventId);
        const who = t.ownerId ? crew.filter((c) => c.id === t.ownerId) : crew;
        const { platform } = await deps.room(crewRoomId);
        await loop.post(t.communityId, crewRoomId, `${who.map((c) => mention(c, platform)).join(" ") || "Crew"}, due now from the plan: ${noDot(t.text)}. Tell me when it's done.`);
        await pushToUsers(db, await switchUsersForCrew(db, who.map((c) => c.id)), {
          kind: "reminder",
          title: "Due now",
          body: clip(t.text, 180),
          url: "/m",
          tag: `plan-${t.id}`,
          renotify: true,
          cardId: null,
        });
        log(`plan task ${t.id}: deadline reminder to ${who.map((c) => c.name).join(", ")}`);
      }

      // Items Desk added or changed: decisions to save, cards to open.
      const changedEvents = await db.selectDistinct({ eventId: planItems.eventId }).from(planItems);
      for (const { eventId } of changedEvents) {
        await saveDecisions(eventId);
        await openCards(eventId);
        await publish(eventId);
      }
    } catch (err) {
      log(`plan tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  /** Re-render the event's plan document in Switch when anything in it changed. */
  async function publish(eventId: string): Promise<void> {
    if (!gateway) return;
    const event = await eventOf(eventId);
    if (!event) return;
    const crewRoomId = await loop.crewRoomFor(eventId);
    if (!crewRoomId) return;
    const items = await loadPlan(db, eventId);
    const crew = await loadCrew(db, event.communityId, eventId);
    const agenda = await latestAgenda(db, eventId);
    const [sig] = await db
      .select({ last: sql<string>`coalesce(max(${planItems.updatedAt})::text, '')`, n: sql<number>`count(*)::int` })
      .from(planItems)
      .where(eq(planItems.eventId, eventId));
    const signature = `${sig?.last}|${sig?.n}|${agenda?.createdAt.toISOString() ?? ""}|${crew.map((c) => `${c.id}:${c.topics.join(",")}`).join(";")}|${crewRoomId}`;
    if (docSignature.get(eventId) === signature) return;
    const tz = await timeZone();
    try {
      const r = await publishLibraryDocument({
        db,
        gateway,
        stateKey: `plan_document:${eventId}`,
        name: `${event.name}: the plan`,
        description: `The living plan for ${event.name}: decisions, owners, tasks and deadlines, open questions, the agenda draft.`,
        instructions: "Maintained by Ferri from the crew's chat, plan cards and Desk. Read it to know what is decided and who owns what; change the plan by telling Ferri or in Desk.",
        content: renderPlanDocument({ eventName: event.name, items, crew, agenda, timeZone: tz }),
        roomIds: [crewRoomId],
      });
      docSignature.set(eventId, signature);
      log(`plan document for ${event.name} ${r.created ? "created" : "updated"} (${items.length} item(s))`);
    } catch (err) {
      log(`plan document for ${event.name} failed: ${(err as Error).message}`);
    }
  }

  return { fromChat, intent, planContext, tick, hooks: { outcome, expired } };
}

export type Plan = ReturnType<typeof createPlan>;
