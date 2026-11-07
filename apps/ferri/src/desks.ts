import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { cards, communities, deskRows, desks, events, guests, planItems, type Db } from "@ferri/db";
import {
  CARD_QUESTION_ID,
  CARD_SESSION,
  CARD_SKIP_OPTION,
  DESK_MAKE_OPTION,
  PACK_TYPES,
  approvers,
  attachSpace,
  checkInGuest,
  checkInTarget,
  deskForRoom,
  deskInvitees,
  deskKickoff,
  deskKindFor,
  deskLine,
  deskPromptBlock,
  deskRoomName,
  deskRowCounts,
  deskRowsOf,
  deskSkillKey,
  deskSlug,
  deskTemplate,
  deskWithSkill,
  desksForEvent,
  findDesk,
  findRoomId,
  freeSkillKey,
  loadCrew,
  loadDeskSkill,
  loadPack,
  looksLikeCardAnswer,
  matchRowForChange,
  mention,
  mergeRow,
  packTypeFor,
  parseDeskSkill,
  platformFor,
  platformName,
  publishLibraryDocument,
  readSheet,
  recordSpace,
  renderDeskSkill,
  renderSheetDocument,
  rowText,
  saveFerriSkill,
  sheetCount,
  summaryText,
  switchExpiry,
  whoText,
  writeCustomDesk,
  type CrewMember,
  type Desk,
  type DeskPack,
  type DeskSkill,
  type DeskValue,
  type Posting,
  type ResolvedSpace,
  type RoomDetail,
} from "@ferri/knowledge";
import type { GatewayClient, MessageEvent, SwitchAgent } from "@ferri/switch";
import type { Builder } from "./builder.ts";
import { config } from "./config.ts";
import type { CrewAsk } from "./crew-ask.ts";
import type { AnnounceHooks, Loop, RoomInfo } from "./loop.ts";
import { mentionRegex } from "./mentions.ts";
import type { Prompts } from "./prompts.ts";

type CardRow = typeof cards.$inferSelect;
type EventRow = typeof events.$inferSelect;

export interface DesksDeps {
  db: Db;
  agent: SwitchAgent;
  loop: Loop;
  builder: Builder;
  gateway: GatewayClient | null;
  prompts: Prompts;
  room: (roomId: string) => Promise<RoomInfo>;
  log: (msg: string) => void;
}

/** One message in an attached space, before the normal path (questions, care) sees it. */
export interface DeskMessage {
  ev: MessageEvent;
  communityId: string;
  space: ResolvedSpace;
  /** The crew member who said it, or null for a member. */
  member: CrewMember | null;
  posting: Posting;
}

/** What a desk card carries in `cards.payload`. */
export interface DeskCardPayload {
  type: "pack" | "custom";
  /** pack: the kind of event ("meetup"). */
  pack?: string;
  packTitle?: string;
  /** The desks rows the card makes (status planned until then). */
  deskIds: string[];
  /** One line per room, as the card lists them. */
  lines: string[];
  /** custom: the skill Ferri wrote and the key it is saved under on "Make it". */
  skill?: string;
  skillKey?: string;
  /** pack: what "Make them" also adds to the event. */
  instructions?: string;
  tasks?: string[];
  requestedBy: string;
}

/** Desk's requests (spec 20): `desks.source_message_id` says what Desk asked for. */
export const DESK_REQUEST_PREFIX = "desk:";
export const DESK_PACK_PREFIX = "desk-pack:";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MODE_LABEL: Record<string, string> = { auto: "Auto", approve: "Approve", listen: "Listen" };
const titleCase = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

/**
 * Desks (spec 20): rooms Ferri makes from Switch templates plus a desk skill
 * (how Ferri behaves there), packs per kind of event, custom desks Ferri
 * writes itself, and sheets it keeps from what people say in a desk.
 */
