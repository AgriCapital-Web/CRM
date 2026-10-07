import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { offlineInsert, offlineUpdate } from "@/lib/offlineWrite";
import { getCachedItems, STORES } from "@/lib/offlineDb";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Target, TrendingUp, Users, MapPin, PhoneCall, ArrowRight, Copy, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSafeErrorMessage } from "@/lib/safeError";
import GeographieCascade from "@/components/common/GeographieCascade";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import CommercialCombobox from "@/components/common/CommercialCombobox";
import { COMMERCIAL_ASSIGNABLE_ROLES } from "@/lib/roles";
import { formatUserShortName } from "@/lib/utils";


const STATUTS = [
  { v: "nouveau", l: "Nouveau", color: "bg-blue-100 text-blue-800" },
  { v: "contacte", l: "Contacté", color: "bg-cyan-100 text-cyan-800" },
  { v: "qualifie", l: "Qualifié", color: "bg-indigo-100 text-indigo-800" },
  { v: "en_discussion", l: "En discussion", color: "bg-purple-100 text-purple-800" },
  { v: "preparation_dossier", l: "Prépa dossier", color: "bg-amber-100 text-amber-800" },
  { v: "pret_souscrire", l: "Prêt à souscrire", color: "bg-orange-100 text-orange-800" },
  { v: "converti", l: "Converti", color: "bg-green-100 text-green-800" },
  { v: "abandonne", l: "Abandonné", color: "bg-gray-100 text-gray-800" },
];

const CANAUX = [{ v: "appel", l: "Appel" }, { v: "whatsapp", l: "WhatsApp" }, { v: "physique", l: "Physique" }, { v: "email", l: "Email" }];
const RESULTATS = [
  { v: "non_joignable", l: "Non joignable" }, { v: "rappel_demande", l: "Rappel demandé" },
  { v: "interesse", l: "Intéressé" }, { v: "tres_interesse", l: "Très intéressé" },
  { v: "en_reflexion", l: "En réflexion" }, { v: "non_interesse", l: "Non intéressé" },
];

