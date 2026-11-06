import { eq, sql } from "drizzle-orm";
import { createDb, knowledgeEntries, runMigrations } from "@ferri/db";
import {
  attachedRoomIds,
  bridgeTypesFrom,
  discoverSpaces,
  findCommunity,
  loadLiveKnowledge,
  mirrorToSwitch,
  roomPlatform,
  type RoomDetail,
} from "@ferri/knowledge";
import { SwitchAgent, gatewayFromEnv } from "@ferri/switch";
import { config } from "./config.ts";
import { createBuilder } from "./builder.ts";
import { createFlow } from "./flow.ts";
import { createLaunch } from "./launch.ts";
import { createPlan } from "./plan.ts";
import { createOutreach } from "./outreach.ts";
import { createCare } from "./care.ts";
import { createGuests } from "./guests.ts";
import { createShield } from "./shield.ts";
import { createPrompts } from "./prompts.ts";
import { createWrap } from "./wrap.ts";
import { createDesks } from "./desks.ts";
import { createSettings } from "./settings.ts";
import { createSocial } from "./social.ts";
import { createLoop, type RoomInfo } from "./loop.ts";
import { RoomHistory, type RoomLine } from "./rooms.ts";
import { ConnectionStore } from "./state.ts";

const log = (msg: string) => console.log(`[ferri ${new Date().toISOString()}] ${msg}`);

await runMigrations();
const { db, close } = createDb();
const store = await ConnectionStore.open(db, config.legacyStateDir);

const agent = new SwitchAgent({
  baseUrl: config.switchUrl,
  agentId: config.agentId,
  apiKey: config.agentKey,
  connectionId: store.connectionId,
  cursor: store.cursor,
  clientName: "ferri",
  clientVersion: "0.9.0",
  log,
});

// Admin Gateway session (from ../switch/.env): the knowledge mirror, and which bridge is which platform.
const gateway = await gatewayFromEnv(config.switchEnvFile);
const bridgeType = gateway ? bridgeTypesFrom(() => gateway.bridges()) : undefined;

const roomInfo = new Map<string, RoomInfo>();
async function room(roomId: string): Promise<RoomInfo> {
  const cached = roomInfo.get(roomId);
  if (cached) return cached;
  try {
    const detail = await agent.op<RoomDetail>("get_room_detail", { room_id: roomId });
    const info = { name: detail?.name ?? roomId, platform: await roomPlatform(detail, bridgeType) };
    roomInfo.set(roomId, info);
    return info;
  } catch {
    return { name: roomId, platform: null };
  }
}

interface ContextEntry {
  id?: string;
  sender_name?: string;
  sender?: string;
  body?: string;
  timestamp?: number;
  kind?: string;
}

const rooms = new RoomHistory(async (roomId) => {
  const ctx = await agent.op<{ threads: { root: ContextEntry; replies: ContextEntry[] }[] }>("read_context", {
    room_id: roomId,
    limit: 30,
  });
  const lines: RoomLine[] = [];
  for (const t of ctx?.threads ?? []) {
    for (const e of [t.root, ...t.replies]) {
      if (e.kind !== "message" || !e.body || !e.id) continue;
      const fromFerri = e.sender === config.agentId || e.sender_name?.toLowerCase() === "ferri";
      lines.push({
        id: e.id,
        senderId: e.sender ?? "",
        sender: fromFerri ? "Ferri" : (e.sender_name ?? e.sender ?? "someone"),
        body: e.body,
        timestamp: e.timestamp ?? 0,
        fromFerri,
      });
    }
  }
  return lines;
});

// Skills are read on every question (from Desk's edits, else the files), so an edit applies without a restart.
const prompts = createPrompts({ db });

// Spaces: ask Switch which rooms Ferri is in, now and every minute. New rooms land in Discovered, Off.
const roomCache = new Map<string, { roomId: string; name: string; platform: string | null }>();
async function discover(): Promise<void> {
  try {
    const community = await findCommunity(db, config.community);
    if (!community) return;
    const r = await discoverSpaces(db, agent, community.id, roomCache, bridgeType);
    if (r.added.length || r.archived) log(`spaces: ${r.rooms} room(s); new: ${r.added.join(", ") || "none"}; archived: ${r.archived}`);
  } catch (err) {
    log(`space discovery failed: ${(err as Error).message}`);
  }
}

// The Switch library mirror follows the knowledge, whether Ferri or Desk changed it.
let mirrorSignature = "";
async function watchMirror(): Promise<void> {
  if (!gateway) return;
  try {
    const community = await findCommunity(db, config.community);
    if (!community) return;
    const [sig] = await db
      .select({ last: sql<string>`coalesce(max(${knowledgeEntries.updatedAt})::text, '')`, n: sql<number>`count(*)::int` })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.communityId, community.id));
    const roomIds = await attachedRoomIds(db, community.id);
    const signature = `${sig?.last}|${sig?.n}|${roomIds.sort().join(",")}`;
    if (signature === mirrorSignature) return;
    const kb = await loadLiveKnowledge(db, config.community);
    if (!kb) return;
    const r = await mirrorToSwitch({ db, gateway, kb, roomIds });
    if (mirrorSignature) log(`mirror updated (${r.bytes} bytes, ${roomIds.length} room(s))`);
    mirrorSignature = signature;
  } catch (err) {
    log(`mirror update failed: ${(err as Error).message}`);
  }
}

