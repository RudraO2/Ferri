import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, lte, lt, sql } from "drizzle-orm";
import { builderJobs, cards, careCases, events, type CareRequest, type Db } from "@ferri/db";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARE_BUILDER,
  CARE_DROP,
  CARE_MINE,
  CARE_OPEN,
  CARE_SOLVED,
  MAX_CHECK_INS,
  addCareNote,
  autoHelp,
  builderAllowed,
  careCardTitle,
  careLine,
  careOptions,
  careRoute,
  caseLine,
  caseRef,
  checkInDelayMs,
  createCase,
  findCase,
  helpHandoff,
  isPaused,
  jobRef,
  loadCrew,
  mention,
  openCaseFor,
  openCases,
  readCare,
  resolveSpace,
  switchExpiry,
  type BuilderJob,
  type CareCase,
  type CareReading,
  type ChatLine,
  type CrewIntent,
  type CrewMember,
  type ResolvedSpace,
} from "@ferri/knowledge";
import { pushToUsers, switchUsersForCrew } from "@ferri/push";
import type { MessageEvent, SwitchAgent } from "@ferri/switch";
import type { Builder } from "./builder.ts";
import { config } from "./config.ts";
import { askerMention, type AnnounceHooks, type Loop, type RoomInfo } from "./loop.ts";

type CardRow = typeof cards.$inferSelect;

export interface CareDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  builder: Builder;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstName = (name: string) => name.split(/[\s._-]+/)[0] || name;
const SEVERITY_RANK: Record<string, number> = { normal: 0, high: 1 };

/**
 * Care (spec 16). Every message from a member (not crew) in an attached
 * members space gets one Haiku reading next to triage. A member who is
 * confused, stuck, upset or unsafe becomes a case with an owner from the crew,
 * announced in the crew room with a `care` card, and it stays open until it is
 * solved or someone says it is not a case. Technical problems can go to the
 * Builder, which helps the member in their own room.
 */
