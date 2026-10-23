import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  cacheClients, cachePlantations, cacheReferenceData,
  getCachedClients, getCachedPlantations, getCachedItems,
  getPendingSyncOps, clearSyncedOps, addToSyncQueue, markOpStatus,
  getLastSyncTime, setLastSyncTime, getOfflineStats, getSyncQueueStats,
  STORES, type SyncOperation, getHttpMutationStats, retryAllHttpMutations, persistQueuedMutation,
} from '@/lib/offlineDb';
import { useToast } from '@/hooks/use-toast';
import { resolveUpdateConflict } from '@/lib/offlineConflict';
import { flushFileQueue, countQueuedFiles, startFileQueueResume } from '@/lib/offlineFiles';
import { flushOfflineHttpQueue, refreshPendingMutationAuthorization, scheduleBackgroundOfflineSync } from '@/lib/offlineHttp';

const SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes
const SLOW_NET_THRESHOLD = 1500; // ms
let offlinePersistenceRequested = false;
let legacyPushInProgress = false;

// Reference tables to cache for full offline use
const REF_TABLES = [
  { store: STORES.OFFRES, table: 'offres' },
  { store: STORES.ACQUISITIONS, table: 'acquisitions' },
  { store: STORES.DISTRICTS, table: 'districts' },
  { store: STORES.REGIONS, table: 'regions' },
  { store: STORES.DEPARTEMENTS, table: 'departements' },
  { store: STORES.SOUS_PREFECTURES, table: 'sous_prefectures' },
  { store: STORES.VILLAGES, table: 'villages' },
  { store: STORES.PROFILES, table: 'profiles' },
  { store: STORES.USER_ROLES, table: 'user_roles' },
  { store: STORES.ROLE_PERMISSIONS, table: 'role_permissions' },
  { store: STORES.DEPARTEMENTS_ENTREPRISE, table: 'departements_entreprise' },
  { store: STORES.APP_ROLES, table: 'app_roles' },
  { store: STORES.OFFRE_FORM_ETAPES, table: 'offre_formulaire_etapes' },
  { store: STORES.OFFRE_FORM_DOCUMENTS, table: 'offre_formulaire_documents' },
  { store: STORES.OFFRE_FORM_CONTRATS, table: 'offre_formulaire_contrats' },
  { store: STORES.CONVENTIONS_FONCIERES, table: 'conventions_foncieres' },
  { store: STORES.LOTS_HECTARES, table: 'lots_hectares' },
  { store: STORES.DOCUMENTS_ACQUISITION, table: 'documents_acquisition' },
  { store: STORES.PORTAIL_MESSAGES, table: 'portail_messages' },
  { store: STORES.BENEFICIAIRE_ATTRIBUTIONS, table: 'beneficiaire_attributions' },
  { store: STORES.CARTES_PERSONNEL, table: 'cartes_personnel' },
  { store: STORES.COMMISSIONS, table: 'commissions' },
  { store: STORES.PORTEFEUILLES, table: 'portefeuilles' },
  { store: STORES.PORTEFEUILLE_VERSEMENTS, table: 'portefeuille_versements' },
  { store: STORES.PORTEFEUILLE_VERSEMENT_LIGNES, table: 'portefeuille_versement_lignes' },
  { store: STORES.INTERVENTIONS_TECHNIQUES, table: 'interventions_techniques' },
  
  { store: STORES.TICKETS_TECHNIQUES, table: 'tickets_techniques' },
  { store: STORES.FINANCE_TRANSACTIONS, table: 'finance_transactions' },
  { store: STORES.FINANCE_EXPENSES, table: 'finance_expenses' },
  { store: STORES.FINANCE_ASSOCIATES, table: 'finance_associates' },
  { store: STORES.FINANCE_SALARY_PROFILES, table: 'finance_salary_profiles' },
  { store: STORES.FINANCE_PAYROLL_RUNS, table: 'finance_payroll_runs' },
  { store: STORES.FINANCE_PAYROLL_ITEMS, table: 'finance_payroll_items' },
  { store: STORES.ACQUISITIONS_BROUILLON, table: 'acquisitions_brouillon' },
] as const;

