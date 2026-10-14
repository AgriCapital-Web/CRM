const CACHE_NAME = "agricapital-crm-v6";
const CACHE_PREFIX = "agricapital-crm-";
const OFFLINE_DB = "agricapital_offline";
const OFFLINE_DB_VERSION = 10;
const HTTP_QUEUE_STORE = "http_mutations";
const SHELL_URLS = ["/", "/index.html", "/manifest-crm.json", "/logo-agricapital.png"];
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch { /* An individual optional shell asset must not abort installation. */ }
    }));

    // Cache the exact JS/CSS bundles referenced by the current HTML so the
    // first offline launch does not depend on a later lazy network request.
    try {
      const htmlResponse = await cache.match("/index.html");
      const html = htmlResponse ? await htmlResponse.text() : "";
      const urls = new Set();
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        try {
          const asset = new URL(match[1], self.location.origin);
          if (asset.origin === self.location.origin || FONT_HOSTS.has(asset.hostname)) {
            if (asset.origin !== self.location.origin || /\.(?:js|mjs|css|woff2?|ttf|otf)(?:$|\?)/i.test(asset.pathname)) urls.add(asset.href);
          }
        } catch { /* Ignore invalid HTML references. */ }
      }
      await Promise.all(Array.from(urls).map(async (url) => {
        try {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok || response.type === "opaque") await cache.put(url, response);
        } catch { /* Runtime caching will retry later. */ }
      }));
    } catch { /* Keep the minimal shell if bundle discovery fails. */ }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; }
    catch { payload = { body: event.data?.text?.() || "" }; }
    const openClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // The in-app realtime channel handles visible tabs; push is for background/closed app delivery.
    if (openClients.some((client) => client.visibilityState === "visible")) return;
    const id = payload.notificationId || payload.id || payload.tag || "general";
    await self.registration.showNotification(payload.title || "AgriCapital", {
      body: payload.body || payload.message || "",
      icon: payload.icon || "/logo-agricapital.png",
      badge: payload.badge || "/logo-agricapital.png",
      tag: "agricapital-notification-" + id,
      renotify: false,
      data: { ...(payload.data || {}), url: payload.url || payload.data?.route || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || event.notification.data?.route || "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    let safeTarget = "/";
    try {
      const parsed = new URL(target, self.location.origin);
      if (parsed.origin === self.location.origin) safeTarget = parsed.pathname + parsed.search + parsed.hash;
    } catch { /* Stay on the CRM home route. */ }
    for (const client of windows) {
      if ("focus" in client) {
        try { await client.navigate(safeTarget); } catch { /* Some browser clients cannot navigate. */ }
        await client.focus();
        client.postMessage({ type: "OPEN_NOTIFICATION", data: event.notification.data || {} });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(safeTarget);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "RUN_OFFLINE_SYNC") event.waitUntil(runBackgroundHttpSync());
});

// Background Sync can replay REST mutations even after all application tabs close.
// File uploads and the legacy business queue still resume in the application when it wakes.
self.addEventListener("sync", (event) => {
  if (event.tag === "agricapital-http-mutations") event.waitUntil(runBackgroundHttpSync());
});

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
    request.onupgradeneeded = (event) => {
      // If the worker runs before the first app visit, initialize the same
      // stores as the app so a future app upgrade never encounters a partial DB.
      const db = event.target.result;
      const stores = [
        "clients","plantations","paiements","offres","districts","regions","departements","sous_prefectures","villages","leads","lead_relances","proprietaires_terres","parcelles","rapports_visites_techniques","rapports_visites_medias","cartes_personnel","offline_files","sync_queue","auth_cache","meta","profiles","user_roles","role_permissions","departements_entreprise","app_roles","offre_formulaire_etapes","offre_formulaire_documents","offre_formulaire_contrats","conventions_foncieres","lots_hectares","documents_acquisition","portail_messages","finance_transactions","finance_expenses","finance_associates","finance_salary_profiles","finance_payroll_runs","finance_payroll_items","commissions","portefeuilles","portefeuille_versements","portefeuille_versement_lignes","interventions_techniques","tickets","tickets_techniques","beneficiaire_attributions","acquisitions_brouillon","http_cache","http_mutations"
      ];
      for (const name of stores) {
        if (db.objectStoreNames.contains(name)) continue;
        if (name === "sync_queue" || name === "http_mutations") {
          const store = db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("status", "status");
          if (name === "sync_queue") store.createIndex("timestamp", "timestamp");
        } else if (name === "auth_cache" || name === "meta" || name === "http_cache") {
          db.createObjectStore(name, { keyPath: "key" });
        } else {
          const store = db.createObjectStore(name, { keyPath: "id" });
          store.createIndex("updated_at", "updated_at");
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txRequest(db, storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let request;
    let result;
    try { request = action(store); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

async function runBackgroundHttpSync() {
  let db;
  try { db = await openOfflineDb(); } catch { return; }
  let rows = [];
  try { rows = await txRequest(db, HTTP_QUEUE_STORE, "readonly", (store) => store.getAll()); }
  catch { db.close(); return; }

  const now = Date.now();
  const queue = rows.filter((item) =>
    (item.status === "pending" || item.status === "error") &&
    (!item.nextRetryAt || item.nextRetryAt <= now)
  ).sort((a, b) => a.createdAt - b.createdAt);

  let synced = 0;
  for (const item of queue) {
    if (!item.id) continue;
    try {
      // Claim the item before sending so a foreground tab does not replay it too.
      item.status = "syncing";
      item.syncStartedAt = Date.now();
      await txRequest(db, HTTP_QUEUE_STORE, "readwrite", (store) => store.put(item));

      const headers = new Headers(item.headers || {});
      headers.set("x-agri-offline-replay", "1");
      let url = item.url;
      if (String(item.method).toUpperCase() === "POST" && item.body) {
        try {
          const payload = JSON.parse(item.body);
          const values = Array.isArray(payload) ? payload : [payload];
          if (values.length && values.every((row) => row && typeof row === "object" && row.id)) {
            headers.set("prefer", [headers.get("prefer"), "resolution=merge-duplicates"].filter(Boolean).join(","));
            const parsedUrl = new URL(url);
            if (!parsedUrl.searchParams.has("on_conflict")) parsedUrl.searchParams.set("on_conflict", "id");
            url = parsedUrl.toString();
          }
        } catch { /* Preserve non-JSON mutations unchanged. */ }
      }

      const response = await fetch(url, { method: item.method, headers, body: item.body || undefined });
      if (response.ok) {
        await txRequest(db, HTTP_QUEUE_STORE, "readwrite", (store) => store.delete(item.id));
        synced++;
        continue;
      }
      const message = await response.clone().text().catch(() => response.statusText);
      const retries = (item.retries || 0) + 1;
      item.status = "error";
      item.retries = retries;
      item.error = message || ("HTTP " + response.status);
      item.syncStartedAt = undefined;
      item.nextRetryAt = Date.now() + Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.min(retries, 8));
      await txRequest(db, HTTP_QUEUE_STORE, "readwrite", (store) => store.put(item));
      if (response.status >= 500 || response.status === 429) break;
    } catch (error) {
      const retries = (item.retries || 0) + 1;
      item.status = "error";
      item.retries = retries;
      item.error = String(error?.message || error || "Erreur réseau");
      item.syncStartedAt = undefined;
      item.nextRetryAt = Date.now() + Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.min(retries, 8));
      try { await txRequest(db, HTTP_QUEUE_STORE, "readwrite", (store) => store.put(item)); } catch { /* retry on next sync */ }
      break;
    }
  }

  db.close();
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "OFFLINE_BACKGROUND_SYNC_COMPLETE", synced });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const allowedFontHost = FONT_HOSTS.has(url.hostname);
  if (!sameOrigin && !allowedFontHost) return;

  if (sameOrigin && (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("/functions/")
  )) return;

  const isNavigation = request.mode === "navigate";
  const isStaticAsset = sameOrigin && (
    url.pathname.startsWith("/assets/") ||
    request.destination === "image" ||
    request.destination === "font" ||
    /\.(?:css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(url.pathname)
  );

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/index.html", response.clone());
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match("/index.html") || await caches.match("/");
        return cached || new Response("AC_Teams doit être ouvert au moins une fois avec une connexion pour préparer son mode hors ligne.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  if (isStaticAsset || allowedFontHost) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      // Vite assets are content-hashed: cache-first is safe and fastest on 2G.
      if (cached && (url.pathname.startsWith("/assets/") || request.destination === "font" || allowedFontHost)) return cached;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
        return response;
      } catch {
        if (cached) return cached;
        if (request.destination === "image") return new Response("", { status: 504 });
        throw new Error("Ressource indisponible hors ligne: " + url.pathname);
      }
    })());
  }
});
