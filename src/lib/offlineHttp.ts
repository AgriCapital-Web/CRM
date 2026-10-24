import {
  addHttpMutation,
  cacheHttpResponse,
  deleteHttpMutation,
  getCachedHttpResponse,
  getAllHttpCacheEntries,
  getPendingHttpMutations,
  markHttpMutationError,
  markHttpMutationSyncing,
  type HttpMutation,
  getItem,
  putItem,
  deleteItem,
  TABLE_TO_OFFLINE_STORE,
  getCachedAuth,
} from "@/lib/offlineDb";

const SUPABASE_REST_SUFFIX = "/rest/v1/";
const MAX_CACHE_BODY_BYTES = 8 * 1024 * 1024;
const TABLES_WITHOUT_SYNTHETIC_ID = new Set([
  "role_permissions",
  "portefeuille_versement_lignes",
]);
let flushing = false;
let installed = false;

function baseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const fn = typeof window !== "undefined" && window.fetch
    ? window.fetch.bind(window)
    : fetch;
  const url = input instanceof Request ? input.url : String(input);
  // A connected-looking but unusably slow mobile network must not leave every
  // CRM screen spinning indefinitely. REST reads can fall back to IndexedDB;
  // REST mutations are queued by installOfflineFetch after this timeout.
  if (!isRestRequest(url) || typeof AbortController === "undefined") return fn(input, init);

  const controller = new AbortController();
  const sourceSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
  const abortFromSource = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) abortFromSource();
  else sourceSignal?.addEventListener("abort", abortFromSource, { once: true });

  const timeoutId = typeof window !== "undefined"
    ? window.setTimeout(() => controller.abort(new DOMException("Délai réseau dépassé", "TimeoutError")), 20000)
    : undefined;
  return fn(input, { ...init, signal: controller.signal }).finally(() => {
    if (timeoutId !== undefined && typeof window !== "undefined") window.clearTimeout(timeoutId);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  });
}

function isRestRequest(url: string): boolean {
  return url.includes(SUPABASE_REST_SUFFIX);
}

function isMutation(method: string): boolean {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method);
}

function isNetworkFailure(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return !navigator.onLine || /failed to fetch|network|fetch failed|connection|timeout|offline|load failed|aborted/.test(message);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!["content-length", "host"].includes(key.toLowerCase())) out[key] = value;
  });
  return out;
}

async function getAuthScope(headers: Headers): Promise<string> {
  const auth = headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  try {
    const payload = token.split(".")[1];
    if (payload) {
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(atob(normalized));
      if (decoded.sub && decoded.role !== "anon") return String(decoded.sub);
    }
  } catch {
    // Offline-authenticated sessions intentionally have no Supabase JWT.
  }

  // Offline login is local-only; scope cached reads to the user who proved
  // their cached credentials, rather than looking under the anonymous scope.
  try {
    if (typeof window !== "undefined") {
      const offlineUserId = window.localStorage.getItem("agricapital_offline_user_id");
      if (offlineUserId) return offlineUserId;
    }
  } catch {
    // Storage can be disabled by browser policy; fall back to the anonymous scope.
  }
  return "anon";
}

async function buildCacheKey(request: Request): Promise<string> {
  return [
    "GET",
    await getAuthScope(request.headers),
    request.url,
    request.headers.get("accept") || "",
  ].join("|");
}

function isCacheableResponse(response: Response): boolean {
  if (!response.ok) return false;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") || contentType.includes("text/plain");
}

function responseFromCache(entry: {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}): Response {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

function getRpcName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = "/rest/v1/rpc/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length).split("/")[0]) || null;
  } catch {
    return null;
  }
}

async function rpcCacheKey(request: Request): Promise<string> {
  const body = await request.clone().text().catch(() => "");
  return [
    "RPC",
    await getAuthScope(request.headers),
    request.url,
    body,
  ].join("|");
}

function getTableFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = "/rest/v1/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length).split("/")[0]) || null;
  } catch {
    return null;
  }
}

function getEqIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("id") || "";
    if (!raw.startsWith("eq.")) return null;
    return decodeURIComponent(raw.slice(3));
  } catch {
    return null;
  }
}