export function createCare(deps: CareDeps) {
  const { db, agent, loop, builder, log } = deps;
  /** One reading at a time per person, so three angry messages make one case. */
  const queues = new Map<string, Promise<void>>();

  async function eventOf(eventId: string | null) {
    if (!eventId) return null;
    const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return ev ?? null;
  }

  async function crewFor(c: Pick<CareCase, "communityId" | "eventId">): Promise<CrewMember[]> {
    return loadCrew(db, c.communityId, c.eventId);
  }

  async function say(c: Pick<CareCase, "communityId" | "eventId">, text: string): Promise<void> {
    const roomId = await loop.crewRoomFor(c.eventId);
    if (roomId) await loop.post(c.communityId, roomId, text);
  }

  async function push(crewIds: string[], c: CareCase, title: string, body: string): Promise<void> {
    if (!crewIds.length) return;
    const r = await pushToUsers(db, await switchUsersForCrew(db, crewIds), {
      kind: "care",
      title,
      body: clip(body, 180),
      url: `/m/case/${c.id}`,
      tag: `care-${c.id}`,
      renotify: true,
      cardId: null,
    });
    if (r.sent || r.failed) log(`care: ${caseRef(c)} push "${title}" to ${r.users} people (${r.sent} sent)`);
  }

  async function fresh(id: string): Promise<CareCase | null> {
    const [row] = await db.select().from(careCases).where(eq(careCases.id, id)).limit(1);
    return row ?? null;
  }

  async function update(c: CareCase, set: Partial<typeof careCases.$inferInsert>): Promise<CareCase> {
    const [row] = await db.update(careCases).set({ ...set, updatedAt: new Date() }).where(eq(careCases.id, c.id)).returning();
    return row ?? c;
  }

  // ── Reading members ────────────────────────────────────────────────────

  /** Read one member message (not awaited by the flow: it never holds up an answer). */
  function read(input: { ev: MessageEvent; communityId: string; space: ResolvedSpace; history: ChatLine[] }): Promise<void> {
    const p = input.ev.payload;
    if (p.body.trim().length < 3) return Promise.resolve();
    const key = p.sender;
    const prev = queues.get(key) ?? Promise.resolve();
    const run = prev
      .then(() => readNow(input))
      .catch((err) => log(`care: reading ${p.message_id} failed: ${(err as Error).message}`));
    queues.set(key, run);
    void run.finally(() => {
      if (queues.get(key) === run) queues.delete(key);
    });
    return run;
  }

  async function readNow(input: { ev: MessageEvent; communityId: string; space: ResolvedSpace; history: ChatLine[] }): Promise<void> {
    const p = input.ev.payload;
    const { space, communityId } = input;
    // A replay after a restart: this message already opened a case.
    const [seen] = await db.select({ id: careCases.id }).from(careCases).where(eq(careCases.sourceMessageId, p.message_id)).limit(1);
    if (seen) return;
    const open = await openCaseFor(db, communityId, p.sender);
    const ev = await eventOf(space.eventId);
    const roomName = (await deps.room(input.ev.room_id)).name;
    const { reading, latencyMs } = await readCare({
      choice: config.modelFast,
      roomName,
      sender: p.sender_name,
      message: p.body,
      before: input.history,
      openCase: open ? caseLine(open) : null,
      stage: ev?.stage ?? null,
    });
    if (!reading) return;
    if (reading.case !== "none" || reading.signal !== "none") {
      log(`care: ${p.sender_name} in ${space.name}: ${reading.signal}${reading.technical ? " (technical)" : ""}, ${reading.case}, ${latencyMs} ms${reading.reason ? `: ${clip(reading.reason, 140)}` : ""}`);
    }
    if (reading.case === "new") await openNew({ ev: input.ev, communityId, space, reading, stage: ev?.stage ?? null, roomName });
    else if (open && reading.case === "update") await updateFromMember(open, reading, p.message_id, p.body, space);
    else if (open && reading.case === "solved") await close(open, "solved", p.sender_name, `${firstName(p.sender_name)} said: “${clip(reading.quote || p.body, 160)}”`, { fromMember: true });
    else if (open) await update(open, { lastMessageAt: new Date(p.timestamp) });
  }

  async function openNew(input: { ev: MessageEvent; communityId: string; space: ResolvedSpace; reading: CareReading; stage: string | null; roomName: string }): Promise<void> {
    const p = input.ev.payload;
    const { reading, space } = input;
    const crew = await loadCrew(db, input.communityId, space.eventId);
    const route = careRoute(crew, reading);
    const kind = reading.signal === "none" ? "confused" : reading.signal;
    const c = await createCase(db, {
      communityId: input.communityId,
      eventId: space.eventId,
      spaceId: space.spaceId,
      roomId: input.ev.room_id,
      personId: p.sender,
      personName: p.sender_name,
      platform: space.platform,
      kind,
      technical: reading.technical,
      severity: reading.severity,
      topic: reading.technical ? "tech" : reading.topic,
      reason: clip(reading.reason, 600),
      quote: reading.quote || null,
      status: "open",
      ownerId: route.owner?.id ?? null,
      ownerName: route.owner?.name ?? null,
      sourceMessageId: p.message_id,
      lastMessageAt: new Date(p.timestamp),
      checkInAt: new Date(Date.now() + checkInDelayMs(input.stage)),
    });
    if (!c) return;
    await addCareNote(db, c.id, { kind: "opened", text: c.reason, by: "Ferri", messageId: p.message_id });
    log(`care: ${caseRef(c)} opened (${c.kind}, ${c.severity}${c.technical ? ", technical" : ""}) for ${c.personName}; owner ${c.ownerName ?? "none"}`);
    const paused = await isPaused(db, c.communityId);
    let current = c;
    if (autoHelp({ technical: c.technical, kind: c.kind, stage: input.stage, mode: space.setting?.mode ?? null, paused })) {
      const r = await sendBuilder(c, "Ferri", null, { auto: true });
      current = (await fresh(c.id)) ?? c;
      log(`care: ${caseRef(c)} ${r.ok ? "went to the Builder during the event" : `could not go to the Builder: ${r.text}`}`);
    }
    await openCard(current, route.notify.map((m) => m.id));
  }

  async function updateFromMember(c: CareCase, reading: CareReading, messageId: string, body: string, space: ResolvedSpace): Promise<void> {
    const kind = reading.signal === "none" ? c.kind : reading.signal;
    const severity = SEVERITY_RANK[reading.severity]! > SEVERITY_RANK[c.severity]! ? reading.severity : c.severity;
    const updated = await update(c, {
      kind,
      severity,
      technical: c.technical || reading.technical,
      reason: reading.reason ? clip(reading.reason, 600) : c.reason,
      quote: reading.quote || c.quote,
      lastMessageAt: new Date(),
    });
    await addCareNote(db, c.id, { kind: "member", text: clip(body, 500), by: c.personName, messageId });
    log(`care: ${caseRef(c)} updated from ${c.personName}${severity !== c.severity ? `; now ${severity}` : ""}`);
    if (severity !== c.severity) {
      const crew = await crewFor(c);
      const route = careRoute(crew, { signal: kind as CareReading["signal"], technical: updated.technical, topic: c.topic as CareReading["topic"], severity: severity as CareReading["severity"] });
      const notify = [...new Set([...(c.ownerId ? [c.ownerId] : []), ...route.notify.map((m) => m.id)])];
      await say(c, `Urgent now: ${caseRef(c)} · ${c.personName}: ${updated.reason}`);
      await push(notify, updated, `${caseRef(c)} is urgent now`, updated.reason);
    }
    // Technical now, during the event, in an Auto space, nobody on it: the Builder.
    const ev = await eventOf(c.eventId);
    if (updated.status === "open" && !c.technical && updated.technical) {
      const paused = await isPaused(db, c.communityId);
      if (autoHelp({ technical: true, kind, stage: ev?.stage ?? null, mode: space.setting?.mode ?? null, paused })) {
        const r = await sendBuilder(updated, "Ferri", null, { auto: true });
        if (r.ok) await say(c, r.text);
      }
    }
  }

  // ── The card ───────────────────────────────────────────────────────────

  async function openCard(c: CareCase, notify: string[]): Promise<void> {
    const crewRoomId = await loop.crewRoomFor(c.eventId);
    if (!crewRoomId) {
      log(`care: ${caseRef(c)} has no crew room to go to; it stays in Desk`);
      return;
    }
    if (await isPaused(db, c.communityId)) {
      log(`care: paused; ${caseRef(c)}'s card waits for the pause to end`);
      return;
    }
    const space = await resolveSpace(db, c.roomId);
    const mode = space?.setting?.mode ?? null;
    const room = await deps.room(c.roomId);
    const ev = await eventOf(c.eventId);
    const times = loop.ladder(ev?.stage ?? null, ev?.endsAt ?? null);
    const id = randomUUID();
    // Claim the case's card slot first, so two ticks never open two cards.
    const [claimed] = await db
      .update(careCases)
      .set({ cardId: id, updatedAt: new Date() })
      .where(and(eq(careCases.id, c.id), isNull(careCases.cardId)))
      .returning();
    if (!claimed) return;
    await db.insert(cards).values({
      id,
      communityId: c.communityId,
      eventId: c.eventId,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "care",
      topic: `${caseRef(c)} · ${c.kind}`,
      question: clip(c.reason, 300),
      ownerIds: c.ownerId ? [c.ownerId] : [],
      careCaseId: c.id,
      ...times,
    });
    const first = firstName(c.personName);
    const canWrite = mode === "auto" || mode === "approve";
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: careCardTitle(c, room.name),
        detail: "A member needs someone from the crew. The case stays open until it is solved.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: c.status === "builder" ? "The Builder is helping. Who owns it?" : "Who takes it?",
            prompt:
              `${c.reason}${c.quote ? `\n\n${first}: “${c.quote}”` : ""}\n\n` +
              (canWrite
                ? `Pick an option, or write a message for ${first} in quotes after the card code, and I'll send it to them in ${room.name}.`
                : `Pick an option. ${room.name} is a Listen space, so I can't post there; reach ${first} directly.`),
            options: careOptions({ technical: c.technical, mode, builderBusy: c.status === "builder" }),
            multi_select: false,
            allow_custom_answer: canWrite,
          },
        ],
        room_id: crewRoomId,
        thread_id: null,
        expires_at: switchExpiry(times.expiresAt).toISOString(),
      });
    } catch (err) {
      await db.update(cards).set({ status: "closed", updatedAt: new Date() }).where(eq(cards.id, id));
      await db.update(careCases).set({ cardId: null, updatedAt: new Date() }).where(eq(careCases.id, c.id));
      log(`care: opening ${caseRef(c)}'s card failed: ${(err as Error).message}`);
      return;
    }
    const crew = await crewFor(c);
    const owner = c.ownerId ? crew.find((m) => m.id === c.ownerId) : undefined;
    const { platform } = await deps.room(crewRoomId);
    await loop.post(c.communityId, crewRoomId, careLine({ c, roomName: room.name, owner: owner ? mention(owner, platform) : null, builder: c.status === "builder" }));
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (row) loop.pocketNotify("open", row, notify.length ? notify : c.ownerId ? [c.ownerId] : crew.map((m) => m.id), { roomName: room.name });
    log(`care: ${caseRef(c)} card ${id} in the crew room`);
  }

  async function caseForCard(card: CardRow): Promise<CareCase | null> {
    return card.careCaseId ? fresh(card.careCaseId) : null;
  }

  /** Someone answered a care card: take it, send the Builder, solved, not a case, or a message to the member. */
  async function outcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const c = await caseForCard(card);
    if (!c) return;
    const pick = answer.selected.find((s) => [CARE_MINE, CARE_BUILDER, CARE_SOLVED, CARE_DROP].includes(s)) ?? null;
    const claimed = await loop.claim(card.id, {
      status: pick === CARE_DROP ? "dismissed" : "answered",
      answeredAt: new Date(),
      answeredBy: by,
      answeredVia: "card",
      answerText: answer.written,
    });
    if (!claimed) return;
    const crew = await crewFor(c);
    const byId = crew.find((m) => m.name.toLowerCase() === by.toLowerCase())?.id ?? null;
    const reply = await act(c, pick ?? (answer.written ? "message" : null), by, byId, answer.written);
    if (reply) await say(c, reply);
    loop.pocketSettled(claimed, pick === CARE_DROP ? "dismissed" : "answered", by);
  }

  async function expired(card: CardRow): Promise<void> {
    const c = await caseForCard(card);
    if (!c || !CARE_OPEN.includes(c.status as (typeof CARE_OPEN)[number])) return;
    await addCareNote(db, c.id, { kind: "check_in", text: "The card expired with nobody on the case.", by: "Ferri" });
    await loop.post(
      card.communityId,
      card.crewRoomId,
      `Nobody took ${caseRef(c)} (${c.personName}: ${clip(c.reason, 200)}) on the card, so the card expired. The case stays open in Desk and Pocket; take it there, or tell me "@${config.agentName} I've got case ${c.number}".`,
    );
  }

  const hooks: AnnounceHooks = { outcome, expired };

  // ── What the crew does with a case ─────────────────────────────────────

  /** One action on a case, from a card, the crew room, Desk or Pocket. Returns Ferri's reply, if any. */
  async function act(
    c: CareCase,
    action: string | null,
    by: string,
    byId: string | null,
    note: string | null,
  ): Promise<string | null> {
    const closed = !CARE_OPEN.includes(c.status as (typeof CARE_OPEN)[number]);
    if (closed && action !== "reopen") return `${caseRef(c)} is already ${c.status === "solved" ? "solved" : "closed"}. Say "reopen case ${c.number}" if it needs attention again.`;
    switch (action) {
      case CARE_MINE:
        return take(c, by, byId, note);
      case CARE_BUILDER: {
        const r = await sendBuilder(c, by, byId);
        return r.text;
      }
      case CARE_SOLVED:
        return close(c, "solved", by, note);
      case CARE_DROP:
        return close(c, "dropped", by, note);
      case "message":
        return note ? message(c, note, by, byId) : "What should I tell them?";
      case "reopen":
        return reopen(c, by, byId);
      default:
        return null;
    }
  }

  async function take(c: CareCase, by: string, byId: string | null, note: string | null): Promise<string> {
    const ev = await eventOf(c.eventId);
    const updated = await update(c, {
      ownerId: byId ?? c.ownerId,
      ownerName: byId ? by : (c.ownerName ?? by),
      status: c.status === "builder" ? "builder" : "helping",
      checkInAt: new Date(Date.now() + checkInDelayMs(ev?.stage ?? null)),
      checkIns: 0,
    });
    await addCareNote(db, c.id, { kind: "owner", text: `${by} is on it${note ? `: ${note}` : "."}`, by });
    log(`care: ${caseRef(c)} taken by ${by}`);
    return `Thanks ${by}, ${caseRef(updated)} is yours (${updated.personName}${updated.status === "builder" ? "; the Builder is still helping" : ""}). Tell me "@${config.agentName} case ${c.number} solved" when it's done.`;
  }

  /** Send the Builder to the member's room (the crew's tap, or automatically during the event). */
  async function sendBuilder(
    c: CareCase,
    by: string,
    byId: string | null,
    opts: { auto?: boolean } = {},
  ): Promise<{ ok: boolean; text: string }> {
    if (c.status === "builder") return { ok: false, text: `The Builder is already helping ${c.personName} with ${caseRef(c)}.` };
    const space = await resolveSpace(db, c.roomId);
    const mode = space?.setting?.mode ?? null;
    const room = await deps.room(c.roomId);
    if (!space || space.archived || !builderAllowed(mode)) {
      const text = `${room.name} is ${mode === "listen" ? "a Listen space" : "not a space Ferri may post in"}, so the Builder can't help there. Reach ${firstName(c.personName)} directly.`;
      return { ok: false, text };
    }
    if (await isPaused(db, c.communityId)) {
      const text = "Ferri is paused, so the Builder can't post anywhere right now.";
      return { ok: false, text };
    }
    const first = firstName(c.personName);
    const r = await builder.startJob({
      communityId: c.communityId,
      eventId: c.eventId,
      kind: "help",
      title: clip(`Help ${first}: ${c.reason.replace(/^[^:]*:\s*/, "")}`, 80),
      brief: `Case ${c.number}: ${c.reason}`,
      requestedBy: by,
      requestedById: byId,
      origin: "chat",
      sourceMessageId: null,
      roomId: c.roomId,
    });
    if (!r) return { ok: false, text: "Couldn't start the Builder job." };
    const updated = await update(c, { status: "builder", builderJobId: r.job.id });
    await addCareNote(db, c.id, {
      kind: "builder",
      text: `${opts.auto ? "Handed to the Builder automatically (technical, during the event)" : `${by} sent the Builder`} as job ${jobRef(r.job)}${r.handed ? "" : "; it waits for the Builder's machine"}.`,
      by,
    });
    await builder.syncPolicy();
    const text = r.handed
      ? `The Builder is on ${caseRef(updated)} as job ${jobRef(r.job)}, helping ${first} in ${room.name}.${updated.ownerName ? ` ${updated.ownerName} still owns it if it needs a person.` : ""}`
      : `I've queued job ${jobRef(r.job)} for ${caseRef(updated)}, but the Builder's machine is offline. It helps ${first} in ${room.name} as soon as it's back.`;
    log(`care: ${caseRef(c)} -> Builder ${jobRef(r.job)} (${r.handed ? "handed" : "queued"})`);
    return { ok: true, text };
  }

  async function close(c: CareCase, status: "solved" | "dropped", by: string, note: string | null, opts: { fromMember?: boolean; fromBuilder?: boolean } = {}): Promise<string> {
    const [row] = await db
      .update(careCases)
      .set({ status, closedAt: new Date(), closedBy: by, resolution: note, request: null, updatedAt: new Date() })
      .where(and(eq(careCases.id, c.id), inArray(careCases.status, [...CARE_OPEN])))
      .returning();
    if (!row) return `${caseRef(c)} is already closed.`;
    await addCareNote(db, c.id, { kind: status, text: note ?? (status === "solved" ? "Solved." : "Not a case."), by });
    // An open card for it is settled too.
    if (c.cardId) {
      const claimed = await loop.claim(c.cardId, { status: status === "solved" ? "answered" : "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "chat", answerText: note });
      if (claimed) {
        await agent.closeCard(claimed.switchSessionId, claimed.id).catch((err: Error) => log(`care: closing ${caseRef(c)}'s card: ${err.message}`));
        loop.pocketSettled(claimed, status === "solved" ? "answered" : "dismissed", by);
      }
    }
    // The Builder's job ends with the case (its report already ended it when the Builder solved it).
    if (c.builderJobId && !opts.fromBuilder) {
      const [job] = await db.select().from(builderJobs).where(eq(builderJobs.id, c.builderJobId)).limit(1);
      if (job && ["queued", "handed", "working", "stuck"].includes(job.status)) {
        const done = opts.fromMember || status === "solved";
        await db
          .update(builderJobs)
          .set({ status: done ? "done" : "cancelled", report: done ? `${caseRef(c)} solved: ${note ?? ""}`.trim() : by, finishedAt: done ? new Date() : null, updatedAt: new Date() })
          .where(eq(builderJobs.id, job.id));
      }
    }
    if (c.status === "builder") await builder.syncPolicy().catch((err: Error) => log(`care: policy sync failed: ${err.message}`));
    const text =
      status === "solved"
        ? opts.fromMember
          ? `${caseRef(c)} looks solved: ${note ?? ""}${/[.!?]$/.test(note ?? "") ? "" : "."} I closed it; say "reopen case ${c.number}" if it isn't.`
          : `${caseRef(c)} is solved${by !== "the Builder" ? `, thanks ${by}` : " by the Builder"}${note ? `: ${note}` : "."}`
        : `Okay ${by}, ${caseRef(c)} is closed as not a case.`;
    log(`care: ${caseRef(c)} ${status} by ${by}`);
    if (opts.fromMember || opts.fromBuilder) await say(c, text);
    return text;
  }

  async function reopen(c: CareCase, by: string, byId: string | null): Promise<string> {
    const ev = await eventOf(c.eventId);
    await update(c, {
      status: c.ownerId ? "helping" : "open",
      closedAt: null,
      closedBy: null,
      resolution: null,
      ownerId: byId ?? c.ownerId,
      ownerName: byId ? by : c.ownerName,
      checkInAt: new Date(Date.now() + checkInDelayMs(ev?.stage ?? null)),
      checkIns: 0,
    });
    await addCareNote(db, c.id, { kind: "reopened", text: `${by} reopened it.`, by });
    return `${caseRef(c)} is open again${byId ? `, and it's yours, ${by}` : ""}.`;
  }

  /** The crew's words to the member, posted by Ferri in the member's space. */
  async function message(c: CareCase, text: string, by: string, byId: string | null): Promise<string> {
    const space = await resolveSpace(db, c.roomId);
    const room = await deps.room(c.roomId);
    if (!space?.setting || space.setting.mode === "listen" || space.archived) {
      return `${room.name} is not a space I may post in, so I didn't send it. Reach ${firstName(c.personName)} directly.`;
    }
    const sent = await loop.post(c.communityId, c.roomId, `${askerMention(c.personId, c.personName)} ${text}`);
    if (!sent) return "I couldn't post it (the pause may be on).";
    await addCareNote(db, c.id, { kind: "reply", text, by, messageId: sent });
    if (c.status === "open") await take(c, by, byId, null);
    log(`care: ${caseRef(c)}: ${by}'s message sent to ${c.personName}`);
    return `Sent to ${c.personName} in ${room.name}.`;
  }

  /** "@ferri case 3 solved", "I've got case 3", "who's stuck?" */
  async function intent(input: { communityId: string; eventId: string | null; member: CrewMember; care: NonNullable<CrewIntent["care"]> }): Promise<string | null> {
    const { care, member } = input;
    if (care.action === "status") {
      if (care.case) {
        const c = await findCase(db, input.communityId, care.case);
        return c ? `${caseLine(c)}${c.resolution ? ` (${c.resolution})` : ""}` : `There is no case ${care.case}.`;
      }
      const open = await openCases(db, input.communityId);
      if (!open.length) return "Nobody is stuck right now: there are no open cases.";
      return [`${open.length} open ${open.length === 1 ? "case" : "cases"}:`, ...open.map((c) => `- ${caseLine(c)}`)].join("\n");
    }
    if (!care.case) {
      const open = await openCases(db, input.communityId);
      return open.length ? `Which case? Open now: ${open.map((c) => `case ${c.number} (${c.personName})`).join(", ")}.` : "There are no open cases.";
    }
    const c = await findCase(db, input.communityId, care.case);
    if (!c) return `There is no case ${care.case}.`;
    const reply = await act(c, care.action, member.name, member.id, care.note.trim() || null);
    // Card answers already say their own line; chat actions reply here.
    return reply;
  }

  // ── The Builder's side ─────────────────────────────────────────────────

  async function caseForJob(job: BuilderJob): Promise<CareCase | null> {
    const [byJob] = await db.select().from(careCases).where(eq(careCases.builderJobId, job.id)).limit(1);
    if (byJob) return byJob;
    const n = /^Case (\d+):/.exec(job.brief)?.[1];
    return n ? findCase(db, job.communityId, Number(n)) : null;
  }

  const helpHooks = {
    async handoff(job: BuilderJob): Promise<string | null> {
      const c = await caseForJob(job);
      if (!c) return null;
      return helpHandoff({ job: job.number, caseNumber: c.number, personName: c.personName, reason: c.reason, agentName: config.agentName });
    },
    async report(job: BuilderJob, outcome: "done" | "stuck", text: string): Promise<void> {
      const c = await caseForJob(job);
      if (!c || c.status !== "builder") return;
      if (outcome === "done") {
        await close(c, "solved", "the Builder", text, { fromBuilder: true });
        return;
      }
      const updated = await update(c, { status: c.ownerId ? "helping" : "open" });
      await addCareNote(db, c.id, { kind: "builder", text: `The Builder needs a person: ${text}`, by: "the Builder" });
      await builder.syncPolicy().catch(() => {});
      const crew = await crewFor(c);
      const owner = c.ownerId ? crew.find((m) => m.id === c.ownerId) : undefined;
      const crewRoomId = await loop.crewRoomFor(c.eventId);
      const platform = crewRoomId ? (await deps.room(crewRoomId)).platform : null;
      await say(c, `The Builder couldn't finish ${caseRef(c)} (${c.personName}): ${clip(text, 400)} ${owner ? `${mention(owner, platform)}, it needs you.` : "It needs someone from the crew."}`);
      await push(owner ? [owner.id] : crew.filter((m) => m.lead || m.onDuty).map((m) => m.id), updated, `${caseRef(c)} needs a person`, text);
    },
  };

  /** While the Builder helps someone in a room, Ferri does not answer that person's unaddressed messages there. */
  async function builderHelping(roomId: string, personId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: careCases.id })
      .from(careCases)
      .where(and(eq(careCases.roomId, roomId), eq(careCases.personId, personId), eq(careCases.status, "builder")))
      .limit(1);
    return !!row;
  }

  // ── The tick: Desk and Pocket requests, cards held by the pause, check-ins ──

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      const asked = await db.select().from(careCases).where(isNotNull(careCases.request)).limit(10);
      for (const c of asked) {
        const req = c.request as CareRequest;
        const [claimed] = await db
          .update(careCases)
          .set({ request: null, updatedAt: new Date() })
          .where(and(eq(careCases.id, c.id), sql`${careCases.request}->>'at' = ${req.at}`))
          .returning();
        if (!claimed) continue;
        log(`care: ${caseRef(c)} ${req.action} from Desk/Pocket by ${req.by}`);
        const reply = await act({ ...claimed, request: null }, req.action, req.by, req.byCrewId, req.note);
        if (reply) await say(c, reply);
      }
      // Cards the pause held back (or that failed to open).
      const noCard = await db
        .select()
        .from(careCases)
        .where(and(isNull(careCases.cardId), inArray(careCases.status, [...CARE_OPEN]), lt(careCases.createdAt, new Date(Date.now() - 10_000))))
        .limit(5);
      for (const c of noCard) {
        if (await isPaused(db, c.communityId)) continue;
        await openCard(c, c.ownerId ? [c.ownerId] : []);
      }
      // Check-ins on cases still open.
      const due = await db
        .select()
        .from(careCases)
        .where(and(inArray(careCases.status, [...CARE_OPEN]), lte(careCases.checkInAt, new Date()), lt(careCases.checkIns, MAX_CHECK_INS)))
        .limit(5);
      for (const c of due) {
        if (await isPaused(db, c.communityId)) continue;
        const ev = await eventOf(c.eventId);
        const [claimed] = await db
          .update(careCases)
          .set({ checkIns: c.checkIns + 1, checkInAt: new Date(Date.now() + checkInDelayMs(ev?.stage ?? null)), updatedAt: new Date() })
          .where(and(eq(careCases.id, c.id), eq(careCases.checkIns, c.checkIns)))
          .returning();
        if (!claimed) continue;
        const crew = await crewFor(c);
        const owner = c.ownerId ? crew.find((m) => m.id === c.ownerId) : undefined;
        const crewRoomId = await loop.crewRoomFor(c.eventId);
        const platform = crewRoomId ? (await deps.room(crewRoomId)).platform : null;
        const age = Math.round((Date.now() - c.createdAt.getTime()) / 60_000);
        await say(
          c,
          `${owner ? `${mention(owner, platform)}, ` : ""}${caseRef(c)} is still open after ${age >= 60 ? `${Math.floor(age / 60)} h ${age % 60} min` : `${age} min`} (${c.personName}: ${clip(c.reason, 200)}). Solved? Tell me "@${config.agentName} case ${c.number} solved".`,
        );
        await addCareNote(db, c.id, { kind: "check_in", text: `Check-in ${c.checkIns + 1} of ${MAX_CHECK_INS}.`, by: "Ferri" });
        await push(owner ? [owner.id] : crew.filter((m) => m.lead || m.onDuty).map((m) => m.id), c, `${caseRef(c)} is still open`, c.reason);
      }
      await builder.syncPolicy().catch((err: Error) => log(`care: policy sync failed: ${err.message}`));
    } catch (err) {
      log(`care tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  return { read, hooks, helpHooks, intent, tick, builderHelping, openCases: (communityId: string) => openCases(db, communityId) };
}

export type Care = ReturnType<typeof createCare>;
