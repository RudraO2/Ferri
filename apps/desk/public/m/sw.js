// Ferri Pocket service worker (scope /m, which covers /m itself and /m/...). Shows Ferri's push notifications,
// opens the card when one is tapped, and keeps a tiny offline page.
const OFFLINE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ferri Pocket</title><body style="font-family:system-ui;padding:32px;color:#18181b;background:#fafafa">
<h1 style="font-size:20px">You are offline</h1><p style="color:#71717a">Pocket needs a connection to answer cards. It reloads when you are back.</p>
<script>addEventListener("online",()=>location.reload())</script>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Ferri", body: event.data ? event.data.text() : "" };
  }
  const tag = data.tag || undefined;
  const show = self.registration.showNotification(data.title || "Ferri", {
    body: data.body || "",
    tag,
    renotify: Boolean(tag && data.renotify),
    silent: data.renotify === false,
    icon: "/m/icon/192",
    badge: "/m/icon/96",
    requireInteraction: data.kind === "escalate",
    data: { url: data.url || "/m", kind: data.kind, cardId: data.cardId || null },
  });
  // Open Pocket windows refresh, so the list matches the buzz.
  const tell = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: "ferri-push", kind: data.kind, cardId: data.cardId || null })));
  event.waitUntil(Promise.all([show, tell]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/m", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(`${self.location.origin}/m`) && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