export function createDesks(deps: DesksDeps) {
  const { db, agent, loop, gateway, log } = deps;
  const mentionRe = mentionRegex(config.agentName);
  /** Desk rows being made right now (the tick and a card never make one twice). */
  const building = new Set<string>();
  /** Per desk: the rows' state when its sheet document was last published. */
  const docSignature = new Map<string, string>();
  let ticking = false;

  async function eventOf(eventId: string | null): Promise<EventRow | null> {
    if (!eventId) return null;
    const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return ev ?? null;
  }

  async function skillOf(communityId: string, key: string): Promise<{ skill: DeskSkill; text: string; version: number } | null> {
    const s = await loadDeskSkill(db, config.skillsDir, communityId, key);
    if (!s) return null;
    if ("error" in s) {
      log(`desks: the skill ${key} is not valid: ${s.error}`);
      return null;
    }
    return s;
  }

  async function sayCrew(communityId: string, eventId: string | null, text: string): Promise<void> {
    const roomId = await loop.crewRoomFor(eventId);
    if (roomId) await loop.post(communityId, roomId, text);
  }

  // ── Where a desk goes ──────────────────────────────────────────────────

  /** The connection a new channel goes on: the one the crew named, else the crew room's. */
  async function bridgeFor(input: { crewRoomId: string | null; platform: string | null }): Promise<{ bridge: string; platform: string | null } | { error: string }> {
    const crewDetail = input.crewRoomId ? await agent.op<RoomDetail>("get_room_detail", { room_id: input.crewRoomId }).catch(() => null) : null;
    const crewPlatform = input.crewRoomId ? (await deps.room(input.crewRoomId).catch(() => ({ platform: null }) as RoomInfo)).platform : null;
    const wanted = input.platform;
    if (wanted && wanted !== crewPlatform) {
      if (!gateway) return { error: `I can't see Switch's connections from here, so I can only make channels where the crew room is.` };
      const list = await gateway.bridges().catch(() => []);
      const hit = list.find((b) => b.bridge_type === wanted) ?? (wanted.startsWith("whatsapp") ? list.find((b) => b.bridge_type.startsWith("whatsapp")) : undefined);
      if (!hit) return { error: `There's no ${platformName(wanted)} connection in Switch yet, so I can't make a channel there.` };
      return { bridge: hit.display_name, platform: hit.bridge_type };
    }
    const bridge = crewDetail?.bridge_display_name;
    if (!bridge) return { error: "The crew room is not on a messaging app, so I cannot make channels from here. Name a platform (\"on Discord\")." };
    return { bridge, platform: crewPlatform };
  }

  // ── Making a desk ──────────────────────────────────────────────────────

  /**
   * Make one planned desk: its channel from a Switch template (Ferri and the
   * invited people in it, the kickoff posted), recorded as a space and
   * attached to the event at once with the desk's mode (Ferri made it, so it
   * skips Discovered).
   */
  async function build(id: string): Promise<{ ok: boolean; line: string }> {
    if (building.has(id)) return { ok: false, line: "" };
    building.add(id);
    try {
      const [d] = await db.select().from(desks).where(eq(desks.id, id)).limit(1);
      if (!d || d.status !== "planned") return { ok: false, line: "" };
      const fail = async (why: string) => {
        await db.update(desks).set({ status: "failed", error: why.slice(0, 500), updatedAt: new Date() }).where(eq(desks.id, d.id));
        log(`desks: ${d.title} (${d.roomName}) failed: ${why}`);
        return { ok: false, line: `Could not make the ${d.title} (#${d.roomName}): ${clip(why.replace(/^.*?failed: /, ""), 200)}` };
      };
      const loaded = await skillOf(d.communityId, d.skillKey);
      if (!loaded) return fail(`its skill ${d.skillKey} is missing or not valid`);
      const { skill } = loaded;
      const ev = await eventOf(d.eventId);
      const crewRoomId = await loop.crewRoomFor(d.eventId);
      const where = await bridgeFor({ crewRoomId, platform: d.platform });
      if ("error" in where) return fail(where.error);
      const crew = await loadCrew(db, d.communityId, d.eventId);
      const inv = deskInvitees({ who: skill.who, crew, named: d.members, platform: where.platform });
      const kickoff = deskKickoff({ kickoff: skill.kickoff, title: d.title, eventName: ev?.name ?? "the event", agentName: config.agentName });
      const yaml = deskTemplate({
        bridge: where.bridge,
        agentName: config.agentName,
        eventName: ev?.name ?? "the event",
        desk: { title: d.title, roomName: d.roomName, visibility: d.visibility === "public" ? "public" : "private", members: inv.users, kickoff },
      });
      try {
        const out = await agent.op<unknown>("create_room_from_yaml", { yaml });
        const roomId = findRoomId(out, d.roomName);
        let spaceId: string | null = null;
        let platform = where.platform;
        if (roomId) {
          platform = (await deps.room(roomId).catch(() => ({ platform: null }) as RoomInfo)).platform ?? where.platform;
          spaceId = await recordSpace(db, d.communityId, { roomId, name: `${where.bridge}: ${d.roomName}`, platform });
          if (d.eventId) await attachSpace(db, { eventId: d.eventId, spaceId, mode: skill.mode, role: "members", by: d.requestedBy });
        }
        await db
          .update(desks)
          .set({ status: "created", switchRoomId: roomId, spaceId, platform, members: inv.users, skillVersion: loaded.version, error: null, updatedAt: new Date() })
          .where(eq(desks.id, d.id));
        log(`desks: made ${d.title} #${d.roomName} on ${where.bridge}${roomId ? ` (${roomId})` : " (room id not found in the reply)"} with ${inv.users.join(", ") || "nobody invited"}`);
        const who = inv.names.length ? ` with ${inv.names.join(", ")}` : "";
        const missing = inv.missing.length ? ` (${inv.missing.join(", ")} ${inv.missing.length === 1 ? "has" : "have"} no ${platformName(platform ?? "")} handle, so add them by hand)` : "";
        return {
          ok: true,
          line: `${d.title}: #${d.roomName} on ${platformName(platform ?? where.bridge)}${who}, ${d.visibility}, ${MODE_LABEL[skill.mode]}${skill.sheet ? `, keeps the ${skill.sheet.name} sheet` : ""}${missing}`,
        };
      } catch (err) {
        return fail((err as Error).message);
      }
    } finally {
      building.delete(id);
    }
  }

  /** A planned desks row for one desk kind (or a written custom skill). */
  async function planDesk(input: {
    communityId: string;
    event: EventRow | null;
    skillKey: string;
    skill: DeskSkill;
    name?: string;
    members: string[];
    platform: string | null;
    by: string;
    sourceMessageId: string | null;
    cardId?: string | null;
  }): Promise<Desk> {
    const named = input.name?.trim() ? deskSlug(input.name) : "";
    const custom = named && named !== input.skill.kind && named !== input.skill.room && !input.skill.kind.startsWith("custom-");
    const room = custom ? named : input.skill.room;
    const title = custom ? `${titleCase(input.name!.trim().replace(/\s*\bdesk\b\s*/i, " ").trim())} desk` : input.skill.title;
    const [row] = await db
      .insert(desks)
      .values({
        communityId: input.communityId,
        eventId: input.event?.id ?? null,
        kind: input.skill.kind,
        title,
        skillKey: input.skillKey,
        roomName: deskRoomName(input.event, room),
        platform: input.platform,
        visibility: input.skill.visibility,
        members: input.members,
        status: "planned",
        cardId: input.cardId ?? null,
        requestedBy: input.by,
        sourceMessageId: input.sourceMessageId,
      })
      .returning();
    return row!;
  }

  async function liveRoomNames(communityId: string, eventId: string | null): Promise<Set<string>> {
    const list = await desksForEvent(db, communityId, eventId);
    return new Set(list.filter((d) => d.status === "created" || d.status === "planned").map((d) => d.roomName));
  }

  // ── Crew asks ──────────────────────────────────────────────────────────

  async function intent(ask: CrewAsk): Promise<string | null> {
    const d = ask.intent.desk;
    const ev = await eventOf(ask.eventId);
    const by = ask.member.name;
    const platform = d.platform.trim() ? platformFor(d.platform) : null;
    if (d.platform.trim() && !platform) return `I don't know the platform "${d.platform}". I can make desks on Mattermost, Slack, Discord, Telegram or WhatsApp.`;
    if (d.action === "list") return listText(ask.communityId, ask.eventId, ev);
    if (!ev) return "This room is not attached to an event, so I don't know which event the desk is for.";

    if (d.action === "sheet") {
      const list = await desksForEvent(db, ask.communityId, ev.id);
      const desk = findDesk(list, { kind: d.kind, name: d.name });
      if (!desk) return `There's no ${d.name || d.kind || "such"} desk for ${ev.name} yet. Say "what desks do we have?" to see them.`;
      return sheetText(desk);
    }

    if (d.action === "make") {
      const kind = deskKindFor(d.kind) ?? (d.name ? deskKindFor(d.name) : null);
      if (!kind) return custom(ask, ev, platform);
      const loaded = await skillOf(ask.communityId, deskSkillKey(kind));
      if (!loaded) return `I don't have a working ${kind} desk skill right now; check it in Desk's Skills page.`;
      const planned = await planDesk({ communityId: ask.communityId, event: ev, skillKey: deskSkillKey(kind), skill: loaded.skill, name: d.name, members: d.members, platform, by, sourceMessageId: ask.messageId });
      const taken = await db
        .select({ id: desks.id })
        .from(desks)
        .where(and(eq(desks.communityId, ask.communityId), eq(desks.eventId, ev.id), eq(desks.roomName, planned.roomName), eq(desks.status, "created")))
        .limit(1);
      if (taken.length) {
        await db.update(desks).set({ status: "dismissed", error: "already exists", updatedAt: new Date() }).where(eq(desks.id, planned.id));
        return `There's already a desk called #${planned.roomName} for ${ev.name}. Give the new one a name ("a judging desk called finals").`;
      }
      const r = await build(planned.id);
      return r.ok ? `Made the ${r.line}. I'm in it and work there the desk's way.` : r.line || "I couldn't make that desk.";
    }

    if (d.action === "pack") {
      const type = packTypeFor(d.kind) ?? packTypeFor(d.what) ?? packTypeFor(ask.body);
      if (!type) return `I don't have a pack for that kind of event yet. I have ${PACK_TYPES.join(", ")}. I can also write a desk for any job: "make a desk for the photographers where they log their shots".`;
      return planPack({ communityId: ask.communityId, event: ev, type, members: d.members, platform, by, sourceMessageId: ask.messageId });
    }

    if (d.action === "custom") return custom(ask, ev, platform);
    return null;
  }

  async function listText(communityId: string, eventId: string | null, ev: EventRow | null): Promise<string> {
    const list = (await desksForEvent(db, communityId, eventId)).filter((d) => d.status !== "failed");
    if (!list.length) return `${ev ? `${ev.name} has` : "There are"} no desks yet. Say "set up the desks for a meetup" (or hackathon, game-night, festival, workshop, conference), or "make a judging desk with arjun".`;
    const counts = await deskRowCounts(db, list.map((d) => d.id));
    const lines = list.map((d) => `- ${deskLine(d, counts.get(d.id))}`);
    return `${ev ? `${ev.name}'s desks` : "Desks"}:\n${lines.join("\n")}`;
  }

  async function sheetText(desk: Desk): Promise<string> {
    const loaded = await skillOf(desk.communityId, desk.skillKey);
    if (!loaded?.skill.sheet) return `The ${desk.title} keeps no sheet.`;
    const rows = await deskRowsOf(db, desk.id);
    return summaryText(loaded.skill.sheet, rows, desk.title);
  }

  /** "Set up the desks for a meetup": every desk of the pack on one card. */
  async function planPack(input: { communityId: string; event: EventRow; type: string; members: string[]; platform: string | null; by: string; sourceMessageId: string | null }): Promise<string> {
    const loaded = await loadPack(db, config.skillsDir, input.communityId, input.type);
    if (!loaded || "error" in loaded) return `The ${input.type} pack is ${loaded ? `not valid (${loaded.error})` : "missing"}; check it in Desk's Skills page.`;
    const pack = loaded.pack;
    const have = await liveRoomNames(input.communityId, input.event.id);
    const rows: Desk[] = [];
    const skipped: string[] = [];
    for (const kind of pack.desks) {
      const s = await skillOf(input.communityId, deskSkillKey(kind));
      if (!s) {
        skipped.push(`${kind} (no valid skill)`);
        continue;
      }
      const room = deskRoomName(input.event, s.skill.room);
      if (have.has(room)) {
        skipped.push(`#${room} (already there)`);
        continue;
      }
      rows.push(await planDesk({ communityId: input.communityId, event: input.event, skillKey: deskSkillKey(kind), skill: s.skill, members: input.members, platform: input.platform, by: input.by, sourceMessageId: input.sourceMessageId }));
    }
    if (!rows.length) return `Every desk of the ${pack.title.toLowerCase()} pack is already there${skipped.length ? `: ${skipped.join(", ")}` : ""}.`;
    const r = await openPackCard({ event: input.event, pack, rows, by: input.by });
    return r.ok ? `The ${pack.title.toLowerCase()} desks are on a card in the crew room: ${rows.map((d) => `#${d.roomName}`).join(", ")}.${skipped.length ? ` Left out: ${skipped.join(", ")}.` : ""}` : r.text;
  }

  /** "Make a desk for the rangoli judges where they post their scores": Ferri writes the skill and shows it on a card. */
  async function custom(ask: CrewAsk, ev: EventRow, platform: string | null): Promise<string> {
    const d = ask.intent.desk;
    const what = d.what.trim() || ask.body;
    const w = await writeCustomDesk({ choice: config.modelFast, what, name: d.name, eventName: ev.name, sender: ask.member.name });
    if (w.fallback) log(`desks: the custom desk writer fell back to a minimal skill (${w.error ?? "invalid"})`);
    const key = await freeSkillKey(db, ask.communityId, deskSkillKey(w.skill.kind));
    const kind = key.slice("desks/".length);
    const text = kind === w.skill.kind ? w.text : renderDeskSkill({ ...w.skill, kind });
    const skill = kind === w.skill.kind ? w.skill : { ...w.skill, kind };
    const have = await liveRoomNames(ask.communityId, ev.id);
    let room = skill.room;
    for (let i = 2; have.has(deskRoomName(ev, room)) && i < 20; i++) room = `${skill.room}-${i}`;
    const row = await planDesk({ communityId: ask.communityId, event: ev, skillKey: key, skill: { ...skill, room }, members: d.members, platform, by: ask.member.name, sourceMessageId: ask.messageId });
    const r = await openCustomCard({ event: ev, desk: row, skill, text, key, by: ask.member.name });
    return r.ok ? `I wrote a desk skill for it: the ${row.title}, #${row.roomName}. It's on a card in the crew room; "Make it" saves the skill and makes the room.` : r.text;
  }

  // ── Desk cards ─────────────────────────────────────────────────────────

  async function cardLine(d: Desk, skill: DeskSkill, event: EventRow): Promise<string> {
    const crewRoomId = await loop.crewRoomFor(event.id);
    const crewPlatform = crewRoomId ? (await deps.room(crewRoomId).catch(() => ({ platform: null }) as RoomInfo)).platform : null;
    const platform = d.platform ?? crewPlatform;
    const crew = await loadCrew(db, d.communityId, d.eventId);
    const inv = deskInvitees({ who: skill.who, crew, named: d.members, platform });
    const who = inv.names.length ? inv.names.join(", ") : d.members.length ? d.members.join(", ") : `nobody yet (${whoText(skill.who)})`;
    return `#${d.roomName} · ${d.title} · ${platform ? platformName(platform) : "the crew room's platform"} · ${d.visibility} · ${MODE_LABEL[skill.mode]} · invites ${who}${skill.sheet ? ` · sheet: ${skill.sheet.name}` : ""}${skill.care === "help" ? " · the Builder helps here" : ""}`;
  }

  async function openDeskCard(input: { event: EventRow; title: string; question: string; prompt: string; makeLabel: string; payload: DeskCardPayload; deskIds: string[] }): Promise<{ ok: boolean; text: string }> {
    const ev = input.event;
    const crewRoomId = await loop.crewRoomFor(ev.id);
    if (!crewRoomId) {
      await db.update(desks).set({ status: "dismissed", error: "no crew room for the card", updatedAt: new Date() }).where(inArray(desks.id, input.deskIds));
      return { ok: false, text: `${ev.name} has no crew room for the card; attach one in Desk first.` };
    }
    const crew = await loadCrew(db, ev.communityId, ev.id);
    const route = approvers(crew);
    const times = loop.ladder(ev.stage, ev.endsAt);
    const id = randomUUID();
    await db.insert(cards).values({
      id,
      communityId: ev.communityId,
      eventId: ev.id,
      crewRoomId,
      switchSessionId: CARD_SESSION,
      kind: "desk",
      topic: "desks",
      question: clip(input.question, 300),
      ownerIds: route.owners.map((o) => o.id),
      draftText: input.prompt,
      payload: input.payload as unknown as Record<string, unknown>,
      ...times,
    });
    await db.update(desks).set({ cardId: id, updatedAt: new Date() }).where(inArray(desks.id, input.deskIds));
    try {
      await agent.openQuestionsCard(CARD_SESSION, {
        request_id: id,
        turn_id: id,
        title: `Desks · ${ev.name} · ${input.title}`,
        detail: "Nothing is made until someone on the crew says so.",
        questions: [
          {
            id: CARD_QUESTION_ID,
            title: input.question,
            prompt: clip(input.prompt, 3800),
            options: [
              { id: DESK_MAKE_OPTION, label: input.makeLabel, description: null },
              { id: CARD_SKIP_OPTION, label: "Don't", description: null },
            ],
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
      await db.update(desks).set({ status: "dismissed", error: "the card could not be opened", updatedAt: new Date() }).where(inArray(desks.id, input.deskIds));
      log(`desks: opening the desk card failed: ${(err as Error).message}`);
      return { ok: false, text: "I couldn't open the desk card in the crew room." };
    }
    const { platform } = await deps.room(crewRoomId);
    await loop.post(ev.communityId, crewRoomId, `${route.owners.map((o) => mention(o, platform)).join(" ") || "Crew"}, ${input.question.charAt(0).toLowerCase()}${input.question.slice(1)} It's on the card in this room.`);
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (row) loop.pocketNotify("open", row, route.owners.map((o) => o.id), { roomName: ev.name });
    log(`desks: card ${id} for ${input.title}`);
    return { ok: true, text: "" };
  }

  async function openPackCard(input: { event: EventRow; pack: DeskPack; rows: Desk[]; by: string }): Promise<{ ok: boolean; text: string }> {
    const lines: string[] = [];
    for (const d of input.rows) {
      const s = await skillOf(d.communityId, d.skillKey);
      lines.push(s ? await cardLine(d, s.skill, input.event) : `#${d.roomName} · ${d.title}`);
    }
    const extra = [
      input.pack.instructions ? "adds the pack's instructions to the event" : null,
      input.pack.tasks.length ? `puts ${plural(input.pack.tasks.length, "starter task", "starter tasks")} on the plan` : null,
    ].filter(Boolean);
    const prompt = [`${plural(input.rows.length, "room", "rooms")}, each with Ferri in it and its own way of working:`, ...lines.map((l) => `- ${l}`), extra.length ? `"Make them" also ${extra.join(" and ")}.` : null]
      .filter(Boolean)
      .join("\n");
    return openDeskCard({
      event: input.event,
      title: `${input.pack.title} desks`,
      question: `Set up the ${input.pack.title.toLowerCase()} desks for ${input.event.name}?`,
      prompt,
      makeLabel: "Make them",
      deskIds: input.rows.map((d) => d.id),
      payload: {
        type: "pack",
        pack: input.pack.type,
        packTitle: input.pack.title,
        deskIds: input.rows.map((d) => d.id),
        lines,
        instructions: input.pack.instructions,
        tasks: input.pack.tasks,
        requestedBy: input.by,
      },
    });
  }

  async function openCustomCard(input: { event: EventRow; desk: Desk; skill: DeskSkill; text: string; key: string; by: string }): Promise<{ ok: boolean; text: string }> {
    const line = await cardLine(input.desk, input.skill, input.event);
    return openDeskCard({
      event: input.event,
      title: input.desk.title,
      question: `Make the ${input.desk.title} (#${input.desk.roomName}) with the skill I wrote?`,
      prompt: `${line}\n\nThe desk skill (saved as ${input.key}, editable in Desk):\n\n${input.text}`,
      makeLabel: "Make it",
      deskIds: [input.desk.id],
      payload: { type: "custom", deskIds: [input.desk.id], lines: [line], skill: input.text, skillKey: input.key, requestedBy: input.by },
    });
  }

  /** "Make them" on a pack also adds the pack's instructions to the event and its starter tasks to the plan. */
  async function applyPack(card: CardRow, p: DeskCardPayload, by: string): Promise<string[]> {
    const ev = await eventOf(card.eventId);
    if (!ev) return [];
    const notes: string[] = [];
    const instr = p.instructions?.trim();
    if (instr && !ev.instructions.includes(instr)) {
      await db
        .update(events)
        .set({ instructions: ev.instructions.trim() ? `${ev.instructions.trim()}\n\n${instr}` : instr, deskEditedAt: new Date(), updatedAt: new Date() })
        .where(eq(events.id, ev.id));
      notes.push("added the pack's instructions to the event");
    }
    const tasks = p.tasks ?? [];
    if (tasks.length) {
      const inserted = await db
        .insert(planItems)
        .values(tasks.map((t, i) => ({ communityId: ev.communityId, eventId: ev.id, kind: "task" as const, status: "proposed" as const, topic: "other", title: clip(t, 60), text: t, origin: "pack", decidedBy: by, sourceKey: `pack:${card.id}#${i + 1}` })))
        .onConflictDoNothing()
        .returning({ id: planItems.id });
      if (inserted.length) notes.push(`put ${plural(inserted.length, "starter task", "starter tasks")} on the plan`);
    }
    return notes;
  }

  async function outcome(card: CardRow, answer: { written: string | null; selected: string[] }, by: string): Promise<void> {
    const make = answer.selected.includes(DESK_MAKE_OPTION);
    const claimed = await loop.claim(card.id, { status: make ? "answered" : "dismissed", answeredAt: new Date(), answeredBy: by, answeredVia: "card" });
    if (!claimed) return;
    loop.pocketSettled(claimed, make ? "answered" : "dismissed", by);
    const p = (card.payload ?? {}) as unknown as DeskCardPayload;
    const planned = await db.select().from(desks).where(and(eq(desks.cardId, card.id), eq(desks.status, "planned")));
    if (!make) {
      if (planned.length) await db.update(desks).set({ status: "dismissed", updatedAt: new Date() }).where(inArray(desks.id, planned.map((d) => d.id)));
      await sayCrew(card.communityId, card.eventId, `Okay ${by}, I won't make ${p.type === "custom" ? "that desk" : "those desks"}.`);
      log(`desks: card ${card.id} declined by ${by}`);
      return;
    }
    const notes: string[] = [];
    if (p.type === "custom" && p.skill && p.skillKey) {
      const check = parseDeskSkill(p.skill);
      if (!check.ok) {
        await db.update(desks).set({ status: "failed", error: `the written skill is not valid: ${check.error}`, updatedAt: new Date() }).where(inArray(desks.id, planned.map((d) => d.id)));
        await sayCrew(card.communityId, card.eventId, `The desk skill on that card is not valid (${check.error}), so I made nothing.`);
        return;
      }
      const saved = await saveFerriSkill(db, { communityId: card.communityId, key: p.skillKey, body: p.skill, by });
      notes.push(`saved its skill as ${p.skillKey} (version ${saved.version}, editable in Desk)`);
    }
    if (p.type === "pack") notes.push(...(await applyPack(card, p, by)));
    const made: string[] = [];
    const failed: string[] = [];
    for (const d of planned) {
      const r = await build(d.id);
      if (r.ok) made.push(r.line);
      else if (r.line) failed.push(r.line);
    }
    const text = [
      made.length ? `Made ${plural(made.length, "desk", "desks")}, approved by ${by}:\n${made.map((l) => `- ${l}`).join("\n")}` : null,
      failed.length ? failed.join("\n") : null,
      notes.length ? `I also ${notes.join(" and ")}.` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await sayCrew(card.communityId, card.eventId, text || "Those desks were already made or set aside.");
  }

  async function expired(card: CardRow): Promise<void> {
    const planned = await db.select({ id: desks.id }).from(desks).where(and(eq(desks.cardId, card.id), eq(desks.status, "planned")));
    if (planned.length) await db.update(desks).set({ status: "dismissed", error: "the card expired", updatedAt: new Date() }).where(inArray(desks.id, planned.map((d) => d.id)));
    await sayCrew(card.communityId, card.eventId, `Nobody answered the desk card “${card.question}”, so I made nothing. Ask again any time.`);
  }

  // ── Sheets: what people say in a desk ──────────────────────────────────

  /** True when the message was a sheet entry and is done (the normal path skips it). */
  async function onMessage(m: DeskMessage): Promise<boolean> {
    const p = m.ev.payload;
    if (p.sender_kind === "agent" || p.sender.startsWith("@switch-agent-") || looksLikeCardAnswer(p.body)) return false;
    if (p.body.trim().length < 2) return false;
    const desk = await deskForRoom(db, m.ev.room_id);
    if (!desk) return false;
    const loaded = await skillOf(desk.communityId, desk.skillKey);
    const sheet = loaded?.skill.sheet;
    if (!loaded || !sheet) return false;
    // A replay after a restart: this message was already read into the sheet.
    const [seen] = await db.select({ id: deskRows.id }).from(deskRows).where(eq(deskRows.messageId, p.message_id)).limit(1);
    if (seen) return true;
    const rows = await deskRowsOf(db, desk.id);
    const by = m.member?.name ?? p.sender_name;
    const body = p.body.replace(mentionRe, "").replace(/\s+/g, " ").trim();
    const { reading, latencyMs } = await readSheet({ choice: config.modelFast, deskTitle: desk.title, sheet, sender: by, message: body, rows: rows.map((r) => ({ id: r.id, data: r.data, by: r.by })) });
    if (!reading || reading.action === "none") return false;
    log(`desks: ${desk.title} sheet reading for ${by}: ${reading.action} (${reading.rows.length} row(s), ${latencyMs} ms)`);
    const canPost = m.posting === "auto" || (m.posting === "approve" && reading.action === "show" && m.member !== null);

    if (reading.action === "show") {
      const [claimed] = await db.insert(deskRows).values({ deskId: desk.id, data: {}, by, messageId: p.message_id, status: "show" }).onConflictDoNothing().returning({ id: deskRows.id });
      if (claimed && canPost) await loop.post(desk.communityId, m.ev.room_id, summaryText(sheet, rows, desk.title));
      return true;
    }

    const changed: { data: Record<string, DeskValue>; kind: "added" | "changed" }[] = [];
    for (const [i, r] of reading.rows.entries()) {
      const messageId = i === 0 ? p.message_id : `${p.message_id}#${i + 1}`;
      const live = rows.filter((x) => x.status === "active");
      const targetId = reading.action === "change" ? (r.ref ?? matchRowForChange(sheet, live, r.data, by)) : null;
      const target = targetId ? live.find((x) => x.id === targetId) : undefined;
      const data = target ? mergeRow(target.data, r.data) : r.data;
      const [ins] = await db.insert(deskRows).values({ deskId: desk.id, data, by, messageId }).onConflictDoNothing().returning({ id: deskRows.id });
      if (!ins) {
        if (i === 0) return true;
        continue;
      }
      if (target) {
        await db.update(deskRows).set({ status: "removed", updatedAt: new Date() }).where(eq(deskRows.id, target.id));
        target.status = "removed";
      }
      changed.push({ data, kind: target ? "changed" : "added" });
    }
    if (!changed.length) return true;
    const total = (await deskRowsOf(db, desk.id)).length;

    let reply: string;
    if (sheet.link === "guests.checkin" && desk.eventId) {
      const inNames: string[] = [];
      const already: string[] = [];
      const unknown: string[] = [];
      for (const c of changed) {
        const t = checkInTarget(sheet, c.data);
        const g = await checkInGuest(db, desk.eventId, t);
        if (!g) unknown.push(t.name ?? t.email ?? rowText(sheet, c.data));
        else if (g.already) already.push(g.name);
        else inNames.push(g.name);
      }
      const [n] = await db
        .select({ inn: sql<number>`count(*) filter (where ${guests.checkedInAt} is not null)::int`, all: sql<number>`count(*) filter (where ${guests.status} = 'going')::int` })
        .from(guests)
        .where(eq(guests.eventId, desk.eventId));
      reply = [
        inNames.length ? `Checked in: ${inNames.join(", ")}.` : null,
        already.length ? `${already.join(", ")} ${already.length === 1 ? "was" : "were"} already checked in.` : null,
        unknown.length ? `I couldn't find ${unknown.join(", ")} on the guest list; what name or email did they register with?` : null,
        n ? `${n.inn} checked in${n.all ? ` of ${n.all} going` : ""}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
      if (unknown.length) log(`desks: check-in for unknown guest(s) ${unknown.join(", ")} in ${desk.roomName}`);
    } else {
      const skip = sheet.columns.filter((c) => changed.every((x) => typeof x.data[c] === "string" && (x.data[c] as string).toLowerCase() === by.toLowerCase()));
      const items = changed.map((c) => rowText(sheet, c.data, { skip }));
      const verb = changed.every((c) => c.kind === "changed") ? "Changed" : "Noted";
      reply = `${verb}: ${items.join("; ")} (${by}). ${sheetCount(sheet, total)} so far.`;
    }

    // An incident in a desk whose sheet links to care (the safety desk): care reads a member's message
    // (unsafe goes to the on-duty person and the leads); a crew member's report goes to them here.
    let handOn = false;
    if (sheet.link === "care") {
      if (!m.member) handOn = true;
      else {
        const crew = await loadCrew(db, desk.communityId, desk.eventId);
        const who = crew.filter((c) => c.onDuty || c.lead);
        const crewRoomId = await loop.crewRoomFor(desk.eventId);
        if (crewRoomId && crewRoomId !== m.ev.room_id) {
          const { platform } = await deps.room(crewRoomId);
          await loop.post(desk.communityId, crewRoomId, `${who.map((c) => mention(c, platform)).join(" ") || "Crew"}, from the ${desk.title} (#${desk.roomName}), ${by}: ${clip(changed.map((c) => rowText(sheet, c.data)).join("; "), 400)}`);
        }
        reply += " The person on duty has been told.";
      }
    }
    if (canPost && reply) await loop.post(desk.communityId, m.ev.room_id, reply);
    return !handOn;
  }

  // ── The prompt and routing in a desk ───────────────────────────────────

  /** The desk skill a space runs (its body, for the answer prompt), or null when it is not a desk. */
  async function skillFor(spaceId: string): Promise<string | null> {
    const found = await deskWithSkill(db, config.skillsDir, spaceId);
    if (!found) return null;
    const ev = await eventOf(found.desk.eventId);
    return deskPromptBlock({ desk: found.desk, skill: found.skill, eventName: ev?.name ?? null });
  }

  /** The topic cards from a desk go to (its owners first), or null when the space is not a desk. */
  async function topicFor(spaceId: string): Promise<string | null> {
    return (await deskWithSkill(db, config.skillsDir, spaceId).catch(() => null))?.skill.topic ?? null;
  }

  // ── Tick: Desk's requests and the sheet documents ──────────────────────

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      await requests();
      await publishSheets();
    } catch (err) {
      log(`desks tick failed: ${(err as Error).message}`);
    } finally {
      ticking = false;
    }
  }

  /** Desks and packs asked for in Desk: status planned, no card yet. */
  async function requests(): Promise<void> {
    const planned = await db
      .select()
      .from(desks)
      .where(and(eq(desks.status, "planned"), isNull(desks.cardId), isNotNull(desks.sourceMessageId), like(desks.sourceMessageId, "desk%")))
      .limit(30);
    const packs = new Map<string, Desk[]>();
    for (const d of planned) {
      const src = d.sourceMessageId ?? "";
      if (src.startsWith(DESK_PACK_PREFIX)) {
        packs.set(src, [...(packs.get(src) ?? []), d]);
      } else if (src.startsWith(DESK_REQUEST_PREFIX)) {
        const r = await build(d.id);
        if (r.line) await sayCrew(d.communityId, d.eventId, r.ok ? `Made the ${r.line}, asked for in Desk by ${d.requestedBy}.` : r.line);
      }
    }
    for (const [src, rows] of packs) {
      const type = src.slice(DESK_PACK_PREFIX.length).split(":")[0] ?? "";
      const ev = await eventOf(rows[0]!.eventId);
      if (!ev) {
        await db.update(desks).set({ status: "failed", error: "no event", updatedAt: new Date() }).where(inArray(desks.id, rows.map((d) => d.id)));
        continue;
      }
      const loaded = await loadPack(db, config.skillsDir, ev.communityId, type);
      const pack: DeskPack = loaded && "pack" in loaded ? loaded.pack : { type, title: titleCase(type.replace(/-/g, " ")), desks: rows.map((d) => d.kind), instructions: "", tasks: [], body: "" };
      const r = await openPackCard({ event: ev, pack, rows, by: rows[0]!.requestedBy });
      if (!r.ok) log(`desks: the pack card from Desk could not open: ${r.text}`);
    }
  }

  /** Each sheet is a Switch library document attached to its desk room, updated after every change. */
  async function publishSheets(): Promise<void> {
    if (!gateway) return;
    const live = await db
      .select()
      .from(desks)
      .where(and(eq(desks.status, "created"), isNotNull(desks.switchRoomId)));
    if (!live.length) return;
    const sigs = await db
      .select({ deskId: deskRows.deskId, last: sql<string>`max(${deskRows.updatedAt})::text`, n: sql<number>`count(*)::int` })
      .from(deskRows)
      .where(and(inArray(deskRows.deskId, live.map((d) => d.id)), inArray(deskRows.status, ["active", "removed"])))
      .groupBy(deskRows.deskId);
    const sigOf = new Map(sigs.map((s) => [s.deskId, `${s.last}|${s.n}`]));
    for (const d of live) {
      const signature = `${sigOf.get(d.id) ?? "empty"}|${d.title}|${d.skillKey}`;
      if (docSignature.get(d.id) === signature) continue;
      const loaded = await skillOf(d.communityId, d.skillKey);
      const sheet = loaded?.skill.sheet;
      if (!sheet) {
        docSignature.set(d.id, signature);
        continue;
      }
      const ev = await eventOf(d.eventId);
      const [c] = await db.select({ tz: communities.timezone }).from(communities).where(eq(communities.id, d.communityId)).limit(1);
      const rows = await deskRowsOf(db, d.id);
      try {
        const r = await publishLibraryDocument({
          db,
          gateway,
          stateKey: `desk_sheet:${d.id}`,
          name: `${ev ? `${ev.name}: ` : ""}${d.title} ${sheet.name.toLowerCase()}`,
          description: `The ${sheet.name.toLowerCase()} sheet of the ${d.title} (#${d.roomName}), kept by Ferri from what people post there.`,
          instructions: `Maintained by Ferri. Each row is one entry posted in #${d.roomName}; change it by saying so in the room, or in Desk.`,
          content: renderSheetDocument({ title: d.title, roomName: d.roomName, eventName: ev?.name ?? null, sheet, rows, timeZone: c?.tz ?? "Asia/Kolkata" }),
          roomIds: [d.switchRoomId!],
        });
        docSignature.set(d.id, signature);
        if (d.sheetDocumentId !== r.documentId) await db.update(desks).set({ sheetDocumentId: r.documentId, updatedAt: new Date() }).where(eq(desks.id, d.id));
        log(`desks: sheet document for ${d.title} ${r.created ? "created" : "updated"} (${rows.length} row(s))`);
      } catch (err) {
        docSignature.set(d.id, signature);
        log(`desks: sheet document for ${d.title} failed: ${(err as Error).message}`);
      }
    }
  }

  const hooks: AnnounceHooks = { outcome, expired };
  return { intent, onMessage, skillFor, topicFor, tick, hooks };
}

export type Desks = ReturnType<typeof createDesks>;
