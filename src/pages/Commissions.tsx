import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { formatUserShortName } from "@/lib/utils";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, DollarSign, TrendingUp, CheckCircle, Clock3, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { COMMERCIAL_ASSIGNABLE_ROLES } from "@/lib/roles";

const money = (n: any) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(Number(n || 0));
const typeLabel = (t: string) => t === "acquisition" ? "Commercial" : t === "recouvrement_mensuel" ? "Recouvrement mensuel" : t === "technique" ? "Technicien" : t || "—";
const statusLabel = (s: string) => s === "calculee" ? "À valider" : s === "validee" ? "À payer" : s === "payee" ? "Payée" : s === "annule" ? "Annulée" : s || "—";
const statusVariant = (s: string) => s === "payee" ? "default" : s === "validee" ? "secondary" : s === "calculee" ? "outline" : "destructive";

export default function Commissions() {
  const { toast } = useToast();
  const { profile, userRoles } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("commissions")
        .select("*,profile:profiles!commissions_profile_id_fkey(nom_complet,telephone,equipe_id,equipe:equipes!profiles_equipe_id_fkey(nom)),plantation:plantations(id_unique,nom_plantation),client:clients(id,id_unique,nom_complet,famille_offre,formule_code,formule_nom)")
        .order("periode", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const allRows = data || [];
      const global = userRoles.some((r: string) => ["pdg", "dg"].includes(r));
      const isTech = userRoles.includes("technicien");
      const isTechManager = userRoles.includes("chef_equipe_technique");
      const isCommercial = userRoles.some((r: string) => COMMERCIAL_ASSIGNABLE_ROLES.includes(r as any));
      const isCommercialManager = userRoles.includes("chef_equipe_commercial") || userRoles.includes("responsable_commercial");
      const isCommercialDirector = userRoles.includes("responsable_commercial");
      const isFinance = userRoles.includes("comptable") || userRoles.includes("responsable_operations");
      let scopedRows = allRows;

      if (!global && !isFinance && profile?.id) {
        if (isCommercialDirector) {
          scopedRows = allRows.filter((row: any) => ["acquisition", "recouvrement_mensuel"].includes(row.type_commission));
        } else if (isTechManager || isCommercialManager) {
          scopedRows = allRows.filter((row: any) => row.profile?.equipe_id && row.profile.equipe_id === profile.equipe_id);
        } else if (isTech || isCommercial) {
          scopedRows = allRows.filter((row: any) => row.profile_id === profile.id);
        }
      }
      setRows(scopedRows);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Commissions indisponibles", description: e?.message || "Erreur." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useRealtime({ table: "commissions", onChange: load });

  const groups = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = row.profile_id || row.profile?.nom_complet || "sans-commercial";
      const current = map.get(key) || {
        key, profile_id: row.profile_id, nom: formatUserShortName(row.profile?.nom_complet || "Collaborateur non renseigné"), type: row.type_commission === "technique" ? "Technicien" : "Commercial", equipe: row.profile?.equipe?.nom || "Sans équipe",
        total: 0, base: 0, count: 0, calculee: 0, validee: 0, payee: 0, aPayer: 0, details: []
      };
      current.total += Number(row.montant_commission || 0);
      current.base += Number(row.montant_base || 0);
      current.count += 1;
      if (row.statut === "calculee") current.calculee += Number(row.montant_commission || 0);
      if (row.statut === "validee") { current.validee += Number(row.montant_commission || 0); current.aPayer += Number(row.montant_commission || 0); }
      if (row.statut === "payee") current.payee += Number(row.montant_commission || 0);
      current.details.push(row);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const canSeeTeamCommission = userRoles.some((r: string) => ["pdg","dg","responsable_operations","responsable_commercial","chef_equipe_commercial","chef_equipe_technique"].includes(r));

  const teamGroups = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = row.profile?.equipe_id || "sans-equipe";
      const current = map.get(key) || { key, equipe: row.profile?.equipe?.nom || "Sans équipe", total: 0, payee: 0, aPayer: 0 };
      const amount = Number(row.montant_commission || 0);
      current.total += amount;
      if (row.statut === "payee") current.payee += amount;
      else if (row.statut !== "annule") current.aPayer += amount;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const filtered = groups.filter((g) => {
    const q = search.trim().toLowerCase();
    return !q || g.nom.toLowerCase().includes(q) || g.details.some((d: any) =>
      String(d.type_commission || "").toLowerCase().includes(q) ||
      String(d.client?.nom_complet || "").toLowerCase().includes(q) ||
      String(d.client?.formule_code || "").toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => ({
    total: rows.reduce((s, r) => s + Number(r.montant_commission || 0), 0),
    aValider: rows.filter(r => r.statut === "calculee").reduce((s, r) => s + Number(r.montant_commission || 0), 0),
    aPayer: rows.filter(r => r.statut === "validee").reduce((s, r) => s + Number(r.montant_commission || 0), 0),
    payees: rows.filter(r => r.statut === "payee").reduce((s, r) => s + Number(r.montant_commission || 0), 0),
  }), [rows]);

  return (
    <ProtectedRoute requiredPermissionCode="commissions.view">
      <MainLayout>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-2xl font-bold">Commissions</h1><p className="text-sm text-muted-foreground">Suivi des commissions commerciales et techniques.</p></div>
            <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Total", stats.total, DollarSign], ["À valider", stats.aValider, Clock3], ["À payer", stats.aPayer, CheckCircle], ["Payées", stats.payees, TrendingUp]].map(([label, value, Icon]: any) =>
              <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-2 text-lg font-bold">{money(value)}</div></CardContent></Card>
            )}
          </div>

          <Card><CardContent className="p-4"><div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un commercial, un client ou une offre" className="pl-10" /></div></CardContent></Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="responsive-data-table min-w-[720px]">
                  <TableHeader><TableRow><TableHead>Collaborateur</TableHead><TableHead>Type</TableHead><TableHead>Équipe</TableHead><TableHead>Opérations</TableHead><TableHead>Base</TableHead><TableHead>Total commission</TableHead><TableHead>À valider</TableHead><TableHead>À payer</TableHead><TableHead>Payées</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {loading ? <TableRow><TableCell colSpan={9} className="py-8 text-center">Chargement</TableCell></TableRow> :
                      filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Aucune commission.</TableCell></TableRow> :
                      filtered.map((g: any) => <TableRow key={g.key} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(g)}>
                        <TableCell className="font-medium">{g.nom}</TableCell>
                        <TableCell><Badge variant="outline">{g.type}</Badge></TableCell>
                        <TableCell>{g.equipe}</TableCell>
                        <TableCell>{g.count}</TableCell>
                        <TableCell>{money(g.base)}</TableCell>
                        <TableCell className="font-bold">{money(g.total)}</TableCell>
                        <TableCell>{money(g.calculee)}</TableCell>
                        <TableCell>{money(g.aPayer)}</TableCell>
                        <TableCell>{money(g.payee)}</TableCell>
                      </TableRow>)
                    }
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {canSeeTeamCommission && (
          <Card>
            <CardContent className="p-0">
              <div className="p-4"><h2 className="font-semibold">Commissions par équipe</h2><p className="text-sm text-muted-foreground">Total des commissions rattachées à chaque équipe.</p></div>
              <div className="overflow-x-auto">
                <Table className="responsive-data-table min-w-[560px]">
                  <TableHeader><TableRow><TableHead>Équipe</TableHead><TableHead>Total commissions</TableHead><TableHead>Payées</TableHead><TableHead>À payer</TableHead></TableRow></TableHeader>
                  <TableBody>{teamGroups.map((g: any) => <TableRow key={g.key}><TableCell className="font-medium">{g.equipe}</TableCell><TableCell>{money(g.total)}</TableCell><TableCell>{money(g.payee)}</TableCell><TableCell>{money(g.aPayer)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          )}

          <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
            <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
              <DialogHeader><DialogTitle>{selected?.nom}</DialogTitle></DialogHeader>
              {selected && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total</p><p className="font-bold">{money(selected.total)}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Opérations</p><p className="font-bold">{selected.count}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">À valider</p><p className="font-bold">{money(selected.calculee)}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Payées</p><p className="font-bold">{money(selected.payee)}</p></CardContent></Card>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[950px]">
                      <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Offre</TableHead><TableHead>Type</TableHead><TableHead>Base</TableHead><TableHead>Taux</TableHead><TableHead>Commission</TableHead><TableHead>Période</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                      <TableBody>{selected.details.map((d: any) =>
                        <TableRow key={d.id}>
                          <TableCell>{d.client?.nom_complet || "—"}</TableCell>
                          <TableCell>{d.client?.famille_offre || d.client?.formule_code || "—"}{d.client?.formule_nom ? ` · ${d.client.formule_nom}` : ""}</TableCell>
                          <TableCell><Badge variant="outline">{typeLabel(d.type_commission)}</Badge></TableCell>
                          <TableCell>{money(d.montant_base)}</TableCell>
                          <TableCell>{Number(d.taux_commission || 0) > 0 ? `${d.taux_commission}%` : "—"}</TableCell>
                          <TableCell className="font-semibold">{money(d.montant_commission)}</TableCell>
                          <TableCell>{d.periode ? format(new Date(d.periode), "dd/MM/yyyy", { locale: fr }) : "—"}</TableCell>
                          <TableCell><Badge variant={statusVariant(d.statut)}>{statusLabel(d.statut)}</Badge></TableCell>
                        </TableRow>
                      )}</TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
