import { createDb, runMigrations } from "@ferri/db";
import { loadSkills } from "@ferri/knowledge";
import { SwitchAgent } from "@ferri/switch";
import { config } from "./config.js";
import { createFlow } from "./flow.js";
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
  clientVersion: "0.2.0",
  log,
});

const roomNames = new Map<string, string>();
async function roomName(roomId: string): Promise<string> {
  const cached = roomNames.get(roomId);
  if (cached) return cached;
  try {
    const detail = await agent.op<{ name?: string }>("get_room_detail", { room_id: roomId });
    const name = detail?.name ?? roomId;
    roomNames.set(roomId, name);
    return name;
  } catch {
    return roomId;
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

const onMessage = createFlow({ db, agent, rooms, skills, roomName, log });

const shutdown = async () => {
  log("shutting down");
  agent.stop();
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