async function reconcileHttpCacheForMutation(url: string, method: string, rawBody: string): Promise<void> {
  const table = getTableFromUrl(url);
  if (!table) return;

  let payload: any = null;
  try { payload = rawBody ? JSON.parse(rawBody) : null; } catch { return; }
  const id = getEqIdFromUrl(url);
  const entries = await getAllHttpCacheEntries();

  for (const entry of entries) {
    const parts = entry.key.split("|");
    const cachedUrl = parts.find((part) => part.includes("/rest/v1/"));
    if (!cachedUrl || !cachedUrl.includes("/rest/v1/" + table)) continue;

    let body: any;
    try { body = JSON.parse(entry.body); } catch { continue; }

    const apply = (rows: any[]) => {
      if (method === "DELETE" && id) return rows.filter((row) => String(row?.id) !== String(id));
      const incoming = Array.isArray(payload) ? payload : [payload];
      if (method === "POST") {
        for (const item of incoming) {
          if (!item || typeof item !== "object") continue;
          const idx = item.id ? rows.findIndex((row) => String(row?.id) === String(item.id)) : -1;
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...item };
          } else {
            rows.push(item);
          }
        }
      } else if ((method === "PATCH" || method === "PUT") && id) {
        for (const item of rows) {
          if (String(item?.id) === String(id)) Object.assign(item, payload || {});
        }
      }
      return rows;
    };

    const next = Array.isArray(body)
      ? apply(body.map((row) => ({ ...row })))
      : body && method !== "DELETE" && id && String(body?.id) === String(id)
        ? { ...body, ...(payload || {}) }
        : body;

    if (JSON.stringify(next) !== JSON.stringify(body)) {
      await cacheHttpResponse({
        ...entry,
        body: JSON.stringify(next),
        cachedAt: Date.now(),
      });
    }
  }
}

async function optimisticLocalMutation(url: string, method: string, rawBody: string): Promise<string | null> {
  const table = getTableFromUrl(url);
  const store = table ? TABLE_TO_OFFLINE_STORE[table] : null;
  if (!store) return rawBody;

  let parsed: any = null;
  try { parsed = rawBody ? JSON.parse(rawBody) : null; } catch { parsed = null; }
  if (!parsed) return rawBody;

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const next = { ...item, id: item.id || (crypto.randomUUID ? crypto.randomUUID() : "off-" + Date.now()) };
        await putItem(store, next);
      }
    }
    return JSON.stringify(parsed.map((item) => item && typeof item === "object"
      ? { ...item, id: item.id || (crypto.randomUUID ? crypto.randomUUID() : "off-" + Date.now()) }
      : item));
  }

  let localPayload = parsed;
  if (method === "POST") {
    const id = parsed.id || (crypto.randomUUID ? crypto.randomUUID() : "off-" + Date.now() + "-" + Math.random().toString(16).slice(2));
    localPayload = { ...parsed, id, _offline: true, updated_at: new Date().toISOString() };
    await putItem(store, localPayload);
    return JSON.stringify(localPayload);
  }

  const id = getEqIdFromUrl(url);
  if (method === "PATCH" || method === "PUT") {
    if (id) {
      const existing = await getItem(store, id);
      localPayload = { ...(existing || { id }), ...parsed, id, _offline: true, updated_at: new Date().toISOString() };
      await putItem(store, localPayload);
      return JSON.stringify(localPayload);
    }
  }

  if (method === "DELETE" && id) {
    await deleteItem(store, id);
  }

  return rawBody;
}


/**
 * Met à jour IndexedDB après une mutation réellement acceptée par le serveur.
 * En ligne, ne jamais fabriquer un UUID local pour un insert déjà créé par Supabase :
 * cela laisserait un faux doublon local avec un identifiant différent du serveur.
 */
