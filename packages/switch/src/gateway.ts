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
