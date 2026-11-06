import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import {
  announcements,
  builderJobs,
  cards,
  careCases,
  communities,
  crewReminders,
  eventRecaps,
  events,
  guestSends,
  spaces,
  starterKits,
  type Db,
} from "@ferri/db";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  WRAP_MOVE_OPTION,
  WRAP_OFF_OPTION,
  addCareNote,
  attachSpace,
  buildStarterKit,
  closeLine,
  detachSpace,
  eventById,
  eventSpacesNow,
  extractPartners,
  findCommunity,
  formatWhen,
  isPaused,
  kitForEvent,
  loadCrew,
  makeRecap,
  matchEvent,
  nextLiveEvent,
  parseWhen,
  partnerSources,
  publishLibraryDocument,
  renderRecapDocument,
  savePartners,
  startFromKit,
  switchExpiry,
  takeWrapRequests,
  thankYouRequest,
  wrapOptions,
  type EventRecap,
  type EventRow,
  type KitSpace,
  type Lessons,
  type RecapStats,
  type SavedPartner,
  type StarterKit,
  type StarterKitContent,
  type WrapCardPayload,
  type WrapRequest,
} from "@ferri/knowledge";
import type { GatewayClient, SwitchAgent } from "@ferri/switch";
import type { Builder } from "./builder.ts";
import { config } from "./config.ts";
import type { CrewAsk } from "./crew-ask.ts";
import type { Launch } from "./launch.ts";
import type { AnnounceHooks, Loop, RoomInfo } from "./loop.ts";
import type { Prompts } from "./prompts.ts";

export interface WrapDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  launch: Launch;
  builder: Builder;
  gateway: GatewayClient | null;
  prompts: Prompts;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

type CardRow = typeof cards.$inferSelect;

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const clip = (s: string, k: number) => (s.length > k ? `${s.slice(0, k - 1)}…` : s);
/** Care cases that still need a person. */
const CARE_OPEN = ["open", "helping", "builder"];

/**
 * Wrap (spec 19): the recap with real numbers, partners saved to contacts,
 * the starter kit, closing an event (spaces Off or moved, context archived)
 * and reopening it, starting the next event from a kit.
 */
