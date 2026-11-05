import { createDb, runMigrations } from "@ferri/db";
import { loadLiveKnowledge, loadSkills, mirrorToSwitch } from "@ferri/knowledge";
import { SwitchAgent, gatewayFromEnv } from "@ferri/switch";
import { config } from "./config.js";
import { createFlow } from "./flow.js";
import { createLoop, type RoomInfo } from "./loop.js";
import { RoomHistory, type RoomLine } from "./rooms.js";
import { ConnectionStore } from "./state.js";

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
  clientVersion: "0.3.0",
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

// The Switch library mirror, refreshed a few seconds after the knowledge changes.
const gateway = await gatewayFromEnv(config.switchEnvFile);
let mirrorTimer: NodeJS.Timeout | null = null;
function mirrorSoon(): void {
  if (!gateway || !config.mirrorRoomIds.length || mirrorTimer) return;
  mirrorTimer = setTimeout(async () => {
    mirrorTimer = null;
    try {
      const kb = await loadLiveKnowledge(db, config.community);
      if (kb) {
        const r = await mirrorToSwitch({ db, gateway, kb, roomIds: config.mirrorRoomIds });
        log(`mirror updated (${r.bytes} bytes)`);
      }
    } catch (err) {
      log(`mirror update failed: ${(err as Error).message}`);
    }
  }, 3000);
}

const loop = createLoop({ db, agent, skills, room, mirrorSoon, log });
const onMessage = createFlow({ db, agent, rooms, loop, skills, room, log });
const stopLoop = loop.start();

const shutdown = async () => {
  log("shutting down");
  agent.stop();
  stopLoop();
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
