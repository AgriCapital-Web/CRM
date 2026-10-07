import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  cacheClients, cachePlantations, cacheReferenceData,
  getCachedClients, getCachedPlantations, getCachedItems,
  getPendingSyncOps, clearSyncedOps, addToSyncQueue, markOpStatus,
  getLastSyncTime, setLastSyncTime, getOfflineStats, getSyncQueueStats,
  STORES, type SyncOperation, getHttpMutationStats,
} from '@/lib/offlineDb';
import { useToast } from '@/hooks/use-toast';
import { resolveUpdateConflict } from '@/lib/offlineConflict';
import { flushFileQueue, countQueuedFiles, startFileQueueResume } from '@/lib/offlineFiles';
import { flushOfflineHttpQueue } from '@/lib/offlineHttp';

const SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes
const SLOW_NET_THRESHOLD = 1500; // ms

// Reference tables to cache for full offline use
const REF_TABLES = [
  { store: STORES.OFFRES, table: 'offres' },
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
  { store: STORES.COMMISSIONS, table: 'commissions' },
  { store: STORES.PORTEFEUILLES, table: 'portefeuilles' },
  { store: STORES.PORTEFEUILLE_VERSEMENTS, table: 'portefeuille_versements' },
  { store: STORES.PORTEFEUILLE_VERSEMENT_LIGNES, table: 'portefeuille_versement_lignes' },
  { store: STORES.INTERVENTIONS_TECHNIQUES, table: 'interventions_techniques' },
  { store: STORES.TICKETS, table: 'tickets' },
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
      const MAIN_TABLES: Array<{ store: string; table: string }> = [
        { store: STORES.CLIENTS, table: 'clients' },
        { store: STORES.PLANTATIONS, table: 'plantations' },
        { store: STORES.PAIEMENTS, table: 'paiements' },
        { store: STORES.LEADS, table: 'leads' },
        { store: STORES.LEAD_RELANCES, table: 'lead_relances' },
        { store: STORES.PROPRIETAIRES_TERRES, table: 'proprietaires_terres' },
        { store: STORES.PARCELLES, table: 'parcelles' },
        { store: STORES.RAPPORTS_VISITES, table: 'rapports_visites_techniques' },
        { store: STORES.RAPPORTS_MEDIAS, table: 'rapports_visites_medias' },
      ];
      for (const { store, table } of MAIN_TABLES) {
        try {
          const lastSync = await getLastSyncTime(store);
          const PAGE_SIZE = 1000;
          const MAX_PAGES = 100;
          let offset = 0;
          let page = 0;
          let fetched = 0;

          while (page < MAX_PAGES) {
            let q = (supabase as any).from(table).select('*');
            if (lastSync) q = q.gte('updated_at', lastSync);
            const { data, error } = await q
              .order('updated_at', { ascending: false })
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
    const pendingOps = await getPendingSyncOps();
    if (!pendingOps.length) return;

    setIsSyncing(true);
    let syncedCount = 0;
    let conflictCount = 0;

    for (const op of pendingOps) {
      try {
        await markOpStatus(op.id!, 'syncing');
        let result: any;

        if (op.operation === 'insert') {
          // Les inserts hors ligne utilisent un UUID client : l'upsert rend la reprise idempotente
          // si l'application est interrompue après l'écriture serveur mais avant le marquage local.
          result = await (supabase as any).from(op.table).upsert(op.data, { onConflict: 'id' });
        } else if (op.operation === 'update') {
          // Résolution de conflit multi-appareils (merge par champ / last-write-wins)
          const res = await resolveUpdateConflict(op.table, op.record_id, op.data, op.timestamp);
          if (res.conflicted) conflictCount++;
          if (res.skipped) {
            await markOpStatus(op.id!, 'synced');
            syncedCount++;
            continue;
          }
          result = await (supabase as any).from(op.table).update(res.payload).eq('id', op.record_id);
        } else if (op.operation === 'delete') {
          result = await (supabase as any).from(op.table).delete().eq('id', op.record_id);
        }

        if (result?.error) {
          throw new Error(result.error.message);
        }

        await markOpStatus(op.id!, 'synced');
        syncedCount++;
      } catch (error: any) {
        console.error('[OfflineSync] Push error for op:', op.id, error);
        await markOpStatus(op.id!, 'error', error?.message || 'Unknown error');
      }
    }

    await clearSyncedOps();
    // Upload des pièces jointes mises en file
    const uploadedFiles = await flushFileQueue();
    setPendingFiles(await countQueuedFiles());
    const stats = await getSyncQueueStats();
    setPendingCount(stats.pending + stats.error);
    setIsSyncing(false);

    if (syncedCount > 0 || uploadedFiles > 0) {
      // Rafraîchissement des listes/pages concernées sans rechargement
      window.dispatchEvent(new CustomEvent('offline-sync-complete', {
        detail: { synced: syncedCount, files: uploadedFiles, conflicts: conflictCount },
      }));
      toast({
        title: 'Synchronisation terminée',
        description: `${syncedCount} modification(s), ${uploadedFiles} fichier(s) envoyé(s)`
          + `${conflictCount > 0 ? `, ${conflictCount} conflit(s) fusionné(s)` : ''}`
          + `${stats.error > 0 ? `, ${stats.error} erreur(s)` : ''}`,
      });
    }
  }, [toast]);

  // Full sync: push then pull
  const syncNow = useCallback(async () => {
    if (syncLockRef.current) return;
    if (!navigator.onLine) {
      toast({ variant: 'destructive', title: 'Hors ligne', description: 'Synchronisation impossible sans connexion.' });
      return;
    }
    syncLockRef.current = true;
    setIsSyncing(true);
    try {
      await flushOfflineHttpQueue();
      await pushData();
      await flushOfflineHttpQueue();
      await pullData();
      toast({ title: 'Synchronisation complète', description: 'Toutes les données sont à jour.' });
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
    await addToSyncQueue({ table, operation, record_id: recordId, data: { ...data, id: recordId }, timestamp: Date.now() });

    // Optimistic local update
    const storeMap: Record<string, string> = {
      clients: STORES.CLIENTS,
      plantations: STORES.PLANTATIONS,
      paiements: STORES.PAIEMENTS,
      leads: STORES.LEADS,
      lead_relances: STORES.LEAD_RELANCES,
      proprietaires_terres: STORES.PROPRIETAIRES_TERRES,
      parcelles: STORES.PARCELLES,
      rapports_visites_techniques: STORES.RAPPORTS_VISITES,
      rapports_visites_medias: STORES.RAPPORTS_MEDIAS,
    };
    const store = storeMap[table];
    if (store && operation !== 'delete') {
      const { putItem } = await import('@/lib/offlineDb');
      await putItem(store, { id: recordId, ...data, _offline: true, updated_at: new Date().toISOString() });
    } else if (store && operation === 'delete') {
      const { deleteItem } = await import('@/lib/offlineDb');
      await deleteItem(store, recordId);
    }

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
      const [localStats, httpStats] = await Promise.all([
        getSyncQueueStats(),
        getHttpMutationStats(),
      ]);
      setPendingCount(
        localStats.pending + localStats.error + httpStats.pending + httpStats.error
      );
    };

    const queued = () => { void refreshQueueCount(); };
    window.addEventListener("offline-mutation-queued", queued);
    window.addEventListener("offline-http-sync-complete", queued);
    return () => {
      window.removeEventListener("offline-mutation-queued", queued);
      window.removeEventListener("offline-http-sync-complete", queued);
    };
  }, []);

  // Network status monitoring
  useEffect(() => {
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
    Promise.all([getSyncQueueStats(), getHttpMutationStats()]).then(([s, h]) =>
      setPendingCount(s.pending + s.error + h.pending + h.error)
    );
    countQueuedFiles().then(setPendingFiles);

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