async function updateLocalCacheAfterSuccessfulMutation(
  url: string,
  method: string,
  rawBody: string,
  response: Response,
): Promise<void> {
  const table = getTableFromUrl(url);
  const store = table ? TABLE_TO_OFFLINE_STORE[table] : null;
  if (!store) return;

  if (method === "DELETE") {
    const id = getEqIdFromUrl(url);
    if (id) await deleteItem(store, id);
    return;
  }

  let parsedBody: any = null;
  try { parsedBody = rawBody ? JSON.parse(rawBody) : null; } catch { return; }

  if (method === "POST") {
    let serverRows: any[] = [];
    try {
      const payload = await response.clone().json();
      serverRows = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
    } catch {
      // Sans représentation serveur, on ne met en cache que les lignes dont
      // l'identifiant a été fourni explicitement dans la requête.
      serverRows = Array.isArray(parsedBody) ? parsedBody : parsedBody && typeof parsedBody === "object" ? [parsedBody] : [];
    }
    for (const row of serverRows) {
      if (row && typeof row === "object" && row.id) await putItem(store, row);
    }
    return;
  }

  if (method === "PATCH" || method === "PUT") {
    const id = getEqIdFromUrl(url);
    if (!id || !parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return;
    const existing = await getItem(store, id);
    await putItem(store, { ...(existing || { id }), ...parsedBody, id, updated_at: new Date().toISOString() });
  }
}

async function makeQueuedResponse(request: Request): Promise<Response> {
  let parsed: any = null;
  try {
    const text = await request.clone().text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
  } catch {
    parsed = null;
  }

  const accept = (request.headers.get("accept") || "").toLowerCase();
  const prefer = (request.headers.get("prefer") || "").toLowerCase();

  if (
    request.method === "DELETE" ||
    (!prefer.includes("return=representation") &&
      !accept.includes("application/vnd.pgrst.object+json"))
  ) {
    return new Response("", { status: 204 });
  }

  const responsePayload = accept.includes("application/vnd.pgrst.object+json")
    ? parsed
    : Array.isArray(parsed) ? parsed : [parsed];

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function prepareOfflineMutationBody(url: string, method: string, body: string): Promise<string> {
  const table = getTableFromUrl(url);
  const store = table ? TABLE_TO_OFFLINE_STORE[table] : null;
  if (!store || !body) {
    if (method === "DELETE") return body;
    return body;
  }

  // Composite-key tables must be replayed with their original payload unchanged.
  if (table && TABLES_WITHOUT_SYNTHETIC_ID.has(table)) {
    await optimisticLocalMutation(url, method, body);
    return body;
  }

  if (method !== "POST") {
    await optimisticLocalMutation(url, method, body);
    return body;
  }

  let parsed: any = null;
  try { parsed = JSON.parse(body); } catch { return body; }
  if (Array.isArray(parsed)) {
    const next = parsed.map((item) =>
      item && typeof item === "object"
        ? { ...item, id: item.id || (crypto.randomUUID ? crypto.randomUUID() : "off-" + Date.now() + "-" + Math.random().toString(16).slice(2)) }
        : item
    );
    await optimisticLocalMutation(url, method, JSON.stringify(next));
    return JSON.stringify(next);
  }

  if (parsed && typeof parsed === "object") {
    const next = { ...parsed, id: parsed.id || (crypto.randomUUID ? crypto.randomUUID() : "off-" + Date.now() + "-" + Math.random().toString(16).slice(2)) };
    await optimisticLocalMutation(url, method, JSON.stringify(next));
    return JSON.stringify(next);
  }

  return body;
}

export async function refreshPendingMutationAuthorization(accessToken: string): Promise<void> {
  if (!accessToken) return;
  const queue = await getPendingHttpMutations();
  for (const item of queue) {
    const headers = { ...item.headers, authorization: `Bearer ${accessToken}` };
    await putItem("http_mutations", { ...item, headers });
  }
}

export async function scheduleBackgroundOfflineSync(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as any).sync;
    if (syncManager && typeof syncManager.register === "function") {
      await syncManager.register("agricapital-http-mutations");
    }
  } catch {
    // Background Sync is not supported by every browser; foreground sync remains enabled.
  }
}

export async function flushOfflineHttpQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  const lockManager = (navigator as any).locks;
  if (lockManager && typeof lockManager.request === "function") {
    // Même verrou que le service worker : évite qu'un onglet et le worker
    // rejouent simultanément la même mutation persistée.
    return lockManager.request("agricapital-http-queue-flush", { mode: "exclusive" }, () =>
      flushOfflineHttpQueueUnlocked()
    );
  }
  return flushOfflineHttpQueueUnlocked();
}