export default function Leads() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user, userRoles } = useAuth();
  const { byCategory: refs } = useSystemReferences(["oui_non","lead_delai","lead_disponibilite","lead_source","public_lead_delai"]);
  const canSupervise = (userRoles || []).some((r: string) =>
    ["pdg", "dg", "responsable_operations", "responsable_commercial",
     "chef_equipe_commercial", "service_client", "chef_equipe_service_client"].includes(r));
  const isServiceClient = (userRoles || []).some((r: string) => ["service_client", "chef_equipe_service_client"].includes(r));
  const hasCommercialAccess = (userRoles || []).some((r: string) => COMMERCIAL_ASSIGNABLE_ROLES.includes(r));
  const [selected, setSelected] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const emptyLead = {
    nom: "", prenoms: "", telephone: "", telephone_indicatif: "", telephone_local: "", whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village_id: "", region_residence: "",
    dispose_terrain: "non", superficie_disponible_ha: "", superficie_a_valoriser_ha: "", superficie_souhaitee_ha: "",
    delai_demarrage: "", date_contact_souhaitee: "", creneau_prefere: "", mode_contact_prefere: "appel",
    statut: "nouveau", source: "commercial_terrain", assigned_to: "", commentaire: "",
  };
  const [leadForm, setLeadForm] = useState<Record<string, string>>({ ...emptyLead, assigned_to: "" });

  useEffect(() => {
    const hasOwnCommercialRole = (userRoles || []).some((r: string) =>
      COMMERCIAL_ASSIGNABLE_ROLES.includes(r as any)
    );
    if (!hasOwnCommercialRole || !user?.id || leadForm.assigned_to) return;

    let active = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_default_commercial_for_client", {
          _current_user: user.id,
        });
        if (!error && data && active) {
          setLeadForm((x) => x.assigned_to ? x : { ...x, assigned_to: data });
          return;
        }
      } catch {
        // Fallback local : le commercial connecté reste le responsable par défaut.
      }
      if (active) {
        setLeadForm((x) => x.assigned_to ? x : { ...x, assigned_to: user.id });
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, userRoles, leadForm.assigned_to]);
  const [relanceOpen, setRelanceOpen] = useState(false);
  const [relance, setRelance] = useState<any>({ canal: "appel", resultat: "interesse", commentaire: "", prochaine_relance: "" });
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [reassignMotif, setReassignMotif] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const tablePageSize = useResponsivePageSize();

  useEffect(() => {
    if (searchParams.get("new") === "1") setCreateOpen(true);
  }, [searchParams]);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await getCachedItems(STORES.LEADS);
        return cached.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      const { data, error } = await (supabase as any).from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: relances = [] } = useQuery({
    queryKey: ["lead_relances", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await getCachedItems(STORES.LEAD_RELANCES);
        return cached.filter((r: any) => r.lead_id === selected.id);
      }
      const { data } = await (supabase as any).from("lead_relances").select("*").eq("lead_id", selected.id).order("date_relance", { ascending: false });
      return data || [];
    },
  });

  // Traçabilité complète du lead (création, modifications, conversion, réaffectations)
  const { data: historique = [] } = useQuery({
    queryKey: ["lead_historique", selected?.id],
    enabled: !!selected?.id && navigator.onLine,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lead_historique").select("*").eq("lead_id", selected.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Annuaire des acteurs (auteur / affectation / historique)
  const { data: acteurs = [] } = useQuery({
    queryKey: ["profiles_acteurs"],
    enabled: navigator.onLine,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profils_annuaire").select("id,user_id,nom_complet").eq("actif", true);
      return data || [];
    },
  });
  const nameOf = (id?: string | null) => {
    if (!id) return "—";
    const raw = acteurs.find((a: any) => a.user_id === id || a.id === id)?.nom_complet;
    return raw ? formatUserShortName(raw) : String(id).slice(0, 8) + "…";
  };

  const reassign = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("reassign_lead", {
        _lead_id: selected.id, _new_owner: reassignTo, _motif: reassignMotif || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_historique", selected?.id] });
      setReassignOpen(false); setReassignTo(""); setReassignMotif("");
      toast({ title: "Prospect réaffecté" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Réaffectation refusée", description: getSafeErrorMessage(e) }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, statut }: any) => {
       const lead = leads.find((item: any) => item.id === id);
       const isOwner = lead?.assigned_to === user?.id || lead?.created_by === user?.id;
       if (!isOwner && !canSupervise) throw new Error("Vous ne pouvez modifier que vos propres prospects.");
       const { error } = await offlineUpdate("leads", id, { statut });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast({ title: "Statut mis à jour" }); },
  });

  const createLead = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié");
      if (leadForm.source === "commercial_terrain" && (canSupervise || isServiceClient) && !leadForm.assigned_to) {
        throw new Error("Sélectionnez le commercial responsable de ce lead.");
      }
      const num = (v: string) => (v === "" || v == null ? null : Number(v));
      const { error } = await offlineInsert("leads", {
        nom: leadForm.nom,
        prenoms: leadForm.prenoms,
        telephone: leadForm.telephone,
        whatsapp: leadForm.whatsapp || null,
        email: leadForm.email || null,
        district_id: leadForm.district_id || null, region_id: leadForm.region_id || null, departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null, village_id: leadForm.village_id || null, region_residence: leadForm.region_residence,
        dispose_terrain: leadForm.dispose_terrain === "oui",
        superficie_disponible_ha: leadForm.dispose_terrain === "oui" ? num(leadForm.superficie_disponible_ha) : null,
        superficie_a_valoriser_ha: leadForm.dispose_terrain === "oui" ? num(leadForm.superficie_a_valoriser_ha) : null,
        superficie_souhaitee_ha: num(leadForm.superficie_souhaitee_ha),
        delai_demarrage: leadForm.delai_demarrage || null,
        date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
        creneau_prefere: leadForm.creneau_prefere || null,
        mode_contact_prefere: leadForm.mode_contact_prefere || null,
        commentaire: leadForm.commentaire || null,
        statut: leadForm.statut || "nouveau",
        source: leadForm.source || "commercial_terrain",
        created_by: user.id,
        assigned_to: (leadForm.source === "commercial_terrain" && (canSupervise || isServiceClient))
        ? (leadForm.assigned_to || null)
        : user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setLeadForm({ ...emptyLead, assigned_to: hasCommercialAccess ? (user?.id || "") : "" });
      setCreateOpen(false);
      toast({ title: navigator.onLine ? "Lead créé" : "Lead enregistré hors ligne" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Création impossible", description: getSafeErrorMessage(e) }),
  });

  const addRelance = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await offlineInsert("lead_relances", {
        lead_id: selected.id,
        commercial_id: selected.assigned_to || null,
        ...relance,
        prochaine_relance: relance.prochaine_relance || null,
      });
      if (error) throw error;
      if (relance.prochaine_relance) {
        await offlineUpdate("leads", selected.id, { prochaine_relance_at: relance.prochaine_relance });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_relances", selected?.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      setRelanceOpen(false);
      setRelance({ canal: "appel", resultat: "interesse", commentaire: "", prochaine_relance: "" });
      toast({ title: "Relance enregistrée" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) }),
  });

  const convertToClient = (lead: any) => {
    const isOwner = lead.assigned_to === user?.id || lead.created_by === user?.id;
    if (!isOwner && !canSupervise) {
      toast({ variant: "destructive", title: "Conversion refusée", description: "Ce prospect appartient à un autre commercial." });
      return;
    }
    // Pré-remplir acquisition via query params
    const params = new URLSearchParams({
      lead_id: lead.id,
      commercial_id: lead.assigned_to || "",
      nom: lead.nom || "",
      prenoms: lead.prenoms || "",
      telephone: lead.telephone || "",
      whatsapp: lead.whatsapp || "",
      email: lead.email || "",
      region: lead.region_residence || "",
    });
    navigate(`/nouvelle-acquisition?${params.toString()}`);
  };

  const publicUrl = `${window.location.origin}/leads/public`;

  const filteredLeads = leads.filter((l: any) => JSON.stringify(l).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const paginatedLeads = filteredLeads.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);
  useEffect(() => { setTablePage(1); }, [tableSearch, tablePageSize]);

  const stats = {
    total: leads.length,
    nouveaux: leads.filter((l: any) => l.statut === "nouveau").length,
    aRelancer: leads.filter((l: any) => l.prochaine_relance_at && new Date(l.prochaine_relance_at) <= new Date()).length,
    convertis: leads.filter((l: any) => l.statut === "converti").length,
    superficie: leads.reduce((s: number, l: any) => s + (Number(l.superficie_disponible_ha || l.superficie_souhaitee_ha) || 0), 0),
  };
  const tauxConversion = stats.total ? Math.round((stats.convertis / stats.total) * 100) : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6 text-primary" />Prospects / Leads</h1>
            <p className="text-muted-foreground text-sm">Suivi commercial jusqu'à la conversion en client.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Créer un lead</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: "Lien copié", description: publicUrl }); }}>
              <Copy className="h-4 w-4 mr-2" />Lien public
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { l: "Total", v: stats.total, i: Users },
            { l: "Nouveaux", v: stats.nouveaux, i: Target },
            { l: "À relancer", v: stats.aRelancer, i: PhoneCall },
            { l: "Convertis", v: stats.convertis, i: TrendingUp },
            { l: "Taux conv.", v: `${tauxConversion}%`, i: TrendingUp },
          ].map((s, i) => (
            <Card key={i}><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground">{s.l}</p><p className="text-xl font-bold">{s.v}</p></div>
                <s.i className="h-5 w-5 text-primary/60" />
              </div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Pipeline commercial</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un lead…" /></div></CardHeader>
          <CardContent>
            <Table className="responsive-data-table">
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>Nom</TableHead><TableHead>Contact</TableHead>
                <TableHead>Région</TableHead><TableHead>Statut</TableHead><TableHead>Relance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredLeads.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Aucun prospect enregistré.</TableCell></TableRow>}
                {paginatedLeads.map((l: any) => {
                  const st = STATUTS.find(s => s.v === l.statut);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.id_unique}</TableCell>
                      <TableCell><div className="font-medium">{l.nom} {l.prenoms}</div></TableCell>
                      <TableCell className="text-sm">{l.telephone}<br/><span className="text-xs text-muted-foreground">{l.email || "—"}</span></TableCell>
                      <TableCell className="text-sm">{l.region_residence}</TableCell>
                      <TableCell>
                        <Select value={l.statut} onValueChange={v => updateStatus.mutate({ id: l.id, statut: v })}>
                          <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUTS.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm">{l.prochaine_relance_at ? format(new Date(l.prochaine_relance_at), "dd MMM", { locale: fr }) : "—"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setSelected(l)}>Détails</Button>
                        {l.statut !== "converti" && (
                          <Button size="sm" onClick={() => convertToClient(l)}><ArrowRight className="h-3 w-3 mr-1" />Convertir</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ResponsiveTablePagination page={tablePage} pageSize={tablePageSize} total={filteredLeads.length} onPageChange={setTablePage} />
          </CardContent>
        </Card>

        <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            {selected && (
              <>
                <DialogHeader><DialogTitle>{selected.nom} {selected.prenoms} — {selected.id_unique}</DialogTitle></DialogHeader>
                <Tabs defaultValue="info">
                  <TabsList>
                    <TabsTrigger value="info">Informations</TabsTrigger>
                    <TabsTrigger value="relances">Relances ({relances.length})</TabsTrigger>
                    <TabsTrigger value="historique">Historique ({historique.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="info" className="space-y-2 text-sm">
                    <p><b>Téléphone:</b> {selected.telephone} • <b>WhatsApp:</b> {selected.whatsapp || "—"}</p>
                    <p><b>Email:</b> {selected.email || "—"}</p>
                    <p><b>Région:</b> {selected.region_residence || "—"}</p>
                    <p><b>Terrain:</b> {selected.dispose_terrain ? `Oui — ${selected.superficie_disponible_ha || 0} ha dispo, ${selected.superficie_a_valoriser_ha || 0} ha à valoriser` : `Non — souhaite ${selected.superficie_souhaitee_ha || 0} ha`}</p>
                    <p><b>Délai:</b> {selected.delai_demarrage || "—"} • <b>Créneau:</b> {selected.creneau_prefere || "—"} • <b>Mode:</b> {selected.mode_contact_prefere}</p>
                    <p><b>Source:</b> {selected.source}</p>
                    <p><b>Message:</b> {selected.commentaire || "—"}</p>
                    <p><b>Créé par:</b> {nameOf(selected.created_by)} • <b>Commercial affecté:</b> {nameOf(selected.assigned_to)}</p>
                    {canSupervise && (
                      <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>Réaffecter à un commercial</Button>
                    )}
                  </TabsContent>
                  <TabsContent value="relances" className="space-y-3">
                    <Button size="sm" onClick={() => setRelanceOpen(true)}>+ Nouvelle relance</Button>
                    {relances.map((r: any) => (
                      <Card key={r.id}><CardContent className="p-3 text-sm">
                        <div className="flex justify-between"><b>{CANAUX.find(c=>c.v===r.canal)?.l}</b><span className="text-xs text-muted-foreground">{format(new Date(r.date_relance),"dd/MM HH:mm",{locale:fr})}</span></div>
                        <Badge className="mt-1">{RESULTATS.find(x=>x.v===r.resultat)?.l}</Badge>
                        <p className="mt-2">{r.commentaire}</p>
                        {r.prochaine_relance && <p className="text-xs text-muted-foreground mt-1">Prochaine: {format(new Date(r.prochaine_relance),"dd/MM/yyyy")}</p>}
                      </CardContent></Card>
                    ))}
                  </TabsContent>
                  <TabsContent value="historique" className="space-y-2">
                    {historique.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement enregistré.</p>}
                    {historique.map((h: any) => (
                      <Card key={h.id}><CardContent className="p-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <Badge variant="outline">{h.action}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}</span>
                        </div>
                        <p className="mt-1"><b>Par:</b> {nameOf(h.acteur_id)}</p>
                        {h.champ && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {h.champ} : {h.champ === "assigned_to" ? nameOf(h.ancienne_valeur) : (h.ancienne_valeur || "—")}
                            {" → "}
                            {h.champ === "assigned_to" ? nameOf(h.nouvelle_valeur) : (h.nouvelle_valeur || "—")}
                          </p>
                        )}
                        {h.commentaire && <p className="text-xs mt-1">{h.commentaire}</p>}
                      </CardContent></Card>
                    ))}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Réaffecter le prospect</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nouveau commercial</Label>
                <CommercialCombobox
                  value={reassignTo || null}
                  onChange={(value) => setReassignTo(value || "")}
                  placeholder="Sélectionner un commercial de votre périmètre"
                />
              </div>
              <div><Label>Motif</Label><Textarea value={reassignMotif} onChange={(e) => setReassignMotif(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => reassign.mutate()} disabled={!reassignTo || reassign.isPending}>Réaffecter</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Créer un lead</DialogTitle></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Nom *</Label><Input value={leadForm.nom} onChange={(e) => setLeadForm({ ...leadForm, nom: e.target.value })} /></div>
              <div><Label>Prénom(s) *</Label><Input value={leadForm.prenoms} onChange={(e) => setLeadForm({ ...leadForm, prenoms: e.target.value })} /></div>
              <CountryPhoneInput label="Téléphone" required countryCode={leadForm.telephone_indicatif||undefined} localValue={leadForm.telephone_local||""} onChange={v=>setLeadForm(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/>
              <CountryPhoneInput label="WhatsApp" countryCode={leadForm.whatsapp_indicatif||undefined} localValue={leadForm.whatsapp_local||""} onChange={v=>setLeadForm(x=>({...x,whatsapp_indicatif:v.callingCode,whatsapp_local:v.localValue,whatsapp:v.internationalValue}))}/>
              <div><Label>Email</Label><Input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <GeographieCascade
                  districtId={leadForm.district_id}
                  regionId={leadForm.region_id}
                  departementId={leadForm.departement_id}
                  sousPrefectureId={leadForm.sous_prefecture_id}
                  villageId={leadForm.village_id}
                  required
                  onChange={(g)=>setLeadForm(x=>({...x,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||"",region_residence:g.regionName||""}))}
                />
              </div>
              <div>
                <Label>Diaspora ?</Label>
                <Select value={leadForm.est_diaspora} onValueChange={(v) => setLeadForm({ ...leadForm, est_diaspora: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{refs("oui_non").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {leadForm.est_diaspora === "oui" && (
                <div><Label>Pays de résidence</Label><Input value={leadForm.pays_diaspora} onChange={(e) => setLeadForm({ ...leadForm, pays_diaspora: e.target.value })} /></div>
              )}
              <div>
                <Label>Dispose d'un terrain ?</Label>
                <Select value={leadForm.dispose_terrain} onValueChange={(v) => setLeadForm({ ...leadForm, dispose_terrain: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{refs("oui_non").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {leadForm.dispose_terrain === "oui" ? (
                <>
                  <div><Label>Superficie disponible (ha)</Label><Input type="number" min="0" step="0.01" value={leadForm.superficie_disponible_ha} onChange={(e) => setLeadForm({ ...leadForm, superficie_disponible_ha: e.target.value })} /></div>
                  <div><Label>Superficie à valoriser (ha)</Label><Input type="number" min="0" step="0.01" value={leadForm.superficie_a_valoriser_ha} onChange={(e) => setLeadForm({ ...leadForm, superficie_a_valoriser_ha: e.target.value })} /></div>
                </>
              ) : (
                <div><Label>Superficie souhaitée (ha)</Label><Input type="number" min="0" step="0.01" value={leadForm.superficie_souhaitee_ha} onChange={(e) => setLeadForm({ ...leadForm, superficie_souhaitee_ha: e.target.value })} /></div>
              )}
              <div>
                <Label>Délai de démarrage</Label>
                <Select value={leadForm.delai_demarrage} onValueChange={(v) => setLeadForm({ ...leadForm, delai_demarrage: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {refs("lead_delai").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date de contact souhaitée</Label><Input type="date" value={leadForm.date_contact_souhaitee} onChange={(e) => setLeadForm({ ...leadForm, date_contact_souhaitee: e.target.value })} /></div>
              <div>
                <Label>Créneau préféré</Label>
                <Select value={leadForm.creneau_prefere} onValueChange={(v) => setLeadForm({ ...leadForm, creneau_prefere: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {refs("lead_disponibilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mode de contact préféré</Label>
                <Select value={leadForm.mode_contact_prefere} onValueChange={(v) => setLeadForm({ ...leadForm, mode_contact_prefere: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CANAUX.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Statut initial</Label>
                <Select value={leadForm.statut} onValueChange={(v) => setLeadForm({ ...leadForm, statut: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUTS.filter(s => s.v !== "converti").map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={leadForm.source} onValueChange={(v) => setLeadForm({ ...leadForm, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {refs("lead_source").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(canSupervise || isServiceClient || hasCommercialAccess) && leadForm.source === "commercial_terrain" && (
                <div className="sm:col-span-2">
                  <Label>Commercial responsable *</Label>
                  <CommercialCombobox
                    value={leadForm.assigned_to || null}
                    onChange={(v) => setLeadForm((x) => ({ ...x, assigned_to: v || "" }))}
                    placeholder={hasCommercialAccess && user?.id ? "Moi-même par défaut — choisir un autre commercial" : "Rechercher ou sélectionner un commercial"}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isServiceClient
                      ? "Le Service Client peut attribuer le lead à un commercial terrain."
                      : "Sélectionnez le commercial terrain responsable du lead."}
                  </p>
                </div>
              )}
              <div className="sm:col-span-2"><Label>Note / Commentaire</Label><Textarea value={leadForm.commentaire} onChange={(e) => setLeadForm({ ...leadForm, commentaire: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button
                onClick={() => createLead.mutate()}
                disabled={createLead.isPending || !leadForm.nom.trim() || !leadForm.prenoms.trim() || !leadForm.telephone.trim() || !leadForm.district_id.trim()}
              >{createLead.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouvelle relance</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Canal</Label><Select value={relance.canal} onValueChange={v=>setRelance({...relance,canal:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CANAUX.map(c=><SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Résultat</Label><Select value={relance.resultat} onValueChange={v=>setRelance({...relance,resultat:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RESULTATS.map(r=><SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Commentaire</Label><Textarea value={relance.commentaire} onChange={e=>setRelance({...relance,commentaire:e.target.value})} /></div>
              <div><Label>Prochaine relance</Label><Input type="date" value={relance.prochaine_relance} onChange={e=>setRelance({...relance,prochaine_relance:e.target.value})} /></div>
            </div>
            <DialogFooter><Button onClick={()=>addRelance.mutate()} disabled={addRelance.isPending}>Enregistrer</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}