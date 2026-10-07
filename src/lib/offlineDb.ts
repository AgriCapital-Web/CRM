/**
 * IndexedDB-based offline storage for AgriCapital CRM
 * Full offline support: auth, data caching, sync queue, conflict resolution
 */

const DB_NAME = 'agricapital_offline';
const DB_VERSION = 10;

export const STORES = {
  CLIENTS: 'clients',
  PLANTATIONS: 'plantations',
  PAIEMENTS: 'paiements',
  OFFRES: 'offres',
  DISTRICTS: 'districts',
  REGIONS: 'regions',
  DEPARTEMENTS: 'departements',
  SOUS_PREFECTURES: 'sous_prefectures',
  VILLAGES: 'villages',
  LEADS: 'leads',
  LEAD_RELANCES: 'lead_relances',
  PROPRIETAIRES_TERRES: 'proprietaires_terres',
  PARCELLES: 'parcelles',
  RAPPORTS_VISITES: 'rapports_visites_techniques',
  RAPPORTS_MEDIAS: 'rapports_visites_medias',
  CARTES_PERSONNEL: 'cartes_personnel',
  FILES: 'offline_files',
  SYNC_QUEUE: 'sync_queue',
  AUTH_CACHE: 'auth_cache',
  META: 'meta',
  PROFILES: 'profiles',
  USER_ROLES: 'user_roles',
  ROLE_PERMISSIONS: 'role_permissions',
  DEPARTEMENTS_ENTREPRISE: 'departements_entreprise',
  APP_ROLES: 'app_roles',
  OFFRE_FORM_ETAPES: 'offre_formulaire_etapes',
  OFFRE_FORM_DOCUMENTS: 'offre_formulaire_documents',
  OFFRE_FORM_CONTRATS: 'offre_formulaire_contrats',
  CONVENTIONS_FONCIERES: 'conventions_foncieres',
  LOTS_HECTARES: 'lots_hectares',
  DOCUMENTS_ACQUISITION: 'documents_acquisition',
  PORTAIL_MESSAGES: 'portail_messages',
  FINANCE_TRANSACTIONS: 'finance_transactions',
  FINANCE_EXPENSES: 'finance_expenses',
  FINANCE_ASSOCIATES: 'finance_associates',
  FINANCE_SALARY_PROFILES: 'finance_salary_profiles',
  FINANCE_PAYROLL_RUNS: 'finance_payroll_runs',
  FINANCE_PAYROLL_ITEMS: 'finance_payroll_items',
  COMMISSIONS: 'commissions',
  PORTEFEUILLES: 'portefeuilles',
  PORTEFEUILLE_VERSEMENTS: 'portefeuille_versements',
  PORTEFEUILLE_VERSEMENT_LIGNES: 'portefeuille_versement_lignes',
  INTERVENTIONS_TECHNIQUES: 'interventions_techniques',
  TICKETS: 'tickets',
  TICKETS_TECHNIQUES: 'tickets_techniques',
  BENEFICIAIRE_ATTRIBUTIONS: 'beneficiaire_attributions',
  ACQUISITIONS_BROUILLON: 'acquisitions_brouillon',
  HTTP_CACHE: 'http_cache',
  HTTP_MUTATIONS: 'http_mutations',
} as const;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const storeNames = Object.values(STORES);
      for (const name of storeNames) {
        if (!db.objectStoreNames.contains(name)) {
          if (name === STORES.SYNC_QUEUE) {
            const store = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp');
            store.createIndex('status', 'status');
          } else if (name === STORES.HTTP_MUTATIONS) {
            const store = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
            store.createIndex('createdAt', 'createdAt');
            store.createIndex('status', 'status');
          } else if (name === STORES.AUTH_CACHE || name === STORES.META || name === STORES.HTTP_CACHE) {
            db.createObjectStore(name, { keyPath: 'key' });
          } else {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('updated_at', 'updated_at');
          }
        }
      }
    };
    request.onsuccess = () => { dbInstance = request.result; resolve(dbInstance); };
    request.onerror = () => reject(request.error);
  });
}

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// Generic CRUD
function makeStableOfflineId(item: any): string {
  if (item?.id !== undefined && item?.id !== null && item.id !== "") return String(item.id);
  const source = JSON.stringify(item, Object.keys(item || {}).sort());
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "local-" + (hash >>> 0).toString(16);
}

