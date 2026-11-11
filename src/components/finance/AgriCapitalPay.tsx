import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, RefreshCw, Send, Users, Wallet } from "lucide-react";

type Profile = { id: string; prenoms?: string | null; nom?: string | null; nom_complet?: string | null; telephone?: string | null; email?: string | null; poste?: string | null; actif?: boolean | null };
type Beneficiary = { id: string; profile_id?: string | null; beneficiary_type: string; first_names?: string | null; last_name?: string | null; display_name: string; phone?: string | null; email?: string | null; active: boolean };
type PayoutBatch = { id: string; reference: string; status: string; total_amount: number; payout_count: number; created_at: string };
type Payout = { id: string; reference: string; beneficiary_id: string; profile_id?: string | null; source_kind?: string | null; source_id?: string | null; category: string; amount: number; reason: string; payment_method: string; provider_code: string; provider_reference?: string | null; provider_transaction_id?: string | null; status: string; notification_status: string; created_at: string; paid_at?: string | null; failure_reason?: string | null };

const categories = [
  ["salary", "Salaire"], ["commission", "Commission"], ["remuneration", "Rémunération"],
  ["indemnity", "Indemnité"], ["bonus", "Prime"], ["supplier", "Fournisseur"],
  ["agricultural_labor", "Main-d’œuvre agricole"], ["partner", "Partenaire"],
  ["reimbursement", "Remboursement"], ["refund", "Remboursement client"], ["advance", "Avance"], ["other", "Autre"],
] as const;
const categoryLabel = (value: string) => categories.find(([key]) => key === value)?.[1] || value;
const statusLabel: Record<string, string> = {
  draft: "Brouillon", pending_approval: "À approuver", approved: "Approuvé",
  processing: "En traitement", succeeded: "Payé", partially_succeeded: "Partiellement payé", failed: "Échec", cancelled: "Annulé",
};
const statusClass: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-800", failed: "bg-destructive/10 text-destructive",
  pending_approval: "bg-amber-100 text-amber-800", approved: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800", partially_succeeded: "bg-amber-100 text-amber-800", cancelled: "bg-muted text-muted-foreground",
};
const money = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0)) + " FCFA";
const normalizedName = (firstNames?: string | null, lastName?: string | null, fullName?: string | null) => {
  const combined = [firstNames, lastName].filter(Boolean).join(" ").trim() || String(fullName || "").trim();
  const parts = combined.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(" ") : (parts[0] || "");
};
export default function AgriCapitalPay({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [payrollItems, setPayrollItems] = useState<any[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [batchMode, setBatchMode] = useState<"uniform" | "payroll">("uniform");
  const [payrollRunId, setPayrollRunId] = useState("");
  const [category, setCategory] = useState("salary");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [providerCode, setProviderCode] = useState("manual");
  const [profileId, setProfileId] = useState("");
  const [sourceKind, setSourceKind] = useState("none");
  const [sourceId, setSourceId] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [externalFirstNames, setExternalFirstNames] = useState("");
  const [externalLastName, setExternalLastName] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [externalType, setExternalType] = useState("supplier");
  const [reconcilePayout, setReconcilePayout] = useState<Payout | null>(null);
  const [providerReference, setProviderReference] = useState("");
  const [providerTransactionId, setProviderTransactionId] = useState("");
  const [reconcileMethod, setReconcileMethod] = useState("mobile_money");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b, pay, payroll, commission, commissionPayout, expense, batch, runs] = await Promise.all([
        (supabase as any).rpc("finance_payout_list_profiles"),
        (supabase as any).from("finance_payout_beneficiaries").select("*").order("display_name"),
        (supabase as any).from("finance_payouts").select("*").order("created_at", { ascending: false }).limit(150),
        (supabase as any).from("finance_payroll_items").select("id,profile_id,net_salary,status,transaction_id,payroll_run_id").eq("status","valide").is("transaction_id",null).gt("net_salary",0),
        (supabase as any).from("commissions").select("id,profile_id,montant_commission,type_commission,statut,periode").eq("statut","validee").not("profile_id","is",null).gt("montant_commission",0),
        (supabase as any).from("portefeuille_versements").select("id,profile_id,montant_brut,montant_paye,statut,periode_debut,periode_fin").in("statut",["valide","partiellement_paye"]),
        (supabase as any).from("finance_expenses").select("id,profile_id,beneficiary_name,supplier_name,beneficiary_phone,total_amount,paid_amount,status,expense_category,description").in("status",["unpaid","partial"]),
        (supabase as any).from("finance_payout_batches").select("*").order("created_at",{ascending:false}).limit(50),
        (supabase as any).from("finance_payroll_runs").select("id,period_start,period_end,status,paid_at").eq("status","valide").is("paid_at",null).order("period_end",{ascending:false}),
      ]);
      for (const result of [p, b, pay, batch]) if (result.error) throw result.error;
      setProfiles((p.data || []).filter((row: Profile) => row.actif !== false));
      setBeneficiaries(b.data || []);
      setPayouts(pay.data || []);
      setBatches(batch.data || []);
      setPayrollItems(payroll.error ? [] : payroll.data || []);
      setPayrollRuns(runs.error ? [] : runs.data || []);
      setCommissions(commission.error ? [] : commission.data || []);
      setCommissionPayouts(commissionPayout.error ? [] : commissionPayout.data || []);
      setExpenses(expense.error ? [] : expense.data || []);
    } catch (error: any) {
      toast({ title: "AgriCapital PAY indisponible", description: error?.message || "Impossible de charger les données.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const beneficiaryById = useMemo(() => new Map(beneficiaries.map((item) => [item.id, item])), [beneficiaries]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const totals = useMemo(() => ({
    pending: payouts.filter((p) => ["pending_approval", "approved", "processing"].includes(p.status)).length,
    paid: payouts.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + Number(p.amount || 0), 0),
    waiting: payouts.filter((p) => p.status === "pending_approval").length,
  }), [payouts]);

  const createPayout = async () => {
    if (!canManage) return;
    const payrollBatch = mode === "batch" && batchMode === "payroll";
    if (providerCode === "kkiapay_push_up" && !["mobile_money","bank_transfer"].includes(paymentMethod)) { toast({ title: "Mode Push Up invalide", description: "Push Up prend en charge Mobile Money ou virement bancaire.", variant: "destructive" }); return; }
    if (payrollBatch ? !payrollRunId : (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !reason.trim())) {
      toast({ title: "Informations manquantes", description: payrollBatch ? "Sélectionnez un cycle de paie validé." : "Indiquez un montant positif et un motif.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      if (mode === "batch") {
        if (providerCode === "kkiapay_push_up") throw new Error("La préparation Push Up est possible, mais l'envoi API reste verrouillé jusqu'à validation officielle.");
        if (batchMode === "payroll") {
          const { data, error } = await (supabase as any).rpc("finance_payout_create_payroll_batch", {
            p_payroll_run_id: payrollRunId, p_provider_code: providerCode, p_payment_method: paymentMethod,
          });
          if (error) throw error;
          toast({ title: "Lot de paie créé", description: "Les montants nets individuels du cycle sont soumis à approbation. Référence du lot : " + data });
        } else {
          if (!selectedProfiles.length) throw new Error("Sélectionnez au moins un bénéficiaire interne.");
          const { data, error } = await (supabase as any).rpc("finance_payout_create_batch", {
            p_category: category, p_amount: Number(amount), p_reason: reason.trim(),
            p_profile_ids: selectedProfiles, p_provider_code: providerCode, p_payment_method: paymentMethod,
          });
          if (error) throw error;
          toast({ title: "Lot de paiements créé", description: "Les " + selectedProfiles.length + " décaissements sont soumis à approbation. Référence du lot : " + data });
        }
      } else {
        if (sourceKind !== "none" && !sourceId) throw new Error("Sélectionnez l'opération financière à rapprocher.");
        const sourceRows: Record<string, any[]> = { payroll_item: payrollItems, commission: commissions, commission_payout: commissionPayouts, finance_expense: expenses };
        const source = sourceKind === "none" ? null : (sourceRows[sourceKind] || []).find((item) => item.id === sourceId);
        if (sourceKind !== "none" && !source) throw new Error("L'opération financière sélectionnée n'est plus disponible.");
        const remaining = sourceKind === "commission_payout"
          ? Number(source.montant_brut || 0) - Number(source.montant_paye || 0)
          : sourceKind === "finance_expense"
            ? Number(source.total_amount || 0) - Number(source.paid_amount || 0)
            : Number(source?.net_salary ?? source?.montant_commission ?? amount);
        if (sourceKind === "payroll_item" && Math.abs(Number(amount) - Number(source.net_salary)) > 0.01) throw new Error("Le montant doit correspondre au net de la ligne de paie.");
        if (sourceKind === "commission" && Math.abs(Number(amount) - Number(source.montant_commission)) > 0.01) throw new Error("Le montant doit correspondre à la commission validée.");
        if ((sourceKind === "commission_payout" || sourceKind === "finance_expense") && Number(amount) > remaining + 0.01) throw new Error("Le montant dépasse le solde restant de l'opération.");
        let beneficiary: Beneficiary | null = null;
        let linkedProfile: Profile | null = null;
        const sourceProfileId = source?.profile_id || profileId;
        if (sourceProfileId) {
          linkedProfile = profileById.get(sourceProfileId) || null;
          if (!linkedProfile) throw new Error("Profil CRM introuvable pour l'opération sélectionnée.");
          const displayName = linkedProfile.nom_complet || [linkedProfile.prenoms, linkedProfile.nom].filter(Boolean).join(" ");
          const { data, error } = await (supabase as any).from("finance_payout_beneficiaries").upsert({
            profile_id: linkedProfile.id, beneficiary_type: category === "salary" ? "employee" : "crm_user",
            display_name: displayName, active: true,
          }, { onConflict: "profile_id" }).select("*").single();
          if (error) throw error;
          beneficiary = data;
        } else {
          const sourceName = sourceKind === "finance_expense" ? (source?.beneficiary_name || source?.supplier_name || "") : "";
          const displayName = [externalFirstNames, externalLastName].filter(Boolean).join(" ").trim() || sourceName;
          const phone = externalPhone.trim() || source?.beneficiary_phone || "";
          if (!displayName || !phone) throw new Error("Renseignez le nom et le téléphone du bénéficiaire externe.");
          const { data, error } = await (supabase as any).from("finance_payout_beneficiaries").insert({
            beneficiary_type: sourceKind === "finance_expense" ? "supplier" : externalType,
            first_names: externalFirstNames.trim() || sourceName || null,
            last_name: externalLastName.trim() || null, display_name: displayName,
            phone, active: true,
          }).select("*").single();
          if (error) throw error;
          beneficiary = data;
        }
        if (!beneficiary) throw new Error("Bénéficiaire non créé.");
        const { error } = await (supabase as any).from("finance_payouts").insert({
          beneficiary_id: beneficiary.id, profile_id: linkedProfile?.id || null,
          source_kind: sourceKind === "none" ? null : sourceKind, source_id: source?.id || null,
          category, amount: Number(amount), reason: reason.trim(), payment_method: paymentMethod,
          provider_code: providerCode, status: "pending_approval",
        });
        if (error) throw error;
        toast({ title: "Décaissement soumis", description: "Le paiement attend l'approbation d'un second responsable." });
      }
      setAmount(""); setReason(""); setProfileId(""); setSelectedProfiles([]); setSourceKind("none"); setSourceId(""); setBatchMode("uniform"); setPayrollRunId("");
      setExternalFirstNames(""); setExternalLastName(""); setExternalPhone("");
      await load();
      setPayoutDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Création impossible", description: error?.message || "Vérifiez les données saisies.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const approve = async (payout: Payout) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("finance_payout_approve", { p_payout_id: payout.id });
      if (error) throw error;
      toast({ title: "Décaissement approuvé", description: payout.reference });
      await load();
    } catch (error: any) {
      toast({ title: "Approbation refusée", description: error?.message || "Un autre responsable doit approuver ce paiement.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const approveBatch = async (batch: PayoutBatch) => {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("finance_payout_approve_batch", { p_batch_id: batch.id });
      if (error) throw error;
      toast({ title: "Lot approuvé", description: String(data || 0) + " décaissement(s) approuvé(s)." });
      await load();
    } catch (error: any) {
      toast({ title: "Approbation du lot refusée", description: error?.message || "Un autre responsable doit approuver ce lot.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const reconcile = async () => {
    if (!reconcilePayout) return;
    if (!providerReference.trim()) {
      toast({ title: "Référence requise", description: "Saisissez la référence de confirmation réelle.", variant: "destructive" }); return;
    }
    if (reconcilePayout.provider_code === "kkiapay_push_up" && !providerTransactionId.trim()) {
      toast({ title: "Référence Push Up requise", description: "Saisissez l'identifiant de transaction visible dans le rapport Push Up.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("finance_payout_record_manual_success", {
        p_payout_id: reconcilePayout.id, p_provider_reference: providerReference.trim(),
        p_provider_transaction_id: providerTransactionId.trim() || null, p_payment_method: reconcileMethod,
      });
      if (error) throw error;
      toast({ title: "Paiement rapproché", description: "Le statut est confirmé et la notification SMS a été mise en file." });
      setReconcilePayout(null); setProviderReference(""); setProviderTransactionId("");
      await load();
    } catch (error: any) {
      toast({ title: "Rapprochement impossible", description: error?.message || "Vérifiez la référence et le statut.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const profileDisplay = (profile: Profile) => normalizedName(profile.prenoms, profile.nom, profile.nom_complet) || profile.nom_complet || "Utilisateur CRM";
  const profileDisplayById = (id?: string | null) => id ? profileDisplay(profileById.get(id) || { id }) : "Collaborateur";
  const getBeneficiaryName = (payout: Payout) => {
    const profile = payout.profile_id ? profileById.get(payout.profile_id) : null;
    const beneficiary = beneficiaryById.get(payout.beneficiary_id);
    return profile ? profileDisplay(profile) : beneficiary?.display_name || "Bénéficiaire";
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">À APPROUVER</p><p className="mt-1 text-2xl font-bold">{totals.waiting}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">EN COURS</p><p className="mt-1 text-2xl font-bold">{totals.pending}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">DÉCAISSEMENTS CONFIRMÉS</p><p className="mt-1 text-xl font-bold">{money(totals.paid)}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="operations">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3">
          <TabsTrigger value="operations">Nouveau décaissement</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="beneficiaires">Bénéficiaires</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-3">
          <div className="flex justify-end">
            <Button onClick={() => setPayoutDialogOpen(true)} disabled={!canManage || loading}>
              <Send className="mr-2 h-4 w-4" />Nouveau décaissement
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="historique" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Décaissements récents</h3><Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button></div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Lots de décaissement récents</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table exportFileName="lots-decaissement">
            <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Créé le</TableHead><TableHead className="text-right">Bénéficiaires</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Statut</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>{batches.map((batch) => <TableRow key={batch.id}><TableCell className="font-medium">{batch.reference}</TableCell><TableCell>{new Date(batch.created_at).toLocaleDateString("fr-FR")}</TableCell><TableCell className="text-right">{batch.payout_count}</TableCell><TableCell className="text-right font-semibold">{money(batch.total_amount)}</TableCell><TableCell><Badge className={statusClass[batch.status] || ""}>{statusLabel[batch.status] || batch.status}</Badge></TableCell><TableCell>{batch.status === "pending_approval" && canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => void approveBatch(batch)}>Approuver le lot</Button>}</TableCell></TableRow>)}{!batches.length && <TableRow><TableCell colSpan={6} className="p-4 text-center text-muted-foreground">Aucun lot créé.</TableCell></TableRow>}</TableBody>
          </Table></div></CardContent></Card>
          <div className="overflow-x-auto rounded-lg border">
            <Table exportFileName="historique-decaissements">
              <TableHeader><TableRow><TableHead>Bénéficiaire</TableHead><TableHead>Motif</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Référence</TableHead><TableHead>Statut</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>{payouts.map((p) => <TableRow key={p.id}><TableCell className="font-medium">{getBeneficiaryName(p)}<span className="block text-xs text-muted-foreground">{categoryLabel(p.category)}</span></TableCell><TableCell className="max-w-[220px]"><span className="block truncate">{p.reason}</span><span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("fr-FR")}</span></TableCell><TableCell className="text-right font-semibold tabular-nums">{money(p.amount)}</TableCell><TableCell><span className="block">{p.reference}</span><span className="text-xs text-muted-foreground">{p.provider_code === "kkiapay_push_up" ? "Kkiapay Push Up" : "Hors ligne"}{p.source_kind ? " · " + p.source_kind : ""}</span></TableCell><TableCell><Badge className={statusClass[p.status] || ""}>{statusLabel[p.status] || p.status}</Badge>{p.notification_status === "queued" && <span className="mt-1 block text-xs text-muted-foreground">SMS en file</span>}{p.notification_status === "blocked_too_long" && <span className="mt-1 block text-xs text-destructive">SMS bloqué (&gt;150)</span>}</TableCell><TableCell><div className="flex flex-wrap gap-1">{p.status === "pending_approval" && canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => void approve(p)}>Approuver</Button>}{p.status === "approved" && canManage && <Button size="sm" disabled={saving} onClick={() => { setReconcilePayout(p); setProviderReference(""); setProviderTransactionId(""); setReconcileMethod(p.payment_method || "mobile_money"); }}>{p.provider_code === "kkiapay_push_up" ? "Rapprocher Push Up" : "Confirmer paiement"}</Button>}</div></TableCell></TableRow>)}{!payouts.length && <TableRow><TableCell colSpan={6} className="p-8 text-center text-muted-foreground">{loading ? "Chargement…" : "Aucun décaissement enregistré."}</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="beneficiaires" className="mt-3 space-y-3">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Répertoire des bénéficiaires</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table exportFileName="beneficiaires-decaissement">
            <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Catégorie</TableHead><TableHead>Téléphone</TableHead><TableHead>Origine</TableHead></TableRow></TableHeader>
            <TableBody>{beneficiaries.map((b) => <TableRow key={b.id}><TableCell className="font-medium">{b.display_name}</TableCell><TableCell>{b.beneficiary_type}</TableCell><TableCell>{b.phone || "—"}</TableCell><TableCell>{b.profile_id ? "Profil CRM synchronisé" : "Externe"}</TableCell></TableRow>)}{!beneficiaries.length && <TableRow><TableCell colSpan={4} className="p-5 text-center text-muted-foreground">Aucun bénéficiaire enregistré.</TableCell></TableRow>}</TableBody>
          </Table></div></CardContent></Card>
        </TabsContent>


      </Tabs>

      <Dialog open={payoutDialogOpen} onOpenChange={(open) => { if (!saving) setPayoutDialogOpen(open); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Nouveau décaissement</DialogTitle></DialogHeader>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Préparer un paiement</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>Paiement individuel</Button>
                <Button type="button" size="sm" variant={mode === "batch" ? "default" : "outline"} onClick={() => { setMode("batch"); setSourceKind("none"); setSourceId(""); }}>Lot d'utilisateurs internes</Button>
              </div>
              {mode === "batch" && <div className="space-y-1"><Label>Type de lot</Label><Select value={batchMode} onValueChange={(v) => { setBatchMode(v as "uniform" | "payroll"); setPayrollRunId(""); setSelectedProfiles([]); if (v === "payroll") { setCategory("salary"); setAmount(""); setReason(""); } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="uniform">Montant identique pour plusieurs utilisateurs</SelectItem><SelectItem value="payroll">Cycle de paie validé — montants individuels</SelectItem></SelectContent></Select></div>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Catégorie du paiement</Label><Select value={category} onValueChange={setCategory} disabled={(mode === "single" && sourceKind !== "none") || (mode === "batch" && batchMode === "payroll")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Montant par bénéficiaire (FCFA)</Label><Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={(mode === "single" && (sourceKind === "payroll_item" || sourceKind === "commission")) || (mode === "batch" && batchMode === "payroll")} placeholder={mode === "batch" && batchMode === "payroll" ? "Calculé par ligne de paie" : "Ex. 125000"} /></div>
                <div className="space-y-1"><Label>Mode de paiement</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="bank_transfer">Virement bancaire</SelectItem><SelectItem value="cash">Espèces</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Canal de décaissement</Label><Select value={providerCode} onValueChange={setProviderCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Paiement hors ligne / manuel</SelectItem><SelectItem value="kkiapay_push_up">Kkiapay Push Up (préparation / rapprochement)</SelectItem><SelectItem value="other">Autre prestataire</SelectItem></SelectContent></Select></div>
                <div className="space-y-1 sm:col-span-2"><Label>Motif détaillé</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={mode === "batch" && batchMode === "payroll"} placeholder={mode === "batch" && batchMode === "payroll" ? "Généré depuis le cycle de paie sélectionné" : "Salaire, commission, facture fournisseur…"} /></div>
              </div>

              {mode === "single" ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1"><Label>Lier à une opération existante (facultatif)</Label><Select value={sourceKind} onValueChange={(v) => { setSourceKind(v); setSourceId(""); setProfileId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nouveau décaissement sans source</SelectItem><SelectItem value="payroll_item">Ligne de paie validée ({payrollItems.length})</SelectItem><SelectItem value="commission">Commission individuelle validée ({commissions.length})</SelectItem><SelectItem value="commission_payout">Versement groupé de commissions ({commissionPayouts.length})</SelectItem><SelectItem value="finance_expense">Dépense à payer ({expenses.length})</SelectItem></SelectContent></Select></div>
                  {sourceKind !== "none" && <div className="space-y-1"><Label>Opération à payer</Label><Select value={sourceId} onValueChange={(id) => {
                    setSourceId(id);
                    const rows: Record<string, any[]> = { payroll_item: payrollItems, commission: commissions, commission_payout: commissionPayouts, finance_expense: expenses };
                    const item = (rows[sourceKind] || []).find((row) => row.id === id);
                    if (!item) return;
                    const linked = item.profile_id ? profileById.get(item.profile_id) : null;
                    if (linked) setProfileId(linked.id);
                    else setProfileId("");
                    if (sourceKind === "payroll_item") { setCategory("salary"); setAmount(String(item.net_salary)); setReason("Paie - " + (linked ? profileDisplay(linked) : "Collaborateur")); }
                    if (sourceKind === "commission") { setCategory("commission"); setAmount(String(item.montant_commission)); setReason("Commission " + (item.type_commission || "") + " - " + (linked ? profileDisplay(linked) : "Collaborateur")); }
                    if (sourceKind === "commission_payout") { const rest = Number(item.montant_brut || 0) - Number(item.montant_paye || 0); setCategory("commission"); setAmount(String(rest)); setReason("Versement de commissions - " + (linked ? profileDisplay(linked) : "Collaborateur")); }
                    if (sourceKind === "finance_expense") { const rest = Number(item.total_amount || 0) - Number(item.paid_amount || 0); setCategory("supplier"); setAmount(String(rest)); setReason("Paiement " + (item.expense_category || "dépense") + " - " + (item.description || item.supplier_name || item.beneficiary_name || "")); if (!linked) { const n = String(item.beneficiary_name || item.supplier_name || ""); setExternalFirstNames(n); setExternalLastName(""); setExternalPhone(item.beneficiary_phone || ""); } }
                  }}><SelectTrigger><SelectValue placeholder="Choisir une opération en attente" /></SelectTrigger><SelectContent>
                    {sourceKind === "payroll_item" && payrollItems.map((item) => <SelectItem key={item.id} value={item.id}>{profileDisplayById(item.profile_id)} — {money(item.net_salary)}</SelectItem>)}
                    {sourceKind === "commission" && commissions.map((item) => <SelectItem key={item.id} value={item.id}>{profileDisplayById(item.profile_id)} — {item.type_commission} — {money(item.montant_commission)}</SelectItem>)}
                    {sourceKind === "commission_payout" && commissionPayouts.map((item) => <SelectItem key={item.id} value={item.id}>{profileDisplayById(item.profile_id)} — reste {money(Number(item.montant_brut || 0)-Number(item.montant_paye || 0))}</SelectItem>)}
                    {sourceKind === "finance_expense" && expenses.map((item) => <SelectItem key={item.id} value={item.id}>{item.beneficiary_name || item.supplier_name || item.description || item.expense_category} — reste {money(Number(item.total_amount || 0)-Number(item.paid_amount || 0))}</SelectItem>)}
                  </SelectContent></Select></div>}
                                    <div className="space-y-1"><Label>Bénéficiaire interne (CRM)</Label><Select value={profileId || "external"} onValueChange={(v) => setProfileId(v === "external" ? "" : v)} disabled={sourceKind !== "none"}><SelectTrigger><SelectValue placeholder="Choisir un utilisateur interne" /></SelectTrigger><SelectContent><SelectItem value="external">Bénéficiaire externe / prestataire</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nom_complet || profileDisplay(p)}{p.poste ? " — " + p.poste : ""}</SelectItem>)}</SelectContent></Select></div>
                  {!profileId && <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Prénoms</Label><Input value={externalFirstNames} onChange={(e) => setExternalFirstNames(e.target.value)} /></div>
                    <div className="space-y-1"><Label>Nom</Label><Input value={externalLastName} onChange={(e) => setExternalLastName(e.target.value)} /></div>
                    <div className="space-y-1"><Label>Téléphone</Label><Input type="tel" value={externalPhone} onChange={(e) => setExternalPhone(e.target.value)} placeholder="+225 07 00 00 00 00" /></div>
                    <div className="space-y-1"><Label>Type de bénéficiaire</Label><Select value={externalType} onValueChange={setExternalType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="supplier">Fournisseur</SelectItem><SelectItem value="provider">Prestataire</SelectItem><SelectItem value="agent">Agent</SelectItem><SelectItem value="partner">Partenaire</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div>
                  </div>}
                </div>
              ) : (batchMode === "payroll" ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <Label>Cycle de paie à décaisser</Label>
                  <Select value={payrollRunId} onValueChange={setPayrollRunId}><SelectTrigger><SelectValue placeholder="Choisir un cycle validé non payé" /></SelectTrigger><SelectContent>{payrollRuns.map((run) => <SelectItem key={run.id} value={run.id}>Du {new Date(run.period_start).toLocaleDateString("fr-FR")} au {new Date(run.period_end).toLocaleDateString("fr-FR")}</SelectItem>)}</SelectContent></Select>
                  {!payrollRuns.length && <p className="text-xs text-muted-foreground">Aucun cycle de paie validé et non payé.</p>}
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between"><Label>Utilisateurs internes à payer</Label><Badge variant="outline">{selectedProfiles.length} sélectionné(s)</Badge></div>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {profiles.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"><input type="checkbox" checked={selectedProfiles.includes(p.id)} onChange={(e) => setSelectedProfiles((current) => e.target.checked ? [...current, p.id] : current.filter((id) => id !== p.id))} className="h-4 w-4" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.nom_complet || profileDisplay(p)}</span><span className="block truncate text-xs text-muted-foreground">{p.poste || p.email || "Collaborateur"}</span></span><span className="text-xs text-muted-foreground">{p.telephone || "Sans téléphone"}</span></label>)}
                    {!profiles.length && <p className="text-sm text-muted-foreground">Aucun utilisateur interne actif trouvé.</p>}
                  </div>
                </div>
              ))}
              <Button onClick={() => void createPayout()} disabled={!canManage || saving || loading}><Send className="mr-2 h-4 w-4" />{saving ? "Enregistrement…" : mode === "batch" ? "Créer le lot à approuver" : "Soumettre à approbation"}</Button>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
      <Dialog open={!!reconcilePayout} onOpenChange={(open) => { if (!open && !saving) setReconcilePayout(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{reconcilePayout?.provider_code === "kkiapay_push_up" ? "Rapprocher une opération Kkiapay Push Up" : "Confirmer un paiement effectué"}</DialogTitle></DialogHeader>
          {reconcilePayout && <div className="space-y-3"><div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">{getBeneficiaryName(reconcilePayout)}</p><p>{money(reconcilePayout.amount)} · {reconcilePayout.reference}</p><p className="text-xs text-muted-foreground">{reconcilePayout.reason}</p></div><div className="space-y-1"><Label>Référence de confirmation *</Label><Input value={providerReference} onChange={(e) => setProviderReference(e.target.value)} placeholder="Référence de transfert / lot" /></div>{reconcilePayout.provider_code === "kkiapay_push_up" && <div className="space-y-1"><Label>ID de transaction Push Up *</Label><Input value={providerTransactionId} onChange={(e) => setProviderTransactionId(e.target.value)} placeholder="Identifiant issu du rapport Push Up" /></div>}<div className="space-y-1"><Label>Mode de paiement</Label><Select value={reconcileMethod} onValueChange={setReconcileMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="bank_transfer">Virement bancaire</SelectItem><SelectItem value="cash">Espèces</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReconcilePayout(null)}>Annuler</Button><Button onClick={() => void reconcile()} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmer le rapprochement</Button></div></div>}
        </DialogContent>
      </Dialog>
      {loading && <p className="text-xs text-muted-foreground">Chargement des données AgriCapital PAY…</p>}
    </div>
  );
}
