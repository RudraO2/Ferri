/**
 * A small client for the Switch Gateway admin API (mounted at /gateway on the
 * core port). Signs in with an email and password and keeps the session cookie.
 * Used for things agents cannot do through ops, such as library documents.
 */
export interface GatewayMe {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface GatewayRoom {
  id: string;
  name: string;
  description: string;
  channel_type: string | null;
  agent_count: number;
  connected_user_count: number;
  bridge_id: string | null;
  bridge_display_name: string | null;
  bridge_type?: string | null;
}

/** Options for tests and health checks: a stand-in fetch, and a timeout per request. */
export interface GatewayClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class GatewayClient {
  private cookie = "";

  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly password: string,
    private readonly opts: GatewayClientOptions = {},
  ) {}

  /** A client for an existing session (Desk keeps the person's Gateway cookie). It cannot sign in again. */
  static withSession(baseUrl: string, cookie: string): GatewayClient {
    const c = new GatewayClient(baseUrl, "", "");
    c.cookie = cookie;
    return c;
  }

  /** The session cookie, so a caller can keep it (encrypted) and act as this person later. */
  get session(): string {
    return this.cookie;
  }

  async me(): Promise<GatewayMe> {
    return this.call<GatewayMe>("GET", "/gateway/auth/me");
  }

  /**
   * Answer a question card as the signed-in person. Switch records them as
   * `user:<id>`, edits the card, and reports the outcome to the agent.
   */
  async answerCard(
    agentId: string,
    sessionId: string,
    requestId: string,
    answers: { question_id: string; selected_option_ids: string[]; custom_text: string | null }[],
  ): Promise<unknown> {
    return this.call(
      "POST",
      `/gateway/agent-sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}/answer`,
      { answers },
    );
  }

  /** The messaging-app connections (admin): which bridge is Slack, Discord, Telegram, ... */
  async bridges(): Promise<{ bridge_id: string; bridge_type: string; display_name: string }[]> {
    return this.call("GET", "/gateway/collaborations");
  }

  /** Every room this person can read (admin: all of them), with its bridge platform. */
  async rooms(): Promise<GatewayRoom[]> {
    return this.call("GET", "/gateway/rooms");
  }

  /** Add agents to a room (needs write access to the room). */
  async addAgentsToRoom(roomId: string, agentIds: string[]): Promise<unknown> {
    return this.call("POST", `/gateway/rooms/${encodeURIComponent(roomId)}/agents`, { agent_ids: agentIds });
  }

  async login(): Promise<void> {
    const res = await this.raw("POST", "/gateway/auth/login", { email: this.email, password: this.password });
    if (res.status >= 300) throw new Error(`gateway sign-in failed: HTTP ${res.status} ${await res.text()}`);
  }

  /** JSON call. Signs in on first use and again once if the session expired. */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.cookie) await this.login();
    let res = await this.raw(method, path, body);
    if (res.status === 401 && this.password) {
      await this.login();
      res = await this.raw(method, path, body);
    }
    const text = await res.text();
    if (res.status >= 300) throw new GatewayError(res.status, text, `${method} ${path}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async raw(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await (this.opts.fetch ?? fetch)(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...(this.opts.timeoutMs ? { signal: AbortSignal.timeout(this.opts.timeoutMs) } : {}),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    return res;
  }
}

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string,
  ) {
    super(`${what} failed: HTTP ${status} ${body.slice(0, 300)}`);
  }
}

/**
 * A Gateway client from the environment: SWITCH_URL, SWITCH_ADMIN_EMAIL and
 * SWITCH_ADMIN_PASSWORD, falling back (like `pnpm setup:switch`) to the
 * GATEWAY_ADMIN_PASSWORD of a Switch checkout's .env next to the repo.
 * Null when no password can be found.
 */
export async function gatewayFromEnv(siblingSwitchEnv?: string, env = process.env): Promise<GatewayClient | null> {
  let password = env.SWITCH_ADMIN_PASSWORD;
  if (!password && siblingSwitchEnv) {
    const fs = await import("node:fs");
    if (fs.existsSync(siblingSwitchEnv)) {
      password = /^GATEWAY_ADMIN_PASSWORD=(.*)$/m.exec(fs.readFileSync(siblingSwitchEnv, "utf8"))?.[1]?.trim();
    }
  }
  if (!password) return null;
  return new GatewayClient(env.SWITCH_URL ?? "http://localhost:8000", env.SWITCH_ADMIN_EMAIL ?? "admin@switch.local", password);
}
