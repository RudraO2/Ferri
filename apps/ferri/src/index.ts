import { SwitchAgent, type MessageEvent } from "@ferri/switch";
import { config } from "./config.js";
import { ConnectionStore } from "./state.js";
import { reply, type TranscriptLine } from "./brain.js";

const log = (msg: string) => console.log(`[ferri ${new Date().toISOString()}] ${msg}`);

const store = new ConnectionStore(config.stateDir);
const agent = new SwitchAgent({
  baseUrl: config.switchUrl,
  agentId: config.agentId,
  apiKey: config.agentKey,
  connectionId: store.connectionId,
  cursor: store.cursor,
  clientName: "ferri",
  clientVersion: "0.1.0",
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
  sender_name?: string;
  sender?: string;
  body?: string;
  timestamp?: number;
  kind?: string;
}

async function history(roomId: string, excludeId: string): Promise<TranscriptLine[]> {
  const ctx = await agent.op<{ threads: { root: ContextEntry & { id?: string }; replies: (ContextEntry & { id?: string })[] }[] }>(
    "read_context",
    { room_id: roomId, limit: 30 },
  );
  const lines: TranscriptLine[] = [];
  for (const t of ctx?.threads ?? []) {
    for (const e of [t.root, ...t.replies]) {
      if (e.kind !== "message" || e.id === excludeId || !e.body) continue;
      lines.push({ sender: e.sender_name ?? e.sender ?? "someone", body: e.body, timestamp: e.timestamp ?? 0 });
    }
  }
  return lines.sort((a, b) => a.timestamp - b.timestamp);
}

function isOwnMessage(ev: MessageEvent): boolean {
  const name = ev.payload.sender_name?.toLowerCase();
  return name === "ferri" || ev.payload.sender_kind === "platform";
}

async function onMessage(ev: MessageEvent): Promise<void> {
  const p = ev.payload;
  if (isOwnMessage(ev)) return;
  if (!p.addressed) return; // Spec 01: answer only when mentioned.
  if (Date.now() - p.timestamp > config.maxReplyAgeMs) {
    log(`skip stale message ${p.message_id} in ${ev.room_id}`);
    return;
  }

  log(`addressed by ${p.sender_name} in ${ev.room_id}: ${p.body.slice(0, 120)}`);
  await agent.setTyping(ev.room_id, true).catch(() => {});
  try {
    const [name, past] = await Promise.all([roomName(ev.room_id), history(ev.room_id, p.message_id).catch(() => [])]);
    const text = await reply({ roomName: name, history: past, from: p.sender_name, message: p.body });
    if (text) {
      await agent.sendMessage(ev.room_id, text);
      log(`replied in ${ev.room_id}`);
    } else {
      log(`no reply (model declined) for ${p.message_id}`);
    }
  } finally {
    await agent.setTyping(ev.room_id, false).catch(() => {});
  }
}

const shutdown = () => {
  log("shutting down");
  agent.stop();
  store.flush();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`starting; agent ${config.agentId}, connection ${store.connectionId}, cursor ${store.cursor ?? "head"}`);
await agent.run({
  onConnected: (s) => log(`connected; ${s.rooms.length} room(s), cursor ${s.cursor}, beat ${s.heartbeat_interval_seconds ?? "?"}s`),
  onCursor: (c) => store.setCursor(c),
  onEvent: async (ev, gap) => {
    if (gap) log(`gap before #${ev.sequence}: ${gap.reason}`);
    // Not awaited: a slow model call must not hold up the stream.
    if (ev.type === "message") void onMessage(ev).catch((err) => log(`reply failed: ${(err as Error).message}`));
  },
});
