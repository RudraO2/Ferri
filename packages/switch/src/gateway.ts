/**
 * A small client for the Switch Gateway admin API (mounted at /gateway on the
 * core port). Signs in with an email and password and keeps the session cookie.
 * Used for things agents cannot do through ops, such as library documents.
 */
export class GatewayClient {
  private cookie = "";

  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly password: string,
  ) {}

  async login(): Promise<void> {
    const res = await this.raw("POST", "/gateway/auth/login", { email: this.email, password: this.password });
    if (res.status >= 300) throw new Error(`gateway sign-in failed: HTTP ${res.status} ${await res.text()}`);
  }

  /** JSON call. Signs in on first use and again once if the session expired. */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.cookie) await this.login();
    let res = await this.raw(method, path, body);
    if (res.status === 401) {
      await this.login();
      res = await this.raw(method, path, body);
    }
    const text = await res.text();
    if (res.status >= 300) throw new GatewayError(res.status, text, `${method} ${path}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async raw(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
