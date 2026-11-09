import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, RefreshCw, Plus, CheckCircle2, Users, MessageSquare, ShieldCheck, AlertTriangle } from "lucide-react";

type Beneficiary = {
  id: string; profile_id: string | null; beneficiary_type: string; display_name: string;
  first_names?: string | null; last_name?: string | null; phone?: string | null; email?: string | null; active: boolean;
};
type Payout = {
  id: string; reference: string; beneficiary_id: string; profile_id: string | null; category: string;
  amount: number; reason: string; status: string; payment_method: string; provider_code: string;
  created_by: string | null; created_at: string; notification_status: string; provider_reference?: string | null;
};
type SmsTemplate = { id: string; category: string; name: string; content: string; active: boolean };

const CATEGORIES = [
  ["salary", "Salaire"], ["commission", "Commission"], ["remuneration", "Rémunération"],
  ["indemnity", "Indemnité"], ["bonus", "Prime"], ["supplier", "Fournisseur"],
  ["agricultural_labor", "Main-d’œuvre agricole"], ["partner", "Partenaire"],
  ["reimbursement", "Remboursement"], ["advance", "Avance"], ["other", "Autre"],
] as const;
const TYPES = [["employee","Employé"],["crm_user","Utilisateur CRM"],["provider","Prestataire"],["supplier","Fournisseur"],["agent","Agent"],["partner","Partenaire"],["other","Autre"]] as const;
const money = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0)) + " FCFA";
const categoryLabel = (value: string) => CATEGORIES.find(([key]) => key === value)?.[1] || value;
const statusLabel: Record<string,string> = {
  draft:"Brouillon", pending_approval:"À valider", approved:"Approuvé", processing:"En traitement",
  succeeded:"Payé", failed:"Échec", cancelled:"Annulé",
};
const statusVariant = (value: string): "default" | "secondary" | "destructive" | "outline" =>
  value === "succeeded" ? "default" : value === "failed" ? "destructive" :
  value === "pending_approval" ? "outline" : "secondary";

const asciiSms = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
const renderPreview = (content: string) => content
  .replace(/\{\s*(?:dernier_prenom_nom|dernierprenom_nom)\s*\}/gi, "Inocent KOFFI")
  .replace(/\{\s*montant\s*\}/gi, "125 000")
  .replace(/\{\s*motif\s*\}/gi, "Salaire mensuel")
  .replace(/\{\s*date\s*\}/gi, "09/11/2026")
  .replace(/\{\s*reference\s*\}/gi, "AGP-20261109")
  .replace(/\{\s*entreprise\s*\}/gi, "AgriCapital");
const GSM_BASIC = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,-.\/:;<=>?¡ÄÖÑÜ§¿äöñüà0-9A-Za-z]*$/;
const smsSegments = (message: string) => {
  const gsm = GSM_BASIC.test(message);
  const length = Array.from(message).length;
  return { gsm, length, segments: length === 0 ? 0 : gsm ? (length <= 160 ? 1 : Math.ceil(length / 153)) : (length <= 70 ? 1 : Math.ceil(length / 67)) };
};

