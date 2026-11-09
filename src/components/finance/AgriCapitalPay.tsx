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
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, RefreshCw, Send, ShieldCheck, Users, Wallet } from "lucide-react";

type Profile = { id: string; prenoms?: string | null; nom?: string | null; nom_complet?: string | null; telephone?: string | null; email?: string | null; poste?: string | null; actif?: boolean | null };
type Beneficiary = { id: string; profile_id?: string | null; beneficiary_type: string; first_names?: string | null; last_name?: string | null; display_name: string; phone?: string | null; email?: string | null; active: boolean };
type Payout = { id: string; reference: string; beneficiary_id: string; profile_id?: string | null; source_kind?: string | null; source_id?: string | null; category: string; amount: number; reason: string; payment_method: string; provider_code: string; provider_reference?: string | null; provider_transaction_id?: string | null; status: string; notification_status: string; created_at: string; paid_at?: string | null; failure_reason?: string | null };
type SmsTemplate = { id: string; category: string; name: string; content: string; active: boolean; max_characters: number };

const categories = [
  ["salary", "Salaire"], ["commission", "Commission"], ["remuneration", "Rémunération"],
  ["indemnity", "Indemnité"], ["bonus", "Prime"], ["supplier", "Fournisseur"],
  ["agricultural_labor", "Main-d’œuvre agricole"], ["partner", "Partenaire"],
  ["reimbursement", "Remboursement"], ["refund", "Remboursement client"], ["advance", "Avance"], ["other", "Autre"],
] as const;
const categoryLabel = (value: string) => categories.find(([key]) => key === value)?.[1] || value;
const statusLabel: Record<string, string> = {
  draft: "Brouillon", pending_approval: "À approuver", approved: "Approuvé",
  processing: "En traitement", succeeded: "Payé", failed: "Échec", cancelled: "Annulé",
};
const statusClass: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-800", failed: "bg-destructive/10 text-destructive",
  pending_approval: "bg-amber-100 text-amber-800", approved: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800", cancelled: "bg-muted text-muted-foreground",
};
const money = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0)) + " FCFA";
const normalizedName = (firstNames?: string | null, lastName?: string | null, fullName?: string | null) => {
  const combined = [firstNames, lastName].filter(Boolean).join(" ").trim() || String(fullName || "").trim();
  const parts = combined.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(" ") : (parts[0] || "");
};
const renderSms = (content: string, name: string, amount = "125 000", reason = "salaire", date = "09/11/2026", reference = "AGP-EXEMPLE") => {
  const greeting = name ? "Bonjour " + name : "Bonjour";
  return content
    .replaceAll("Bonjour {dernier_prenom_nom}", greeting)
    .replaceAll("Bonjour {dernierprenom_nom}", greeting)
    .replaceAll("{dernier_prenom_nom}", name)
    .replaceAll("{dernierprenom_nom}", name)
    .replaceAll("{prenom}", name.split(" ")[0] || "")
    .replaceAll("{nom}", name.split(" ").slice(-1)[0] || "")
    .replaceAll("{nom_complet}", name)
    .replaceAll("{montant}", amount)
    .replaceAll("{motif}", reason)
    .replaceAll("{date}", date)
    .replaceAll("{reference}", reference)
    .replaceAll("{entreprise}", "AgriCapital");
};