const loop = createLoop({ db, agent, skillsFor: prompts.skillsFor, room, log });
const launch = createLaunch({ db, agent, loop, room, log });
loop.setAnnounceHooks(launch.hooks);
const plan = createPlan({ db, agent, loop, gateway: gateway ?? null, room, log });
loop.setPlanHooks(plan.hooks);
const builder = createBuilder({ db, agent, loop, gateway: gateway ?? null, log });
const outreach = createOutreach({ db, agent, loop, room, log });
loop.setOutreachHooks(outreach.hooks);
builder.setProspectsHook(outreach.prospectsReady);
const care = createCare({ db, agent, loop, builder, room, log });
loop.setCareHooks(care.hooks);
builder.setHelpHooks(care.helpHooks);
const guests = createGuests({ db, agent, loop, room, log });
loop.setGuestHooks(guests.sendHooks, guests.spotHooks);
outreach.setGuestsHook(guests);
builder.setSiteGuestHook(guests.siteEvent);
log(outreach.enabled ? `email: on, from ${outreach.mailbox}` : "email: off (no RESEND_API_KEY)");
const wrap = createWrap({ db, agent, loop, launch, builder, gateway: gateway ?? null, prompts, room, log });
loop.setKindHooks("wrap", wrap.hooks);
const desks = createDesks({ db, agent, loop, builder, gateway: gateway ?? null, prompts, room, log });
loop.setKindHooks("desk", desks.hooks);
prompts.setDeskSkill(desks.skillFor);
const settings = createSettings({ db, prompts, room, log });
const social = createSocial({ db, agent, loop, prompts, room, log });
loop.setKindHooks("social", social.hooks);
log(social.enabled ? `social: on (Buffer)${social.mediaEnabled ? ", images on the media host" : ", no media host"}` : "social: off (no BUFFER_API_KEY)");
const onMessage = createFlow({ db, agent, rooms, loop, launch, plan, builder, outreach, care, guests, wrap, desks, settings, social, prompts, room, log });
const stopLoop = loop.start();
const shield = await createShield({ db, loop, log }).start();
await discover();
const timers = [
  setInterval(() => void discover(), config.discoveryMs),
  setInterval(() => void watchMirror(), config.mirrorWatchMs),
  // Announcements written in Desk or Pocket, scheduled posts, held edits, crew reminders.
  setInterval(() => void launch.tick(), config.ladderTickMs),
  // Plan stage: deadlines, items added in Desk, the plan document in Switch.
  setInterval(() => void plan.tick(), config.ladderTickMs),
  // Builder: jobs queued in Desk (or waiting for the machine), cancellations.
  setInterval(() => void builder.tick(), config.ladderTickMs),
  // Outreach: emails Desk asked for, replies and delivery events from the webhook.
  setInterval(() => void outreach.tick(), config.ladderTickMs),
  // Care: Desk and Pocket actions on cases, cards held by the pause, check-ins, the Builder's rooms.
  setInterval(() => void care.tick(), config.ladderTickMs),
  // RSVP: guest syncs (Luma, the site), RSVP answers, the waitlist, sends to guests, Ferri's own proposals.
  setInterval(() => void guests.tick(), config.ladderTickMs),
  // Wrap: Ferri's own wrap proposal after the end, closes and reopens asked for in Desk.
  setInterval(() => void wrap.tick(), config.ladderTickMs),
  // Desks: desks and packs asked for in Desk, sheet documents.
  setInterval(() => void desks.tick(), config.ladderTickMs),
  // Social: posts Desk asked for, deletes, scheduled posts that went out, images to remove.
  setInterval(() => void social.tick(), config.ladderTickMs),
];
void launch.tick();
void watchMirror();

const shutdown = async () => {
  log("shutting down");
  agent.stop();
  stopLoop();
  shield?.close();
  for (const t of timers) clearInterval(t);
  await store.flush();
  await close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

log(
  `starting; agent ${config.agentId}, connection ${store.connectionId}, cursor ${store.cursor ?? "head"}, ` +
    `answers ${config.modelMain.model}/${config.modelMain.effort}, triage ${config.modelFast.model}/${config.modelFast.effort}`,
);
await agent.run({
  onConnected: (s) => log(`connected; ${s.rooms.length} room(s), cursor ${s.cursor}, beat ${s.heartbeat_interval_seconds ?? "?"}s`),
  onCursor: (c) => store.setCursor(c),
  onEvent: async (ev, gap) => {
    if (gap) log(`gap before #${ev.sequence}: ${gap.reason}`);
    // Not awaited: a slow model call must not hold up the stream.
    if (ev.type === "message") void onMessage(ev).catch((err) => log(`message failed: ${(err as Error).message}`));
  },
});
