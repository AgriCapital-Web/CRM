import {
  addHttpMutation,
  cacheHttpResponse,
  deleteHttpMutation,
  getCachedHttpResponse,
  getAllHttpCacheEntries,
  getPendingHttpMutations,
  markHttpMutationError,
  type HttpMutation,
  getItem,
  putItem,
  deleteItem,
  TABLE_TO_OFFLINE_STORE,
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
  return fn(input, init);
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

function getAuthScope(headers: Headers): string {
  const auth = headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  try {
    const payload = token.split(".")[1];
    if (!payload) return "anon";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized));
    return String(decoded.sub || "anon");
  } catch {
    return "anon";
  }
}

async function buildCacheKey(request: Request): Promise<string> {
  return [
    "GET",
    getAuthScope(request.headers),
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
    getAuthScope(request.headers),
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

export async function flushOfflineHttpQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let flushed = 0;

  try {
    const queue = await getPendingHttpMutations();

    for (const item of queue) {
      if (!navigator.onLine || !item.id) break;

      try {
        const headers = new Headers(item.headers);
        headers.set("x-agri-offline-replay", "1");

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
      const originalBody = method === "DELETE" && !request.body
        ? ""
        : await request.clone().text().catch(() => "");
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
            await optimisticLocalMutation(request.url, method, originalBody);
            await reconcileHttpCacheForMutation(request.url, method, originalBody);
          } catch {
            // Local cache is best-effort; server success remains authoritative.
          }
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

  window.addEventListener("online", () => {
    void flushOfflineHttpQueue();
  });

  window.setInterval(() => {
    void flushOfflineHttpQueue();
  }, 60_000);

  return wrapped as typeof fetch;
}
