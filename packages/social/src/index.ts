// ── Social posting for Ferri (spec 18): Buffer's GraphQL API, no SDK ──
//
// One personal API key (publish.buffer.com/settings/api) acts on the whole
// Buffer account: LinkedIn, X and Instagram are channels of an organization.
// Images go by public URL (Buffer has no upload), so the URL must stay live
// until the post is out.

export const BUFFER_API = "https://api.buffer.com";

export interface BufferOrganization {
  id: string;
  name: string;
  ownerEmail: string | null;
}

export interface BufferChannel {
  id: string;
  name: string;
  displayName: string | null;
  /** "linkedin", "twitter", "instagram", ... */
  service: string;
  avatar: string | null;
  isQueuePaused: boolean;
  isDisconnected: boolean;
  isLocked: boolean;
}

export interface BufferPost {
  id: string;
  text: string | null;
  status: string | null;
  dueAt: string | null;
  channelId: string | null;
}

/** "now": share now; "queue": next free slot; "at": `dueAt`; "draft": saved as a draft in Buffer, never posted. */
export type PostWhen = { mode: "now" } | { mode: "queue" } | { mode: "at"; dueAt: Date } | { mode: "draft"; dueAt?: Date | null };

export interface CreatePostInput {
  channelId: string;
  /** The channel's service, for the metadata it needs (Instagram requires a post type). */
  service: string;
  text: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  when: PostWhen;
}

export class BufferError extends Error {
  constructor(
    message: string,
    /** "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMIT_EXCEEDED", "UNEXPECTED", "MUTATION" (a typed error), "HTTP". */
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BufferError";
  }
}

type Fetch = typeof fetch;

export class BufferClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly url = BUFFER_API,
  ) {}

  /** One GraphQL call. Top-level `errors` and HTTP failures throw a BufferError; typed mutation errors are the caller's. */
  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] } | null;
    if (body?.errors?.length) {
      const e = body.errors[0]!;
      throw new BufferError(e.message, e.extensions?.code ?? "UNEXPECTED", res.status);
    }
    if (!res.ok) throw new BufferError(`Buffer answered HTTP ${res.status}`, res.status === 401 ? "UNAUTHORIZED" : "HTTP", res.status);
    if (!body?.data) throw new BufferError("Buffer sent no data", "UNEXPECTED", res.status);
    return body.data;
  }

  async organizations(): Promise<BufferOrganization[]> {
    const d = await this.query<{ account: { organizations: BufferOrganization[] } }>(
      "query Orgs { account { organizations { id name ownerEmail } } }",
    );
    return d.account.organizations;
  }

  async channels(organizationId: string): Promise<BufferChannel[]> {
    const d = await this.query<{ channels: BufferChannel[] }>(
      "query Channels($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service avatar isQueuePaused isDisconnected isLocked } }",
      { org: organizationId },
    );
    return d.channels;
  }

  /** Every channel of every organization the key reaches, with its organization. */
  async allChannels(): Promise<(BufferChannel & { organizationId: string; organizationName: string })[]> {
    const out: (BufferChannel & { organizationId: string; organizationName: string })[] = [];
    for (const o of await this.organizations()) {
      for (const c of await this.channels(o.id)) out.push({ ...c, organizationId: o.id, organizationName: o.name });
    }
    return out;
  }

  async createPost(input: CreatePostInput): Promise<BufferPost> {
    const d = await this.query<{ createPost: { post?: BufferPost; message?: string } }>(
      `mutation Create($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess { post { id text status dueAt channelId } }
          ... on MutationError { message }
        }
      }`,
      { input: postInput(input) },
    );
    if (!d.createPost.post) throw new BufferError(d.createPost.message ?? "Buffer did not create the post", "MUTATION", 200);
    return d.createPost.post;
  }

  async getPost(id: string): Promise<BufferPost> {
    const d = await this.query<{ post: BufferPost }>("query Post($id: PostId!) { post(input: { id: $id }) { id text status dueAt channelId } }", { id });
    return d.post;
  }

  async deletePost(id: string): Promise<void> {
    const d = await this.query<{ deletePost: { id?: string; message?: string } }>(
      `mutation Delete($id: PostId!) {
        deletePost(input: { id: $id }) {
          ... on DeletePostSuccess { id }
          ... on MutationError { message }
        }
      }`,
      { id },
    );
    if (!d.deletePost.id) throw new BufferError(d.deletePost.message ?? "Buffer did not delete the post", "MUTATION", 200);
  }
}

