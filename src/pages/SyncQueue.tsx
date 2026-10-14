import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SyncStatusBadge, OnlineBadge, type SyncState } from "@/components/offline/SyncStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { getAllItems, getHttpMutationStats, getPendingHttpMutations, retryHttpMutation, retryAllHttpMutations, deleteHttpMutation, STORES } from "@/lib/offlineDb";
import {
  getAllQueuedFiles, retryQueuedFile, retryAllQueuedFiles, discardQueuedFile,
  getFileQueueStats, startFileQueueResume, flushFileQueue,
} from "@/lib/offlineFiles";
import { RefreshCw, RotateCcw, Trash2, Wifi, WifiOff, Database, HardDrive, ShieldCheck, AlertTriangle } from "lucide-react";

export function SyncQueueContent() {
  const { isOnline, isSyncing, syncNow, pendingCount, pendingFiles, lastSync } = useOfflineSync();
  const [ops, setOps] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [fileStats, setFileStats] = useState({ pending: 0, error: 0, waiting: 0, total: 0 });
  const [httpStats, setHttpStats] = useState({ pending: 0, error: 0, total: 0 });
  const [httpMutations, setHttpMutations] = useState<any[]>([]);
  const [offlineChecks, setOfflineChecks] = useState({
    serviceWorkerSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    serviceWorkerReady: false,
    shellCached: false,
    indexedDbReady: false,
    storageEstimate: null as number | null,
    checking: true,
    error: "",
  });

  const checkOfflineReadiness = useCallback(async () => {
    setOfflineChecks((current) => ({ ...current, checking: true, error: "" }));
    try {
      const serviceWorkerSupported = "serviceWorker" in navigator;
      let serviceWorkerReady = false;
      if (serviceWorkerSupported) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        serviceWorkerReady = Boolean(registration?.active || navigator.serviceWorker.controller);
      }
      let shellCached = false;
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const key of keys.filter((item) => item.startsWith("agricapital-crm-"))) {
          const cache = await caches.open(key);
          if (await cache.match("/index.html") || await cache.match("/")) {
            shellCached = true;
            break;
          }
        }
      }
      let indexedDbReady = false;
      try {
        const request = indexedDB.open("agricapital_offline");
        indexedDbReady = await new Promise<boolean>((resolve) => {
          request.onsuccess = () => { request.result.close(); resolve(true); };
          request.onerror = () => resolve(false);
          request.onblocked = () => resolve(false);
        });
      } catch { indexedDbReady = false; }
      let storageEstimate: number | null = null;
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        storageEstimate = estimate.usage ?? null;
      }
      setOfflineChecks({ serviceWorkerSupported, serviceWorkerReady, shellCached, indexedDbReady, storageEstimate, checking: false, error: "" });
    } catch (error) {
      setOfflineChecks((current) => ({ ...current, checking: false, error: error instanceof Error ? error.message : "Vérification impossible" }));
    }
  }, []);

  const prepareOfflineMode = useCallback(async () => {
    if (!navigator.onLine) {
      await checkOfflineReadiness();
      return;
    }
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/");
      if (registration) await registration.update();
      await checkOfflineReadiness();
    } catch {
      await checkOfflineReadiness();
    }
  }, [checkOfflineReadiness]);

  const load = useCallback(async () => {
    const queue = await getAllItems(STORES.SYNC_QUEUE);
    setOps((queue as any[]).filter((o) => o.status !== "synced"));
    setFiles(await getAllQueuedFiles());
    setFileStats(await getFileQueueStats());
    await getPendingHttpMutations();
    setHttpMutations(await getAllItems(STORES.HTTP_MUTATIONS));
    setHttpStats(await getHttpMutationStats());
  }, []);

  useEffect(() => {
    void load();
    void checkOfflineReadiness();
    const stopResume = startFileQueueResume();
    const onDone = () => void load();
    window.addEventListener("offline-sync-complete", onDone);
    const t = setInterval(() => void load(), 10000);
    return () => {
      stopResume();
      window.removeEventListener("offline-sync-complete", onDone);
      clearInterval(t);
    };
  }, [load, checkOfflineReadiness]);

  useEffect(() => {
    const refresh = () => { void checkOfflineReadiness(); };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [checkOfflineReadiness]);

  const stateOf = (status: string): SyncState =>
    status === "error" ? "error" : status === "syncing" || status === "uploading" ? "syncing" : "queued";

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Synchronisation</h1>
          <p className="text-sm text-muted-foreground break-words">
            {pendingCount} opération(s), {pendingFiles} fichier(s) et {httpStats.total} requête(s) réseau en attente
            {lastSync ? ` • dernière synchro : ${new Date(lastSync).toLocaleString("fr-FR")}` : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:flex-nowrap lg:items-center">
          <div className="shrink-0"><OnlineBadge isOnline={isOnline} /></div>
          <Button
            variant="outline"
            size="sm"
            className="w-full min-w-0 sm:flex-1 lg:w-auto lg:min-w-[230px] lg:flex-none"
            onClick={async () => { await retryAllQueuedFiles(); await flushFileQueue(); await retryAllHttpMutations(); await syncNow(); await load(); }}
            disabled={!isOnline || fileStats.error + fileStats.waiting + httpStats.error === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Relancer les échecs ({fileStats.error + fileStats.waiting + httpStats.error})
          </Button>
          <Button
            onClick={async () => { await retryAllQueuedFiles(); await flushFileQueue(); await syncNow(); await load(); }}
            disabled={!isOnline || isSyncing}
            size="sm"
            className="w-full shrink-0 px-3 sm:w-auto sm:flex-none"
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span className="whitespace-nowrap">Synchroniser</span>
          </Button>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {isOnline ? <Wifi className="h-5 w-5 text-emerald-600" /> : <WifiOff className="h-5 w-5 text-amber-600" />}
            Diagnostic du mode hors ligne
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Vérifie que le navigateur a préparé les éléments nécessaires pour rouvrir le CRM sans réseau. Faites ce contrôle avant de couper Internet.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Service worker", ok: offlineChecks.serviceWorkerSupported && offlineChecks.serviceWorkerReady, detail: offlineChecks.serviceWorkerReady ? "Actif" : offlineChecks.serviceWorkerSupported ? "Pas encore actif" : "Non supporté", icon: ShieldCheck },
              { label: "Application en cache", ok: offlineChecks.shellCached, detail: offlineChecks.shellCached ? "Écran de démarrage en cache" : "Ouvrir en ligne puis réessayer", icon: HardDrive },
              { label: "Stockage local", ok: offlineChecks.indexedDbReady, detail: offlineChecks.indexedDbReady ? "IndexedDB accessible" : "Stockage non prêt", icon: Database },
              { label: "Connexion", ok: isOnline, detail: isOnline ? "En ligne" : "Hors ligne", icon: isOnline ? Wifi : WifiOff },
            ].map((check) => {
              return <div key={check.label} className="flex min-w-0 items-start gap-2 rounded-lg border p-3">
                {check.ok ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <div className="min-w-0"><p className="text-sm font-medium">{check.label}</p><p className="break-words text-xs text-muted-foreground">{check.detail}</p></div>
              </div>;
            })}
          </div>
          {offlineChecks.storageEstimate !== null && <p className="text-xs text-muted-foreground">Stockage utilisé par le site : {(offlineChecks.storageEstimate / (1024 * 1024)).toFixed(1)} Mo. Le navigateur peut appliquer ses propres limites de stockage.</p>}
          {offlineChecks.error && <p className="text-sm text-destructive">{offlineChecks.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void checkOfflineReadiness()} disabled={offlineChecks.checking}>
              <RefreshCw className={`mr-2 h-4 w-4 ${offlineChecks.checking ? "animate-spin" : ""}`} />Vérifier le mode hors ligne
            </Button>
            <Button size="sm" onClick={() => void prepareOfflineMode()} disabled={!isOnline || offlineChecks.checking}>
              <HardDrive className="mr-2 h-4 w-4" />Préparer / actualiser le cache
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Limite importante : la première ouverture, la connexion initiale et les données jamais chargées nécessitent Internet. Les données mises en cache et les opérations prises en charge peuvent rester disponibles hors ligne, puis se synchroniser au retour du réseau.</p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { l: "Fichiers en file", v: fileStats.total },
          { l: "Prêts à envoyer", v: fileStats.pending },
          { l: "En attente de reprise", v: fileStats.waiting },
          { l: "Échecs fichiers", v: fileStats.error },
          { l: "Écritures réseau", v: httpStats.total },
        ].map((s) => (
          <Card key={s.l} className="min-w-0">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">{s.l}</p>
              <p className="text-xl font-bold">{s.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-2"><CardTitle className="text-base">Requêtes réseau en attente</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          {httpMutations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune requête réseau en attente.</p> : (
            <div className="w-full overflow-x-auto">
              <Table className="responsive-data-table">
                <TableHeader><TableRow><TableHead>Méthode</TableHead><TableHead>Endpoint</TableHead><TableHead>État</TableHead><TableHead>En file depuis</TableHead><TableHead>Erreur</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>{httpMutations.map((m: any) => {
                  let endpoint = m.url || "—"; try { endpoint = new URL(m.url).pathname; } catch { /* URL invalide */ }
                  return <TableRow key={m.id}>
                    <TableCell><span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{m.method}</span></TableCell>
                    <TableCell className="max-w-[14rem] break-all font-mono text-xs">{endpoint}</TableCell>
                    <TableCell><SyncStatusBadge state={stateOf(m.status)} /><span className="mt-1 block text-[10px] text-muted-foreground">{m.retries || 0} reprise(s)</span></TableCell>
                    <TableCell className="text-xs">{m.createdAt ? new Date(m.createdAt).toLocaleString("fr-FR") : "—"}</TableCell>
                    <TableCell className="max-w-[16rem] break-words text-xs text-destructive">{m.error || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right"><div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" aria-label="Réessayer la requête" onClick={async () => { if (!m.id) return; await retryHttpMutation(m.id); await syncNow(); await load(); }} disabled={!isOnline || isSyncing}><RotateCcw className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Retirer la requête de la file" onClick={async () => { if (!m.id) return; await deleteHttpMutation(m.id); await load(); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader><CardTitle className="text-base">Opérations de données</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          {ops.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune opération en attente.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>État</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ops.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>{op.table}</TableCell>
                      <TableCell>{op.operation}</TableCell>
                      <TableCell className="text-xs">{new Date(op.timestamp).toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        <SyncStatusBadge state={stateOf(op.status)} />
                        {op.error && <p className="mt-1 text-xs text-destructive break-words">{op.error}</p>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader><CardTitle className="text-base">Pièces jointes en attente</CardTitle></CardHeader>
        <CardContent className="min-w-0">
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun fichier en attente.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Chemin</TableHead>
                    <TableHead>Rattachement</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.bucket}</TableCell>
                      <TableCell className="text-xs break-all">{f.path}</TableCell>
                      <TableCell className="text-xs">
                        {f.table ? `${f.table}.${f.column || "—"}` : "sans rattachement"}
                        <br />
                        <span className="text-muted-foreground">{f.record_id || f.form_id ? "Enregistrement lié" : "Sans rattachement"}</span>
                      </TableCell>
                      <TableCell>
                        <SyncStatusBadge state={stateOf(f.status)} />
                        {f.error && <p className="mt-1 text-xs text-destructive break-words">{f.error}</p>}
                        {f.retries > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Tentative {f.retries}
                            {f.nextRetryAt > Date.now() ? ` • reprise à ${new Date(f.nextRetryAt).toLocaleTimeString("fr-FR")}` : " • reprise automatique"}
                          </p>
                        )}
                        {(f.form_id || f.field) && <p className="mt-1 text-xs text-muted-foreground">Formulaire associé • {f.field || "pièce jointe"}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" aria-label="Relancer" onClick={async () => { await retryQueuedFile(f.id); await syncNow(); await load(); }} disabled={!isOnline}>
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Supprimer de la file" onClick={async () => { await discardQueuedFile(f.id); await load(); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SyncQueue() {
  return (
    <ProtectedRoute>
      <MainLayout>
        <SyncQueueContent />
      </MainLayout>
    </ProtectedRoute>
  );
}