export function useOfflineSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingFiles, setPendingFiles] = useState(0);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'slow' | 'offline'>('good');
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncLockRef = useRef(false);

  // Measure network latency
  const checkNetworkQuality = useCallback(async () => {
    if (!navigator.onLine) { setNetworkQuality('offline'); return 'offline' as const; }
    try {
      const start = performance.now();
       await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
         headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(5000),
      });
      const latency = performance.now() - start;
      const quality = latency > SLOW_NET_THRESHOLD ? 'slow' : 'good';
      setNetworkQuality(quality);
      return quality;
    } catch {
      setNetworkQuality('slow');
      return 'slow' as const;
    }
  }, []);

  // Pull reference and secondary tables into IndexedDB. Each dataset is refreshed
  // only when its local snapshot is missing or older than 15 minutes.
  const pullReferenceData = useCallback(async () => {
    const REFRESH_MS = 15 * 60 * 1000;
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 50;

    for (const { store, table } of REF_TABLES) {
      try {
        const last = await getLastSyncTime(store);
        if (last && Date.now() - new Date(last).getTime() < REFRESH_MS) continue;

        let offset = 0;
        let pages = 0;

        while (pages < MAX_PAGES) {
          const { data, error } = await (supabase as any)
            .from(table)
            .select('*')
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) throw error;
          if (!data?.length) break;

          await cacheReferenceData(store, data);

          if (data.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
          pages++;
        }
      } catch (err) {
        console.warn(`[OfflineSync] Failed to cache ${table}:`, err);
      }
    }
  }, []);

  // Pull main data from Supabase → IndexedDB (incremental)
  const pullData = useCallback(async () => {
    if (!navigator.onLine || !user) return;
    try {
      // Field-team essentials (incremental by updated_at)
      const MAIN_TABLES: Array<{ store: string; table: string; ts?: string }> = [
        { store: STORES.CLIENTS, table: 'clients' },
        { store: STORES.PROSPECTS, table: 'prospects' },
        { store: STORES.PLANTATIONS, table: 'plantations' },
        { store: STORES.PAIEMENTS, table: 'paiements' },
        { store: STORES.LEADS, table: 'leads' },
        { store: STORES.LEAD_RELANCES, table: 'lead_relances', ts: 'created_at' },
        { store: STORES.PROPRIETAIRES_TERRES, table: 'proprietaires_terres' },
        { store: STORES.PARCELLES, table: 'parcelles' },
        { store: STORES.RAPPORTS_VISITES, table: 'rapports_visites_techniques' },
        { store: STORES.RAPPORTS_MEDIAS, table: 'rapports_visites_medias' },
      ];
      for (const { store, table, ts = 'updated_at' } of MAIN_TABLES) {
        try {
          const lastSync = await getLastSyncTime(store);
          const PAGE_SIZE = 1000;
          const MAX_PAGES = 100;
          let offset = 0;
          let page = 0;
          let fetched = 0;

          while (page < MAX_PAGES) {
            let q = (supabase as any).from(table).select('*');
            if (lastSync) q = q.gte(ts, lastSync);
            const { data, error } = await q
              .order(ts, { ascending: false })
              .range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;
            if (!data?.length) break;

            await cacheReferenceData(store, data);
            fetched += data.length;

            if (data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
            page++;
          }

          if (fetched > 0) {
            await setLastSyncTime(store);
          }
        } catch (err) {
          console.warn(`[OfflineSync] Pull ${table} failed`, err);
        }
      }

      // Reference tables (full cache)
      await pullReferenceData();

      setLastSync(new Date().toISOString());
    } catch (error) {
      console.error('[OfflineSync] Pull error:', error);
    }
  }, [user, pullReferenceData]);

  // Push pending local changes → Supabase with per-op error handling
  const pushData = useCallback(async () => {
    if (!navigator.onLine) return;

    const runQueue = async () => {
      // Lire la file seulement après avoir obtenu le verrou partagé entre onglets.
      const pendingOps = await getPendingSyncOps();
      if (!pendingOps.length) return;

      const managesSyncState = !syncLockRef.current;
      if (managesSyncState) setIsSyncing(true);
      let syncedCount = 0;
      let conflictCount = 0;
      const conflictDetails: string[] = [];

      try {
        for (const op of pendingOps) {
          try {
            await markOpStatus(op.id!, 'syncing');
            let result: any;

            if (op.operation === 'insert') {
              result = await (supabase as any).from(op.table).upsert(op.data, { onConflict: 'id' });
            } else if (op.operation === 'update') {
              const res = await resolveUpdateConflict(op.table, op.record_id, op.data, op.timestamp);
              if (res.conflicted) {
                conflictCount++;
                const fields = (res.conflictingFields || []).slice(0, 5).join(', ');
                const detail = `${op.table} #${op.record_id}${fields ? ` — champs conservés côté serveur : ${fields}` : ''}`;
                conflictDetails.push(detail);
                console.warn('[OfflineSync] Conflit détecté; données serveur préservées', { table: op.table, recordId: op.record_id, fields: res.conflictingFields || [] });
              }
              if (res.skipped) {
                await markOpStatus(op.id!, 'synced');
                syncedCount++;
                continue;
              }
              result = await (supabase as any).from(op.table).update(res.payload).eq('id', op.record_id);
            } else if (op.operation === 'delete') {
              result = await (supabase as any).from(op.table).delete().eq('id', op.record_id);
            }

            if (result?.error) throw new Error(result.error.message);
            await markOpStatus(op.id!, 'synced');
            syncedCount++;
          } catch (error: any) {
            console.error('[OfflineSync] Push error for op:', op.id, error);
            await markOpStatus(op.id!, 'error', error?.message || 'Unknown error');
          }
        }

        await clearSyncedOps();
        const uploadedFiles = await flushFileQueue();
        const [fileCount, stats, httpStats] = await Promise.all([
          countQueuedFiles(),
          getSyncQueueStats(),
          getHttpMutationStats(),
        ]);
        setPendingFiles(fileCount);
        setPendingCount(stats.pending + stats.error + httpStats.pending + httpStats.error);

        const failedCount = stats.error + httpStats.error;
        if (syncedCount > 0 || uploadedFiles > 0 || conflictCount > 0 || failedCount > 0) {
          window.dispatchEvent(new CustomEvent('offline-sync-complete', {
            detail: { synced: syncedCount, files: uploadedFiles, conflicts: conflictCount, failed: failedCount, conflictDetails },
          }));
          // Synchronisation automatique silencieuse : aucun message technique ne doit interrompre l'utilisateur.
          // Les opérations non confirmées restent dans la file locale et seront réessayées automatiquement.
        }
      } finally {
        if (managesSyncState) setIsSyncing(false);
      }
    };

    const lockManager = (navigator as any).locks;
    if (lockManager && typeof lockManager.request === 'function') {
      await lockManager.request('agricapital-legacy-sync-queue', { mode: 'exclusive' }, runQueue);
      return;
    }

    // Repli pour les navigateurs sans Web Locks : verrou partagé par les hooks du même onglet.
    if (legacyPushInProgress) return;
    legacyPushInProgress = true;
    try { await runQueue(); }
    finally { legacyPushInProgress = false; }
  }, [toast]);
  // Full sync: push then pull
  const syncNow = useCallback(async () => {
    if (syncLockRef.current) return;
    if (!navigator.onLine) {
      return;
    }
    syncLockRef.current = true;
    setIsSyncing(true);
    try {
      // Replace stale queued credentials with the currently refreshed Supabase session
      // before replaying mutations that may have waited through an offline period.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        await refreshPendingMutationAuthorization(sessionData.session.access_token);
      }
      await retryAllHttpMutations(); // Une synchronisation manuelle force la reprise des requêtes en erreur.
      await flushOfflineHttpQueue();
      await pushData();
      await flushOfflineHttpQueue();
      await flushFileQueue();
      await pullData();
      const [httpStats, localStats, queuedFiles] = await Promise.all([
        getHttpMutationStats(),
        getSyncQueueStats(),
        countQueuedFiles(),
      ]);
      setPendingCount(httpStats.pending + httpStats.error + localStats.pending + localStats.error);
      setPendingFiles(queuedFiles);
      // La synchronisation reste silencieuse pour l'utilisateur. La file locale
      // conserve les éléments en attente jusqu'à confirmation serveur.
    } finally {
      setIsSyncing(false);
      syncLockRef.current = false;
    }
  }, [pushData, pullData, toast]);

  // Queue an offline mutation + update local cache immediately
  const queueMutation = useCallback(async (
    table: string,
    operation: 'insert' | 'update' | 'delete',
    recordId: string,
    data: any
  ) => {
    // Optimistic local update et file de synchronisation dans une seule transaction.
    const storeMap: Record<string, string> = {
      clients: STORES.CLIENTS,
      plantations: STORES.PLANTATIONS,
      paiements: STORES.PAIEMENTS,
      leads: STORES.LEADS,
      prospects: STORES.PROSPECTS,
      lead_relances: STORES.LEAD_RELANCES,
      proprietaires_terres: STORES.PROPRIETAIRES_TERRES,
      parcelles: STORES.PARCELLES,
      rapports_visites_techniques: STORES.RAPPORTS_VISITES,
      rapports_visites_medias: STORES.RAPPORTS_MEDIAS,
    };
    const store = storeMap[table];
    const existing = store && operation === "update" ? await getCachedItems(store).then(items => items.find((item: any) => String(item.id) === String(recordId))) : null;
    await persistQueuedMutation({
      table, operation, record_id: recordId, data: { ...data, id: recordId }, timestamp: Date.now(),
      storeName: store,
      record: operation === "delete" ? undefined : {
        ...(existing || {}), id: recordId, ...data, _offline: true,
        _pending: operation === "insert" ? "insert" : "update", updated_at: new Date().toISOString(),
      },
    });

    const stats = await getSyncQueueStats();
    setPendingCount(stats.pending + stats.error);

    // If online, sync immediately
    if (navigator.onLine) {
      setTimeout(() => pushData(), 300);
    }
  }, [pushData]);

  // Get cached data for offline use
  const getOfflineClients = useCallback(() => getCachedClients(), []);
  const getOfflinePlantations = useCallback(() => getCachedPlantations(), []);
  const getOfflineItems = useCallback((store: string) => getCachedItems(store), []);
  const getStats = useCallback(() => getOfflineStats(), []);

  // Keep the global pending counter aligned with the generic REST queue,
  // including background flushes triggered by the network layer itself.
  useEffect(() => {
    const refreshQueueCount = async () => {
      const [localStats, httpStats, queuedFiles] = await Promise.all([
        getSyncQueueStats(),
        getHttpMutationStats(),
        countQueuedFiles(),
      ]);
      setPendingCount(
        localStats.pending + localStats.error + httpStats.pending + httpStats.error
      );
      setPendingFiles(queuedFiles);
    };

    const queued = () => { void refreshQueueCount(); };
    window.addEventListener("offline-mutation-queued", queued);
    window.addEventListener("offline-http-sync-complete", queued);
    window.addEventListener("offline-file-queue-updated", queued);
    return () => {
      window.removeEventListener("offline-mutation-queued", queued);
      window.removeEventListener("offline-http-sync-complete", queued);
      window.removeEventListener("offline-file-queue-updated", queued);
    };
  }, []);

  // Network status monitoring
  useEffect(() => {
    // Demander au navigateur de préserver le cache métier et la file locale.
    // L'API peut refuser la persistance; la synchronisation normale reste active.
    if (!offlinePersistenceRequested && "storage" in navigator && typeof navigator.storage?.persist === "function") {
      offlinePersistenceRequested = true;
      void navigator.storage.persist().catch(() => false);
    }
    // Reprise persistante des pièces jointes (au démarrage, au retour réseau, périodiquement)
    const stopResume = startFileQueueResume();
    const handleOnline = async () => {
      setIsOnline(true);
      const quality = await checkNetworkQuality();
      if (quality !== 'offline') {
        toast({ title: 'Connexion rétablie', description: 'Synchronisation automatique en cours...' });
        syncNow();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setNetworkQuality('offline');
      toast({ variant: 'destructive', title: 'Mode hors ligne', description: 'Vos modifications seront synchronisées automatiquement.' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      stopResume();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, toast, checkNetworkQuality]);

  // Initial sync + periodic sync + slow network detection
  useEffect(() => {
    if (user && navigator.onLine) {
      pullData();
      checkNetworkQuality();
    }

    // Load pending count
    Promise.all([getSyncQueueStats(), getHttpMutationStats()]).then(([s, h]) => {
      const totalPending = s.pending + s.error + h.pending + h.error;
      setPendingCount(totalPending);
      // Register the existing queue too, not only new writes created after this release.
      if (totalPending > 0) void scheduleBackgroundOfflineSync();
    });
    countQueuedFiles().then((count) => {
      setPendingFiles(count);
      if (count > 0) void scheduleBackgroundOfflineSync();
    });

    syncIntervalRef.current = setInterval(async () => {
      if (navigator.onLine && user && !syncLockRef.current) {
        const quality = await checkNetworkQuality();
        // On slow network, trigger sync to push pending changes
        if (quality === 'slow') {
          console.log('[OfflineSync] Slow network detected, pushing pending...');
          await pushData();
          await flushOfflineHttpQueue();
        } else {
          await pullData();
        }
      }
    }, SYNC_INTERVAL);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [user, pullData, pushData, checkNetworkQuality]);

  return {
    isOnline,
    isSyncing,
    lastSync,
    pendingCount,
    pendingFiles,
    networkQuality,
    syncNow,
    queueMutation,
    getOfflineClients,
    getOfflinePlantations,
    getOfflineItems,
    getStats,
  };
}
