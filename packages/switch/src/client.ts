import { SseParser } from "./sse.ts";
import type { ApprovalView, ConnectionState, DomainEvent, GapFrame, OpenQuestionsCard } from "./types.ts";

export interface SwitchAgentOptions {
  /** Agent bridge base URL, e.g. http://localhost:8000 */
  baseUrl: string;
  agentId: string;
  apiKey: string;
  /** Kept across restarts so the connection survives (see agent-protocol.md). */
  connectionId: string;
  /**
   * Sequence to resume after, as the decimal string from the SSE `id:` line.
   * Undefined means "head". Kept as a string: Switch sequence numbers sit near
   * 2^53, past which a JS number silently loses precision.
   */
  cursor?: string;
  clientName?: string;
  clientVersion?: string;
  log?: (msg: string) => void;
}

export interface StreamHandlers {
  onEvent: (event: DomainEvent, gap: GapFrame | null) => void | Promise<void>;
  onConnected?: (state: ConnectionState) => void;
  /** Called after each event is handled, so the caller can persist it. */
  onCursor?: (cursor: string) => void;
}

export class SwitchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string,
  ) {
    super(`${what} failed: HTTP ${status} ${body.slice(0, 300)}`);
  }
}

/**
 * A small client for the Switch agent protocol:
 * one SSE stream down (all rooms), heartbeat and operations up over HTTP.
 */