function normalizeStoreItem(storeName: string, item: any): any {
  if (
    storeName === STORES.SYNC_QUEUE ||
    storeName === STORES.HTTP_MUTATIONS ||
    storeName === STORES.AUTH_CACHE ||
    storeName === STORES.META ||
    storeName === STORES.HTTP_CACHE
  ) {
    return item;
  }
  if (item?.id !== undefined && item?.id !== null && item.id !== "") return item;
  return { ...item, id: makeStableOfflineId(item) };
}

export async function putItem(storeName: string, item: any): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  const normalized = normalizeStoreItem(storeName, item);
  return new Promise((resolve, reject) => {
    const req = store.put(normalized);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function putItems(storeName: string, items: any[]): Promise<void> {
  if (!items.length) return;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  items.forEach(item => store.put(normalizeStoreItem(storeName, item)));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getItem(storeName: string, key: IDBValidKey): Promise<any> {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllItems(storeName: string): Promise<any[]> {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteItem(storeName: string, key: IDBValidKey): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function countItems(storeName: string): Promise<number> {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Sync queue operations
export interface SyncOperation {
  id?: number;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  record_id: string;
  data: any;
  timestamp: number;
  status: 'pending' | 'syncing' | 'synced' | 'error';
  retries: number;
  error_message?: string;
  next_retry_at?: number;
}

export async function addToSyncQueue(op: Omit<SyncOperation, 'id' | 'status' | 'retries'>): Promise<void> {
  await putItem(STORES.SYNC_QUEUE, { ...op, status: 'pending', retries: 0 });
}

export async function getPendingSyncOps(): Promise<SyncOperation[]> {
  const now = Date.now();
  const all = await getAllItems(STORES.SYNC_QUEUE);
  return all
    .filter(op => op.status === 'pending' || op.status === 'error')
    .filter(op => !op.next_retry_at || op.next_retry_at <= now)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function markOpStatus(id: number, status: SyncOperation['status'], errorMsg?: string): Promise<void> {
  const item = await getItem(STORES.SYNC_QUEUE, id);
  if (item) {
    item.status = status;
    if (errorMsg) item.error_message = errorMsg;
    if (status === 'error') {
      item.retries = (item.retries || 0) + 1;
      item.next_retry_at = Date.now() + Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.min(item.retries, 8));
    } else if (status === 'pending' || status === 'synced') {
      item.next_retry_at = 0;
      item.error_message = undefined;
    }
    await putItem(STORES.SYNC_QUEUE, item);
  }
}

export async function clearSyncedOps(): Promise<void> {
  const all = await getAllItems(STORES.SYNC_QUEUE);
  const db = await openDB();
  const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
  const store = tx.objectStore(STORES.SYNC_QUEUE);
  all.filter(op => op.status === 'synced').forEach(op => store.delete(op.id));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSyncQueueStats(): Promise<{ pending: number; error: number; total: number }> {
  const all = await getAllItems(STORES.SYNC_QUEUE);
  return {
    pending: all.filter(o => o.status === 'pending').length,
    error: all.filter(o => o.status === 'error').length,
    total: all.length,
  };
}

// Auth cache for offline login
export async function cacheAuthCredentials(email: string, passwordHash: string, salt: string, profile: any, roles: string[]): Promise<void> {
  await putItem(STORES.AUTH_CACHE, {
    key: 'last_auth',
    email,
    passwordHash,
    salt,
    profile,
    roles,
    cachedAt: Date.now(),
  });
}

export async function getCachedAuth(): Promise<{ email: string; passwordHash: string; salt?: string; profile: any; roles: string[]; cachedAt: number } | null> {
  return getItem(STORES.AUTH_CACHE, 'last_auth');
}


// Meta: last sync timestamps
export async function setLastSyncTime(table: string): Promise<void> {
  await putItem(STORES.META, { key: `last_sync_${table}`, timestamp: new Date().toISOString() });
}

export async function getLastSyncTime(table: string): Promise<string | null> {
  const meta = await getItem(STORES.META, `last_sync_${table}`);
  return meta?.timestamp || null;
}

// Cache helpers
export async function cacheClients(items: any[]): Promise<void> {
  await putItems(STORES.CLIENTS, items);
  await setLastSyncTime(STORES.CLIENTS);
}

export const getCachedClients = () => getAllItems(STORES.CLIENTS);

export async function cachePlantations(items: any[]): Promise<void> {
  await putItems(STORES.PLANTATIONS, items);
  await setLastSyncTime(STORES.PLANTATIONS);
}

export const getCachedPlantations = () => getAllItems(STORES.PLANTATIONS);

export async function cacheReferenceData(storeName: string, items: any[]): Promise<void> {
  await putItems(storeName, items);
  await setLastSyncTime(storeName);
}

export const getCachedItems = (storeName: string) => getAllItems(storeName);

// Simple hash for offline auth
/** Génère un sel aléatoire par utilisateur (hex) pour le hash de connexion hors ligne. */
export function generateAuthSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Dérive un hash de mot de passe via PBKDF2-SHA256 (210 000 itérations)
 * avec un sel unique par utilisateur, généré aléatoirement et stocké localement.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  if (!salt) throw new Error('salt requis');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 210000, hash: 'SHA-256' },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}


// Get offline data stats
export async function getOfflineStats(): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  for (const [key, store] of Object.entries(STORES)) {
    if (store !== STORES.AUTH_CACHE && store !== STORES.META && store !== STORES.SYNC_QUEUE) {
      try {
        stats[key] = await countItems(store);
      } catch { stats[key] = 0; }
    }
  }
  const queueStats = await getSyncQueueStats();
  stats['PENDING_SYNC'] = queueStats.pending;
  stats['ERROR_SYNC'] = queueStats.error;
  return stats;
}


export const TABLE_TO_OFFLINE_STORE: Record<string, string> = {
  clients: STORES.CLIENTS,
  plantations: STORES.PLANTATIONS,
  paiements: STORES.PAIEMENTS,
  offres: STORES.OFFRES,
  districts: STORES.DISTRICTS,
  regions: STORES.REGIONS,
  departements: STORES.DEPARTEMENTS,
  sous_prefectures: STORES.SOUS_PREFECTURES,
  villages: STORES.VILLAGES,
  leads: STORES.LEADS,
  lead_relances: STORES.LEAD_RELANCES,
  proprietaires_terres: STORES.PROPRIETAIRES_TERRES,
  parcelles: STORES.PARCELLES,
  rapports_visites_techniques: STORES.RAPPORTS_VISITES,
  rapports_visites_medias: STORES.RAPPORTS_MEDIAS,
  cartes_personnel: STORES.CARTES_PERSONNEL,
  profiles: STORES.PROFILES,
  user_roles: STORES.USER_ROLES,
  role_permissions: STORES.ROLE_PERMISSIONS,
  departements_entreprise: STORES.DEPARTEMENTS_ENTREPRISE,
  app_roles: STORES.APP_ROLES,
  offre_formulaire_etapes: STORES.OFFRE_FORM_ETAPES,
  offre_formulaire_documents: STORES.OFFRE_FORM_DOCUMENTS,
  offre_formulaire_contrats: STORES.OFFRE_FORM_CONTRATS,
  conventions_foncieres: STORES.CONVENTIONS_FONCIERES,
  lots_hectares: STORES.LOTS_HECTARES,
  documents_acquisition: STORES.DOCUMENTS_ACQUISITION,
  portail_messages: STORES.PORTAIL_MESSAGES,
  finance_transactions: STORES.FINANCE_TRANSACTIONS,
  finance_expenses: STORES.FINANCE_EXPENSES,
  finance_associates: STORES.FINANCE_ASSOCIATES,
  finance_salary_profiles: STORES.FINANCE_SALARY_PROFILES,
  finance_payroll_runs: STORES.FINANCE_PAYROLL_RUNS,
  finance_payroll_items: STORES.FINANCE_PAYROLL_ITEMS,
  commissions: STORES.COMMISSIONS,
  portefeuilles: STORES.PORTEFEUILLES,
  portefeuille_versements: STORES.PORTEFEUILLE_VERSEMENTS,
  portefeuille_versement_lignes: STORES.PORTEFEUILLE_VERSEMENT_LIGNES,
  interventions_techniques: STORES.INTERVENTIONS_TECHNIQUES,
  tickets: STORES.TICKETS,
  tickets_techniques: STORES.TICKETS_TECHNIQUES,
  beneficiaire_attributions: STORES.BENEFICIAIRE_ATTRIBUTIONS,
  acquisitions_brouillon: STORES.ACQUISITIONS_BROUILLON,
};

export interface HttpCacheEntry {
  key: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  cachedAt: number;
}

export interface HttpMutation {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  responseMode: 'empty' | 'object' | 'array';
  createdAt: number;
  retries: number;
  status: 'pending' | 'error';
  error?: string;
  nextRetryAt?: number;
}

export async function cacheHttpResponse(entry: HttpCacheEntry): Promise<void> {
  // Keep a single bounded entry per exact user/query. Large binary responses are excluded upstream.
  await putItem(STORES.HTTP_CACHE, entry);
}

export async function getCachedHttpResponse(key: string): Promise<HttpCacheEntry | null> {
  return getItem(STORES.HTTP_CACHE, key);
}

export async function deleteCachedHttpResponse(key: string): Promise<void> {
  await deleteItem(STORES.HTTP_CACHE, key);
}

export async function getAllHttpCacheEntries(): Promise<HttpCacheEntry[]> {
  return (await getAllItems(STORES.HTTP_CACHE)) as HttpCacheEntry[];
}



export async function addHttpMutation(
  input: Omit<HttpMutation, 'id' | 'createdAt' | 'retries' | 'status'>
): Promise<void> {
  await putItem(STORES.HTTP_MUTATIONS, {
    ...input,
    createdAt: Date.now(),
    retries: 0,
    status: 'pending',
    nextRetryAt: 0,
  });
}

export async function getPendingHttpMutations(): Promise<HttpMutation[]> {
  const now = Date.now();
  const all = (await getAllItems(STORES.HTTP_MUTATIONS)) as HttpMutation[];
  return all
    .filter((item) => (item.status === 'pending' || item.status === 'error') && (!item.nextRetryAt || item.nextRetryAt <= now))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markHttpMutationError(id: number, error: string): Promise<void> {
  const item = (await getItem(STORES.HTTP_MUTATIONS, id)) as HttpMutation | undefined;
  if (!item) return;
  const retries = (item.retries || 0) + 1;
  item.status = 'error';
  item.retries = retries;
  item.error = error;
  item.nextRetryAt = Date.now() + Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.min(retries, 8));
  await putItem(STORES.HTTP_MUTATIONS, item);
}

export async function deleteHttpMutation(id: number): Promise<void> {
  await deleteItem(STORES.HTTP_MUTATIONS, id);
}

export async function getHttpMutationStats(): Promise<{ pending: number; error: number; total: number }> {
  const all = (await getAllItems(STORES.HTTP_MUTATIONS)) as HttpMutation[];
  return {
    pending: all.filter((x) => x.status === 'pending').length,
    error: all.filter((x) => x.status === 'error').length,
    total: all.length,
  };
}

export async function cachePermissionMatrix(matrix: Record<string, string[]>): Promise<void> {
  await putItem(STORES.META, {
    key: 'permissions_matrix',
    matrix,
    timestamp: new Date().toISOString(),
  });
}

export async function getCachedPermissionMatrix(): Promise<Record<string, string[]> | null> {
  const item = await getItem(STORES.META, 'permissions_matrix');
  return item?.matrix || null;
}
