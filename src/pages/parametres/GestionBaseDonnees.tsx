import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getSafeErrorMessage } from "@/lib/safeError";
import { 
  Database, 

  Download, 
  Cloud, 
  Clock, 
  HardDrive, 
  Table, 
  Shield,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

// Catalogue synchronisé avec le schéma Supabase du projet.
const TABLES = [
  "account_requests",
  "acquisition_lots",
  "acquisitions_brouillon",
  "activity_notes",
  "admin_audit_logs",
  "app_roles",
  "beneficiaire_attributions",
  "beneficiaire_documents",
  "campements",
  "cartes_personnel",
  "client_account_provision_outbox",
  "client_contracts",
  "client_cotitulaires_mandataires",
  "client_enquetes",
  "client_portal_access_codes",
  "client_portal_sessions",
  "clients",
  "commissions",
  "configurations_systeme",
  "conventions_foncieres",
  "cotitulaires_mandataires",
  "departements",
  "departements_entreprise",
  "districts",
  "documents_acquisition",
  "documents_convention",
  "domaines",
  "equipes",
  "grille_remuneration",
  "historique_actions",
  "historique_activites",
  "interventions_techniques",
  "kkiapay_events",
  "lead_historique",
  "lead_relances",
  "leads",
  "lots_hectares",
  "notification_automations",
  "notification_campaigns",
  "notification_cron_state",
  "notification_deliveries",
  "notification_event_outbox",
  "notification_provider_events",
  "notification_segments",
  "notification_templates",
  "notifications",
  "offre_formulaire_contrats",
  "offre_formulaire_documents",
  "offre_formulaire_etapes",
  "offres",
  "otp_codes",
  "paiements",
  "parcelles",
  "photos_plantation",
  "plantation_activations",
  "plantations",
  "portail_messages",
  "portail_notifications",
  "portefeuille_versement_lignes",
  "portefeuille_versements",
  "portefeuilles",
  "profiles",
  "promotions",
  "proprietaires_terres",
  "push_subscriptions",
  "rapports_visites_medias",
  "rapports_visites_techniques",
  "rate_limits",
  "regions",
  "remboursements",
  "retraits_portefeuille",
  "role_permissions",
  "sous_prefectures",
  "tickets_techniques",
  "transferts_paiements",
  "user_roles",
  "villages",
  "zone_assignments"
];

const AUTO_BACKUP_TABLES = ["clients","plantations","paiements","parcelles","portail_messages","documents_acquisition","interventions_techniques","profiles","user_roles","offres","promotions","configurations_systeme"];

const GestionBaseDonnees = () => {
  const { toast } = useToast();
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState("json");
  const [exporting, setExporting] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(() => localStorage.getItem("agricapital-auto-backup-last"));
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => localStorage.getItem("agricapital-auto-backup-enabled") !== "false");
  const createLocalAutoBackup = useCallback(async () => {
    const snapshot: Record<string, unknown[]> = {};
    for (const table of AUTO_BACKUP_TABLES) {
      const { data, error } = await (supabase as any).from(table).select("*");
      if (error) throw error;
      snapshot[table] = data || [];
    }
    const payload = JSON.stringify({ version: 1, created_at: new Date().toISOString(), tables: snapshot });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("agricapital-backups", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("snapshots", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({ id: "latest", created_at: new Date().toISOString(), payload });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const stamp = new Date().toISOString();
    localStorage.setItem("agricapital-auto-backup-last", stamp);
    setLastBackup(stamp);
  }, []);

  useEffect(() => {
    if (!autoBackupEnabled || !navigator.onLine) return;
    const last = lastBackup ? new Date(lastBackup).getTime() : 0;
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    void createLocalAutoBackup().catch((error) => console.warn("Auto-backup local non disponible:", error));
  }, [autoBackupEnabled, createLocalAutoBackup, lastBackup]);

  const handleExport = async () => {
    if (selectedTables.length === 0) {
      toast({ variant: "destructive", title: "Erreur", description: "Sélectionnez au moins une table" });
      return;
    }

    setExporting(true);
    try {
      const exportData: Record<string, any[]> = {};
      
      for (const table of selectedTables) {
        const { data, error } = await (supabase as any)
          .from(table)
          .select("*");
        
        if (error) throw error;
        exportData[table] = data || [];
      }

      let content: string;
      let mimeType: string;
      let extension: string;

      if (exportFormat === "json") {
        content = JSON.stringify(exportData, null, 2);
        mimeType = "application/json";
        extension = "json";
      } else if (exportFormat === "csv") {
        // Export CSV pour chaque table
        const csvParts: string[] = [];
        for (const [table, rows] of Object.entries(exportData)) {
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]).join(",");
            const values = rows.map(row => 
              Object.values(row).map(v => 
                typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v
              ).join(",")
            ).join("\n");
            csvParts.push(`--- ${table} ---\n${headers}\n${values}\n`);
          }
        }
        content = csvParts.join("\n\n");
        mimeType = "text/csv";
        extension = "csv";
      } else {
        // SQL format
        const sqlParts: string[] = [];
        for (const [table, rows] of Object.entries(exportData)) {
          for (const row of rows) {
            const columns = Object.keys(row).join(", ");
            const values = Object.values(row).map(v => 
              v === null ? "NULL" : 
              typeof v === "string" ? `'${v.replace(/'/g, "''")}'` :
              typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'` : v
            ).join(", ");
            sqlParts.push(`INSERT INTO ${table} (${columns}) VALUES (${values});`);
          }
        }
        content = sqlParts.join("\n");
        mimeType = "text/sql";
        extension = "sql";
      }

      // Créer et télécharger le fichier
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agricapital_backup_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastBackup(new Date().toISOString());
      toast({ title: "Succès", description: "Export réalisé avec succès" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setExporting(false);
    }
  };

  const toggleTable = (table: string) => {
    setSelectedTables(prev => 
      prev.includes(table) 
        ? prev.filter(t => t !== table)
        : [...prev, table]
    );
  };

  const selectAllTables = () => {
    setSelectedTables(TABLES);
  };

  const deselectAllTables = () => {
    setSelectedTables([]);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="export" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="export" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
          <TabsTrigger value="schema" className="gap-2">
            <Table className="h-4 w-4" />
            Schéma
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2">
            <Cloud className="h-4 w-4" />
            Sauvegarde Auto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Exporter les données
              </CardTitle>
              <CardDescription>
                Sélectionnez les tables à exporter et le format souhaité
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Tables à exporter</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllTables}>
                      Tout sélectionner
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAllTables}>
                      Tout désélectionner
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {TABLES.map((table) => (
                    <div
                      key={table}
                      onClick={() => toggleTable(table)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors flex items-center gap-2 ${
                        selectedTables.includes(table)
                          ? "border-primary bg-primary/10"
                          : "hover:border-muted-foreground"
                      }`}
                    >
                      {selectedTables.includes(table) && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-sm">{table}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Format d'export</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="sql">SQL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleExport} 
                disabled={exporting || selectedTables.length === 0}
                className="w-full"
              >
                {exporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Export en cours...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Exporter ({selectedTables.length} table(s))
                  </>
                )}
              </Button>

              {lastBackup && (
                <p className="text-sm text-muted-foreground text-center">
                  Dernière sauvegarde: {new Date(lastBackup).toLocaleString("fr-FR")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schema">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Schéma de la Base de Données
              </CardTitle>
              <CardDescription>
                Vue d'ensemble des tables et de leurs relations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {TABLES.map((table) => (
                  <Card key={table} className="border">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Table className="h-4 w-4" />
                        {table}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          Accès contrôlé par RLS
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Sauvegarde Automatique
              </CardTitle>
              <CardDescription>
                Une copie locale automatique des données critiques est créée au maximum une fois toutes les 24 heures sur cet appareil. Les exports manuels restent disponibles pour une sauvegarde externe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <HardDrive className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Sauvegarde automatique</p>
                    <p className="text-sm text-muted-foreground">
                      {autoBackupEnabled ? "Activée sur cet appareil" : "Désactivée"}
                    </p>
                  </div>
                </div>
                <Switch checked={autoBackupEnabled} onCheckedChange={(checked) => { setAutoBackupEnabled(checked); localStorage.setItem("agricapital-auto-backup-enabled", String(checked)); }} aria-label="Activer la sauvegarde automatique locale" />
              </div>


              <Button type="button" variant="outline" onClick={() => void createLocalAutoBackup()} disabled={!autoBackupEnabled} className="w-full sm:w-auto">\n                <HardDrive className="h-4 w-4 mr-2" />\n                Créer une copie maintenant\n              </Button>\n\n              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <p className="font-medium">Historique des sauvegardes</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lastBackup ? `Dernière copie locale : ${new Date(lastBackup).toLocaleString("fr-FR")}` : "Aucune copie locale créée pour le moment."}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GestionBaseDonnees;