async function flushOfflineHttpQueueUnlocked(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let flushed = 0;

  try {
    const queue = await getPendingHttpMutations();

    for (const item of queue) {
      if (!navigator.onLine || !item.id) break;

      try {
        await markHttpMutationSyncing(item.id);
        const headers = new Headers(item.headers);
        headers.set("x-agri-offline-replay", "1");
        // Replayed inserts carry a stable client UUID; upsert makes retries idempotent.
        if (item.method.toUpperCase() === "POST" && item.body) {
          try {
            const payload = JSON.parse(item.body);
            const rows = Array.isArray(payload) ? payload : [payload];
            if (rows.length && rows.every((row) => row && typeof row === "object" && row.id)) {
              headers.set("prefer", [headers.get("prefer"), "resolution=merge-duplicates"].filter(Boolean).join(","));
              const replayUrl = new URL(item.url);
              if (!replayUrl.searchParams.has("on_conflict")) replayUrl.searchParams.set("on_conflict", "id");
              const response = await baseFetch(replayUrl.toString(), {
                method: item.method,
                headers,
                body: item.body,
              });
              if (response.ok) {
                await deleteHttpMutation(item.id);
                flushed++;
                continue;
              }
              const message = await response.clone().text().catch(() => response.statusText);
              await markHttpMutationError(item.id, message || ("HTTP " + response.status));
              continue;
            }
          } catch (error) {
            if (error instanceof SyntaxError) {
              // Non-JSON payload: replay below without changing its semantics.
            } else {
              throw error;
            }
          }
        }

        const response = await baseFetch(item.url, {
          method: item.method,
          headers,
          body: item.body || undefined,
        });

        if (response.ok) {
          await deleteHttpMutation(item.id);
          flushed++;
          continue;
        }

        const message = await response.clone().text().catch(() => response.statusText);
        await markHttpMutationError(item.id, message || ("HTTP " + response.status));
      } catch (error) {
        await markHttpMutationError(
          item.id,
          String((error as any)?.message || error || "Erreur réseau")
        );
        if (!navigator.onLine) break;
      }
    }
  } finally {
    flushing = false;
  }

  if (flushed > 0) {
    window.dispatchEvent(
      new CustomEvent("offline-http-sync-complete", {
        detail: { synced: flushed },
      })
    );
  }

  return flushed;
}