export class SwitchAgent {
  private cursor: string | undefined;
  private stopped = false;
  private abort: AbortController | null = null;
  private beatTimer: NodeJS.Timeout | null = null;
  private pendingGap: GapFrame | null = null;
  /** Rooms Ferri's per-room sessions have connected to (see roomOp). */
  private readonly roomSessions = new Set<string>();
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: SwitchAgentOptions) {
    this.cursor = opts.cursor;
    this.log = opts.log ?? (() => {});
  }

  get agentId(): string {
    return this.opts.agentId;
  }

  // ── Up: HTTP ───────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    rawBody?: string,
  ): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        ...(body !== undefined || rawBody !== undefined ? { "content-type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    if (!res.ok) throw new SwitchHttpError(res.status, text, `${method} ${path}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Call a Switch operation. Arguments go unwrapped in the body. */
  async op<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const out = await this.request<{ result: T }>(
      "POST",
      `/agents/${this.opts.agentId}/ops/${name}`,
      args,
      // Optional: it binds the call to a room. A one-off caller (the kb CLI) has no live connection.
      this.opts.connectionId ? { "x-switch-connection-id": this.opts.connectionId } : {},
    );
    return out.result;
  }

  /**
   * Call an operation that acts on one room (`send_targeted_message`,
   * `read_context` without a room id, room documents, ...). Ferri's connection
   * covers every room, so Switch would refuse ("This connection covers several
   * rooms"). A session selector fixes that: a session of Ferri's own per room
   * (`X-Switch-Session-Id`) connects to that room once, and every call naming
   * it is bound to that room alone (`resolve_caller` in Switch's operations API).
   */
  async roomOp<T = unknown>(roomId: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.opts.connectionId) throw new Error("roomOp needs a live connection id");
    const headers = { "x-switch-connection-id": this.opts.connectionId, "x-switch-session-id": `ferri-room-${roomId}` };
    const call = (op: string, body: Record<string, unknown>) =>
      this.request<{ result: unknown }>("POST", `/agents/${this.opts.agentId}/ops/${op}`, body, headers);
    for (let attempt = 0; ; attempt++) {
      if (!this.roomSessions.has(roomId)) {
        await call("connect_to_room", { room_id: roomId, include_general_instructions: false });
        this.roomSessions.add(roomId);
      }
      try {
        return (await call(name, args)).result as T;
      } catch (err) {
        // Switch restarted, or the connection was opened afresh: connect the session again, once.
        if (attempt === 0 && err instanceof SwitchHttpError && /not connected/i.test(err.body)) {
          this.roomSessions.delete(roomId);
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * An addressed message (`send_targeted_message`): Switch prepends `@name` for
   * each target, so each named agent gets it as addressed and a managed agent
   * (the Builder) starts a session for it. Returns each agent's reachability.
   */
  async sendTargetedMessage(
    roomId: string,
    body: string,
    targetNames: string[],
    threadId?: string,
  ): Promise<{ event_id: string; target_statuses: Record<string, string> }> {
    return this.roomOp(roomId, "send_targeted_message", {
      body,
      target_names: targetNames,
      ...(threadId ? { thread_id: threadId } : {}),
    });
  }

  /** Put another agent in a room by its registry name (`invite_agent_to_room`). */
  async inviteAgentToRoom(roomId: string, agentName: string): Promise<void> {
    await this.op("invite_agent_to_room", { room_id: roomId, agent_name: agentName });
  }

  /** Post a top-level message to a room. Needs no room claim. */
  async sendMessage(roomId: string, content: string): Promise<string> {
    const out = await this.request<{ ok: boolean; event_id: string }>(
      "POST",
      `/agents/${this.opts.agentId}/message`,
      { room_id: roomId, content },
    );
    return out.event_id;
  }

  /**
   * Edit a message this agent posted, where the room's bridge relayed it.
   * Needs Ferri's Switch fork (`POST /agents/{id}/messages/{event_id}/edit`).
   * False: the message never reached a platform, so nothing was redrawn.
   */
  async editMessage(roomId: string, eventId: string, content: string): Promise<boolean> {
    const out = await this.request<{ ok: boolean; edited: boolean }>(
      "POST",
      `/agents/${this.opts.agentId}/messages/${encodeURIComponent(eventId)}/edit`,
      { room_id: roomId, content },
    );
    return out.edited;
  }

  async setTyping(roomId: string, isTyping: boolean): Promise<void> {
    await this.request("POST", `/agents/${this.opts.agentId}/typing`, { room_id: roomId, is_typing: isTyping });
  }

  // ── Question cards ────────────────────────────────────────────────────────
  // The session id is ours to choose; no session needs to be started first.

  /** Open a questions card in a room. Re-opening with the same content is a no-op. */
  async openQuestionsCard(sessionId: string, card: OpenQuestionsCard): Promise<ApprovalView> {
    return this.request<ApprovalView>("POST", `/agent-sessions/${encodeURIComponent(sessionId)}/approvals`, {
      kind: "questions",
      options: [],
      ...card,
    });
  }

  /** Withdraw an open card (it then reads "closed" on the platform). Closing a settled one changes nothing. */
  async closeCard(sessionId: string, requestId: string): Promise<ApprovalView> {
    return this.request<ApprovalView>(
      "POST",
      `/agent-sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}/close`,
    );
  }

  /** Answered and expired cards not yet acknowledged, oldest first. */
  async cardOutcomes(): Promise<ApprovalView[]> {
    return this.request<ApprovalView[]>("GET", "/agent-sessions/approvals/outcomes");
  }

  /** Acknowledge an outcome so it is not reported again. */
  async markCardDelivered(sessionId: string, requestId: string): Promise<ApprovalView> {
    return this.request<ApprovalView>(
      "POST",
      `/agent-sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}/delivered`,
    );
  }

  // ── Down: the event stream ────────────────────────────────────────────────

  /** Runs until stop(). Reconnects with the same connection id on any drop. */
  async run(handlers: StreamHandlers): Promise<void> {
    let backoff = 1000;
    while (!this.stopped) {
      try {
        await this.openOnce(handlers);
        backoff = 1000;
      } catch (err) {
        if (this.stopped) break;
        this.log(`stream error: ${(err as Error).message}; reconnecting in ${backoff} ms`);
      }
      this.stopHeartbeat();
      if (this.stopped) break;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }

  stop(): void {
    this.stopped = true;
    this.stopHeartbeat();
    this.abort?.abort();
  }

  private async openOnce(handlers: StreamHandlers): Promise<void> {
    const params = new URLSearchParams({
      connection_id: this.opts.connectionId,
      scope: "all",
      filter: "all",
      start_from: this.cursor ?? "head",
      client: this.opts.clientName ?? "ferri",
      client_version: this.opts.clientVersion ?? "0.1.0",
    });
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.opts.apiKey}`,
      accept: "text/event-stream",
    };
    if (this.cursor !== undefined) headers["last-event-id"] = this.cursor;

    this.abort = new AbortController();
    const res = await fetch(`${this.opts.baseUrl}/agents/${this.opts.agentId}/events?${params}`, {
      headers,
      signal: this.abort.signal,
    });
    if (!res.ok || !res.body) {
      throw new SwitchHttpError(res.status, await res.text(), "open event stream");
    }

    const parser = new SseParser();
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("event stream closed by server");
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        await this.handleFrame(frame.event, frame.data, frame.id, handlers);
      }
    }
  }

  private async handleFrame(kind: string, data: string, id: string | undefined, handlers: StreamHandlers): Promise<void> {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.log(`unparseable ${kind} frame dropped`);
      return;
    }
    switch (kind) {
      case "connection_state": {
        const state = parsed as ConnectionState;
        // The raw text keeps every digit; JSON.parse may not.
        const raw = /"cursor"\s*:\s*(\d+)/.exec(data)?.[1];
        if (raw && (this.cursor === undefined || isAfter(raw, this.cursor))) this.cursor = raw;
        this.startHeartbeat((state.heartbeat_interval_seconds ?? 2) * 1000);
        handlers.onConnected?.(state);
        return;
      }
      case "gap":
        // Not a wake: attach to the next event (agent-protocol.md, "gap").
        this.pendingGap = parsed as GapFrame;
        return;
      case "evicted":
        throw new Error(`evicted: ${parsed.reason ?? "unknown"}`);
      case "subscription_changed":
      case "room_released":
        return;
      default: {
        const event = parsed as DomainEvent;
        if (typeof event.sequence !== "number" || !id) return;
        const gap = this.pendingGap;
        this.pendingGap = null;
        try {
          await handlers.onEvent(event, gap);
        } catch (err) {
          this.log(`handler failed on #${event.sequence}: ${(err as Error).message}`);
        }
        this.cursor = id;
        handlers.onCursor?.(id);
      }
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    const beat = async () => {
      try {
        // Built by hand so the cursor goes out with every digit intact.
        const body = `{"connection_id":${JSON.stringify(this.opts.connectionId)},"cursor":${this.cursor ?? "0"}}`;
        await this.request("POST", `/agents/${this.opts.agentId}/connection/beat`, undefined, undefined, body);
      } catch (err) {
        if (err instanceof SwitchHttpError && (err.status === 404 || err.status === 409)) {
          // Both mean "reopen", not "back off" (agent-protocol.md, heartbeat).
          this.log(`heartbeat ${err.status}; reopening stream`);
          this.abort?.abort();
        } else {
          this.log(`heartbeat failed: ${(err as Error).message}`);
        }
      }
    };
    this.beatTimer = setInterval(beat, intervalMs);
    void beat();
  }

  private stopHeartbeat(): void {
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.beatTimer = null;
  }
}

/** Compare two non-negative decimal strings without converting to number. */
export function isAfter(a: string, b: string): boolean {
  if (a.length !== b.length) return a.length > b.length;
  return a > b;
}
