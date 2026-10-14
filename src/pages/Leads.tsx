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
import { Target, TrendingUp, Users, MapPin, PhoneCall, ArrowRight, Copy, Plus, Phone, Mail, MessageCircle, Contact } from "lucide-react";
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
  { v: "interesse", l: "Intéressé", color: "bg-teal-100 text-teal-800" },
  { v: "tres_interesse", l: "Très intéressé", color: "bg-emerald-100 text-emerald-800" },
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

export default function Leads({ view = "leads" }: { view?: "leads" | "prospects" }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user, userRoles } = useAuth();
  const { byCategory: refs } = useSystemReferences(["oui_non","lead_delai","lead_disponibilite","lead_source","public_lead_delai"]);
  const isGlobalAdmin = (userRoles || []).some((r: string) => ["pdg", "dg", "admin", "super_admin"].includes(r));
  const isFoncierRole = (userRoles || []).some((r: string) => ["mobilisateur_foncier", "superviseur_mobilisation_fonciere"].includes(r));
  const canSupervise = isGlobalAdmin || (userRoles || []).some((r: string) =>
    ["responsable_operations", "responsable_commercial",
     "chef_equipe_commercial", "service_client", "chef_equipe_service_client"].includes(r));
  const isServiceClient = (userRoles || []).some((r: string) => ["service_client", "chef_equipe_service_client"].includes(r));
  const hasCommercialAccess = (userRoles || []).some((r: string) => COMMERCIAL_ASSIGNABLE_ROLES.includes(r));
  const [offers, setOffers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<any>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactLead, setContactLead] = useState<any>(null);
  const [contactChannel, setContactChannel] = useState("whatsapp");
  const [contactMessage, setContactMessage] = useState("");
  const [editingLead, setEditingLead] = useState<any>(null);
  const emptyLead = {
    nom: "", prenoms: "", telephone: "", telephone_indicatif: "", telephone_local: "", whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village_id: "", region_residence: "", campement_quartier: "",
    type_lead: "client", civilite: "", etape_pipeline: view === "prospects" ? "prospect" : "lead", offre_code: "", formule_code: "",
    dispose_terrain: "non", superficie_disponible_ha: "", superficie_a_valoriser_ha: "", superficie_souhaitee_ha: "",
    delai_demarrage: "", date_contact_souhaitee: "", creneau_prefere: "", mode_contact_prefere: "appel",
    statut: view === "prospects" ? "qualifie" : "nouveau", source: "commercial_terrain", assigned_to: "", commentaire: "",
  };
  const [leadForm, setLeadForm] = useState<Record<string, string>>({ ...emptyLead, assigned_to: "" });

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).from("offres")
        .select("id,code,nom,famille_offre,formule_code,formule_nom,formules_configuration").eq("actif", true).order("nom");
      if (active) setOffers(error ? [] : (data || []).filter((o: any) => typeof o.code === "string" && o.code.trim() && typeof o.nom === "string" && o.nom.trim()));
    })();
    return () => { active = false; };
  }, []);

  const selectedLeadOffer = offers.find((o) => o.code && o.code === leadForm.offre_code);
  const selectedLeadFormulas = (() => {
    const configured = Array.isArray(selectedLeadOffer?.formules_configuration)
      ? selectedLeadOffer.formules_configuration.filter((f: any) => typeof f?.code === "string" && f.code.trim() && typeof f?.nom === "string" && f.nom.trim())
      : [];
    if (configured.length) return configured;
    if (selectedLeadOffer?.code) return [{ code: selectedLeadOffer.formule_code || selectedLeadOffer.code, nom: selectedLeadOffer.formule_nom || selectedLeadOffer.nom }];
    return [];
  })();

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
       if (!isOwner && !isGlobalAdmin) throw new Error("Vous ne pouvez modifier que vos propres prospects.");
       const { error } = await offlineUpdate("leads", id, { statut });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast({ title: "Statut mis à jour" }); },
  });

  const createLead = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié");
      if (editingLead) {
        const isOwner = editingLead.assigned_to === user.id || editingLead.created_by === user.id;
        if (!isOwner && !isGlobalAdmin && !canSupervise) throw new Error("Vous ne pouvez modifier que vos propres prospects.");
        const num = (v: string) => (v === "" || v == null ? null : Number(v));
        const { error } = await offlineUpdate("leads", editingLead.id, {
          nom: leadForm.nom, prenoms: leadForm.prenoms, civilite: leadForm.civilite || null, telephone: leadForm.telephone,
          whatsapp: leadForm.whatsapp || null, email: leadForm.email || null,
          district_id: leadForm.district_id || null, region_id: leadForm.region_id || null,
          departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null,
          village_id: leadForm.village_id || null, region_residence: leadForm.region_residence,
          dispose_terrain: leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui",
          superficie_disponible_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_disponible_ha) : null,
          superficie_a_valoriser_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_a_valoriser_ha) : null,
          superficie_souhaitee_ha: leadForm.type_lead === "client" && leadForm.dispose_terrain !== "oui" ? num(leadForm.superficie_souhaitee_ha) : null,
          delai_demarrage: leadForm.delai_demarrage || null,
          date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
          creneau_prefere: leadForm.creneau_prefere || null,
          mode_contact_prefere: leadForm.mode_contact_prefere || null,
          commentaire: leadForm.commentaire || null, statut: leadForm.statut,
          etape_pipeline: view === "prospects" ? "prospect" : (editingLead.etape_pipeline || "lead"),
          type_lead: leadForm.type_lead || "client",
          offre_code: leadForm.type_lead === "client" ? (leadForm.offre_code || null) : null,
          formule_code: leadForm.type_lead === "client" ? (leadForm.formule_code || null) : null,
          source: leadForm.source || editingLead.source,
          assigned_to: (isGlobalAdmin || canSupervise) && leadForm.assigned_to ? leadForm.assigned_to : editingLead.assigned_to,
        });
        if (error) throw error;
        return;
      }
      if (leadForm.source === "commercial_terrain" && (canSupervise || isServiceClient) && !leadForm.assigned_to) {
        throw new Error("Sélectionnez le commercial responsable de ce lead.");
      }
      const num = (v: string) => (v === "" || v == null ? null : Number(v));
      const { error } = await offlineInsert("leads", {
        nom: leadForm.nom,
        prenoms: leadForm.prenoms,
        civilite: leadForm.civilite || null,
        telephone: leadForm.telephone,
        whatsapp: leadForm.whatsapp || null,
        email: leadForm.email || null,
        district_id: leadForm.district_id || null, region_id: leadForm.region_id || null, departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null, village_id: leadForm.village_id || null, region_residence: leadForm.region_residence, campement_quartier: leadForm.campement_quartier.trim() || null,
        dispose_terrain: leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui",
        superficie_disponible_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_disponible_ha) : null,
        superficie_a_valoriser_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_a_valoriser_ha) : null,
        superficie_souhaitee_ha: leadForm.type_lead === "client" && leadForm.dispose_terrain !== "oui" ? num(leadForm.superficie_souhaitee_ha) : null,
        delai_demarrage: leadForm.delai_demarrage || null,
        date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
        creneau_prefere: leadForm.creneau_prefere || null,
        mode_contact_prefere: leadForm.mode_contact_prefere || null,
        commentaire: leadForm.commentaire || null,
        type_lead: leadForm.type_lead || "client",
        offre_code: leadForm.type_lead === "client" ? (leadForm.offre_code || null) : null,
        formule_code: leadForm.type_lead === "client" ? (leadForm.formule_code || null) : null,
        statut: view === "prospects" ? (leadForm.statut || "qualifie") : (leadForm.statut || "nouveau"),
        etape_pipeline: view === "prospects" ? "prospect" : "lead",
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
      setEditingLead(null);
      toast({ title: editingLead ? "Lead modifié" : (navigator.onLine ? "Lead créé" : "Lead enregistré hors ligne") });
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

  const convertToProspect = async (lead: any) => {
    const isOwner = lead.assigned_to === user?.id || lead.created_by === user?.id;
    if (!isOwner && !canSupervise) { toast({ variant: "destructive", title: "Conversion refusée", description: "Ce lead appartient à un autre commercial." }); return; }
    try {
      const { error } = await offlineUpdate("leads", lead.id, { etape_pipeline: "prospect", statut: "qualifie" });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["leads"] });
      setConvertOpen(false); setConvertLead(null);
      toast({ title: "Lead converti en prospect", description: "Le dossier complet peut maintenant être enrichi dans Prospects." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Conversion impossible", description: getSafeErrorMessage(e) });
    }
  };

  const startContact = (lead: any) => {
    setContactLead(lead); setContactChannel("whatsapp");
    const fullName = [lead.prenoms, lead.nom].filter(Boolean).join(" ").trim();
    const greeting = lead.civilite === "madame" ? "Bonjour Madame" : lead.civilite === "monsieur" ? "Bonjour Monsieur" : "Bonjour";
    const message = lead.type_lead === "proprietaire_foncier"
      ? `${greeting} ${fullName}, AgriCapital revient vers vous au sujet de la valorisation de votre terrain pour un projet de palmier à huile. Souhaitez-vous être recontacté(e) ? Répondez OUI.`
      : `${greeting} ${fullName}, êtes-vous toujours intéressé(e) par un projet de plantation de palmier à huile avec AgriCapital ? Répondez OUI pour être recontacté(e).`;
    setContactMessage(message.slice(0, 200)); setContactOpen(true);
  };

  const sendContact = () => {
    if (!contactLead) return;
    const phone = String(contactLead.whatsapp || contactLead.telephone || "").replace(/[^0-9]/g, "");
    if (contactChannel === "appel") {
      if (!phone) { toast({ variant: "destructive", title: "Numéro manquant", description: "Ajoutez un numéro avant de lancer l’appel." }); return; }
      window.location.href = `tel:${phone}`; setContactOpen(false); return;
    }
    if (contactChannel === "whatsapp") {
      if (!phone) { toast({ variant: "destructive", title: "Numéro manquant", description: "Ajoutez un numéro avant d’ouvrir WhatsApp." }); return; }
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(contactMessage.slice(0, 200))}`, "_blank", "noopener,noreferrer");
      setContactOpen(false); return;
    }
    if (!contactLead.email) { toast({ variant: "destructive", title: "Adresse email manquante", description: "Ajoutez une adresse email pour préparer le message." }); return; }
    window.location.href = `mailto:${encodeURIComponent(contactLead.email)}?subject=${encodeURIComponent("Suivi de votre projet de plantation de palmier à huile")}&body=${encodeURIComponent(contactMessage.slice(0, 200))}`;
    setContactOpen(false);
  };

  const convertToClient = (lead: any) => {
    const isOwner = lead.assigned_to === user?.id || lead.created_by === user?.id;
    if (!isOwner && !canSupervise) {
      toast({ variant: "destructive", title: "Conversion refusée", description: "Ce prospect appartient à un autre commercial." });
      return;
    }
    const params = new URLSearchParams({
      lead_id: lead.id, commercial_id: lead.assigned_to || "", nom: lead.nom || "",
      prenoms: lead.prenoms || "", telephone: lead.telephone || "", whatsapp: lead.whatsapp || "",
      email: lead.email || "", district_id: lead.district_id || "", region_id: lead.region_id || "",
      departement_id: lead.departement_id || "", sous_prefecture_id: lead.sous_prefecture_id || "",
      village: lead.campement_quartier || "",
    });
    if (lead.type_lead === "proprietaire_foncier") {
      navigate("/proprietaires-terres?" + params.toString());
      return;
    }
    navigate("/nouvelle-acquisition?" + params.toString());
  };

  const publicUrl = `${window.location.origin}/leads/public`;

  const stageLeads = leads.filter((l: any) => view === "prospects" ? l.etape_pipeline === "prospect" : (l.etape_pipeline || (["qualifie", "interesse", "tres_interesse", "en_discussion", "preparation_dossier", "pret_souscrire"].includes(l.statut) ? "prospect" : l.statut === "converti" ? "converti" : "lead")) === "lead");
  const filteredLeads = stageLeads.filter((l: any) => JSON.stringify(l).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const paginatedLeads = filteredLeads.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);
  useEffect(() => { setTablePage(1); }, [tableSearch, tablePageSize]);

  const stats = {
    total: stageLeads.length,
    nouveaux: stageLeads.filter((l: any) => l.statut === "nouveau").length,
    aRelancer: stageLeads.filter((l: any) => l.prochaine_relance_at && new Date(l.prochaine_relance_at) <= new Date()).length,
    convertis: leads.filter((l: any) => l.etape_pipeline === "converti" || l.statut === "converti").length,
    superficie: stageLeads.reduce((s: number, l: any) => s + (Number(l.superficie_disponible_ha || l.superficie_souhaitee_ha) || 0), 0),
  };
  const tauxConversion = stats.total ? Math.round((stats.convertis / stats.total) * 100) : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6 text-primary" />{view === "prospects" ? "Prospects" : "Leads"}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setEditingLead(null); setLeadForm({ ...emptyLead, statut: view === "prospects" ? "qualifie" : "nouveau", etape_pipeline: view === "prospects" ? "prospect" : "lead", assigned_to: hasCommercialAccess ? (user?.id || "") : "" }); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" />{view === "prospects" ? "Nouveau prospect" : "Nouveau lead"}</Button>
            {view === "prospects" && <Button variant="outline" onClick={() => navigate("/leads?new=1")}><Plus className="h-4 w-4 mr-2" />Nouveau lead</Button>}
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
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{view === "prospects" ? "Suivi des prospects" : "Leads à contacter et qualifier"}</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder={view === "prospects" ? "Rechercher un prospect…" : "Rechercher un lead…"} /></div></CardHeader>
          <CardContent>
            <Table className="responsive-data-table">
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>Nom</TableHead><TableHead>Contact</TableHead>
                <TableHead>Région</TableHead><TableHead>Statut</TableHead><TableHead>Relance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredLeads.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Aucun {view === "prospects" ? "prospect" : "lead"} enregistré.</TableCell></TableRow>}
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
                          <SelectContent>{(view === "prospects" ? [{v:"qualifie",l:"Qualifié"},{v:"interesse",l:"Intéressé"},{v:"tres_interesse",l:"Très intéressé"},{v:"en_discussion",l:"En discussion"},{v:"preparation_dossier",l:"Préparation dossier"},{v:"pret_souscrire",l:"Prêt à souscrire"},{v:"abandonne",l:"Abandonné"}] : STATUTS.filter(s => ["nouveau","contacte","abandonne"].includes(s.v))).map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent></Select>
                      </TableCell>
                      <TableCell className="text-sm">{l.prochaine_relance_at ? format(new Date(l.prochaine_relance_at), "dd MMM", { locale: fr }) : "—"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setSelected(l)}>Détails</Button>
                        {((l.assigned_to === user?.id || l.created_by === user?.id) || isGlobalAdmin) && (
                          <Button size="sm" variant="secondary" onClick={() => {
                            setEditingLead(l);
                            setLeadForm({
                              ...emptyLead,
                              ...Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v == null ? "" : String(v)])),
                              dispose_terrain: l.dispose_terrain ? "oui" : "non",
                              assigned_to: l.assigned_to || "",
                              telephone_indicatif: "", telephone_local: l.telephone || "",
                              whatsapp_indicatif: "", whatsapp_local: l.whatsapp || "",
                            });
                            setCreateOpen(true);
                          }}>Modifier</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => startContact(l)}><Contact className="h-3 w-3 mr-1" />Contacter</Button>
                        {view === "leads" && l.statut !== "converti" && (l.type_lead === "proprietaire_foncier" ? (isFoncierRole || canSupervise) : !isFoncierRole) && (
                          <Button size="sm" onClick={() => { setConvertLead(l); setConvertOpen(true); }}><ArrowRight className="h-3 w-3 mr-1" />Convertir</Button>
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
                    <p><b>Type:</b> {selected.type_lead === "proprietaire_foncier" ? "Propriétaire foncier" : "Client"}</p>
                    {selected.type_lead === "client" && <p><b>Offre / formule:</b> {selected.offre_code || "—"} / {selected.formule_code || "—"}</p>}
                    <p><b>Terrain:</b> {selected.type_lead === "proprietaire_foncier" ? `${selected.superficie_disponible_ha || 0} ha disponibles, ${selected.superficie_a_valoriser_ha || 0} ha à valoriser` : selected.dispose_terrain ? `Oui — ${selected.superficie_disponible_ha || 0} ha disponibles, ${selected.superficie_a_valoriser_ha || 0} ha à valoriser` : `Non — souhaite ${selected.superficie_souhaitee_ha || 0} ha`}</p>
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

        <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Convertir le lead</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Choisissez la prochaine étape pour {convertLead ? [convertLead.prenoms, convertLead.nom].filter(Boolean).join(" ") : "ce contact"}.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="outline" className="h-auto justify-start p-4" onClick={() => convertLead && convertToProspect(convertLead)}><Users className="mr-2 h-4 w-4" /><span className="text-left"><span className="block font-semibold">Convertir en prospect</span><span className="block text-xs font-normal">Ouvrir la fiche commerciale complète</span></span></Button>
              <Button className="h-auto justify-start p-4" onClick={() => { if (convertLead) convertToClient(convertLead); setConvertOpen(false); }}><ArrowRight className="mr-2 h-4 w-4" /><span className="text-left"><span className="block font-semibold">Convertir en client</span><span className="block text-xs font-normal">Démarrer le dossier d’acquisition</span></span></Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={contactOpen} onOpenChange={setContactOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Contacter {contactLead ? [contactLead.prenoms, contactLead.nom].filter(Boolean).join(" ") : "le contact"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Canal de contact</Label><Select value={contactChannel} onValueChange={setContactChannel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="appel">Appel téléphonique</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></div>
              {(contactChannel === "whatsapp" || contactChannel === "email") && <div className="space-y-2"><Label>Message (200 caractères maximum)</Label><Textarea value={contactMessage} maxLength={200} onChange={e => setContactMessage(e.target.value.slice(0, 200))} rows={4} /><p className="text-right text-xs text-muted-foreground">{contactMessage.length}/200</p></div>}
              <p className="text-xs text-muted-foreground">{contactChannel === "appel" ? `Le téléphone s’ouvrira avec le numéro ${contactLead?.telephone || "non renseigné"}.` : contactChannel === "whatsapp" ? "WhatsApp s’ouvrira avec le numéro et le message prérempli. Il restera à confirmer l’envoi dans WhatsApp." : "Votre application de messagerie s’ouvrira avec le destinataire, l’objet et le message préremplis."}</p>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setContactOpen(false)}>Annuler</Button><Button onClick={sendContact}>{contactChannel === "appel" ? "Lancer l’appel" : contactChannel === "whatsapp" ? "Ouvrir WhatsApp" : "Préparer l’email"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingLead ? (view === "prospects" ? "Modifier le prospect" : "Modifier le lead") : (view === "prospects" ? "Nouveau prospect" : "Nouveau lead")}</DialogTitle></DialogHeader>
            {view === "prospects" ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <Label>Type de prospect *</Label>
                              <Select value={leadForm.type_lead} onValueChange={(v) => setLeadForm(x => ({ ...x, type_lead: v, offre_code: v === "client" ? x.offre_code : "", formule_code: v === "client" ? x.formule_code : "" }))}>
                                <SelectTrigger><SelectValue placeholder="Choisir le type de prospect" /></SelectTrigger>
                                <SelectContent><SelectItem value="client">Client</SelectItem><SelectItem value="proprietaire_foncier">Propriétaire foncier</SelectItem></SelectContent>
                              </Select>
                            </div>
                            {leadForm.type_lead === "client" && <>
                              <div><Label>Offre (si connue)</Label><Select value={leadForm.offre_code} onValueChange={(v) => { const offer = offers.find((o) => o.code === v); const forms = Array.isArray(offer?.formules_configuration) ? offer.formules_configuration.filter((f: any) => f?.code && f?.nom) : []; setLeadForm(x => ({ ...x, offre_code: v, formule_code: forms[0]?.code || offer?.formule_code || offer?.code || "" })); }}><SelectTrigger><SelectValue placeholder="Sélectionner une offre" /></SelectTrigger><SelectContent>{offers.filter((o) => Boolean(o.code && o.nom)).map((o) => <SelectItem key={o.id} value={o.code}>{o.nom}</SelectItem>)}</SelectContent></Select></div>
                              <div><Label>Formule (si connue)</Label><Select value={leadForm.formule_code} onValueChange={(v) => setLeadForm(x => ({ ...x, formule_code: v }))} disabled={!selectedLeadFormulas.length}><SelectTrigger><SelectValue placeholder="Sélectionner une formule" /></SelectTrigger><SelectContent>{selectedLeadFormulas.map((f: any) => <SelectItem key={f.code} value={f.code}>{f.nom}</SelectItem>)}</SelectContent></Select></div>
                            </>}
                            <div><Label>Nom *</Label><Input value={leadForm.nom} onChange={(e) => setLeadForm({ ...leadForm, nom: e.target.value.toLocaleUpperCase("fr-FR") })} /></div>
                            <div><Label>Prénom(s) *</Label><Input value={leadForm.prenoms} onChange={(e) => setLeadForm({ ...leadForm, prenoms: e.target.value.toLocaleUpperCase("fr-FR") })} /></div>
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
                            <div><Label>Lieu de résidence</Label><Input value={leadForm.campement_quartier} onChange={(e) => setLeadForm({ ...leadForm, campement_quartier: e.target.value })} placeholder="Lieu de résidence" /></div>
                            {leadForm.type_lead === "client" && <div>
                              <Label>Dispose d'un terrain ?</Label>
                              <Select value={leadForm.dispose_terrain} onValueChange={(v) => setLeadForm({ ...leadForm, dispose_terrain: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{refs("oui_non").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>}
                            {leadForm.type_lead === "proprietaire_foncier" ? (
                              <>
                                <div><Label>Superficie disponible (ha) *</Label><Input type="number" min="0" step="0.01" value={leadForm.superficie_disponible_ha} onChange={(e) => setLeadForm({ ...leadForm, superficie_disponible_ha: e.target.value })} required /></div>
                                <div><Label>Superficie à valoriser (ha)</Label><Input type="number" min="0" step="0.01" value={leadForm.superficie_a_valoriser_ha} onChange={(e) => setLeadForm({ ...leadForm, superficie_a_valoriser_ha: e.target.value })} /></div>
                              </>
                            ) : leadForm.dispose_terrain === "oui" ? (
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
                                <SelectContent>{STATUTS.filter(s => view === "prospects" ? ["qualifie","interesse","tres_interesse","en_discussion","preparation_dossier","pret_souscrire","abandonne"].includes(s.v) : ["nouveau","contacte","abandonne"].includes(s.v)).map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
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
              
                              </div>
                            )}
                            <div className="sm:col-span-2"><Label>Note / Commentaire</Label><Textarea value={leadForm.commentaire} onChange={(e) => setLeadForm({ ...leadForm, commentaire: e.target.value })} rows={3} /></div>
                          </div>
              
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Type de contact *</Label><Select value={leadForm.type_lead} onValueChange={v => setLeadForm(x => ({ ...x, type_lead: v, offre_code: "", formule_code: "" }))}><SelectTrigger><SelectValue placeholder="Choisir le type de contact" /></SelectTrigger><SelectContent><SelectItem value="client">Client potentiel</SelectItem><SelectItem value="proprietaire_foncier">Propriétaire foncier</SelectItem></SelectContent></Select></div>
                <div><Label>Civilité (facultatif)</Label><Select value={leadForm.civilite || "non_precisee"} onValueChange={v => setLeadForm(x => ({ ...x, civilite: v === "non_precisee" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger><SelectContent><SelectItem value="non_precisee">Non précisée</SelectItem><SelectItem value="monsieur">Monsieur</SelectItem><SelectItem value="madame">Madame</SelectItem></SelectContent></Select></div>
                <div><Label>Nom *</Label><Input value={leadForm.nom} onChange={e => setLeadForm(x => ({ ...x, nom: e.target.value.toLocaleUpperCase("fr-FR") }))} placeholder="Nom de famille" /></div>
                <div><Label>Prénom(s) *</Label><Input value={leadForm.prenoms} onChange={e => setLeadForm(x => ({ ...x, prenoms: e.target.value.toLocaleUpperCase("fr-FR") }))} placeholder="Prénom(s)" /></div>
                <div className="sm:col-span-2"><CountryPhoneInput label="Téléphone" required countryCode={leadForm.telephone_indicatif || undefined} localValue={leadForm.telephone_local || leadForm.telephone || ""} onChange={v => setLeadForm(x => ({ ...x, telephone_indicatif: v.callingCode, telephone_local: v.localValue, telephone: v.internationalValue }))} /></div>
                <div className="sm:col-span-2"><Label>Téléphone WhatsApp ou email complémentaire (facultatif)</Label><Input value={leadForm.email} onChange={e => setLeadForm(x => ({ ...x, email: e.target.value }))} placeholder="Email (facultatif)" type="email" /></div>
                <div className="sm:col-span-2"><Label>Localité / lieu de résidence (facultatif)</Label><Input value={leadForm.campement_quartier} onChange={e => setLeadForm(x => ({ ...x, campement_quartier: e.target.value, region_residence: e.target.value }))} placeholder="Village, ville, quartier ou campement" /></div>
                {leadForm.type_lead === "client" && <div className="sm:col-span-2"><Label>Dispose d’un terrain ?</Label><Select value={leadForm.dispose_terrain} onValueChange={v => setLeadForm(x => ({ ...x, dispose_terrain: v }))}><SelectTrigger><SelectValue placeholder="Choisir Oui ou Non" /></SelectTrigger><SelectContent>{refs("oui_non").map((r:any) => <SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>}
                <div className="sm:col-span-2"><Label>Note rapide (facultatif)</Label><Textarea value={leadForm.commentaire} onChange={e => setLeadForm(x => ({ ...x, commentaire: e.target.value }))} placeholder="Besoin exprimé ou information utile…" rows={2} /></div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateOpen(false); setEditingLead(null); setLeadForm({ ...emptyLead, assigned_to: hasCommercialAccess ? (user?.id || "") : "" }); }}>Annuler</Button>
              <Button
                onClick={() => createLead.mutate()}
                disabled={createLead.isPending || !leadForm.nom.trim() || !leadForm.prenoms.trim() || !leadForm.telephone.trim() || (view === "prospects" && !leadForm.district_id.trim())}
              >{createLead.isPending ? "Enregistrement…" : editingLead ? "Enregistrer les modifications" : "Enregistrer"}</Button>
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