/** The `CreatePostInput` Buffer expects, from ours. */
export function postInput(input: CreatePostInput): Record<string, unknown> {
  const draftAt = input.when.mode === "draft" ? (input.when.dueAt ?? null) : null;
  const modes: Record<PostWhen["mode"], string> = { now: "shareNow", queue: "addToQueue", at: "customScheduled", draft: draftAt ? "customScheduled" : "addToQueue" };
  const out: Record<string, unknown> = {
    channelId: input.channelId,
    text: input.text,
    schedulingType: "automatic",
    mode: modes[input.when.mode],
    assets: input.imageUrl ? [{ image: { url: input.imageUrl, metadata: { altText: input.imageAlt?.trim() || "Event poster" } } }] : [],
  };
  if (input.when.mode === "at") out.dueAt = input.when.dueAt.toISOString();
  if (input.when.mode === "draft") {
    out.saveToDraft = true;
    if (draftAt) out.dueAt = draftAt.toISOString();
  }
  if (input.service === "instagram") out.metadata = { instagram: { type: "post", shouldShareToFeed: true } };
  return out;
}

// ── Texts per network ────────────────────────────────────────────────────

/** X counts every link as 23 characters. */
export const X_LIMIT = 280;
export const LINKEDIN_LIMIT = 3000;
export const INSTAGRAM_LIMIT = 2200;

/** Characters X counts for a text (links as 23). */
export function xLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

/** The problems with one network's text, or [] when it can be posted as is. */
export function checkText(service: string, text: string, opts: { image: boolean }): string[] {
  const t = text.trim();
  const out: string[] = [];
  if (!t) out.push("the text is empty");
  if (service === "twitter" && xLength(t) > X_LIMIT) out.push(`X allows ${X_LIMIT} characters; this has ${xLength(t)}`);
  if (service === "linkedin" && t.length > LINKEDIN_LIMIT) out.push(`LinkedIn allows ${LINKEDIN_LIMIT} characters; this has ${t.length}`);
  if (service === "instagram") {
    if (t.length > INSTAGRAM_LIMIT) out.push(`Instagram allows ${INSTAGRAM_LIMIT} characters; this has ${t.length}`);
    if (!opts.image) out.push("Instagram needs an image");
  }
  return out;
}

export const SERVICE_NAMES: Record<string, string> = {
  twitter: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
};

export const serviceName = (s: string) => SERVICE_NAMES[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

// ── The media host: a Cloudflare Worker with Workers KV (infra/media-worker) ──

/** Buffer takes images only by public URL, at posting time; Ferri keeps each one here until its posts are out. */
export class MediaHost {
  constructor(
    readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  /** A new unguessable key for an image ("k3J...Qx.jpg"). */
  static newKey(ext = "jpg"): string {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${b64}.${ext.replace(/^\./, "").toLowerCase()}`;
  }

  url(key: string): string {
    return `${this.baseUrl.replace(/\/+$/, "")}/${key}`;
  }

  /** Upload an image; it expires by itself after `ttlDays` even if nobody deletes it. */
  async put(key: string, bytes: Uint8Array, mimetype: string, ttlDays = 30): Promise<string> {
    const res = await this.fetchImpl(this.url(key), {
      method: "PUT",
      headers: { authorization: `Bearer ${this.secret}`, "content-type": mimetype, "x-ttl-days": String(ttlDays) },
      body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimetype }),
    });
    if (!res.ok) throw new Error(`media host refused the upload: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    return this.url(key);
  }

  async delete(key: string): Promise<void> {
    const res = await this.fetchImpl(this.url(key), { method: "DELETE", headers: { authorization: `Bearer ${this.secret}` } });
    if (!res.ok && res.status !== 404) throw new Error(`media host refused the delete: HTTP ${res.status}`);
  }
}

/** What to set when the media host is off. */
export const MEDIA_HOST_OFF = "the media host is not set up: deploy infra/media-worker, then set FERRI_MEDIA_URL and FERRI_MEDIA_SECRET";

/** The media host from FERRI_MEDIA_URL and FERRI_MEDIA_SECRET; null (no images on posts) unless both are set. */
export function mediaHostFromEnv(env: Record<string, string | undefined> = process.env): MediaHost | null {
  const url = env.FERRI_MEDIA_URL?.trim();
  const secret = env.FERRI_MEDIA_SECRET?.trim();
  return url && secret ? new MediaHost(url, secret) : null;
}

export function bufferFromEnv(env: Record<string, string | undefined> = process.env): BufferClient | null {
  const key = env.BUFFER_API_KEY?.trim();
  return key ? new BufferClient(key) : null;
}
