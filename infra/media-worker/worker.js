// Ferri media host (spec 18): a Cloudflare Worker with Workers KV.
// Buffer fetches a post's image from a public URL when the post goes out, so
// Ferri puts each image here first and deletes it once the post is sent.
//
//   PUT    /<key>   body = the image, Authorization: Bearer <MEDIA_SECRET>, x-ttl-days (optional, default 30)
//   DELETE /<key>   Authorization: Bearer <MEDIA_SECRET>
//   GET    /<key>   public, the image with its content type
//
// Keys are long random names Ferri makes, so a URL cannot be guessed.

const MAX_BYTES = 20 * 1024 * 1024;
const KEY = /^[A-Za-z0-9_-]{16,80}\.(jpg|jpeg|png|webp|gif)$/;

function authorized(request, env) {
  const got = request.headers.get("authorization") || "";
  const want = `Bearer ${env.MEDIA_SECRET}`;
  if (!env.MEDIA_SECRET || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\/+/, "");
    if (!key) return new Response("Ferri media", { status: 200 });
    if (!KEY.test(key)) return new Response("not found", { status: 404 });

    if (request.method === "GET" || request.method === "HEAD") {
      const { value, metadata } = await env.MEDIA.getWithMetadata(key, { type: "arrayBuffer" });
      if (!value) return new Response("not found", { status: 404 });
      return new Response(request.method === "HEAD" ? null : value, {
        headers: { "content-type": metadata?.type || "image/jpeg", "cache-control": "public, max-age=300", "content-length": String(value.byteLength) },
      });
    }
    if (!authorized(request, env)) return new Response("unauthorized", { status: 401 });

    if (request.method === "PUT") {
      const body = await request.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_BYTES) return new Response("bad size", { status: 413 });
      const type = request.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) return new Response("images only", { status: 415 });
      const days = Math.min(90, Math.max(1, Number(request.headers.get("x-ttl-days") || 30)));
      await env.MEDIA.put(key, body, { metadata: { type }, expirationTtl: days * 86400 });
      return Response.json({ ok: true, url: `${url.origin}/${key}`, bytes: body.byteLength });
    }
    if (request.method === "DELETE") {
      await env.MEDIA.delete(key);
      return Response.json({ ok: true });
    }
    return new Response("method not allowed", { status: 405 });
  },
};
