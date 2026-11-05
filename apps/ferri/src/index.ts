import { eq, sql } from "drizzle-orm";
import { createDb, knowledgeEntries, runMigrations } from "@ferri/db";
import {
  attachedRoomIds,
  discoverSpaces,
  findCommunity,
  loadLiveKnowledge,
  loadSkills,
  mirrorToSwitch,
} from "@ferri/knowledge";
import { SwitchAgent, gatewayFromEnv } from "@ferri/switch";
import { config } from "./config.ts";
import { createFlow } from "./flow.ts";
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
  clientVersion: "0.4.0",
  log,
});

const roomInfo = new Map<string, RoomInfo>();
async function room(roomId: string): Promise<RoomInfo> {
  const cached = roomInfo.get(roomId);
  if (cached) return cached;
  try {
    const detail = await agent.op<{ name?: string; bridge_display_name?: string }>("get_room_detail", { room_id: roomId });
    const info = { name: detail?.name ?? roomId, platform: detail?.bridge_display_name?.toLowerCase() ?? null };
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

// Read on every question, so a skill edit applies without a restart.
const skills = () => loadSkills(config.skillsDir, ["ferri", "librarian"]);

// Spaces: ask Switch which rooms Ferri is in, now and every minute. New rooms land in Discovered, Off.
const roomCache = new Map<string, { roomId: string; name: string; platform: string | null }>();
async function discover(): Promise<void> {
  try {
    const community = await findCommunity(db, config.community);
    if (!community) return;
    const r = await discoverSpaces(db, agent, community.id, roomCache);
    if (r.added.length || r.archived) log(`spaces: ${r.rooms} room(s); new: ${r.added.join(", ") || "none"}; archived: ${r.archived}`);
  } catch (err) {
    log(`space discovery failed: ${(err as Error).message}`);
  }
}

// The Switch library mirror follows the knowledge, whether Ferri or Desk changed it.
const gateway = await gatewayFromEnv(config.switchEnvFile);
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

const loop = createLoop({ db, agent, skills, room, log });
const onMessage = createFlow({ db, agent, rooms, loop, skills, room, log });
const stopLoop = loop.start();
await discover();
const timers = [setInterval(() => void discover(), config.discoveryMs), setInterval(() => void watchMirror(), config.mirrorWatchMs)];
void watchMirror();

const shutdown = async () => {
  log("shutting down");
  agent.stop();
  stopLoop();
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
