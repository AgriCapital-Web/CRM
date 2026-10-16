import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/lib/safeError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, UserRound, Pencil, RefreshCw, UserRoundCheck } from "lucide-react";
import ContactLauncher from "@/components/common/ContactLauncher";

type Prospect = {
  id: string; lead_id: string; client_id: string | null; nom: string; prenoms: string;
  civilite: string | null; telephone: string; whatsapp: string | null; email: string | null;
  type_lead: string; offre_code: string | null; formule_code: string | null; statut: string;
  superficie_souhaitee_ha: number | null; delai_demarrage: string | null; commentaire: string | null;
  created_at: string; assigned_to: string | null; _legacyLead?: boolean;
};

const STATUTS = [
  { value: "qualifie", label: "Qualifié" }, { value: "en_discussion", label: "En discussion" },
  { value: "preparation_dossier", label: "Préparation du dossier" }, { value: "pret_souscrire", label: "Prêt à souscrire" },
  { value: "abandonne", label: "Abandonné" },
];

export default function Prospects() {
  const { userRoles } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [saving, setSaving] = useState(false);
  const isGlobalAdmin = (userRoles || []).some((r: string) => ["pdg", "dg", "admin", "super_admin"].includes(r));
  const { data: prospects = [], isLoading, error, refetch } = useQuery({
    queryKey: ["prospects"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prospects")
        .select("id,lead_id,client_id,nom,prenoms,civilite,telephone,whatsapp,email,type_lead,offre_code,formule_code,statut,superficie_souhaitee_ha,delai_demarrage,commentaire,created_at,assigned_to")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if ((data || []).length > 0) return (data || []) as Prospect[];
      // Récupère les anciens prospects encore stockés dans le pipeline Leads.
      const legacy = await (supabase as any).from("leads").select("id,nom,prenoms,civilite,telephone,whatsapp,email,type_lead,offre_code,formule_code,statut,superficie_souhaitee_ha,delai_demarrage,commentaire,created_at,assigned_to").eq("etape_pipeline", "prospect").order("created_at", { ascending: false });
      if (legacy.error) throw legacy.error;
      return (legacy.data || []).map((row: any) => ({ ...row, lead_id: row.id, client_id: null, _legacyLead: true })) as Prospect[];
    },
  });
  const visible = prospects.filter(p => [p.nom, p.prenoms, p.telephone, p.email, p.offre_code, p.formule_code]
    .some(v => String(v || "").toLowerCase().includes(search.toLowerCase().trim())));
  const updateField = (field: keyof Prospect, value: string) => setEditing(old => old ? ({ ...old, [field]: value } as Prospect) : old);

  const convertToClient = async (prospect: Prospect) => {
    try {
      const { data: clientId, error } = prospect._legacyLead ? await (supabase as any).rpc("convert_lead_to_prospect", { _lead_id: prospect.lead_id }) : await (supabase as any).rpc("convert_prospect_to_client", { _prospect_id: prospect.id });
      if (error) throw error;
      if (!clientId) throw new Error("La base n'a retourné aucun identifiant client.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["prospects"] }),
        qc.invalidateQueries({ queryKey: ["leads"] }),
        qc.invalidateQueries({ queryKey: ["clients"] }),
      ]);
      toast({ title: prospect._legacyLead ? "Dossier Prospect créé" : "Client créé", description: prospect._legacyLead ? "Le dossier historique a été migré vers la table Prospects. Actualisez la liste puis poursuivez la conversion en client." : "Le client est relié au prospect et au lead d’origine. Complétez maintenant son dossier client." });
    } catch (e: any) {
      toast({ title: "Conversion impossible", description: getSafeErrorMessage(e), variant: "destructive" });
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = {
        nom: editing.nom.trim(), prenoms: editing.prenoms.trim(), civilite: editing.civilite || null,
        telephone: editing.telephone.trim(), whatsapp: editing.whatsapp?.trim() || null,
        email: editing.email?.trim() || null, type_lead: editing.type_lead, offre_code: editing.offre_code || null,
        formule_code: editing.formule_code || null, statut: editing.statut,
        superficie_souhaitee_ha: editing.superficie_souhaitee_ha === null ? null : Number(editing.superficie_souhaitee_ha),
        delai_demarrage: editing.delai_demarrage || null, commentaire: editing.commentaire || null, updated_at: new Date().toISOString(),
      };
      if (!payload.nom || !payload.prenoms || !payload.telephone) throw new Error("Le nom, les prénoms et le téléphone sont obligatoires.");
      const targetTable = editing._legacyLead ? "leads" : "prospects";
      const { error } = await (supabase as any).from(targetTable).update(payload).eq("id", editing.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["prospects"] });
      setEditing(null);
      toast({ title: "Prospect enregistré", description: "Les informations du dossier Prospect ont été mises à jour." });
    } catch (e: any) {
      toast({ title: "Enregistrement impossible", description: getSafeErrorMessage(e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  return <MainLayout>
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Prospects</h1><p className="text-sm text-muted-foreground">Dossiers distincts des leads, reliés à leur origine et prêts pour la conversion client.</p></div>
        <Button variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
      </div>
      <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher nom, téléphone, email, offre…" /></div>
      {error && <Card><CardContent className="p-4 text-sm text-destructive">Impossible de charger les prospects : {getSafeErrorMessage(error)}</CardContent></Card>}
      {isLoading ? <p className="p-6 text-center text-muted-foreground">Chargement des prospects…</p> :
        visible.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center"><UserRound className="h-8 w-8 text-muted-foreground"/><p className="font-medium">Aucun prospect trouvé</p><p className="text-sm text-muted-foreground">Les prospects sont créés lors de la conversion d’un lead depuis le pipeline Leads.</p></CardContent></Card> :
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(p => <Card key={p.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2"><div className="min-w-0"><CardTitle className="truncate text-base">{p.prenoms} {p.nom}</CardTitle><p className="mt-1 text-sm text-muted-foreground"><ContactLauncher phone={p.telephone} whatsapp={p.whatsapp} email={p.email} name={[p.prenoms, p.nom].filter(Boolean).join(" ")} kind={p.type_lead === "proprietaire_foncier" ? "proprietaire" : (p._legacyLead ? "lead" : "prospect")} status={p.statut}/></p></div><Badge variant="secondary">{STATUTS.find(s => s.value === p.statut)?.label || p.statut}</Badge></CardHeader>
          <CardContent className="space-y-2 text-sm"><p className="truncate">{p.email || "Aucun email renseigné"}</p><p>Offre : {p.offre_code || p.formule_code || "À définir"}</p><p>Superficie souhaitée : {p.superficie_souhaitee_ha ?? "—"} ha</p><p className="text-xs text-muted-foreground">Référence lead : {p.lead_id}</p>
            <Button className="w-full" variant="outline" onClick={() => setEditing({...p})}><Pencil className="mr-2 h-4 w-4"/>Ouvrir le formulaire Prospect</Button>
            {p.client_id ? <Badge className="w-full justify-center">Client lié : {p.client_id.slice(0,8)}</Badge> : <Button className="w-full" onClick={() => void convertToClient(p)}><UserRoundCheck className="mr-2 h-4 w-4"/>{p._legacyLead ? "Créer le dossier Prospect" : "Convertir en Client"}</Button>}
          </CardContent></Card>)}</div>}
      <div className="text-xs text-muted-foreground">{visible.length} prospect(s) affiché(s) · Base de données en direct</div>
    </div>
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Formulaire Prospect</DialogTitle></DialogHeader>
        {editing && <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Nom *</Label><Input value={editing.nom} onChange={e => updateField("nom",e.target.value)}/></div>
          <div className="space-y-1"><Label>Prénoms *</Label><Input value={editing.prenoms} onChange={e => updateField("prenoms",e.target.value)}/></div>
          <div className="space-y-1"><Label>Téléphone *</Label><Input value={editing.telephone} onChange={e => updateField("telephone",e.target.value)}/></div>
          <div className="space-y-1"><Label>WhatsApp</Label><Input value={editing.whatsapp || ""} onChange={e => updateField("whatsapp",e.target.value)}/></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={editing.email || ""} onChange={e => updateField("email",e.target.value)}/></div>
          <div className="space-y-1"><Label>Type de prospect</Label><Select value={editing.type_lead} onValueChange={v => updateField("type_lead",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="client">Client plantation</SelectItem><SelectItem value="proprietaire_foncier">Propriétaire foncier</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Code offre</Label><Input value={editing.offre_code || ""} onChange={e => updateField("offre_code",e.target.value)}/></div>
          <div className="space-y-1"><Label>Code formule</Label><Input value={editing.formule_code || ""} onChange={e => updateField("formule_code",e.target.value)}/></div>
          <div className="space-y-1"><Label>Superficie souhaitée (ha)</Label><Input type="number" min="0" value={editing.superficie_souhaitee_ha ?? ""} onChange={e => updateField("superficie_souhaitee_ha",e.target.value)}/></div>
          <div className="space-y-1"><Label>Délai de démarrage</Label><Select value={editing.delai_demarrage || "non_defini"} onValueChange={v => updateField("delai_demarrage",v === "non_defini" ? "" : v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="non_defini">Non défini</SelectItem><SelectItem value="immediat">Immédiat</SelectItem><SelectItem value="3_mois">3 mois</SelectItem><SelectItem value="6_mois">6 mois</SelectItem><SelectItem value="12_mois">12 mois</SelectItem><SelectItem value="plus_tard">Plus tard</SelectItem></SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-2"><Label>Statut du prospect</Label><Select value={editing.statut} onValueChange={v => updateField("statut",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUTS.map(s=><SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 sm:col-span-2"><Label>Notes et prochaines étapes</Label><Textarea value={editing.commentaire || ""} onChange={e => updateField("commentaire",e.target.value)} rows={4}/></div>
          <div className="sm:col-span-2 text-xs text-muted-foreground">Identifiant Prospect : {editing.id} · Lead d’origine : {editing.lead_id}</div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Annuler</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le prospect"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </MainLayout>;
}