export function installOfflineFetch(): typeof fetch {
  if (installed) {
    return (typeof window !== "undefined" ? window.fetch : fetch) as typeof fetch;
  }
  installed = true;

  const wrapped = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);

    if (
      request.headers.has("x-agri-offline-replay") ||
      !isRestRequest(request.url)
    ) {
      return baseFetch(request);
    }

    const method = request.method.toUpperCase();

    const rpcName = getRpcName(request.url);
    if (rpcName) {
      // RPC semantics are not inferable from HTTP method. Cache the result of
      // every RPC call for offline reads, but never enqueue an RPC as a mutation.
      const key = await rpcCacheKey(request);
      if (!navigator.onLine) {
        const cached = await getCachedHttpResponse(key);
        if (cached) return responseFromCache(cached);
      }
      try {
        const response = await baseFetch(request);
        if (response.ok) {
          const body = await response.clone().text();
          if (new TextEncoder().encode(body).byteLength <= MAX_CACHE_BODY_BYTES) {
            await cacheHttpResponse({
              key,
              status: response.status,
              statusText: response.statusText,
              headers: headersToRecord(response.headers),
              body,
              cachedAt: Date.now(),
            });
          }
        } else if (response.status >= 500) {
          const cached = await getCachedHttpResponse(key);
          if (cached) return responseFromCache(cached);
        }
        return response;
      } catch (error) {
        const cached = await getCachedHttpResponse(key);
        if (cached) return responseFromCache(cached);
        throw error;
      }
    }

    if (method === "GET") {
      const key = await buildCacheKey(request);

      // Offline-first: read the last successful response before attempting any network request.
      // This also keeps the cache usable after offline authentication, where Supabase has no live session token.
      if (!navigator.onLine) {
        const cached = await getCachedHttpResponse(key);
        if (cached) return responseFromCache(cached);
      }
      try {
        const response = await baseFetch(request);

        if (isCacheableResponse(response)) {
          const body = await response.clone().text();
          if (new TextEncoder().encode(body).byteLength <= MAX_CACHE_BODY_BYTES) {
            await cacheHttpResponse({
              key,
              status: response.status,
              statusText: response.statusText,
              headers: headersToRecord(response.headers),
              body,
              cachedAt: Date.now(),
            });
          }
        } else if (response.status >= 500) {
          const cached = await getCachedHttpResponse(key);
          if (cached) return responseFromCache(cached);
        }

        return response;
      } catch (error) {
        const cached = await getCachedHttpResponse(key);
        if (cached) return responseFromCache(cached);
        throw error;
      }
    }

    if (isMutation(method)) {
      // Lire le corps AVANT l'envoi : un Request déjà envoyé ne peut plus être cloné.
      let originalBody = method === "DELETE" && !request.body
        ? ""
        : await request.clone().text().catch(() => "");

      // Donner un identifiant stable aux INSERT compatibles AVANT le premier appel
      // réseau. Si PostgREST expire après l'exécution SQL, la reprise sera idempotente.
      const table = getTableFromUrl(request.url);
      if (method === "POST" && table && TABLE_TO_OFFLINE_STORE[table] &&
          !TABLES_WITHOUT_SYNTHETIC_ID.has(table) && originalBody) {
        try {
          const payload = JSON.parse(originalBody);
          const withStableIds = (row: any) => row && typeof row === "object" && !row.id
            ? { ...row, id: crypto.randomUUID ? crypto.randomUUID() : "off-" + Date.now() + "-" + Math.random().toString(16).slice(2) }
            : row;
          const next = Array.isArray(payload) ? payload.map(withStableIds) : withStableIds(payload);
          originalBody = JSON.stringify(next);
        } catch {
          // Preserve non-JSON PostgREST payloads unchanged.
        }
      }

      try {
        if (!navigator.onLine) throw new TypeError("offline");
        const response = await baseFetch(request.url, {
          method,
          headers: request.headers,
          body: originalBody || undefined,
          signal: request.signal,
        });

        if (response.ok) {
          try {
            await updateLocalCacheAfterSuccessfulMutation(request.url, method, originalBody, response);
            await reconcileHttpCacheForMutation(request.url, method, originalBody);
          } catch {
            // La réponse serveur fait foi; le prochain pull réparera le cache local.
          }
          return response;
        }

        // Ne pas confondre une erreur métier (400/401/403/409) avec une panne
        // temporaire de PostgREST. Les expirations serveur 5xx sont mises en file
        // au lieu de faire échouer tous les formulaires au même moment.
        const diagnostic = await response.clone().text().catch(() => "");
        const transientServerFailure = [502, 503, 504].includes(response.status) ||
          (response.status === 500 && /timeout manager|gateway timeout|temporarily unavailable|connection pool|upstream timeout/i.test(diagnostic));
        if (transientServerFailure) {
          const prefer = (request.headers.get("prefer") || "").toLowerCase();
          const accept = (request.headers.get("accept") || "").toLowerCase();
          let responseMode: HttpMutation["responseMode"] = "empty";
          if (accept.includes("application/vnd.pgrst.object+json")) responseMode = "object";
          else if (prefer.includes("return=representation")) responseMode = "array";

          const body = await prepareOfflineMutationBody(request.url, method, originalBody);
          await addHttpMutation({
            url: request.url,
            method,
            headers: headersToRecord(request.headers),
            body: body || null,
            responseMode,
          });
          window.dispatchEvent(new CustomEvent("offline-mutation-queued"));
          void scheduleBackgroundOfflineSync();
          return makeQueuedResponse(new Request(request.url, {
            method,
            headers: request.headers,
            body: body || undefined,
          }));
        }
        return response;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;

        let body = originalBody;
        const prefer = (request.headers.get("prefer") || "").toLowerCase();
        const accept = (request.headers.get("accept") || "").toLowerCase();

        let responseMode: HttpMutation["responseMode"] = "empty";
        if (accept.includes("application/vnd.pgrst.object+json")) {
          responseMode = "object";
        } else if (prefer.includes("return=representation")) {
          responseMode = "array";
        }

        // Apply an optimistic local mutation and, for UUID-backed CRM tables,
        // inject the same local id into the queued request so replay is idempotent.
        const optimisticBody = await prepareOfflineMutationBody(request.url, method, body);
        body = optimisticBody;

        await addHttpMutation({
          url: request.url,
          method,
          headers: headersToRecord(request.headers),
          body: body || null,
          responseMode,
        });

        window.dispatchEvent(new CustomEvent("offline-mutation-queued"));
        void scheduleBackgroundOfflineSync();
        const syntheticRequest = new Request(request.url, {
          method,
          headers: request.headers,
          body: body || undefined,
        });
        return makeQueuedResponse(syntheticRequest);
      }
    }

    return baseFetch(request);
  };

  const resumeQueue = () => { void flushOfflineHttpQueue(); };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "OFFLINE_BACKGROUND_SYNC_COMPLETE") {
        window.dispatchEvent(new CustomEvent("offline-http-sync-complete", {
          detail: { synced: Number(event.data.synced) || 0, background: true },
        }));
        if (navigator.onLine) void flushOfflineHttpQueue();
      }
    });
  }
  window.addEventListener("online", resumeQueue);
  window.addEventListener("focus", resumeQueue);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeQueue();
  });
  window.setInterval(resumeQueue, 30_000);

  return wrapped as typeof fetch;
}