export default function AgriCapitalPay({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [payrollItems, setPayrollItems] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");
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
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [templatePreviewName, setTemplatePreviewName] = useState("Koffi Inocent KOFFI");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b, pay, t, payroll, commission, commissionPayout, expense] = await Promise.all([
        (supabase as any).rpc("finance_payout_list_profiles"),
        (supabase as any).from("finance_payout_beneficiaries").select("*").order("display_name"),
        (supabase as any).from("finance_payouts").select("*").order("created_at", { ascending: false }).limit(150),
        (supabase as any).from("finance_payout_sms_templates").select("*").order("category"),
        (supabase as any).from("finance_payroll_items").select("id,profile_id,net_salary,status,transaction_id,payroll_run_id").eq("status","valide").is("transaction_id",null).gt("net_salary",0),
        (supabase as any).from("commissions").select("id,profile_id,montant_commission,type_commission,statut,periode").eq("statut","validee").not("profile_id","is",null).gt("montant_commission",0),
        (supabase as any).from("portefeuille_versements").select("id,profile_id,montant_brut,montant_paye,statut,periode_debut,periode_fin").in("statut",["valide","partiellement_paye"]),
        (supabase as any).from("finance_expenses").select("id,profile_id,beneficiary_name,supplier_name,beneficiary_phone,total_amount,paid_amount,status,expense_category,description").in("status",["unpaid","partial"]),
      ]);
      for (const result of [p, b, pay, t]) if (result.error) throw result.error;
      setProfiles((p.data || []).filter((row: Profile) => row.actif !== false));
      setBeneficiaries(b.data || []);
      setPayouts(pay.data || []);
      setTemplates(t.data || []);
      setPayrollItems(payroll.error ? [] : payroll.data || []);
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
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !reason.trim()) {
      toast({ title: "Informations manquantes", description: "Indiquez un montant positif et un motif.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      if (mode === "batch") {
        if (!selectedProfiles.length) throw new Error("Sélectionnez au moins un bénéficiaire interne.");
        if (providerCode === "kkiapay_push_up") throw new Error("La préparation d'un lot Push Up est disponible, mais son lancement API reste verrouillé jusqu'à validation de l'API officielle et de l'approvisionnement du compte Push Up.");
        const { data, error } = await (supabase as any).rpc("finance_payout_create_batch", {
          p_category: category, p_amount: Number(amount), p_reason: reason.trim(),
          p_profile_ids: selectedProfiles, p_provider_code: providerCode, p_payment_method: paymentMethod,
        });
        if (error) throw error;
        toast({ title: "Lot de paiements créé", description: "Les " + selectedProfiles.length + " décaissements sont soumis à approbation. Référence du lot : " + data });
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
      setAmount(""); setReason(""); setProfileId(""); setSelectedProfiles([]); setSourceKind("none"); setSourceId("");
      setExternalFirstNames(""); setExternalLastName(""); setExternalPhone("");
      await load();
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

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    const content = editingTemplate.content || "";
    if (!content.trim() || content.length > 150 || /[^\x20-\x7E]/.test(content)) {
      toast({ title: "Modèle SMS invalide", description: "Le texte doit être en caractères GSM/ASCII et ne pas dépasser 150 caractères.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("finance_payout_sms_templates")
        .update({ name: editingTemplate.name, content, active: editingTemplate.active }).eq("id", editingTemplate.id);
      if (error) throw error;
      toast({ title: "Modèle SMS enregistré", description: "La règle de notification correspondante est synchronisée automatiquement." });
      setEditingTemplate(null); await load();
    } catch (error: any) {
      toast({ title: "Enregistrement impossible", description: error?.message || "Vérifiez le modèle.", variant: "destructive" });
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

      <Card className="border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Sécurité des fonds et connexion Kkiapay</div>
          <p>Les clés privées et le webhook Kkiapay existants sont réservés à la vérification des encaissements. Le solde encaissé n'est pas assimilé à un solde Push Up disponible : l'approvisionnement du compte Push Up est distinct. L'envoi automatique reste verrouillé tant que l'API de décaissement et le compte Push Up AgriCapital ne sont pas validés.</p>
          <p className="text-xs text-muted-foreground">Les paiements Push Up peuvent être préparés et rapprochés à partir d'une référence et d'un identifiant confirmés dans le tableau de bord Kkiapay.</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="operations">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="operations">Nouveau décaissement</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="beneficiaires">Bénéficiaires</TabsTrigger>
          <TabsTrigger value="sms">Modèles SMS</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-3 space-y-4">
          {!canManage && <p className="text-sm text-muted-foreground">Consultation seule : les droits Finance sont nécessaires pour créer ou modifier des décaissements.</p>}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Préparer un paiement</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>Paiement individuel</Button>
                <Button type="button" size="sm" variant={mode === "batch" ? "default" : "outline"} onClick={() => { setMode("batch"); setSourceKind("none"); setSourceId(""); }}>Lot d'utilisateurs internes</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Catégorie du paiement</Label><Select value={category} onValueChange={setCategory} disabled={mode === "single" && sourceKind !== "none"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Montant par bénéficiaire (FCFA)</Label><Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={mode === "single" && (sourceKind === "payroll_item" || sourceKind === "commission")} placeholder="Ex. 125000" /></div>
                <div className="space-y-1"><Label>Mode de paiement</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="bank_transfer">Virement bancaire</SelectItem><SelectItem value="cash">Espèces</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Canal de décaissement</Label><Select value={providerCode} onValueChange={setProviderCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Paiement hors ligne / manuel</SelectItem><SelectItem value="kkiapay_push_up">Kkiapay Push Up (préparation / rapprochement)</SelectItem><SelectItem value="other">Autre prestataire</SelectItem></SelectContent></Select></div>
                <div className="space-y-1 sm:col-span-2"><Label>Motif détaillé</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Salaire novembre 2026, commission commerciale, facture fournisseur…" /></div>
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
                  {sourceKind !== "none" && <p className="text-xs text-muted-foreground">À la confirmation du paiement, AgriCapital PAY mettra à jour la ligne de paie, la commission ou la dépense liée et créera l’écriture comptable correspondante.</p>}
                  {!profileId && <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Prénoms</Label><Input value={externalFirstNames} onChange={(e) => setExternalFirstNames(e.target.value)} /></div>
                    <div className="space-y-1"><Label>Nom</Label><Input value={externalLastName} onChange={(e) => setExternalLastName(e.target.value)} /></div>
                    <div className="space-y-1"><Label>Téléphone</Label><Input type="tel" value={externalPhone} onChange={(e) => setExternalPhone(e.target.value)} placeholder="+225 07 00 00 00 00" /></div>
                    <div className="space-y-1"><Label>Type de bénéficiaire</Label><Select value={externalType} onValueChange={setExternalType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="supplier">Fournisseur</SelectItem><SelectItem value="provider">Prestataire</SelectItem><SelectItem value="agent">Agent</SelectItem><SelectItem value="partner">Partenaire</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div>
                  </div>}
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between"><Label>Utilisateurs internes à payer</Label><Badge variant="outline">{selectedProfiles.length} sélectionné(s)</Badge></div>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {profiles.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"><input type="checkbox" checked={selectedProfiles.includes(p.id)} onChange={(e) => setSelectedProfiles((current) => e.target.checked ? [...current, p.id] : current.filter((id) => id !== p.id))} className="h-4 w-4" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.nom_complet || profileDisplay(p)}</span><span className="block truncate text-xs text-muted-foreground">{p.poste || p.email || "Collaborateur"}</span></span><span className="text-xs text-muted-foreground">{p.telephone || "Sans téléphone"}</span></label>)}
                    {!profiles.length && <p className="text-sm text-muted-foreground">Aucun utilisateur interne actif trouvé.</p>}
                  </div>
                </div>
              )}
              {providerCode === "kkiapay_push_up" && <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">Le lot Push Up ne peut pas être envoyé depuis le CRM tant que Kkiapay n'a pas fourni et activé le contrat API de Push Up et confirmé l'approvisionnement automatique. Aucun transfert ne sera lancé par ce formulaire.</p>}
              <Button onClick={() => void createPayout()} disabled={!canManage || saving || loading || (providerCode === "kkiapay_push_up" && mode === "batch")}><Send className="mr-2 h-4 w-4" />{saving ? "Enregistrement…" : mode === "batch" ? "Créer le lot à approuver" : "Soumettre à approbation"}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historique" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Décaissements récents</h3><Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button></div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[860px] text-sm"><thead className="bg-muted/60"><tr className="text-left"><th className="p-3">Bénéficiaire</th><th className="p-3">Motif</th><th className="p-3 text-right">Montant</th><th className="p-3">Référence</th><th className="p-3">Statut</th><th className="p-3">Action</th></tr></thead>
              <tbody>{payouts.map((p) => <tr key={p.id} className="border-t"><td className="p-3 font-medium">{getBeneficiaryName(p)}<span className="block text-xs text-muted-foreground">{categoryLabel(p.category)}</span></td><td className="max-w-[220px] p-3"><span className="block truncate">{p.reason}</span><span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("fr-FR")}</span></td><td className="p-3 text-right font-semibold tabular-nums">{money(p.amount)}</td><td className="p-3"><span className="block">{p.reference}</span><span className="text-xs text-muted-foreground">{p.provider_code === "kkiapay_push_up" ? "Kkiapay Push Up" : "Hors ligne"}{p.source_kind ? " · " + p.source_kind : ""}</span></td><td className="p-3"><Badge className={statusClass[p.status] || ""}>{statusLabel[p.status] || p.status}</Badge>{p.notification_status === "queued" && <span className="mt-1 block text-xs text-muted-foreground">SMS en file</span>}{p.notification_status === "blocked_too_long" && <span className="mt-1 block text-xs text-destructive">SMS bloqué (&gt;150)</span>}</td><td className="p-3"><div className="flex flex-wrap gap-1">{p.status === "pending_approval" && canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => void approve(p)}>Approuver</Button>}{p.status === "approved" && canManage && <Button size="sm" disabled={saving} onClick={() => { setReconcilePayout(p); setProviderReference(""); setProviderTransactionId(""); setReconcileMethod(p.payment_method || "mobile_money"); }}>{p.provider_code === "kkiapay_push_up" ? "Rapprocher Push Up" : "Confirmer paiement"}</Button>}</div></td></tr>)}
              {!payouts.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{loading ? "Chargement…" : "Aucun décaissement enregistré."}</td></tr>}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Une approbation est effectuée par un responsable différent du créateur. La confirmation finale exige une référence réelle. Les lignes Push Up sont rapprochées depuis le rapport du tableau de bord Kkiapay ; aucun transfert n'est simulé.</p>
        </TabsContent>

        <TabsContent value="beneficiaires" className="mt-3 space-y-3">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Répertoire des bénéficiaires</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Nom</th><th className="p-2">Catégorie</th><th className="p-2">Téléphone</th><th className="p-2">Origine</th></tr></thead><tbody>{beneficiaries.map((b) => <tr key={b.id} className="border-b"><td className="p-2 font-medium">{b.display_name}</td><td className="p-2">{b.beneficiary_type}</td><td className="p-2">{b.phone || "—"}</td><td className="p-2">{b.profile_id ? "Profil CRM synchronisé" : "Externe"}</td></tr>)}{!beneficiaries.length && <tr><td colSpan={4} className="p-5 text-center text-muted-foreground">Aucun bénéficiaire enregistré.</td></tr>}</tbody></table></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="sms" className="mt-3 space-y-3">
          <Card><CardHeader><CardTitle>Notifications automatiques de paiement</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Les SMS sont déclenchés uniquement après confirmation du statut « Payé ». Les modèles sont synchronisés avec le moteur de notifications existant. Le nom est résolu depuis le profil CRM : dernier prénom disponible + nom ; si aucun nom n'est disponible, le message commence par « Bonjour ».</p><p className="text-xs text-muted-foreground">Variables : {"{dernierprenom_nom}"}, {"{montant}"}, {"{motif}"}, {"{date}"}, {"{reference}"}, {"{entreprise}"}. Limite stricte : 150 caractères après remplacement des variables. Les modèles restent en alphabet GSM/ASCII afin d'éviter un changement d'encodage.</p></CardContent></Card>
          <div className="grid gap-3 md:grid-cols-2">{templates.map((template) => {
            const preview = renderSms(template.content, normalizedName(null, null, templatePreviewName));
            return <Card key={template.id}><CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{template.name}</CardTitle><Badge variant={template.active ? "default" : "secondary"}>{template.active ? "Actif" : "Inactif"}</Badge></div><p className="text-xs text-muted-foreground">{categoryLabel(template.category)}</p></CardHeader><CardContent className="space-y-2"><p className="rounded-md bg-muted p-3 text-sm">{preview}</p><p className={"text-xs " + (preview.length > 150 ? "text-destructive" : "text-muted-foreground")}>{preview.length}/150 caractères · {preview.length > 150 ? "Envoi bloqué" : "Conforme"}</p>{canManage && <Button size="sm" variant="outline" onClick={() => setEditingTemplate({ ...template })}>Modifier le modèle</Button>}</CardContent></Card>;
          })}</div>
          <div className="space-y-1"><Label>Nom de test pour l'aperçu</Label><Input value={templatePreviewName} onChange={(e) => setTemplatePreviewName(e.target.value)} /></div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open && !saving) setEditingTemplate(null); }}>
        <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Modifier le modèle SMS</DialogTitle></DialogHeader>
          {editingTemplate && <div className="space-y-3"><div className="space-y-1"><Label>Nom du modèle</Label><Input value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} /></div><div className="space-y-1"><Label>Contenu (150 caractères maximum)</Label><Textarea rows={4} value={editingTemplate.content} onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })} /></div><div className="flex items-center justify-between text-xs"><span>{editingTemplate.content.length}/150 caractères</span><span className={/[^\x20-\x7E]/.test(editingTemplate.content) ? "text-destructive" : "text-muted-foreground"}>{/[^\x20-\x7E]/.test(editingTemplate.content) ? "Caractères non GSM/ASCII" : "Alphabet GSM/ASCII"}</span></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingTemplate.active} onChange={(e) => setEditingTemplate({ ...editingTemplate, active: e.target.checked })} />Activer cette notification</label><div className="rounded-md bg-muted p-3 text-sm">{renderSms(editingTemplate.content, normalizedName(null, null, templatePreviewName))}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingTemplate(null)}>Annuler</Button><Button onClick={() => void saveTemplate()} disabled={saving || editingTemplate.content.length > 150 || /[^\x20-\x7E]/.test(editingTemplate.content)}>Enregistrer</Button></div></div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reconcilePayout} onOpenChange={(open) => { if (!open && !saving) setReconcilePayout(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{reconcilePayout?.provider_code === "kkiapay_push_up" ? "Rapprocher une opération Kkiapay Push Up" : "Confirmer un paiement effectué"}</DialogTitle></DialogHeader>
          {reconcilePayout && <div className="space-y-3"><div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">{getBeneficiaryName(reconcilePayout)}</p><p>{money(reconcilePayout.amount)} · {reconcilePayout.reference}</p><p className="text-xs text-muted-foreground">{reconcilePayout.reason}</p></div><div className="space-y-1"><Label>Référence de confirmation *</Label><Input value={providerReference} onChange={(e) => setProviderReference(e.target.value)} placeholder="Référence de transfert / lot" /></div>{reconcilePayout.provider_code === "kkiapay_push_up" && <div className="space-y-1"><Label>ID de transaction Push Up *</Label><Input value={providerTransactionId} onChange={(e) => setProviderTransactionId(e.target.value)} placeholder="Identifiant issu du rapport Push Up" /></div>}<div className="space-y-1"><Label>Mode de paiement</Label><Select value={reconcileMethod} onValueChange={setReconcileMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="bank_transfer">Virement bancaire</SelectItem><SelectItem value="cash">Espèces</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div><p className="text-xs text-muted-foreground">Ne confirmez qu'après vérification effective du débit ou du rapport fournisseur. Cette action déclenche le SMS au bénéficiaire si le modèle est actif et respecte 150 caractères.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReconcilePayout(null)}>Annuler</Button><Button onClick={() => void reconcile()} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmer le rapprochement</Button></div></div>}
        </DialogContent>
      </Dialog>
      {loading && <p className="text-xs text-muted-foreground">Chargement des données AgriCapital PAY…</p>}
    </div>
  );
}
