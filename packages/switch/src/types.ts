// Wire types for the Switch agent protocol.
// Source: switch/docs/official/internals/agent-protocol.md (event catalog).

export interface MessagePayload {
  addressed: boolean;
  sender: string;
  sender_name: string;
  /** "platform" when the Switch app itself posted it, else absent. */
  sender_kind?: string;
  on_behalf_of?: string;
  message_id: string;
  body: string;
  timestamp: number;
  thread_id: string | null;
  attachments: unknown[];
}

export interface CommandPayload {
  command: string;
  args: string[];
  user_id: string;
  user_name: string;
  thread_id: string | null;
}

export interface RoomJoinPayload {
  member: string;
  member_name: string;
  timestamp: number;
  listening: boolean;
}

interface DomainEnvelope<T extends string, P> {
  type: T;
  room_id: string;
  bridge_id: string | null;
  channel_type: string | null;
  payload: P;
  sequence: number;
}

export type MessageEvent = DomainEnvelope<"message", MessagePayload>;
export type CommandEvent = DomainEnvelope<"command", CommandPayload>;
export type RoomJoinEvent = DomainEnvelope<"room_join", RoomJoinPayload>;
export type DomainEvent = MessageEvent | CommandEvent | RoomJoinEvent;

export interface ConnectionState {
  connection_id: string;
  agent_id: string;
  scope: "single" | "all";
  filter: "all" | "addressed";
  rooms: string[];
  /** May exceed Number.MAX_SAFE_INTEGER; the client reads the raw text instead. */
  cursor: number;
  heartbeat_interval_seconds?: number;
  [key: string]: unknown;
}

export interface GapFrame {
  from_sequence: number;
  resumed_at: number;
  reason: string;
}

/** One parsed server-sent event. */
export interface SseFrame {
  id?: string;
  event: string;
  data: string;
}
