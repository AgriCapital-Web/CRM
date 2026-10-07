import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOfflineStats, getSyncQueueStats, getLastSyncTime, getAllItems, clearStore, STORES } from "@/lib/offlineDb";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { RefreshCw, Trash2, Database, Wifi, WifiOff, Clock, AlertTriangle, CheckCircle2, Download, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV, exportAllOfflineData, type ExportType } from "@/utils/csvExport";
import { getSafeErrorMessage } from "@/lib/safeError";

const STORE_LABELS: Record<string, string> = {
  CLIENTS: "Clients",
  PLANTATIONS: "Plantations",
  PAIEMENTS: "Paiements",
  OFFRES: "Offres",
  DISTRICTS: "Districts",
  REGIONS: "Régions",
  DEPARTEMENTS: "Départements",
  SOUS_PREFECTURES: "Sous-préfectures",
  VILLAGES: "Villages",
};

const DiagnosticOffline = () => {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [syncStats, setSyncStats] = useState({ pending: 0, error: 0, total: 0 });
  const [lastSyncTimes, setLastSyncTimes] = useState<Record<string, string | null>>({});
  const [pendingOps, setPendingOps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOnline, isSyncing, syncNow, pendingCount, networkQuality } = useOfflineSync();
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExportSingle = async (type: ExportType) => {
    setExporting(true);
    try {
      const storeMap: Record<ExportType, string> = {
        clients: STORES.CLIENTS,
        plantations: STORES.PLANTATIONS,
        paiements: STORES.PAIEMENTS,
      };
      const data = await getAllItems(storeMap[type]);
      const result = await exportToCSV(type, data);
      if (result.success) {
        toast({ title: "Export réussi", description: `${result.count} enregistrement(s) exporté(s) en CSV.` });
      } else {
        toast({ variant: "destructive", title: "Aucune donnée", description: "Pas de données en cache pour cet export." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur d'export", description: getSafeErrorMessage(e) });
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const results = await exportAllOfflineData();
      const total = Object.values(results).reduce((acc, r) => acc + (r.count || 0), 0);
      toast({ title: "Export complet", description: `${total} enregistrement(s) exporté(s) en ${Object.keys(results).length} fichier(s) CSV.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally {
      setExporting(false);
    }
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const [offlineStats, queueStats] = await Promise.all([
        getOfflineStats(),
        getSyncQueueStats(),
      ]);
      setStats(offlineStats);
      setSyncStats(queueStats);

      const storeKeys = Object.values(STORES).filter(
        s => s !== "sync_queue" && s !== "auth_cache" && s !== "meta"
      );
      const times: Record<string, string | null> = {};
      for (const store of storeKeys) {
        times[store] = await getLastSyncTime(store);
      }
      setLastSyncTimes(times);

      const ops = await getAllItems(STORES.SYNC_QUEUE);
      setPendingOps(ops.filter(o => o.status !== "synced").slice(0, 20));
    } catch (e) {
      console.error("Error loading offline stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const handleClearCache = async (storeName: string) => {
    try {
      await clearStore(storeName);
      toast({ title: "Cache vidé", description: `Le cache ${storeName} a été vidé.` });
      loadStats();
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de vider le cache." });
    }
  };

  const handleClearAll = async () => {
    const storeKeys = Object.values(STORES).filter(s => s !== "auth_cache" && s !== "meta");
    for (const store of storeKeys) {
      await clearStore(store);
    }
    toast({ title: "Cache complet vidé", description: "Toutes les données hors ligne ont été supprimées." });
    loadStats();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Jamais";
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const totalCached = Object.entries(stats)
    .filter(([k]) => !["PENDING_SYNC", "ERROR_SYNC"].includes(k))
    .reduce((acc, [, v]) => acc + v, 0);

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {isOnline ? <Wifi className="h-8 w-8 text-green-500" /> : <WifiOff className="h-8 w-8 text-destructive" />}
              <div>
                <p className="text-sm text-muted-foreground">Réseau</p>
                <p className="text-lg font-semibold">
                  {!isOnline ? "Hors ligne" : networkQuality === "slow" ? "Lent" : "En ligne"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Éléments cachés</p>
                <p className="text-lg font-semibold">{totalCached.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {syncStats.pending > 0 ? <Clock className="h-8 w-8 text-yellow-500" /> : <CheckCircle2 className="h-8 w-8 text-green-500" />}
              <div>
                <p className="text-sm text-muted-foreground">En attente</p>
                <p className="text-lg font-semibold">{syncStats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {syncStats.error > 0 ? <AlertTriangle className="h-8 w-8 text-destructive" /> : <CheckCircle2 className="h-8 w-8 text-green-500" />}
              <div>
                <p className="text-sm text-muted-foreground">Erreurs sync</p>
                <p className="text-lg font-semibold">{syncStats.error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions — Sync se fait en arrière-plan automatiquement */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={loadStats} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir les stats
        </Button>
        <Button onClick={handleExportAll} variant="secondary" size="sm" disabled={exporting}>
          <Download className={`h-4 w-4 mr-2 ${exporting ? "animate-pulse" : ""}`} />
          {exporting ? "Export en cours..." : "Exporter tout en CSV"}
        </Button>
        <p className="text-xs text-muted-foreground self-center ml-2">
          {isSyncing ? "Synchronisation en cours..." : isOnline ? "Synchronisation automatique active" : "Hors ligne — les modifications seront synchronisées automatiquement au retour du réseau"}
        </p>
      </div>

      {/* CSV Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export CSV hors ligne
          </CardTitle>
          <CardDescription>Téléchargez les données en cache au format CSV pour sauvegarde locale</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { type: 'clients' as ExportType, label: 'Clients', count: stats['CLIENTS'] || 0 },
              { type: 'plantations' as ExportType, label: 'Plantations', count: stats['PLANTATIONS'] || 0 },
              { type: 'paiements' as ExportType, label: 'Paiements', count: stats['PAIEMENTS'] || 0 },
            ]).map(({ type, label, count }) => (
              <Button
                key={type}
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                disabled={exporting || count === 0}
                onClick={() => handleExportSingle(type)}
              >
                <Download className="h-5 w-5" />
                <span className="font-medium">{label}</span>
                <Badge variant={count > 0 ? "default" : "secondary"} className="text-xs">{count} élément(s)</Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cache Details */}
      <Card>
        <CardHeader>
          <CardTitle>Détail du cache IndexedDB</CardTitle>
          <CardDescription>Nombre d'éléments cachés par table et dernière synchronisation</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Éléments</TableHead>
                <TableHead>Dernière sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(STORE_LABELS).map(([key, label]) => {
                const storeKey = STORES[key as keyof typeof STORES];
                const count = stats[key] || 0;
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" colSpan={2}>
                      {formatDate(lastSyncTimes[storeKey] || null)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Operations */}
      {pendingOps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Opérations en attente de synchronisation</CardTitle>
            <CardDescription>{pendingOps.length} opération(s) en file d'attente</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Opération</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Erreur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingOps.map((op, i) => (
                  <TableRow key={op.id || i}>
                    <TableCell className="font-medium">{op.table}</TableCell>
                    <TableCell>
                      <Badge variant={op.operation === "insert" ? "default" : op.operation === "delete" ? "destructive" : "secondary"}>
                        {op.operation}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={op.status === "error" ? "destructive" : "outline"}>
                        {op.status} {op.retries > 0 && `(${op.retries}x)`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(op.timestamp).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {op.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DiagnosticOffline;
