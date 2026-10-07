import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SyncStatusBadge, OnlineBadge, type SyncState } from "@/components/offline/SyncStatusBadge";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { getAllItems, getHttpMutationStats, STORES } from "@/lib/offlineDb";
import {
  getAllQueuedFiles, retryQueuedFile, retryAllQueuedFiles, discardQueuedFile,
  getFileQueueStats, startFileQueueResume,
} from "@/lib/offlineFiles";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";

export function SyncQueueContent() {
  const { isOnline, isSyncing, syncNow, pendingCount, pendingFiles, lastSync } = useOfflineSync();
  const [ops, setOps] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [fileStats, setFileStats] = useState({ pending: 0, error: 0, waiting: 0, total: 0 });
  const [httpStats, setHttpStats] = useState({ pending: 0, error: 0, total: 0 });

  const load = useCallback(async () => {
    const queue = await getAllItems(STORES.SYNC_QUEUE);
    setOps((queue as any[]).filter((o) => o.status !== "synced"));
    setFiles(await getAllQueuedFiles());
    setFileStats(await getFileQueueStats());
    setHttpStats(await getHttpMutationStats());
  }, []);

  useEffect(() => {
    void load();
    const stopResume = startFileQueueResume();
    const onDone = () => void load();
    window.addEventListener("offline-sync-complete", onDone);
    const t = setInterval(() => void load(), 10000);
    return () => {
      stopResume();
      window.removeEventListener("offline-sync-complete", onDone);
      clearInterval(t);
    };
  }, [load]);

  const stateOf = (status: string): SyncState =>
    status === "error" ? "error" : status === "syncing" ? "syncing" : "queued";

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
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
          <OnlineBadge isOnline={isOnline} />
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:flex-1 lg:w-auto"
            onClick={async () => { await retryAllQueuedFiles(); await syncNow(); await load(); }}
            disabled={!isOnline || fileStats.error + fileStats.waiting === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Relancer les échecs ({fileStats.error + fileStats.waiting})
          </Button>
          <Button
            onClick={syncNow}
            disabled={!isOnline || isSyncing}
            size="sm"
            className="w-full sm:flex-1 lg:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            Synchroniser
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
        {[
          { l: "Fichiers en file", v: fileStats.total },
          { l: "Prêts à envoyer", v: fileStats.pending },
          { l: "En attente de reprise", v: fileStats.waiting },
          { l: "Échecs fichiers", v: fileStats.error },
          { l: "Écritures réseau", v: httpStats.total },
        ].map((s) => (
          <Card key={s.l}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.l}</p>
              <p className="text-xl font-bold">{s.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                    <TableHead>Enregistrement</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>État</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ops.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>{op.table}</TableCell>
                      <TableCell>{op.operation}</TableCell>
                      <TableCell className="font-mono text-xs">{String(op.record_id).slice(0, 12)}…</TableCell>
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
                        {f.table ? `${f.table}.${f.column || "—"}` : "en attente d'ID"}
                        <br />
                        <span className="text-muted-foreground">{f.record_id ? String(f.record_id).slice(0, 8) + "…" : f.form_id || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <SyncStatusBadge state={f.status === "error" ? "error" : "queued"} />
                        {f.error && <p className="mt-1 text-xs text-destructive break-words">{f.error}</p>}
                        {f.retries > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Tentative {f.retries}
                            {f.nextRetryAt > Date.now() ? ` • reprise à ${new Date(f.nextRetryAt).toLocaleTimeString("fr-FR")}` : " • reprise automatique"}
                          </p>
                        )}
                        {(f.form_id || f.field) && <p className="mt-1 text-xs text-muted-foreground">Formulaire {f.form_id || "—"} • {f.field || "pièce jointe"}</p>}
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