export default function FinancePayouts({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [beneficiaryOpen, setBeneficiaryOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [beneficiaryMode, setBeneficiaryMode] = useState<"internal" | "external">("internal");
  const [internalProfileId, setInternalProfileId] = useState("");
  const [external, setExternal] = useState({ display_name: "", phone: "", email: "", beneficiary_type: "supplier" });
  const [payout, setPayout] = useState({ beneficiary_id: "", category: "salary", amount: "", reason: "", payment_method: "mobile_money" });
  const [selectedCategory, setSelectedCategory] = useState("salary");
  const [templateDraft, setTemplateDraft] = useState("");
  const [templateActive, setTemplateActive] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [directory, b, p, t, auth] = await Promise.all([
        (supabase as any).rpc("workspace_list_finance_users"),
        (supabase as any).from("finance_payout_beneficiaries").select("*").order("display_name"),
        (supabase as any).from("finance_payouts").select("*").order("created_at", { ascending: false }).limit(100),
        (supabase as any).from("finance_payout_sms_templates").select("*").order("category"),
        supabase.auth.getUser(),
      ]);
      for (const result of [directory, b, p, t]) if (result.error) throw result.error;
      setProfiles((directory.data || []).filter((item: any) => item.id));
      setBeneficiaries(b.data || []);
      setPayouts(p.data || []);
      setTemplates(t.data || []);
      setUserId(auth.data.user?.id || null);
    } catch (error: any) {
      toast({ title: "AgriCapital PAY indisponible", description: error?.message || "Impossible de charger les données.", variant: "destructive" });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const selectedTemplate = useMemo(() => templates.find(item => item.category === selectedCategory), [templates, selectedCategory]);
  useEffect(() => {
    setTemplateDraft(selectedTemplate?.content || "");
    setTemplateActive(selectedTemplate?.active ?? true);
  }, [selectedTemplate?.id, selectedTemplate?.content, selectedTemplate?.active]);

  const preview = useMemo(() => renderPreview(templateDraft), [templateDraft]);
  const smsInfo = useMemo(() => smsSegments(preview), [preview]);
  const activeBeneficiaries = beneficiaries.filter(item => item.active);
  const pendingCount = payouts.filter(item => item.status === "pending_approval").length;
  const totalPending = payouts.filter(item => ["pending_approval","approved","processing"].includes(item.status)).reduce((sum,item) => sum + Number(item.amount || 0), 0);

  const saveBeneficiary = async () => {
    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      if (beneficiaryMode === "internal") {
        if (!internalProfileId) throw new Error("Sélectionnez un utilisateur du CRM.");
        const person = profiles.find(item => item.id === internalProfileId);
        if (!person) throw new Error("Utilisateur CRM introuvable.");
        payload = { profile_id: internalProfileId, beneficiary_type: "employee", display_name: person.nom_complet || [person.prenoms, person.nom].filter(Boolean).join(" ") };
      } else {
        if (!external.display_name.trim() || !external.phone.trim()) throw new Error("Le nom et le téléphone du bénéficiaire sont obligatoires.");
        payload = { ...external, display_name: external.display_name.trim(), phone: external.phone.trim(), email: external.email.trim() || null };
      }
      const { error } = await (supabase as any).from("finance_payout_beneficiaries").insert(payload);
      if (error) throw error;
      toast({ title: "Bénéficiaire ajouté" });
      setBeneficiaryOpen(false); setInternalProfileId("");
      setExternal({ display_name: "", phone: "", email: "", beneficiary_type: "supplier" });
      await load();
    } catch (error: any) {
      toast({ title: "Enregistrement impossible", description: error?.message || "Vérifiez les informations.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const createPayout = async () => {
    const amount = Number(payout.amount);
    const beneficiary = activeBeneficiaries.find(item => item.id === payout.beneficiary_id);
    if (!beneficiary || !Number.isFinite(amount) || amount <= 0 || !payout.reason.trim()) {
      toast({ title: "Informations requises", description: "Choisissez un bénéficiaire, un montant positif et un motif.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("finance_payouts").insert({
        beneficiary_id: beneficiary.id, profile_id: beneficiary.profile_id, category: payout.category,
        amount, reason: payout.reason.trim(), payment_method: payout.payment_method,
        provider_code: "manual", status: "pending_approval", created_by: userId,
        idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      toast({ title: "Décaissement soumis", description: "Le dossier attend la validation d’un autre responsable financier." });
      setPayoutOpen(false); setPayout({ beneficiary_id: "", category: "salary", amount: "", reason: "", payment_method: "mobile_money" });
      await load();
    } catch (error: any) {
      toast({ title: "Création impossible", description: error?.message || "Vérifiez les informations.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const approvePayout = async (item: Payout) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("finance_payout_approve", { p_payout_id: item.id });
      if (error) throw error;
      toast({ title: "Décaissement approuvé", description: "Il est prêt pour le traitement par un fournisseur de paiement autorisé." });
      await load();
    } catch (error: any) {
      toast({ title: "Validation refusée", description: error?.message || "Une autre personne doit valider ce dossier.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveTemplate = async () => {
    const normalized = asciiSms(templateDraft).trim();
    if (!normalized || normalized.length > 150 || /[^\x20-\x7E]/.test(normalized)) {
      toast({ title: "Modèle SMS invalide", description: "Le texte doit contenir de 1 à 150 caractères ASCII. Les variables seront contrôlées après personnalisation.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("finance_payout_sms_templates").update({
        content: normalized, active: templateActive, updated_by: userId,
      }).eq("category", selectedCategory);
      if (error) throw error;
      toast({ title: "Modèle SMS enregistré", description: "Le modèle a été synchronisé avec le moteur central de notifications." });
      await load();
    } catch (error: any) {
      toast({ title: "Enregistrement du modèle impossible", description: error?.message || "Réessayez.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Mode sécurisé — préparation et validation uniquement</p>
            <p>Les virements automatiques ne sont pas activés. Les encaissements Kkiapay ne sont pas considérés comme des fonds disponibles tant que leur règlement net et leur transfert vers le compte de décaissement ne sont pas confirmés.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Dossiers suivis</p><p className="text-xl font-bold tabular-nums">{payouts.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">À valider</p><p className="text-xl font-bold tabular-nums">{pendingCount}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Montant en attente</p><p className="text-sm font-bold tabular-nums">{money(totalPending)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Bénéficiaires actifs</p><p className="text-xl font-bold tabular-nums">{activeBeneficiaries.length}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="payouts">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="payouts" className="gap-1"><Banknote className="h-4 w-4"/>Décaissements</TabsTrigger>
          <TabsTrigger value="beneficiaries" className="gap-1"><Users className="h-4 w-4"/>Bénéficiaires</TabsTrigger>
          <TabsTrigger value="sms" className="gap-1"><MessageSquare className="h-4 w-4"/>Modèles SMS</TabsTrigger>
        </TabsList>

        <TabsContent value="payouts" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-semibold">Ordres de décaissement</h3><p className="text-xs text-muted-foreground">Chaque ordre est soumis à une double validation.</p></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setBeneficiaryOpen(true)} disabled={!canManage}><Plus className="mr-1 h-4 w-4"/>Bénéficiaire</Button>
              <Button size="sm" onClick={() => setPayoutOpen(true)} disabled={!canManage || !activeBeneficiaries.length}><Plus className="mr-1 h-4 w-4"/>Nouveau décaissement</Button>
            </div>
          </div>
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm">
              <thead className="bg-muted/50"><tr className="border-b text-left"><th className="p-3">Référence / date</th><th className="p-3">Bénéficiaire</th><th className="p-3">Nature</th><th className="p-3 text-right">Montant</th><th className="p-3">Statut</th><th className="p-3">Action</th></tr></thead>
              <tbody>{payouts.map(item => {
                const beneficiary = beneficiaries.find(row => row.id === item.beneficiary_id);
                return <tr key={item.id} className="border-b last:border-0">
                  <td className="p-3"><p className="font-medium">{item.reference}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString("fr-FR")}</p></td>
                  <td className="p-3"><p className="font-medium">{beneficiary?.display_name || "Bénéficiaire"}</p><p className="text-xs text-muted-foreground">{beneficiary?.phone || "Téléphone absent"}</p></td>
                  <td className="p-3">{categoryLabel(item.category)}<p className="max-w-[220px] truncate text-xs text-muted-foreground">{item.reason}</p></td>
                  <td className="p-3 text-right font-semibold tabular-nums">{money(item.amount)}</td>
                  <td className="p-3"><Badge variant={statusVariant(item.status)}>{statusLabel[item.status] || item.status}</Badge></td>
                  <td className="p-3">{item.status === "pending_approval" && item.created_by !== userId && canManage
                    ? <Button size="sm" onClick={() => void approvePayout(item)} disabled={saving}><CheckCircle2 className="mr-1 h-4 w-4"/>Approuver</Button>
                    : item.status === "approved" ? <Badge variant="outline">Prêt pour exécution</Badge>
                    : item.status === "succeeded" ? <Badge>Confirmé</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}</td>
                </tr>;
              })}
              {!payouts.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{loading ? "Chargement…" : "Aucun décaissement enregistré."}</td></tr>}
              </tbody>
            </table></div>
          </CardContent></Card>
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4 shrink-0"/>Le statut « Approuvé » ne signifie pas que l’argent a été envoyé. Seule une confirmation serveur du prestataire pourra marquer un ordre comme payé.</div>
        </TabsContent>

        <TabsContent value="beneficiaries" className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold">Répertoire des bénéficiaires</h3><p className="text-xs text-muted-foreground">Les identités internes sont récupérées depuis les profils CRM.</p></div><Button size="sm" onClick={() => setBeneficiaryOpen(true)} disabled={!canManage}><Plus className="mr-1 h-4 w-4"/>Ajouter</Button></div>
          <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50"><tr className="border-b text-left"><th className="p-3">Bénéficiaire</th><th className="p-3">Type</th><th className="p-3">Téléphone</th><th className="p-3">Origine</th><th className="p-3">Statut</th></tr></thead><tbody>
            {beneficiaries.map(item => <tr key={item.id} className="border-b last:border-0"><td className="p-3 font-medium">{item.display_name}</td><td className="p-3">{TYPES.find(([key]) => key === item.beneficiary_type)?.[1] || item.beneficiary_type}</td><td className="p-3">{item.phone || "—"}</td><td className="p-3">{item.profile_id ? "Profil CRM" : "Externe"}</td><td className="p-3"><Badge variant={item.active ? "default" : "secondary"}>{item.active ? "Actif" : "Inactif"}</Badge></td></tr>)}
            {!beneficiaries.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Aucun bénéficiaire.</td></tr>}
          </tbody></table></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="sms" className="mt-3 space-y-3">
          <Card><CardHeader><CardTitle className="text-base">Personnalisation des confirmations SMS</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="space-y-1"><Label>Type de paiement</Label><Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{CATEGORIES.map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Message SMS (150 caractères maximum après personnalisation)</Label><Textarea rows={3} value={templateDraft} onChange={event => setTemplateDraft(event.target.value)} disabled={!canManage}/><p className="text-xs text-muted-foreground">Variables : {"{dernier_prenom_nom}"}, {"{dernierprenom_nom}"}, {"{montant}"}, {"{motif}"}, {"{date}"}, {"{reference}"}, {"{entreprise}"}.</p></div>
            <div className="rounded-lg border bg-muted/30 p-3"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs font-semibold">APERÇU PERSONNALISÉ</span><Badge variant={smsInfo.length <= 150 ? "secondary" : "destructive"}>{smsInfo.length}/150</Badge></div><p className="text-sm">{preview}</p><p className="mt-2 text-xs text-muted-foreground">{smsInfo.gsm ? "Encodage GSM-7" : "Encodage Unicode"} · {smsInfo.segments} segment(s) estimé(s)</p></div>
            <div className="flex items-center gap-2"><input id="payout-template-active" type="checkbox" checked={templateActive} onChange={event => setTemplateActive(event.target.checked)} disabled={!canManage} className="h-4 w-4"/><Label htmlFor="payout-template-active">Activer l’envoi automatique à la confirmation du paiement</Label></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => void saveTemplate()} disabled={!canManage || saving || !selectedTemplate}><CheckCircle2 className="mr-1 h-4 w-4"/>Enregistrer le modèle</Button><Button type="button" variant="outline" onClick={() => { setTemplateDraft(selectedTemplate?.content || ""); setTemplateActive(selectedTemplate?.active ?? true); }}>Réinitialiser</Button></div>
            <p className="text-xs text-muted-foreground">Le système bloque la mise en file d’un SMS si le message rendu dépasse 150 caractères. Les modèles sont synchronisés avec le moteur de notifications existant.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-1 h-4 w-4"/>Actualiser</Button></div>

      {beneficiaryOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Ajouter un bénéficiaire"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Ajouter un bénéficiaire</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="flex gap-2"><Button size="sm" variant={beneficiaryMode === "internal" ? "default" : "outline"} onClick={() => setBeneficiaryMode("internal")}>Utilisateur interne</Button><Button size="sm" variant={beneficiaryMode === "external" ? "default" : "outline"} onClick={() => setBeneficiaryMode("external")}>Externe</Button></div>
        {beneficiaryMode === "internal" ? <div className="space-y-1"><Label>Profil CRM</Label><Select value={internalProfileId} onValueChange={setInternalProfileId}><SelectTrigger><SelectValue placeholder="Choisir un collaborateur"/></SelectTrigger><SelectContent>{profiles.map(person => <SelectItem key={person.id} value={person.id}>{person.nom_complet || [person.prenoms,person.nom].filter(Boolean).join(" ")}{person.poste ? " — "+person.poste : ""}</SelectItem>)}</SelectContent></Select></div>
        : <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1 sm:col-span-2"><Label>Nom complet</Label><Input value={external.display_name} onChange={event => setExternal({...external,display_name:event.target.value})}/></div><div className="space-y-1"><Label>Type</Label><Select value={external.beneficiary_type} onValueChange={value => setExternal({...external,beneficiary_type:value})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TYPES.filter(([key]) => key !== "employee" && key !== "crm_user").map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Téléphone</Label><Input type="tel" value={external.phone} onChange={event => setExternal({...external,phone:event.target.value})} placeholder="+225 07 00 00 00 00"/></div><div className="space-y-1 sm:col-span-2"><Label>E-mail (facultatif)</Label><Input type="email" value={external.email} onChange={event => setExternal({...external,email:event.target.value})}/></div></div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBeneficiaryOpen(false)} disabled={saving}>Annuler</Button><Button onClick={() => void saveBeneficiary()} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button></div>
      </CardContent></Card></div>}

      {payoutOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Nouveau décaissement"><Card className="w-full max-w-xl"><CardHeader><CardTitle>Nouveau décaissement</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><Label>Bénéficiaire</Label><Select value={payout.beneficiary_id} onValueChange={value => setPayout({...payout,beneficiary_id:value})}><SelectTrigger><SelectValue placeholder="Sélectionner un bénéficiaire"/></SelectTrigger><SelectContent>{activeBeneficiaries.map(item=><SelectItem key={item.id} value={item.id}>{item.display_name}{item.phone ? " · "+item.phone : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Nature du paiement</Label><Select value={payout.category} onValueChange={value => setPayout({...payout,category:value})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{CATEGORIES.map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Montant (FCFA)</Label><Input type="number" min="1" value={payout.amount} onChange={event => setPayout({...payout,amount:event.target.value})}/></div>
        <div className="space-y-1"><Label>Mode prévu</Label><Select value={payout.payment_method} onValueChange={value => setPayout({...payout,payment_method:value})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="bank_transfer">Virement bancaire</SelectItem><SelectItem value="cash">Espèces</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div>
        <div className="space-y-1 sm:col-span-2"><Label>Motif / détail</Label><Textarea rows={2} value={payout.reason} onChange={event => setPayout({...payout,reason:event.target.value})} placeholder="Ex. salaire du mois, facture fournisseur…"/></div>
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground sm:col-span-2">La création place le dossier en attente d’approbation. Aucun ordre n’est transmis à Kkiapay ni à un opérateur de paiement.</div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setPayoutOpen(false)} disabled={saving}>Annuler</Button><Button onClick={() => void createPayout()} disabled={saving}>{saving ? "Enregistrement…" : "Soumettre pour validation"}</Button></div>
      </CardContent></Card></div>}
    </div>
  );
}
