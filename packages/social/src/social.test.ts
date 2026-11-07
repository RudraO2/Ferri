import { describe, expect, it } from "vitest";
import { BufferClient, BufferError, checkText, mediaHostFromEnv, postInput, xLength } from "./index.ts";

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("postInput", () => {
  it("maps when, image and Instagram metadata", () => {
    const at = new Date("2026-11-20T04:30:00Z");
    expect(postInput({ channelId: "c1", service: "instagram", text: "Hi", imageUrl: "https://x/p.jpg", when: { mode: "at", dueAt: at } })).toEqual({
      channelId: "c1",
      text: "Hi",
      schedulingType: "automatic",
      mode: "customScheduled",
      dueAt: "2026-11-20T04:30:00.000Z",
      assets: [{ image: { url: "https://x/p.jpg", metadata: { altText: "Event poster" } } }],
      metadata: { instagram: { type: "post", shouldShareToFeed: true } },
    });
    const draft = postInput({ channelId: "c2", service: "linkedin", text: "Hi", when: { mode: "draft" } });
    expect(draft).toMatchObject({ saveToDraft: true, mode: "addToQueue", assets: [] });
    expect(draft.metadata).toBeUndefined();
    expect(postInput({ channelId: "c3", service: "twitter", text: "Hi", when: { mode: "now" } }).mode).toBe("shareNow");
  });
});

describe("checkText", () => {
  it("counts X links as 23 and needs an image on Instagram", () => {
    expect(xLength(`${"a".repeat(250)} https://example.com/a/very/long/link/that/is/long`)).toBe(274);
    expect(checkText("twitter", "a".repeat(281), { image: false })[0]).toMatch(/280/);
    expect(checkText("instagram", "hello", { image: false })).toEqual(["Instagram needs an image"]);
    expect(checkText("linkedin", "hello", { image: false })).toEqual([]);
  });
});

describe("BufferClient", () => {
  it("lists channels per organization with the bearer key", async () => {
    const f = fakeFetch([
      { body: { data: { account: { organizations: [{ id: "o1", name: "Mine", ownerEmail: "a@b" }] } } } },
      { body: { data: { channels: [{ id: "c1", name: "rudra", displayName: null, service: "linkedin", avatar: null, isQueuePaused: false, isDisconnected: false, isLocked: false }] } } },
    ]);
    const all = await new BufferClient("k", f.impl).allChannels();
    expect(all).toMatchObject([{ id: "c1", service: "linkedin", organizationId: "o1", organizationName: "Mine" }]);
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("throws typed and top-level errors", async () => {
    const f = fakeFetch([
      { body: { data: { createPost: { message: "Text is required" } } } },
      { status: 401, body: { data: null, errors: [{ message: "Not authorized", extensions: { code: "UNAUTHORIZED" } }] } },
    ]);
    const c = new BufferClient("k", f.impl);
    await expect(c.createPost({ channelId: "c", service: "twitter", text: "", when: { mode: "draft" } })).rejects.toMatchObject({ code: "MUTATION", message: "Text is required" });
    const err = await c.organizations().catch((e) => e);
    expect(err).toBeInstanceOf(BufferError);
    expect(err).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });
});

describe("mediaHostFromEnv", () => {
  it("is off unless both the URL and the secret are set", () => {
    expect(mediaHostFromEnv({})).toBeNull();
    expect(mediaHostFromEnv({ FERRI_MEDIA_SECRET: "s" })).toBeNull();
    expect(mediaHostFromEnv({ FERRI_MEDIA_URL: "https://media.example.com" })).toBeNull();
    const host = mediaHostFromEnv({ FERRI_MEDIA_URL: "https://media.example.com/", FERRI_MEDIA_SECRET: "s" });
    expect(host?.url("abc.jpg")).toBe("https://media.example.com/abc.jpg");
  });
});
