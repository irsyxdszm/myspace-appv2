const CACHE = "us-app-v9";
const SHELL = ["/", "/index.html", "/style.css", "/calendar.css", "/app.js", "/core.js", "/tasks.js", "/restock.js",
  "/calendar.js", "/home.js", "/chat.js", "/chat.css", "/money.js", "/money.css", "/recipes.js", "/lists.css", "/memories.js", "/memories.css", "/push.js", "/push-config.js", "/more.js", "/firebase-config.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});

// ---- Alerts (push notifications) ----
self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data ? e.data.text() : "" } }; }
  const d = p.data || {}, n = p.notification || {};
  const title = d.title || n.title || "Us";
  const options = { body: d.body || n.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: d.url || "/" } };
  if (d.tag) options.tag = d.tag;
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const c of wins) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
