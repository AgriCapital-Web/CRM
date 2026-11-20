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

// Tables publiques exportables. Les tables contenant des secrets, codes d’accès, OTP, jetons de session ou abonnements push sont exclues.
const TABLES = [
  "account_requests",
  "acquisition_lots",
  "acquisitions",
  "acremap_lots",
  "acremap_morcellements",
  "activity_notes",
  "admin_audit_logs",
  "app_permissions",
  "app_roles",
  "beneficiaire_attributions",
  "beneficiaire_documents",
  "campements",
  "cartes_personnel",
  "client_account_provision_outbox",
  "client_contracts",
  "client_cotitulaires_mandataires",
  "client_monnaie_mouvements",
  "clients",
  "commission_payment_allocations",
  "commissions",
  "configurations_systeme",
  "conventions_foncieres",
  "cotitulaires_mandataires",
  "crm_parties",
  "crm_party_links",
  "crm_party_relationships",
  "decision_access_grants",
  "decision_approvals",
  "decision_center_audit",
  "decision_center_settings",
  "decision_confidentiality_rules",
  "decision_financing_sources",
  "decision_proposal_versions",
  "decision_proposals",
  "decision_scenarios",
  "departements",
  "departements_entreprise",
  "department_budgets",
  "districts",
  "documents_acquisition",
  "documents_convention",
  "domaines",
  "equipe_membres",
  "equipes",
  "finance_associate_transactions",
  "finance_associates",
  "finance_expense_payments",
  "finance_expenses",
  "finance_historical_import_batches",
  "finance_historical_ledger",
  "finance_payout_audit_events",
  "finance_payout_batches",
  "finance_payout_beneficiaries",
  "finance_payout_sms_templates",
  "finance_payouts",
  "finance_payroll_items",
  "finance_payroll_runs",
  "finance_salary_profiles",
  "finance_transaction_budget_allocations",
  "finance_transactions",
  "grille_remuneration",
  "historique_actions",
  "historique_activites",
  "imported_phone_contacts",
  "independent_service_catalog",
  "independent_service_customers",
  "independent_service_events",
  "independent_service_invoices",
  "independent_service_items",
  "independent_service_payments",
  "independent_service_proformas",
  "internal_conversation_members",
  "internal_conversations",
  "internal_meeting_attachments",
  "internal_meeting_participants",
  "internal_meeting_provider_config",
  "internal_meetings",
  "internal_message_attachments",
  "internal_message_reactions",
  "internal_message_receipts",
  "internal_messages",
  "interventions_techniques",
  "kkiapay_events",
  "lead_historique",
  "lead_relances",
  "leads",
  "lots_hectares",
  "notification_automations",
  "notification_campaigns",
  "notification_channel_policy",
  "notification_client_preferences",
  "notification_cron_state",
  "notification_deliveries",
  "notification_delivery_attempts",
  "notification_event_outbox",
  "notification_provider_events",
  "notification_provider_webhook_receipts",
  "notification_segments",
  "notification_send_guard",
  "notification_templates",
  "notifications",
  "offre_formulaire_contrats",
  "offre_formulaire_documents",
  "offre_formulaire_etapes",
  "offres",
  "paiement_acquisition_allocations",
  "paiements",
  "parcelles",
  "photos_plantation",
  "plantation_activations",
  "plantations",
  "portail_messages",
  "portail_notifications",
  "portail_support_requests",
  "portefeuille_versement_lignes",
  "portefeuille_versement_paiements",
  "portefeuille_versements",
  "portefeuilles",
  "profiles",
  "promotions",
  "proprietaires_terres",
  "prospects",
  "rapports_visites_medias",
  "rapports_visites_techniques",
  "rate_limits",
  "referentiels_systeme",
  "regions",
  "remboursements",
  "retraits_portefeuille",
  "role_permissions",
  "sous_prefectures",
  "strategic_actions",
  "strategic_plan_audit",
  "strategic_plans",
  "tickets_techniques",
  "transferts_paiements",
  "user_permission_overrides",
  "user_roles",
  "villages",
  "workspace_availability",
  "workspace_decision_audit",
  "workspace_document_comments",
  "workspace_document_members",
  "workspace_document_versions",
  "workspace_documents",
  "workspace_event_external_guests",
  "workspace_event_participants",
  "workspace_events",
  "workspace_job_assignments",
  "workspace_job_descriptions",
  "workspace_leave_requests",
  "workspace_notifications",
  "workspace_objectives",
  "workspace_performance_reviews",
  "workspace_project_members",
  "workspace_projects",
  "workspace_reminders",
  "workspace_reporting_lines",
  "workspace_tasks",
  "zone_assignments"
];

const EXCLUDED_SECURITY_TABLES = [
  "acremap_integration_settings",
  "client_portal_access_codes",
  "client_portal_sessions",
  "independent_service_portal_otps",
  "independent_service_portal_sessions",
  "internal_external_meeting_invites",
  "otp_codes",
  "push_subscriptions"
];

const AUTO_BACKUP_TABLES = ["clients","plantations","paiements","parcelles","portail_messages","documents_acquisition","interventions_techniques","profiles","user_roles","offres","promotions","configurations_systeme"];

const PAGE_SIZE = 500;

async function fetchAllRows(table: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase as any).from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

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
      snapshot[table] = await fetchAllRows(table);
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
        exportData[table] = await fetchAllRows(table);
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
                typeof v === "string"
                  ? `"${(/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`
                  : v
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
            Copie locale
          </TabsTrigger>
        </TabsList>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Exporter les données
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">Les {EXCLUDED_SECURITY_TABLES.length} tables de sécurité contenant des clés API, codes d’accès, OTP, jetons de session ou abonnements push sont volontairement exclues de l’export.</p>
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
                Copie locale de secours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">Cette copie est conservée uniquement dans le navigateur de cet appareil. Elle couvre un ensemble limité de tables et les lignes accessibles à votre compte ; elle ne remplace pas une sauvegarde complète de la base Supabase.</p>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <HardDrive className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Copie locale des tables essentielles</p>
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
