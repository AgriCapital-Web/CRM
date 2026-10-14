const CACHE_NAME = "agricapital-crm-v5";
const CACHE_PREFIX = "agricapital-crm-";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(["/", "/index.html", "/manifest-crm.json"]))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {}; try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text?.() || "" }; }
    const openClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (openClients.some((client) => client.visibilityState === "visible")) return;
    const id = payload.notificationId || payload.id || payload.tag || "general";
    await self.registration.showNotification(payload.title || "AgriCapital", { body: payload.body || payload.message || "", icon: payload.icon || "/icons/icon-app.png", badge: payload.badge || "/icons/icon-96x96.png", tag: "agricapital-notification-" + id, renotify: false, data: { ...(payload.data || {}), url: payload.url || payload.data?.route || "/" } });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close(); const target = event.notification.data?.url || event.notification.data?.route || "/";
  event.waitUntil((async () => { const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true }); for (const client of windows) { if ("focus" in client) { await client.focus(); client.postMessage({ type: "OPEN_NOTIFICATION", data: event.notification.data || {} }); return; } } if (self.clients.openWindow) await self.clients.openWindow(target); })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API/business responses: CRM data remains managed by the app/IndexedDB.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("/functions/")
  ) {
    return;
  }

  const isNavigation = request.mode === "navigate";
  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    /\.(?:css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(url.pathname);

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then(
            (cached) =>
              cached ||
              new Response("Application hors connexion", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              })
          )
        )
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