export function createWrap(deps: WrapDeps) {
  const { db, agent, loop, launch, builder, gateway, log } = deps;
  /** Events being closed or reopened right now (one at a time per event). */
  const busy = new Set<string>();
  const desk = (slug: string) => `${config.publicUrl.replace(/\/$/, "")}/wrap?event=${encodeURIComponent(slug)}`;

  async function timeZone(communityId: string): Promise<string> {
    const [c] = await db.select({ tz: communities.timezone }).from(communities).where(eq(communities.id, communityId)).limit(1);
    return c?.tz ?? "Asia/Kolkata";
  }

  async function allEvents(communityId: string): Promise<EventRow[]> {
    return db.select().from(events).where(eq(events.communityId, communityId)).orderBy(desc(events.createdAt));
  }

  /** The event a crew member means: as written, else the room's own event. */
  async function resolveEvent(ask: CrewAsk, written: string): Promise<EventRow | null> {
    const text = written.trim();
    if (!text || /^(it|this|this one|this event|the event)$/i.test(text)) return ask.eventId ? eventById(db, ask.eventId) : null;
    return matchEvent(await allEvents(ask.communityId), text);
  }

  // ── Switch documents ─────────────────────────────────────────────────────

  async function publishRecap(event: EventRow, recap: EventRecap, roomId: string | null): Promise<void> {
    if (!gateway) return;
    try {
      const r = await publishLibraryDocument({
        db,
        gateway,
        stateKey: `recap_document:${event.id}`,
        name: `${event.name}: recap`,
        description: `How ${event.name} went: the numbers from Ferri's records and the lessons for next time.`,
        instructions: "Made by Ferri when the event wrapped. The numbers are counted from Ferri's own records; the lessons are read from them.",
        content: renderRecapDocument(event.name, recap.stats as unknown as RecapStats, recap.lessons as Lessons, await timeZone(event.communityId)),
        roomIds: roomId ? [roomId] : [],
      });
      await db.update(eventRecaps).set({ documentId: r.documentId }).where(eq(eventRecaps.id, recap.id));
      log(`wrap: recap document for ${event.name} ${r.created ? "created" : "updated"}`);
    } catch (err) {
      log(`wrap: recap document for ${event.name} failed: ${(err as Error).message}`);
    }
  }

  async function publishKit(event: EventRow, kit: StarterKit, roomId: string | null): Promise<void> {
    if (!gateway) return;
    try {
      const r = await publishLibraryDocument({
        db,
        gateway,
        stateKey: `kit_document:${event.id}`,
        name: kit.name,
        description: `The starter kit from ${event.name}: what to keep, what to check, the questions to answer early, the plan, the spaces, the partners and the lessons.`,
        instructions: "Packed by Ferri when the event wrapped. Start the next event from it in Desk or by telling Ferri.",
        content: kit.markdown,
        roomIds: roomId ? [roomId] : [],
      });
      await db.update(starterKits).set({ documentId: r.documentId }).where(eq(starterKits.id, kit.id));
    } catch (err) {
      log(`wrap: kit document for ${event.name} failed: ${(err as Error).message}`);
    }
  }

  // ── The pieces ───────────────────────────────────────────────────────────

  async function recap(event: EventRow, input: { origin: "chat" | "desk" | "ferri" | "close"; by: string; messageId?: string | null; roomId: string | null }): Promise<EventRecap | null> {
    const r = await makeRecap(db, { eventId: event.id, choice: config.modelFast, origin: input.origin, by: input.by, sourceMessageId: input.messageId ?? null });
    if (r) {
      log(`wrap: recap of ${event.name} (${input.origin}, ${input.by})`);
      await publishRecap(event, r, input.roomId);
    }
    return r;
  }

  async function partners(event: EventRow, by: string): Promise<SavedPartner[]> {
    const c = await findCommunity(db, config.community);
    const sources = await partnerSources(db, event.id);
    const found = await extractPartners({ choice: config.modelFast, eventName: event.name, communityName: c?.name ?? "", sources }).catch((err: Error) => {
      log(`wrap: partner reading for ${event.name} failed: ${err.message}`);
      return [];
    });
    const saved = await savePartners(db, { communityId: event.communityId, eventId: event.id, eventName: event.name, found, by });
    log(`wrap: partners of ${event.name}: ${saved.length} (${saved.filter((s) => s.created).length} new contacts, ${saved.filter((s) => s.added).length} new links)`);
    return saved;
  }

  async function kit(event: EventRow, by: string, roomId: string | null): Promise<StarterKit> {
    const k = await buildStarterKit(db, { eventId: event.id, choice: config.modelFast, by });
    await publishKit(event, k, roomId);
    log(`wrap: starter kit for ${event.name} built`);
    return k;
  }

  function partnersLine(saved: SavedPartner[], eventName: string): string {
    if (!saved.length) return `I found no partners for ${eventName} in its contacts, knowledge or plan.`;
    const added = saved.filter((s) => s.added).length;
    const fresh = saved.filter((s) => s.created).length;
    const names = saved.map((s) => `${s.org} (${s.role})`).join(", ");
    if (!added) return `The partners of ${eventName} were already in contacts: ${names}. Nothing new to add, and nobody was emailed.`;
    return `Saved ${plural(added, "partner")} of ${eventName} to contacts${fresh ? ` (${fresh} new)` : ""}: ${names}. Each shows "Worked with us on ${eventName}" in Desk; nobody was emailed.`;
  }

  function kitLine(k: StarterKit, event: EventRow): string {
    const c = k.content as unknown as StarterKitContent;
    return (
      `The ${k.name} is ready: ${plural(c.knowledge.keep.length, "entry", "entries")} to keep, ${c.knowledge.check.length} to check, ` +
      `${plural(c.questions.unanswered.length, "question")} to answer early, ${plural(c.plan.tasks.length, "task")}, ${plural(c.spaces.length, "space")} and ${plural(c.partners.length, "partner")}. ` +
      `View or download it in Desk: ${desk(event.slug)}`
    );
  }

  // ── Closing: one card, then the close itself ──────────────────────────────

  async function openWrapCard(event: EventRow): Promise<CardRow | null> {
    const [c] = await db.select().from(cards).where(and(eq(cards.eventId, event.id), eq(cards.kind, "wrap"), eq(cards.status, "open"))).limit(1);
    return c ?? null;
  }

  /** Open the close card in the event's crew room. Returns a line for the crew. */
  async function openCloseCard(event: EventRow, input: { moveTo: EventRow | null; roomId: string | null }): Promise<string> {
    if (event.closedAt) return `${event.name} is already closed. Say "reopen ${event.name}" to bring it back.`;
    const existing = await openWrapCard(event);
    if (existing) return `The card to close ${event.name} is already open in the crew room.`;
    const crewRoomId = (await loop.crewRoomFor(event.id)) ?? input.roomId;
    if (!crewRoomId) return `${event.name} has no crew room, so there is nowhere to put the card. Close it in Desk on the Wrap page.`;
    const spacesNow = await eventSpacesNow(db, event.id);
    const openCases = (await db.select({ id: careCases.id }).from(careCases).where(and(eq(careCases.eventId, event.id), inArray(careCases.status, CARE_OPEN)))).length;
    const crew = await loadCrew(db, event.communityId, event.id);
    const owners = crew.filter((c) => c.lead);
    const id = randomUUID();
    const times = loop.ladder(event.stage, null);
    const payload: WrapCardPayload = { action: "close", eventId: event.id, moveTo: input.moveTo?.id ?? null, moveToName: input.moveTo?.name ?? null };
    const what =
      `Closing ${event.name} makes a fresh recap and starter kit, says goodbye in this room, closes its open cards, cancels what is still scheduled ` +
      `(announcements, guest emails, crew reminders) and turns its ${plural(spacesNow.length, "space")} Off, or moves them with the same modes. ` +
      `${openCases ? `${plural(openCases, "care case")} stay${openCases === 1 ? "s" : ""} open in Desk. ` : ""}It can be reopened from Desk.`;
    await db.insert(cards).values({
      id,
      communityId: event.communityId,
      eventId: event.id,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "wrap",
      topic: "wrap",
      question: clip(`Close ${event.name}?`, 300),
      draftText: what,
      payload,
      ownerIds: owners.map((o) => o.id),
      ...times,
    });
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: clip(`Close ${event.name}?`, 500),
        detail: "Nothing closes until someone on the crew picks an option.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: `Close ${clip(event.name, 100)}?`,
            prompt: what,
            options: wrapOptions(input.moveTo?.name ?? null, CARD_SKIP_OPTION),
            multi_select: false,
            allow_custom_answer: false,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      log(`wrap: opening the close card for ${event.name} failed: ${(err as Error).message}`);
      return `I could not open the card to close ${event.name}. Try again, or close it in Desk on the Wrap page.`;
    }
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (row) loop.pocketNotify("open", row, owners.length ? owners.map((o) => o.id) : crew.map((c) => c.id));
    log(`wrap: close card ${id} for ${event.name}${input.moveTo ? ` (move offers ${input.moveTo.name})` : ""}`);
    return `The card to close ${event.name} is in the crew room: close with its spaces Off${input.moveTo ? `, or move them to ${input.moveTo.name}` : ""}, or not yet.`;
  }

  /**
   * Close an event, in this order: a fresh recap and kit (with the spaces
   * saved), the goodbye in the crew room, its open cards closed, scheduled
   * announcements, guest sends and crew reminders cancelled, the Builder's help
   * rooms dropped, the spaces detached (or moved with the same mode and role),
   * then closed_at, closed_by and stage wrap.
   */
  async function close(event: EventRow, input: { moveTo: EventRow | null; by: string }): Promise<string> {
    if (event.closedAt) return `${event.name} is already closed.`;
    if (busy.has(event.id)) return `${event.name} is closing already.`;
    busy.add(event.id);
    try {
      const crewRoomId = await loop.crewRoomFor(event.id);
      const spacesNow = await eventSpacesNow(db, event.id);
      const target = input.moveTo && input.moveTo.id !== event.id && !(await eventById(db, input.moveTo.id))?.closedAt ? input.moveTo : null;

      // 1. A fresh recap, the partners, and the kit with the spaces saved.
      await recap(event, { origin: "close", by: input.by, roomId: crewRoomId }).catch((err: Error) => log(`wrap: recap at close failed: ${err.message}`));
      await partners(event, input.by).catch((err: Error) => log(`wrap: partners at close failed: ${err.message}`));
      await kit(event, input.by, crewRoomId).catch((err: Error) => log(`wrap: kit at close failed: ${err.message}`));

      // 2. The goodbye line.
      const openCases = (await db.select({ id: careCases.id }).from(careCases).where(and(eq(careCases.eventId, event.id), inArray(careCases.status, CARE_OPEN)))).length;
      const targetCrew = target ? await loop.crewRoomFor(target.id) : null;
      const crewRoomOff = !!target && !!targetCrew && spacesNow.some((s) => s.role === "crew");
      const line = closeLine({ eventName: event.name, spaces: spacesNow.length, movedTo: target?.name ?? null, crewRoomOff, openCases });
      if (crewRoomId) await loop.post(event.communityId, crewRoomId, line);

      // 3. Every open card of the event, closed in Switch and here.
      const open = await db.select().from(cards).where(and(eq(cards.eventId, event.id), eq(cards.status, "open")));
      for (const c of open) {
        const claimed = await loop.claim(c.id, { status: "closed" });
        if (!claimed) continue;
        await agent.closeCard(claimed.switchSessionId, claimed.id).catch((err: Error) => log(`wrap: closing card ${claimed.id}: ${err.message}`));
        loop.pocketSettled(claimed, "dismissed", input.by);
      }

      // 4. Whatever was still going to go out.
      const anns = await db
        .update(announcements)
        .set({ status: "dismissed", updatedAt: new Date() })
        .where(and(eq(announcements.eventId, event.id), inArray(announcements.status, ["requested", "waiting", "scheduled"])))
        .returning({ id: announcements.id });
      const sends = await db
        .update(guestSends)
        .set({ status: "dismissed", error: "the event closed", updatedAt: new Date() })
        .where(and(eq(guestSends.eventId, event.id), inArray(guestSends.status, ["requested", "drafting", "waiting", "scheduled"])))
        .returning({ id: guestSends.id });
      const reminders = await db
        .update(crewReminders)
        .set({ status: "cancelled" })
        .where(and(eq(crewReminders.eventId, event.id), eq(crewReminders.status, "pending")))
        .returning({ id: crewReminders.id });

      // 5. The Builder stops helping in the event's rooms (the cases stay open with their owner).
      const helping = await db.select().from(careCases).where(and(eq(careCases.eventId, event.id), eq(careCases.status, "builder")));
      for (const c of helping) {
        await db
          .update(careCases)
          .set({ status: c.ownerId ? "helping" : "open", updatedAt: new Date() })
          .where(eq(careCases.id, c.id));
        if (c.builderJobId) {
          await db
            .update(builderJobs)
            .set({ status: "cancelled", report: `${event.name} closed`, updatedAt: new Date() })
            .where(and(eq(builderJobs.id, c.builderJobId), inArray(builderJobs.status, ["queued", "handed", "working", "stuck"])));
        }
        await addCareNote(db, c.id, { kind: "update", text: `${event.name} closed, so the Builder stopped helping. The case stays open.`, by: input.by }).catch(() => {});
      }

      // 6. The spaces: Off, or moved with the same mode and role.
      const moved: string[] = [];
      for (const s of spacesNow) {
        if (target && !(s.role === "crew" && targetCrew)) {
          await attachSpace(db, { spaceId: s.spaceId, eventId: target.id, mode: s.mode, role: s.role, by: `${input.by} (closing ${event.name})` });
          moved.push(s.name);
        } else {
          await detachSpace(db, s.spaceId);
        }
      }

      // 7. Closed.
      await db.update(events).set({ closedAt: new Date(), closedBy: input.by, stage: "wrap", updatedAt: new Date() }).where(eq(events.id, event.id));
      await builder.syncPolicy().catch((err: Error) => log(`wrap: builder policy sync failed: ${err.message}`));
      log(
        `wrap: ${event.name} closed by ${input.by}: ${open.length} card(s) closed, ${anns.length} announcement(s), ${sends.length} guest send(s), ` +
          `${reminders.length} reminder(s) cancelled, ${helping.length} help room(s) dropped, ${target ? `${moved.length} space(s) moved to ${target.name}` : `${spacesNow.length} space(s) Off`}`,
      );
      return line;
    } finally {
      busy.delete(event.id);
    }
  }

  /** Undo a close: closed_at cleared, the kit's spaces attached again with their modes (moved back from wherever they are). */
  async function reopen(event: EventRow, by: string): Promise<string> {
    if (!event.closedAt) return `${event.name} is not closed.`;
    if (busy.has(event.id)) return `${event.name} is being changed already.`;
    busy.add(event.id);
    try {
      await db.update(events).set({ closedAt: null, closedBy: null, updatedAt: new Date() }).where(eq(events.id, event.id));
      const saved = (((await kitForEvent(db, event.id))?.content as Partial<StarterKitContent> | undefined)?.spaces ?? []) as KitSpace[];
      let back = 0;
      const gone: string[] = [];
      for (const s of saved) {
        const [space] = await db.select().from(spaces).where(eq(spaces.id, s.spaceId)).limit(1);
        if (!space || space.archived) {
          gone.push(s.name);
          continue;
        }
        await attachSpace(db, { spaceId: s.spaceId, eventId: event.id, mode: s.mode, role: s.role, by: `${by} (reopening ${event.name})` });
        back++;
      }
      await builder.syncPolicy().catch((err: Error) => log(`wrap: builder policy sync failed: ${err.message}`));
      const line =
        `${event.name} is open again${back ? `: ${back === 1 ? "its 1 space is" : `its ${back} spaces are`} back with their modes` : ", but no saved spaces came back (attach them in Desk)"}.` +
        (gone.length ? ` Ferri is no longer in ${gone.join(", ")}.` : "");
      const crewRoomId = await loop.crewRoomFor(event.id);
      if (crewRoomId) await loop.post(event.communityId, crewRoomId, line);
      log(`wrap: ${event.name} reopened by ${by} (${back} space(s) back)`);
      return line;
    } finally {
      busy.delete(event.id);
    }
  }

  // ── Starting the next event ──────────────────────────────────────────────

  async function start(ask: CrewAsk): Promise<string> {
    const w = ask.intent.wrap;
    const name = w.event.trim();
    if (!name) return `What should the new event be called? Say "start <name> on <date> from the <event> kit".`;
    const all = await allEvents(ask.communityId);
    const fromText = w.from.trim();
    let source: EventRow | null = null;
    if (fromText) {
      source = matchEvent(all, fromText);
      if (!source && /\b(last|previous|latest)\b/i.test(fromText)) source = all.find((e) => e.closedAt) ?? null;
      if (!source) return `I could not find an event called “${fromText}” to start from.`;
    } else if (ask.eventId) {
      source = all.find((e) => e.id === ask.eventId) ?? null;
    } else {
      source = all.find((e) => e.closedAt) ?? null;
    }
    if (!source) return `Which event should ${name} start from? Say "start ${name} from the <event> kit".`;
    if (matchEvent(all, name)?.name.toLowerCase() === name.toLowerCase()) return `There is already an event called ${name}.`;
    let k = await kitForEvent(db, source.id);
    if (!k) {
      await partners(source, ask.member.name).catch(() => []);
      k = await kit(source, ask.member.name, ask.crewRoomId);
    }
    const startsAt = parseWhen(w.when || null);
    let started;
    try {
      started = await startFromKit(db, { communityId: ask.communityId, kitId: k.id, name, startsAt, by: ask.member.name });
    } catch (err) {
      return (err as Error).message;
    }
    const tz = await timeZone(ask.communityId);
    log(`wrap: ${ask.member.name} started ${started.name} from ${k.name}`);
    return (
      `Started ${started.name} in Plan${startsAt ? `, starting ${formatWhen(startsAt, tz)}` : ""}, from the ${k.name}: ` +
      `${plural(started.crew, "crew member")} with their topics, ${plural(started.knowledge, "knowledge entry", "knowledge entries")} kept, ` +
      `${plural(started.questions, "question")} in its plan to confirm or answer early, ${plural(started.tasks, "task")} proposed, and the lessons in its instructions. ` +
      `Nothing was posted outside. Attach its spaces in Desk${source.closedAt ? "" : `, or close ${source.name} and move its spaces`}.` +
      (started.desks.length ? ` The kit had ${plural(started.desks.length, "desk")} to set up again: ${started.desks.join(", ")}.` : "")
    );
  }

  // ── What the crew asks ───────────────────────────────────────────────────

  async function intent(ask: CrewAsk): Promise<string | null> {
    const w = ask.intent.wrap;
    if (w.action === "none") return null;
    if (w.action === "start") return start(ask);
    const event = await resolveEvent(ask, w.event);
    if (!event) return w.event.trim() ? `I could not find an event called “${w.event.trim()}”.` : "Which event? This room is not attached to one, so name it.";
    const by = ask.member.name;
    switch (w.action) {
      case "recap": {
        const r = await recap(event, { origin: "chat", by, messageId: ask.messageId, roomId: (await loop.crewRoomFor(event.id)) ?? ask.crewRoomId });
        if (!r) return null;
        return `${r.text}\n\nThe recap is also in the crew room's library as “${event.name}: recap”, and on Desk's Wrap page.`;
      }
      case "partners":
        return partnersLine(await partners(event, by), event.name);
      case "kit": {
        await partners(event, by).catch(() => []);
        return kitLine(await kit(event, by, (await loop.crewRoomFor(event.id)) ?? ask.crewRoomId), event);
      }
      case "reopen":
        return reopen(event, by);
      case "close": {
        if (event.closedAt) return `${event.name} is already closed. Say "reopen ${event.name}" to bring it back.`;
        let moveTo: EventRow | null = null;
        if (w.to.trim()) {
          const live = (await allEvents(ask.communityId)).filter((e) => !e.closedAt && e.id !== event.id);
          moveTo = matchEvent(live, w.to);
          if (!moveTo) return `I could not find a live event called “${w.to.trim()}” to move the spaces to.`;
        } else {
          moveTo = await nextLiveEvent(db, event.communityId, event.id);
        }
        return openCloseCard(event, { moveTo, roomId: ask.crewRoomId });
      }
    }
    return null;
  }

  // ── The card ─────────────────────────────────────────────────────────────

  const hooks: AnnounceHooks = {
    async outcome(card, answer, by) {
      const p = card.payload as WrapCardPayload | null;
      if (!p || p.action !== "close") return;
      const pick = answer.selected.find((s) => s === WRAP_OFF_OPTION || s === WRAP_MOVE_OPTION || s === CARD_SKIP_OPTION) ?? null;
      if (!pick) return;
      const event = await eventById(db, p.eventId);
      if (pick === CARD_SKIP_OPTION) {
        const claimed = await loop.claim(card.id, { status: "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
        if (!claimed) return;
        loop.pocketSettled(claimed, "dismissed", by);
        await loop.post(card.communityId, card.crewRoomId, `Okay ${by}, ${event?.name ?? "the event"} stays open. Say "@${config.agentName} close it" when you're ready.`);
        return;
      }
      const label = pick === WRAP_MOVE_OPTION ? `Close and move the spaces to ${p.moveToName ?? "the next event"}` : "Close, spaces Off";
      const claimed = await loop.claim(card.id, { status: "answered", answeredAt: new Date(), answeredBy: by, answeredVia: "card", answerText: label });
      if (!claimed) return;
      loop.pocketSettled(claimed, "answered", by);
      if (!event) return;
      const target = pick === WRAP_MOVE_OPTION && p.moveTo ? await eventById(db, p.moveTo) : null;
      if (pick === WRAP_MOVE_OPTION && (!target || target.closedAt)) {
        await loop.post(card.communityId, card.crewRoomId, `The event the spaces were to move to is closed now, so ${event.name}'s spaces go Off instead.`);
      }
      await close(event, { moveTo: target && !target.closedAt ? target : null, by });
    },
    async expired(card) {
      const p = card.payload as WrapCardPayload | null;
      const event = p ? await eventById(db, p.eventId) : null;
      if (!event || event.closedAt) return;
      await loop.post(card.communityId, card.crewRoomId, `Nobody closed ${event.name}, so it stays open. Say "@${config.agentName} close ${event.name}" when you're ready, or close it in Desk.`);
    },
  };

  // ── The clock: Ferri's own wrap, and Desk's requests ─────────────────────

  /** Once per event, after the end: stage Wrap, the recap, the partners, the close card and the thank-you card. */
  async function autoWrap(event: EventRow): Promise<void> {
    const crewRoomId = await loop.crewRoomFor(event.id);
    const r = await recap(event, { origin: "ferri", by: "Ferri", roomId: crewRoomId });
    await partners(event, "Ferri").catch(() => []);
    if (!crewRoomId) {
      log(`wrap: ${event.name} moved to Wrap; it has no crew room, so the recap is only in Desk`);
      return;
    }
    if (r) await loop.post(event.communityId, crewRoomId, `${event.name} is over, so I moved it to Wrap.\n\n${r.text}`);
    await openCloseCard(event, { moveTo: await nextLiveEvent(db, event.communityId, event.id), roomId: crewRoomId });
    if (r) {
      const said = await launch
        .request({
          communityId: event.communityId,
          eventId: event.id,
          what: thankYouRequest(event.name, r.stats as unknown as RecapStats, r.lessons as Lessons),
          when: null,
          by: "Ferri",
          origin: "ferri",
          sourceMessageId: `wrap-thanks:${event.id}`,
        })
        .catch((err: Error) => `failed: ${err.message}`);
      if (said) log(`wrap: thank-you for ${event.name} not offered: ${said}`);
    }
    log(`wrap: ${event.name} wrapped by Ferri (recap, close card, thank-you card)`);
  }

  async function handleRequest(req: WrapRequest): Promise<void> {
    const event = await eventById(db, req.eventId);
    if (!event) return;
    log(`wrap: Desk asked to ${req.action} ${event.name} (${req.by})`);
    if (req.action === "close") {
      const target = req.moveTo ? await eventById(db, req.moveTo) : null;
      await close(event, { moveTo: target && !target.closedAt && target.communityId === event.communityId ? target : null, by: req.by });
    } else if (req.action === "reopen") {
      await reopen(event, req.by);
    } else if (req.action === "recap") {
      const crewRoomId = event.closedAt ? null : await loop.crewRoomFor(event.id);
      const r = await recap(event, { origin: "desk", by: req.by, roomId: crewRoomId });
      if (r && crewRoomId) await loop.post(event.communityId, crewRoomId, `${req.by} asked for a fresh recap in Desk.\n\n${r.text}`);
    } else if (req.action === "kit") {
      await partners(event, req.by).catch(() => []);
      await kit(event, req.by, event.closedAt ? null : await loop.crewRoomFor(event.id));
    } else if (req.action === "partners") {
      await partners(event, req.by);
    }
  }

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      for (const req of await takeWrapRequests(db)) {
        await handleRequest(req).catch((err: Error) => log(`wrap: Desk request ${req.action} failed: ${err.message}`));
      }
      const community = await findCommunity(db, config.community);
      if (!community) return;
      const now = new Date();
      const ended = await db
        .select()
        .from(events)
        .where(and(eq(events.communityId, community.id), isNull(events.closedAt), isNull(events.wrapProposedAt), isNotNull(events.endsAt), lte(events.endsAt, now)));
      for (const e of ended) {
        const s = await deps.prompts.settings({ communityId: e.communityId, eventId: e.id, spaceId: null });
        if (!s.autoWrap) continue;
        if (now.getTime() < e.endsAt!.getTime() + s.wrapAfterMinutes * 60_000) continue;
        if (await isPaused(db, e.communityId)) continue;
        // Claim it first, so the wrap is proposed once.
        const [claimed] = await db
          .update(events)
          .set({ wrapProposedAt: now, stage: "wrap", updatedAt: now })
          .where(and(eq(events.id, e.id), isNull(events.wrapProposedAt), isNull(events.closedAt)))
          .returning();
        if (!claimed) continue;
        await autoWrap(claimed).catch((err: Error) => log(`wrap: Ferri's wrap of ${e.name} failed: ${err.message}`));
      }
    } catch (err) {
      log(`wrap tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  return { intent, tick, hooks, close, reopen };
}

export type Wrap = ReturnType<typeof createWrap>;
