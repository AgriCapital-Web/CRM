import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { offlineInsert, offlineUpdate } from "@/lib/offlineWrite";
import { getCachedItems, STORES } from "@/lib/offlineDb";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Target, TrendingUp, Users, MapPin, PhoneCall, ArrowRight, Copy, Plus, Phone, Mail, MessageCircle, Contact, Eye, Pencil, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { getSafeErrorMessage } from "@/lib/safeError";
import GeographieCascade from "@/components/common/GeographieCascade";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import CommercialCombobox from "@/components/common/CommercialCombobox";
import MediaUploadVisual from "@/components/ui/media-upload-visual";
import { COMMERCIAL_ASSIGNABLE_ROLES } from "@/lib/roles";
import { formatUserShortName } from "@/lib/utils";
import ContactLauncher from "@/components/common/ContactLauncher";


const normalizeSmsText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const offerRequiresLand = (offer: any) => { const identity = normalizeSmsText([offer?.code, offer?.nom, offer?.famille_offre, offer?.formule_code, offer?.formule_nom].filter(Boolean).join(" ")).toLowerCase().replace(/[ _-]+/g, ""); if (identity.includes("palminvest")) return false; if (identity.includes("terrapalm") || identity.includes("palmterroir")) return true; return null; };
const renderLeadTemplate = (template: string, lead: any) => {
  const fullName = [lead?.prenoms, lead?.nom].filter(Boolean).join(" ").trim();
  const vars: Record<string, string> = {
    nom: fullName, nom_complet: fullName, prenom: String(lead?.prenoms || fullName.split(/\s+/)[0] || ""),
    telephone: String(lead?.telephone || ""), telephone_secondaire: String(lead?.telephone_secondaire || ""), telephone_secondaire_indicatif: String(lead?.telephone_secondaire_indicatif || ""), telephone_secondaire_local: String(lead?.telephone_secondaire_local || ""), telephone_principal_whatsapp: String(!!lead?.telephone_principal_whatsapp), telephone_secondaire_whatsapp: String(!!lead?.telephone_secondaire_whatsapp), whatsapp: String(lead?.whatsapp || lead?.telephone || ""),
    email: String(lead?.email || ""), numero_contrat: "", offre: "", montant: "", date: new Date().toLocaleDateString("fr-FR"),
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_ ]+)\s*\}\}|\{\s*([a-zA-Z0-9_ ]+)\s*\}/g, (_match, doubleKey, singleKey) => vars[String(doubleKey || singleKey || "").trim().replace(/\s+/g, "_")] ?? "");
};

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

export default function Leads({ view = "leads" }: { view?: "leads" | "prospects" | "all" }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user, userRoles, primaryRole } = useAuth();
  const { can } = usePermissions();
  const canCreateLeads = can("leads.create");
  const canUpdateLeads = can("leads.update");
  const { byCategory: refs } = useSystemReferences(["oui_non","lead_delai","lead_disponibilite","lead_source","public_lead_delai"]);
  const isGlobalAdmin = ["pdg", "dg", "admin", "super_admin"].includes(primaryRole || "");
  const isFoncierRole = ["mobilisateur_foncier", "superviseur_mobilisation_fonciere"].includes(primaryRole || "");
  // Le périmètre d'encadrement suit le rôle principal; les rôles secondaires
  // continuent d'ajouter leurs permissions, sans élargir automatiquement le périmètre.
  const canSupervise = isGlobalAdmin || ["responsable_operations", "responsable_commercial",
    "chef_equipe_commercial", "service_client", "chef_equipe_service_client"].includes(primaryRole || "");
  const isServiceClient = (userRoles || []).some((r: string) => ["service_client", "chef_equipe_service_client"].includes(r));
  const hasCommercialAccess = (userRoles || []).some((r: string) => COMMERCIAL_ASSIGNABLE_ROLES.includes(r));
  const { data: offers = [] } = useQuery({ queryKey: ["offres-actives"], queryFn: async () => { const { data, error } = await (supabase as any).from("offres").select("*").eq("actif", true).order("nom"); if (error) throw error; return (data || []).filter((offer: any) => Boolean(offer.code && offer.nom)); }, staleTime: 0, refetchOnMount: "always" });
  const [selected, setSelected] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formReadOnly, setFormReadOnly] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<any>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactLead, setContactLead] = useState<any>(null);
  const [contactChannel, setContactChannel] = useState("whatsapp");
  const [contactMessage, setContactMessage] = useState("");
  const [contactMedia, setContactMedia] = useState<File[]>([]);
  const [contactStoredMedia, setContactStoredMedia] = useState<Array<{ bucket: string; path: string; name: string; mimeType: string; size: number }>>([]);
  const [contactTemplates, setContactTemplates] = useState<any[]>([]);
  const [selectedContactTemplate, setSelectedContactTemplate] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [formStage, setFormStage] = useState<"lead" | "prospect">("lead");
  const [editingLead, setEditingLead] = useState<any>(null);
  const [conversionLeadId, setConversionLeadId] = useState<string | null>(null);
  const emptyLead = {
    nom: "", prenoms: "", telephone: "", telephone_indicatif: "", telephone_local: "", telephone_secondaire: "", telephone_secondaire_indicatif: "", telephone_secondaire_local: "", telephone_principal_whatsapp: false, telephone_secondaire_whatsapp: false, whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "", localite: "", village_id: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", region_residence: "", lieu_residence: "",
    type_lead: "client", civilite: "", etape_pipeline: "lead", offre_code: "", formule_code: "",
    dispose_terrain: "non", superficie_disponible_ha: "", superficie_a_valoriser_ha: "", superficie_souhaitee_ha: "",
    delai_demarrage: "", date_contact_souhaitee: "", creneau_prefere: "", mode_contact_prefere: "appel",
    statut: "nouveau", source: "commercial_terrain", assigned_to: "", commentaire: "",
  };
  const [leadForm, setLeadForm] = useState<Record<string, any>>({ ...emptyLead, assigned_to: "" });

  const openOfficialLeadForm = (lead: any, mode: "view" | "edit") => {
    setSelected(null);
    setEditingLead(lead);
    setFormStage(lead.etape_pipeline === "prospect" || lead._record_type === "prospect" ? "prospect" : "lead");
    setLeadForm({
      ...emptyLead,
      ...Object.fromEntries(Object.entries(lead).map(([key, value]) => [key, value == null ? "" : String(value)])),
      dispose_terrain: lead.dispose_terrain ? "oui" : "non",
      assigned_to: lead.assigned_to || "",
      telephone_indicatif: "", telephone_local: lead.telephone || "",
      whatsapp_indicatif: "", whatsapp_local: lead.whatsapp || "",
    });
    setFormReadOnly(mode === "view");
    setCreateOpen(true);
  };



  const selectedLeadOffer = offers.find((o) => o.code && o.code === leadForm.offre_code);
  const selectedLeadFormulas = (() => {
    const configured = Array.isArray(selectedLeadOffer?.formules_configuration)
      ? selectedLeadOffer.formules_configuration.filter((f: any) => typeof f?.code === "string" && f.code.trim() && typeof f?.nom === "string" && f.nom.trim())
      : [];
    // Only explicitly configured formulas are selectable; never synthesize a default from the offer.
    return configured;
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
  // Aucun type coché = vue globale ; un seul coché = filtrage dédié ; les deux = les deux types.
  const [showLeads, setShowLeads] = useState(false);
  const [showProspects, setShowProspects] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const tablePageSize = useResponsivePageSize();

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const requestedType = searchParams.get("type") === "prospect" ? "prospect" : "lead";
    setFormStage(requestedType);
    setEditingLead(null);
    setConversionLeadId(null);
    setFormReadOnly(false);
    setLeadForm({ ...emptyLead, statut: requestedType === "prospect" ? "qualifie" : "nouveau", etape_pipeline: requestedType, assigned_to: hasCommercialAccess ? (user?.id || "") : "" });
    setCreateOpen(true);
  }, [searchParams]);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await getCachedItems(STORES.LEADS);
        return cached.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      const { data, error } = await (supabase as any).from("leads").select("*").order("id_unique", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prospects = [] } = useQuery({
    queryKey: ["prospects"],
    queryFn: async () => {
      if (!navigator.onLine) return [];
      const { data, error } = await (supabase as any).from("prospects").select("*").order("created_at", { ascending: false });
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
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["lead_historique", selected?.id] });
      setReassignOpen(false); setReassignTo(""); setReassignMotif("");
      toast({ title: "Prospect réaffecté" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Réaffectation refusée", description: getSafeErrorMessage(e) }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, leadId, statut, prospectId }: any) => {
       if (!canUpdateLeads) throw new Error("Votre rôle ne permet pas de modifier les leads.");
       const lead = leads.find((item: any) => item.id === (leadId || id));
       const prospect = prospectId ? prospects.find((item: any) => item.id === prospectId) : null;
       const isOwner = (prospect?.assigned_to || lead?.assigned_to) === user?.id || (prospect?.created_by || lead?.created_by) === user?.id;
       if (!isOwner && !isGlobalAdmin && !canSupervise) throw new Error("Vous ne pouvez modifier que vos propres dossiers.");
       if (prospectId) {
         const { error } = await offlineUpdate("prospects", prospectId, { statut });
         if (error) throw error;
         if (leadId) {
           const { error: leadError } = await offlineUpdate("leads", leadId, { statut, etape_pipeline: "prospect" });
           if (leadError) throw leadError;
         }
       } else {
         const { error } = await offlineUpdate("leads", id, { statut });
         if (error) throw error;
       }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["prospects"] }); toast({ title: "Statut mis à jour" }); },
  });

  const createLead = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié");
      if (editingLead ? !canUpdateLeads : !canCreateLeads) {
        throw new Error(editingLead ? "Votre rôle ne permet pas de modifier les leads." : "Votre rôle ne permet pas de créer des leads.");
      }
      if (editingLead) {
        const isOwner = editingLead.assigned_to === user.id || editingLead.created_by === user.id;
        if (!isOwner && !isGlobalAdmin && !canSupervise) throw new Error("Vous ne pouvez modifier que vos propres prospects.");
        const num = (v: string) => (v === "" || v == null ? null : Number(v));
        // Un prospect autonome ne doit jamais déclencher une mise à jour de leads.
        if (editingLead._record_type === "prospect" && !editingLead.lead_id) {
          const { error } = await offlineUpdate("prospects", editingLead.prospect_id || editingLead.id, {
            nom: leadForm.nom, prenoms: leadForm.prenoms, civilite: leadForm.civilite || null,
            telephone: leadForm.telephone, telephone_secondaire: leadForm.telephone_secondaire || null, telephone_secondaire_indicatif: leadForm.telephone_secondaire_indicatif || null, telephone_secondaire_local: leadForm.telephone_secondaire_local || null, telephone_principal_whatsapp: !!leadForm.telephone_principal_whatsapp, telephone_secondaire_whatsapp: !!leadForm.telephone_secondaire_whatsapp, whatsapp: leadForm.telephone_principal_whatsapp ? leadForm.telephone : leadForm.telephone_secondaire_whatsapp ? (leadForm.telephone_secondaire || null) : null, email: leadForm.email || null,
            district_id: leadForm.district_id || null, region_id: leadForm.region_id || null,
            departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null,
            village_id: leadForm.village_id || null, localite: leadForm.localite || null, region_residence: leadForm.region_residence || null,
            lieu_residence: leadForm.lieu_residence || null,
            dispose_terrain: leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui",
            superficie_disponible_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_disponible_ha) : null,
            superficie_a_valoriser_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_a_valoriser_ha) : null,
            superficie_souhaitee_ha: leadForm.type_lead === "client" && leadForm.dispose_terrain !== "oui" ? num(leadForm.superficie_souhaitee_ha) : null,
            delai_demarrage: leadForm.delai_demarrage || null, date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
            creneau_prefere: leadForm.creneau_prefere || null, mode_contact_prefere: leadForm.mode_contact_prefere || null,
            commentaire: leadForm.commentaire || null, statut: leadForm.statut,
            type_lead: leadForm.type_lead || "client",
            offre_code: leadForm.type_lead === "client" ? (leadForm.offre_code || null) : null,
            formule_code: leadForm.type_lead === "client" ? (leadForm.formule_code || null) : null,
            source: leadForm.source || editingLead.source,
            assigned_to: (isGlobalAdmin || canSupervise) && leadForm.assigned_to ? leadForm.assigned_to : editingLead.assigned_to,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
          return;
        }
        const { error } = await offlineUpdate("leads", editingLead.id, {
          nom: leadForm.nom, prenoms: leadForm.prenoms, civilite: leadForm.civilite || null, telephone: leadForm.telephone, telephone_secondaire: leadForm.telephone_secondaire || null, telephone_secondaire_indicatif: leadForm.telephone_secondaire_indicatif || null, telephone_secondaire_local: leadForm.telephone_secondaire_local || null, telephone_principal_whatsapp: !!leadForm.telephone_principal_whatsapp, telephone_secondaire_whatsapp: !!leadForm.telephone_secondaire_whatsapp, whatsapp: leadForm.telephone_principal_whatsapp ? leadForm.telephone : leadForm.telephone_secondaire_whatsapp ? (leadForm.telephone_secondaire || null) : null, email: leadForm.email || null,
          district_id: leadForm.district_id || null, region_id: leadForm.region_id || null,
          departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null,
          village_id: leadForm.village_id || null, localite: leadForm.localite || null, region_residence: leadForm.region_residence,
          dispose_terrain: leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui",
          superficie_disponible_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_disponible_ha) : null,
          superficie_a_valoriser_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_a_valoriser_ha) : null,
          superficie_souhaitee_ha: leadForm.type_lead === "client" && leadForm.dispose_terrain !== "oui" ? num(leadForm.superficie_souhaitee_ha) : null,
          delai_demarrage: leadForm.delai_demarrage || null,
          date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
          creneau_prefere: leadForm.creneau_prefere || null,
          mode_contact_prefere: leadForm.mode_contact_prefere || null,
          commentaire: leadForm.commentaire || null, statut: leadForm.statut,
          etape_pipeline: editingLead.etape_pipeline || formStage,
          type_lead: leadForm.type_lead || "client",
          offre_code: leadForm.type_lead === "client" ? (leadForm.offre_code || null) : null,
          formule_code: leadForm.type_lead === "client" ? (leadForm.formule_code || null) : null,
          source: leadForm.source || editingLead.source,
          assigned_to: (isGlobalAdmin || canSupervise) && leadForm.assigned_to ? leadForm.assigned_to : editingLead.assigned_to,
        });
        if (error) throw error;
        if (editingLead.prospect_id) {
          const num = (v: string) => (v === "" || v == null ? null : Number(v));
          const { error: prospectError } = await offlineUpdate("prospects", editingLead.prospect_id, {
            nom: leadForm.nom, prenoms: leadForm.prenoms, civilite: leadForm.civilite || null,
            telephone: leadForm.telephone, telephone_secondaire: leadForm.telephone_secondaire || null, telephone_secondaire_indicatif: leadForm.telephone_secondaire_indicatif || null, telephone_secondaire_local: leadForm.telephone_secondaire_local || null, telephone_principal_whatsapp: !!leadForm.telephone_principal_whatsapp, telephone_secondaire_whatsapp: !!leadForm.telephone_secondaire_whatsapp, whatsapp: leadForm.telephone_principal_whatsapp ? leadForm.telephone : leadForm.telephone_secondaire_whatsapp ? (leadForm.telephone_secondaire || null) : null, email: leadForm.email || null,
            district_id: leadForm.district_id || null, region_id: leadForm.region_id || null,
            departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null,
            village_id: leadForm.village_id || null, region_residence: leadForm.region_residence || null,
            lieu_residence: leadForm.lieu_residence || null,
            dispose_terrain: leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui",
            superficie_disponible_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_disponible_ha) : null,
            superficie_a_valoriser_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_a_valoriser_ha) : null,
            superficie_souhaitee_ha: leadForm.type_lead === "client" && leadForm.dispose_terrain !== "oui" ? num(leadForm.superficie_souhaitee_ha) : null,
            delai_demarrage: leadForm.delai_demarrage || null, date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
            creneau_prefere: leadForm.creneau_prefere || null, mode_contact_prefere: leadForm.mode_contact_prefere || null,
            commentaire: leadForm.commentaire || null, statut: leadForm.statut,
            type_lead: leadForm.type_lead || "client", offre_code: leadForm.type_lead === "client" ? (leadForm.offre_code || null) : null,
            formule_code: leadForm.type_lead === "client" ? (leadForm.formule_code || null) : null,
            source: leadForm.source || editingLead.source,
            assigned_to: (isGlobalAdmin || canSupervise) && leadForm.assigned_to ? leadForm.assigned_to : editingLead.assigned_to,
          });
          if (prospectError) throw prospectError;
        }
        return;
      }
      // A creator with leads.create may save a lead without assigning it immediately.
      // RLS still restricts who may assign it to another user; do not block basic creation
      // merely because this form has no assignment picker for the current role.
      const num = (v: string) => (v === "" || v == null ? null : Number(v));
      const record = {
        ...(formStage === "prospect" && conversionLeadId ? { lead_id: conversionLeadId } : {}),
        nom: leadForm.nom, prenoms: leadForm.prenoms, civilite: leadForm.civilite || null,
        telephone: leadForm.telephone, telephone_secondaire: leadForm.telephone_secondaire || null, telephone_secondaire_indicatif: leadForm.telephone_secondaire_indicatif || null, telephone_secondaire_local: leadForm.telephone_secondaire_local || null, telephone_principal_whatsapp: !!leadForm.telephone_principal_whatsapp, telephone_secondaire_whatsapp: !!leadForm.telephone_secondaire_whatsapp, whatsapp: leadForm.telephone_principal_whatsapp ? leadForm.telephone : leadForm.telephone_secondaire_whatsapp ? (leadForm.telephone_secondaire || null) : null, email: leadForm.email || null,
        district_id: leadForm.district_id || null, region_id: leadForm.region_id || null,
        departement_id: leadForm.departement_id || null, sous_prefecture_id: leadForm.sous_prefecture_id || null,
        village_id: leadForm.village_id || null, localite: leadForm.localite || null, region_residence: leadForm.region_residence || null,
        lieu_residence: leadForm.lieu_residence.trim() || null,
        dispose_terrain: leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui",
        superficie_disponible_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_disponible_ha) : null,
        superficie_a_valoriser_ha: (leadForm.type_lead === "proprietaire_foncier" || (leadForm.type_lead === "client" && leadForm.dispose_terrain === "oui")) ? num(leadForm.superficie_a_valoriser_ha) : null,
        superficie_souhaitee_ha: leadForm.type_lead === "client" && leadForm.dispose_terrain !== "oui" ? num(leadForm.superficie_souhaitee_ha) : null,
        delai_demarrage: leadForm.delai_demarrage || null, date_contact_souhaitee: leadForm.date_contact_souhaitee || null,
        creneau_prefere: leadForm.creneau_prefere || null, mode_contact_prefere: leadForm.mode_contact_prefere || null,
        commentaire: leadForm.commentaire || null, type_lead: leadForm.type_lead || "client",
        offre_code: leadForm.type_lead === "client" ? (leadForm.offre_code || null) : null,
        formule_code: leadForm.type_lead === "client" ? (leadForm.formule_code || null) : null,
        statut: formStage === "prospect" ? (leadForm.statut || "qualifie") : (leadForm.statut || "nouveau"),
        source: leadForm.source || "commercial_terrain", created_by: user.id,
        assigned_to: (leadForm.source === "commercial_terrain" && (canSupervise || isServiceClient))
          ? (leadForm.assigned_to || null) : user.id,
      };
      if (formStage === "prospect") {
        // Le prospect n'est créé qu'après validation manuelle du formulaire.
        const { error } = await offlineInsert("prospects", record);
        if (error) throw error;
        if (conversionLeadId) {
          const { error: linkError } = await offlineUpdate("leads", conversionLeadId, {
            etape_pipeline: "prospect",
            etape_conversion: "prospect",
            statut: record.statut || "qualifie",
            updated_at: new Date().toISOString(),
          });
          if (linkError) throw linkError;
        }
      } else {
        const { error } = await offlineInsert("leads", { ...record, etape_pipeline: "lead" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setLeadForm({ ...emptyLead, assigned_to: hasCommercialAccess ? (user?.id || "") : "" });
      setCreateOpen(false);
      setEditingLead(null);
      setConversionLeadId(null);
      toast({ title: editingLead ? (editingLead._record_type === "prospect" || editingLead.etape_pipeline === "prospect" ? "Prospect modifié" : "Lead modifié") : (formStage === "prospect" ? (navigator.onLine ? "Prospect créé" : "Prospect enregistré") : (navigator.onLine ? "Lead créé" : "Lead enregistré hors ligne")) });
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
    if (!isOwner && !canSupervise && !isGlobalAdmin) {
      toast({ variant: "destructive", title: "Accès refusé", description: "Ce lead appartient à un autre commercial." });
      return;
    }
    // Préremplir les données connues du lead, sans créer le prospect avant
    // que l'utilisateur ait complété puis enregistré le formulaire.
    setFormStage("prospect");
    setEditingLead(null);
    setConversionLeadId(lead._record_type === "prospect" ? (lead.lead_id || null) : (lead.id || null));
    setFormReadOnly(false);
    setLeadForm({
      ...emptyLead,
      ...Object.fromEntries(Object.entries(lead).filter(([key, value]) =>
        key in emptyLead && value !== null && value !== undefined
      ).map(([key, value]) => [key, String(value)])),
      statut: lead.statut && !["nouveau", "contacte", "converti"].includes(lead.statut) ? lead.statut : "qualifie",
      etape_pipeline: "prospect",
      assigned_to: lead.assigned_to || (hasCommercialAccess ? user?.id || "" : ""),
      source: lead.source || "commercial_terrain",
      telephone_local: lead.telephone || "",
      whatsapp_local: lead.whatsapp || "",
    });
    setConvertOpen(false);
    setConvertLead(null);
    setCreateOpen(true);
  };

  const startContact = (lead: any) => {
    setContactLead(lead); setContactChannel("whatsapp");
    const fullName = [lead.prenoms, lead.nom].filter(Boolean).join(" ").trim();
    const greeting = lead.civilite === "madame" ? "Bonjour Madame" : lead.civilite === "monsieur" ? "Bonjour Monsieur" : "Bonjour";
    const message = lead.type_lead === "proprietaire_foncier"
      ? `${greeting} ${fullName}, AgriCapital revient vers vous au sujet de la valorisation de votre terrain pour un projet de palmier à huile. Souhaitez-vous être recontacté(e) ? Répondez OUI.`
      : `${greeting} ${fullName}, êtes-vous toujours intéressé(e) par un projet de plantation de palmier à huile avec AgriCapital ? Répondez OUI pour être recontacté(e).`;
    setContactMessage(message.slice(0, 350)); setContactMedia([]); setContactStoredMedia([]); setSelectedContactTemplate(""); setContactOpen(true);
    void (async () => {
      const { data, error } = await (supabase as any).from("notification_templates")
        .select("id,code,nom,canal,evenement,sujet,contenu,media_attachments")
        .eq("actif", true).in("canal", ["sms", "whatsapp", "email"]).order("nom");
      if (error) { console.warn("Chargement des modèles de contact impossible", error); return; }
      setContactTemplates(data || []);
    })();
  };

  const sendContact = async () => {
    if (!contactLead) return;
    const phone = String(contactChannel === "whatsapp" ? (contactLead.whatsapp || contactLead.telephone) : (contactLead.telephone || "")).replace(/[^0-9]/g, "");
    if (contactChannel === "appel") {
      if (!phone) { toast({ variant: "destructive", title: "Numéro manquant", description: "Ajoutez un numéro avant de lancer l’appel." }); return; }
      window.location.href = `tel:${phone}`; setContactOpen(false); return;
    }
    if (!navigator.onLine) {
      toast({ variant: "destructive", title: "Connexion requise", description: "Connectez-vous à Internet pour envoyer directement via Senndo." });
      return;
    }
    if ((contactChannel === "whatsapp" || contactChannel === "sms") && !phone) {
      toast({ variant: "destructive", title: "Numéro manquant", description: "Ajoutez un numéro WhatsApp avant l’envoi." }); return;
    }
    if (contactChannel === "email" && !contactLead.email) {
      toast({ variant: "destructive", title: "Adresse email manquante", description: "Ajoutez une adresse email avant l’envoi." }); return;
    }
    const messageLimit = contactChannel === "sms" ? 155 : contactChannel === "whatsapp" ? 350 : 5000;
    const message = contactChannel === "sms" ? Array.from(normalizeSmsText(contactMessage)).slice(0, 155).join("") : Array.from(contactMessage).slice(0, messageLimit).join("");
    if (!message.trim()) {
      toast({ variant: "destructive", title: "Message vide", description: "Rédigez un message avant l’envoi." }); return;
    }
    setContactSending(true);
    try {
      const mediaAttachments: Array<{ bucket: string; path: string; name: string; mimeType: string; size: number }> = [];
      if (contactChannel === "whatsapp" || contactChannel === "email") {
        for (const file of contactMedia) {
          const { data: authData } = await supabase.auth.getUser();
          if (!authData.user) throw new Error("Session expirée. Reconnectez-vous.");
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${authData.user.id}/manual-${crypto.randomUUID()}-${safeName}`;
          const { error: uploadError } = await supabase.storage.from("notification-media").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
          if (uploadError) throw uploadError;
          mediaAttachments.push({ bucket: "notification-media", path, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
        }
      }
      const { data, error } = await supabase.functions.invoke("notification-dispatch", {
        body: {
          mode: "manual_contact",
          lead_id: contactLead.id,
          channel: contactChannel,
          content: message,
          subject: String(contactTemplates.find((item) => item.id === selectedContactTemplate)?.sujet || "Suivi de votre projet de plantation de palmier à huile"),
          media_attachments: [...((contactChannel === "whatsapp" || contactChannel === "email") ? contactStoredMedia : []), ...mediaAttachments],
          template_id: selectedContactTemplate || null,
          request_id: crypto.randomUUID(),
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "L’envoi n’a pas été confirmé par Senndo.");
      toast({
        title: contactChannel === "whatsapp" ? "WhatsApp envoyé à Senndo" : contactChannel === "sms" ? "SMS envoyé à Senndo" : "Email envoyé à Senndo",
        description: `Demande acceptée par Senndo · ${data.characterCount ?? message.length}/${(contactChannel === "sms" ? 155 : contactChannel === "whatsapp" ? 350 : 5000)} caractères.`,
      });
      setContactOpen(false);
      setContactMedia([]);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Échec de l’envoi", description: getSafeErrorMessage(e) });
    } finally {
      setContactSending(false);
    }
  };

  const convertToClient = async (lead: any) => {
    if (lead.client_id || lead.statut === "converti") {
      toast({ title: "Dossier déjà converti", description: "Ce dossier est déjà associé à un client." });
      return;
    }
    const isOwner = lead.assigned_to === user?.id || lead.created_by === user?.id;
    if (!isOwner && !canSupervise && !isGlobalAdmin) {
      toast({ variant: "destructive", title: "Conversion refusée", description: "Vous n'avez pas accès à ce dossier." });
      return;
    }
    const isProspect = lead._record_type === "prospect" || lead.etape_pipeline === "prospect" || !!lead.prospect_id;
    const params = new URLSearchParams({
      ...(lead.lead_id ? { lead_id: lead.lead_id } : (!isProspect ? { lead_id: lead.id } : {})),
      ...(lead.prospect_id || (isProspect ? lead.id : null) ? { prospect_id: lead.prospect_id || lead.id } : {}),
      commercial_id: lead.assigned_to || "", nom: lead.nom || "",
      prenoms: lead.prenoms || "", telephone: lead.telephone || "", whatsapp: lead.whatsapp || "",
      email: lead.email || "", district_id: lead.district_id || "", region_id: lead.region_id || "",
      departement_id: lead.departement_id || "", sous_prefecture_id: lead.sous_prefecture_id || "",
      village_id: lead.village_id || "", village: lead.village || lead.localite || "", lieu_residence: lead.lieu_residence || lead.campement_quartier || "",
      offre_code: lead.offre_code || "",
      formule_code: lead.formule_code || "",
      formule_nom: lead.formule_nom || "",
      type_lead: lead.type_lead || "client", dispose_terrain: lead.dispose_terrain ? "oui" : "non",
    });
    if (lead.type_lead === "proprietaire_foncier") {
      navigate("/proprietaires-terres?" + params.toString());
      return;
    }
    navigate("/nouvelle-acquisition?" + params.toString());
  };

  const publicUrl = `${window.location.origin}/leads/public`;

  const legacyStage = (l: any) => l.etape_pipeline || (["qualifie", "interesse", "tres_interesse", "en_discussion", "preparation_dossier", "pret_souscrire"].includes(l.statut) ? "prospect" : l.statut === "converti" ? "converti" : "lead");
  const stageLeads = view !== "leads"
    ? [
        ...leads.filter((l: any) => legacyStage(l) === "lead"),
        ...prospects.map((p: any) => {
          const linkedLead = leads.find((l: any) => l.id === p.lead_id);
          return {
            ...(linkedLead || {}),
            ...p,
            id: p.lead_id || linkedLead?.id || p.id,
            prospect_id: p.id,
            lead_id: p.lead_id || linkedLead?.id || null,
            etape_pipeline: "prospect",
            statut: p.statut || linkedLead?.statut || "qualifie",
            created_by: p.created_by || linkedLead?.created_by,
            assigned_to: p.assigned_to || linkedLead?.assigned_to,
            prochaine_relance_at: linkedLead?.prochaine_relance_at || null,
            _record_type: "prospect",
          };
        }),
        ...leads.filter((l: any) => legacyStage(l) === "prospect" && !prospects.some((p: any) => p.lead_id === l.id)),
      ]
    : leads.filter((l: any) => legacyStage(l) === "lead");
  const filteredLeads = stageLeads.filter((l: any) => {
    const isProspect = l._record_type === "prospect" || legacyStage(l) === "prospect";
    const typeMatches = (!showLeads && !showProspects) || (showLeads && !showProspects && !isProspect) || (!showLeads && showProspects && isProspect) || (showLeads && showProspects);
    return typeMatches && JSON.stringify(l).toLowerCase().includes(tableSearch.trim().toLowerCase());
  });
  const paginatedLeads = filteredLeads.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);
  useEffect(() => { setTablePage(1); }, [tableSearch, showLeads, showProspects, tablePageSize]);

  const stats = {
    total: stageLeads.length,
    nouveaux: stageLeads.filter((l: any) => l.statut === "nouveau").length,
    aRelancer: stageLeads.filter((l: any) => l.prochaine_relance_at && new Date(l.prochaine_relance_at) <= new Date()).length,
    convertis: leads.filter((l: any) => l.etape_pipeline === "converti" || l.statut === "converti").length,
    superficie: stageLeads.reduce((s: number, l: any) => s + (Number(l.superficie_disponible_ha || l.superficie_souhaitee_ha) || 0), 0),
  };
  const totalLeads = leads.filter((l: any) => (l.etape_pipeline || "lead") === "lead").length;
  const totalProspects = leads.filter((l: any) => l.etape_pipeline === "prospect").length;
  const convertedRows = leads.filter((l: any) => l.etape_pipeline === "converti" || l.statut === "converti");
  const leadsConverted = convertedRows.filter((l: any) => l.etape_conversion !== "prospect").length;
  const prospectsConverted = convertedRows.filter((l: any) => l.etape_conversion === "prospect").length;
  const tauxConversion = totalLeads + leadsConverted ? Math.round(leadsConverted / (totalLeads + leadsConverted) * 100) : 0;
  const tauxConversionProspects = totalProspects + prospectsConverted ? Math.round(prospectsConverted / (totalProspects + prospectsConverted) * 100) : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6 text-primary" />Leads et prospects</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {canCreateLeads && <Button className="w-full sm:w-auto" variant="outline" onClick={() => { setFormStage("lead"); setEditingLead(null); setConversionLeadId(null); setFormReadOnly(false); setLeadForm({ ...emptyLead, statut: "nouveau", etape_pipeline: "lead", assigned_to: hasCommercialAccess ? (user?.id || "") : "" }); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nouveau lead</Button>}
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: "Lien copié", description: publicUrl }); }}><Copy className="h-4 w-4 mr-2" />Lien public</Button>
            {canCreateLeads && <Button className="col-span-2 w-full sm:col-span-1 sm:w-auto" onClick={() => { setFormStage("prospect"); setEditingLead(null); setConversionLeadId(null); setFormReadOnly(false); setLeadForm({ ...emptyLead, statut: "qualifie", etape_pipeline: "prospect", assigned_to: hasCommercialAccess ? (user?.id || "") : "" }); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nouveau prospect</Button>}
          </div>
        </div>

        <div className={view === "prospects"
          ? "crm-prospects-stat-grid flex min-w-0 flex-wrap gap-2"
          : "grid min-w-0 grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 xl:grid-cols-7"
        }>
          {[
            {l:"Leads",short:"Leads",v:totalLeads,i:Target},
            {l:"Leads convertis",short:"Leads conv.",v:leadsConverted,i:TrendingUp},
            {l:"Taux de conversion leads",short:"Conv. leads",v:tauxConversion+"%",i:TrendingUp},
            {l:"Prospects",short:"Prospects",v:totalProspects,i:Users},
            {l:"Prospects convertis",short:"Prospects conv.",v:prospectsConverted,i:TrendingUp},
            {l:"Taux de conversion prospects",short:"Conv. prospects",v:tauxConversionProspects+"%",i:TrendingUp},
            {l:"À relancer",short:"À relancer",v:stats.aRelancer,i:PhoneCall}
          ].map(item=>(
            <Card key={item.l} className={`min-w-0 overflow-hidden ${view === "prospects" ? "crm-prospects-stat-card" : ""}`}>
              <CardContent className="flex min-h-[62px] min-w-0 items-center justify-between gap-1 p-2 sm:p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="hidden text-[10px] leading-tight text-muted-foreground 2xl:block">{item.l}</p>
                  <p className="block text-[10px] leading-tight text-muted-foreground 2xl:hidden">{item.short}</p>
                  <p className="mt-1 whitespace-nowrap text-lg font-bold tabular-nums">{item.v}</p>
                </div>
                <item.i className="hidden h-4 w-4 shrink-0 text-primary/60 sm:block"/>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Suivi des leads et prospects</CardTitle><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="flex shrink-0 flex-nowrap items-center gap-4 whitespace-nowrap rounded-md border px-3 py-2 text-sm"><label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={showLeads} onCheckedChange={(checked) => setShowLeads(checked === true)} />Lead</label><label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={showProspects} onCheckedChange={(checked) => setShowProspects(checked === true)} />Prospect</label></div><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un lead ou prospect…" /></div></div></CardHeader>
          <CardContent>
            <Table className="responsive-data-table">
              <TableHeader><TableRow>
                <TableHead className="px-2 py-2">Nom</TableHead><TableHead className="whitespace-nowrap px-2 py-2">Contact</TableHead>
                <TableHead className="px-2 py-2">Région</TableHead><TableHead className="px-2 py-2">Statut</TableHead><TableHead className="whitespace-nowrap px-2 py-2">Relance</TableHead>
                <TableHead className="whitespace-nowrap px-2 py-2 text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredLeads.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Aucun lead ou prospect enregistré.</TableCell></TableRow>}
                {paginatedLeads.map((l: any) => {
                  const st = STATUTS.find(s => s.v === l.statut);
                  return (
                    <TableRow key={l.id} role="button" tabIndex={0} aria-label={`Ouvrir la fiche ${l.etape_pipeline === "prospect" ? "prospect" : "lead"} ${[l.prenoms, l.nom].filter(Boolean).join(" ")}`} onClick={() => openOfficialLeadForm(l, "view")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOfficialLeadForm(l, "view"); } }} className="cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>td]:py-1 [&>td]:px-2">
                      <TableCell><div className="font-medium leading-tight">{l.nom} {l.prenoms}</div><Badge variant="outline" className="mt-0.5 text-[10px] leading-tight">{l.etape_pipeline === "prospect" ? "Prospect" : "Lead"}</Badge></TableCell>
                      <TableCell className="text-sm" onClick={(event) => event.stopPropagation()}><ContactLauncher phone={l.telephone} whatsapp={l.whatsapp} name={[l.prenoms, l.nom].filter(Boolean).join(" ").trim()} kind={l._record_type === "prospect" || l.etape_pipeline === "prospect" ? "prospect" : "lead"} status={l.statut} /></TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{l.region_residence}</TableCell>
                      <TableCell className="min-w-0" onClick={(event) => event.stopPropagation()}>
                        <Select value={l.statut} disabled={!canUpdateLeads || !((l.assigned_to === user?.id || l.created_by === user?.id) || canSupervise || isGlobalAdmin)} onValueChange={v => updateStatus.mutate({ id: l.id, leadId: l.lead_id || (l._record_type === "prospect" ? null : l.id), prospectId: l.prospect_id, statut: v })}>
                          <SelectTrigger className="h-8 w-28 max-w-28 overflow-hidden px-2 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{(l.etape_pipeline === "prospect" ? [{v:"qualifie",l:"Qualifié"},{v:"interesse",l:"Intéressé"},{v:"tres_interesse",l:"Très intéressé"},{v:"en_discussion",l:"En discussion"},{v:"preparation_dossier",l:"Préparation dossier"},{v:"pret_souscrire",l:"Prêt à souscrire"},{v:"abandonne",l:"Abandonné"}] : STATUTS.filter(s => ["nouveau","contacte","abandonne"].includes(s.v))).map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent></Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{l.prochaine_relance_at ? format(new Date(l.prochaine_relance_at), "dd MMM", { locale: fr }) : "—"}</TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="outline" className="h-7 w-7" aria-label={`Actions pour ${l.prenoms || ""} ${l.nom || ""}`.trim()} title="Actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onSelect={() => openOfficialLeadForm(l, "view")}><Eye className="mr-2 h-4 w-4" />Fiche</DropdownMenuItem>
                              {canUpdateLeads && ((l.assigned_to === user?.id || l.created_by === user?.id) || isGlobalAdmin) && (
                                <DropdownMenuItem onSelect={() => openOfficialLeadForm(l, "edit")}><Pencil className="mr-2 h-4 w-4" />Modifier</DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => startContact(l)}><Contact className="mr-2 h-4 w-4" />Contacter</DropdownMenuItem>
                              {(l.etape_pipeline || "lead") === "lead" && l.statut !== "converti" && (l.type_lead === "proprietaire_foncier" ? (isFoncierRole || canSupervise) : !isFoncierRole) && (
                                <DropdownMenuItem disabled={!((l.assigned_to === user?.id || l.created_by === user?.id) || canSupervise || isGlobalAdmin)} onSelect={() => { setConvertLead(l); setConvertOpen(true); }}><ArrowRight className="mr-2 h-4 w-4" />Convertir en prospect / client</DropdownMenuItem>
                              )}
                              {view !== "leads" && (l.etape_pipeline === "prospect" || (!l.etape_pipeline && ["qualifie", "interesse", "tres_interesse", "en_discussion", "preparation_dossier", "pret_souscrire"].includes(l.statut))) && l.statut !== "abandonne" && (
                                <DropdownMenuItem disabled={!((l.assigned_to === user?.id || l.created_by === user?.id) || canSupervise || isGlobalAdmin)} onSelect={() => void convertToClient(l)}><ArrowRight className="mr-2 h-4 w-4" />{l.type_lead === "proprietaire_foncier" ? "Convertir en propriétaire foncier" : "Convertir en client"}</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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
            <DialogHeader><DialogTitle>{convertLead?.type_lead === "proprietaire_foncier" ? "Convertir en propriétaire foncier" : "Convertir le lead"}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Choisissez la prochaine étape pour {convertLead ? [convertLead.prenoms, convertLead.nom].filter(Boolean).join(" ") : "ce contact"}.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="outline" className="h-auto justify-start p-4" onClick={() => convertLead && convertToProspect(convertLead)}><Users className="mr-2 h-4 w-4" /><span className="text-left"><span className="block font-semibold">Convertir en prospect</span><span className="block text-xs font-normal">Ouvrir la fiche commerciale complète</span></span></Button>
              <Button className="h-auto justify-start p-4" onClick={() => { if (convertLead) convertToClient(convertLead); setConvertOpen(false); }}><ArrowRight className="mr-2 h-4 w-4" /><span className="text-left"><span className="block font-semibold">{convertLead?.type_lead === "proprietaire_foncier" ? "Convertir en propriétaire foncier" : "Convertir en client"}</span><span className="block text-xs font-normal">{convertLead?.type_lead === "proprietaire_foncier" ? "Ouvrir le formulaire officiel du propriétaire foncier" : "Démarrer le dossier d’acquisition"}</span></span></Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={contactOpen} onOpenChange={setContactOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Contacter {contactLead ? [contactLead.prenoms, contactLead.nom].filter(Boolean).join(" ") : "le contact"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Canal de contact</Label><Select value={contactChannel} onValueChange={(v) => { setContactChannel(v); setSelectedContactTemplate(""); setContactStoredMedia([]); if (v === "sms") { setContactMessage(normalizeSmsText(contactMessage).slice(0, 155)); setContactMedia([]); } else if (v === "whatsapp") setContactMessage(contactMessage.slice(0, 350)); else if (v === "email") setContactMessage(contactMessage.slice(0, 5000)); else setContactMedia([]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="appel">Appel téléphonique</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select></div>
              {(contactChannel === "sms" || contactChannel === "whatsapp" || contactChannel === "email") && <div className="space-y-2"><Label>Modèle enregistré</Label><Select value={selectedContactTemplate} onValueChange={(id) => { const template = contactTemplates.find((item) => item.id === id); if (!template) return; setSelectedContactTemplate(id); setContactStoredMedia(Array.isArray(template.media_attachments) ? template.media_attachments : []); const rendered = renderLeadTemplate(String(template.contenu || ""), contactLead).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); const limit = contactChannel === "sms" ? 155 : contactChannel === "whatsapp" ? 350 : 5000; setContactMessage((contactChannel === "sms" ? normalizeSmsText(rendered) : rendered).slice(0, limit)); }}><SelectTrigger><SelectValue placeholder="Choisir un modèle de la base" /></SelectTrigger><SelectContent>{contactTemplates.filter((item) => item.canal === contactChannel).map((item) => <SelectItem key={item.id} value={item.id}>{item.nom} · {item.evenement}</SelectItem>)}</SelectContent></Select></div>}
              {(contactChannel === "sms" || contactChannel === "whatsapp" || contactChannel === "email") && <div className="space-y-2"><Label>Message</Label><Textarea value={contactMessage} maxLength={contactChannel === "sms" ? 155 : contactChannel === "whatsapp" ? 350 : 5000} onChange={e => setContactMessage(contactChannel === "sms" ? normalizeSmsText(e.target.value).slice(0, 155) : e.target.value.slice(0, contactChannel === "whatsapp" ? 350 : 5000))} rows={4} /><p className="text-right text-xs text-muted-foreground">{Array.from(contactChannel === "sms" ? normalizeSmsText(contactMessage) : contactMessage).length}/{contactChannel === "sms" ? 155 : contactChannel === "whatsapp" ? 350 : 5000} caractères</p></div>}
              {(contactChannel === "whatsapp" || contactChannel === "email") && contactStoredMedia.length > 0 && <div className="rounded-md border p-2 text-sm"><Label>Pièces jointes du modèle</Label><div className="mt-1 space-y-1">{contactStoredMedia.map((item) => <div key={item.path} className="flex items-center justify-between gap-2"><span className="truncate">{item.name}</span><span className="shrink-0 text-muted-foreground">{(item.size / 1048576).toFixed(1)} Mo</span></div>)}</div></div>}
              {(contactChannel === "whatsapp" || contactChannel === "email") && <MediaUploadVisual label="Pièces jointes" files={contactMedia} onChange={setContactMedia} multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.csv,.txt" />}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setContactOpen(false)} disabled={contactSending}>Annuler</Button><Button onClick={sendContact} disabled={contactSending}>{contactSending ? "Envoi en cours…" : contactChannel === "appel" ? "Lancer l’appel" : contactChannel === "sms" ? "Envoyer le SMS" : contactChannel === "whatsapp" ? "Envoyer via WhatsApp" : "Envoyer par email"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{formReadOnly ? (formStage === "prospect" ? "Fiche prospect" : "Fiche lead") : editingLead ? (formStage === "prospect" ? "Modification prospect" : "Modification lead") : (formStage === "prospect" ? "Nouveau prospect" : "Nouveau lead")}</DialogTitle></DialogHeader>
            <fieldset disabled={formReadOnly} className="min-w-0 space-y-3">
            {formStage === "prospect" ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <Label>Type de prospect *</Label>
                              <Select value={leadForm.type_lead} onValueChange={(v) => setLeadForm(x => ({ ...x, type_lead: v, offre_code: v === "client" ? x.offre_code : "", formule_code: v === "client" ? x.formule_code : "" }))}>
                                <SelectTrigger><SelectValue placeholder="Choisir le type de prospect" /></SelectTrigger>
                                <SelectContent><SelectItem value="client">Client</SelectItem><SelectItem value="proprietaire_foncier">Propriétaire foncier</SelectItem></SelectContent>
                              </Select>
                            </div>
                            {leadForm.type_lead === "client" && <>
                              <div><Label>Offre (si connue)</Label><Select value={leadForm.offre_code} onValueChange={(v) => { const offer = offers.find((o) => o.code === v); setLeadForm(x => ({ ...x, offre_code: v, formule_code: "", ...(offerRequiresLand(offer) === null ? {} : { dispose_terrain: offerRequiresLand(offer) ? "oui" : "non" }) })); }}><SelectTrigger><SelectValue placeholder="Sélectionner une offre" /></SelectTrigger><SelectContent>{offers.filter((o) => Boolean(o.code && o.nom)).map((o) => <SelectItem key={o.id} value={o.code}>{o.nom}</SelectItem>)}</SelectContent></Select></div>
                              <div><Label>Formule (si connue)</Label><Select value={leadForm.formule_code} onValueChange={(v) => setLeadForm(x => ({ ...x, formule_code: v }))} disabled={!selectedLeadFormulas.length}><SelectTrigger><SelectValue placeholder="Sélectionner une formule" /></SelectTrigger><SelectContent>{selectedLeadFormulas.map((f: any) => <SelectItem key={f.code} value={f.code}>{f.nom}</SelectItem>)}</SelectContent></Select></div>
                            </>}
                            <div><Label>Nom *</Label><Input value={leadForm.nom} onChange={(e) => setLeadForm({ ...leadForm, nom: e.target.value.toLocaleUpperCase("fr-FR") })} /></div>
                            <div><Label>Prénom(s) *</Label><Input value={leadForm.prenoms} onChange={(e) => setLeadForm({ ...leadForm, prenoms: e.target.value.toLocaleUpperCase("fr-FR") })} /></div>
                            <div className="space-y-1"><CountryPhoneInput label="Téléphone principal" required countryCode={leadForm.telephone_indicatif||undefined} localValue={leadForm.telephone_local||leadForm.telephone||""} onChange={v=>setLeadForm(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!leadForm.telephone_principal_whatsapp} onCheckedChange={v=>setLeadForm(x=>({...x,telephone_principal_whatsapp:v===true,telephone_secondaire_whatsapp:v===true?false:x.telephone_secondaire_whatsapp}))}/>Ce numéro utilise WhatsApp</label></div>
                            <div className="space-y-1"><CountryPhoneInput label="Téléphone secondaire" countryCode={leadForm.telephone_secondaire_indicatif||undefined} localValue={leadForm.telephone_secondaire_local||leadForm.telephone_secondaire||""} onChange={v=>setLeadForm(x=>({...x,telephone_secondaire_indicatif:v.callingCode,telephone_secondaire_local:v.localValue,telephone_secondaire:v.internationalValue}))}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!leadForm.telephone_secondaire_whatsapp} onCheckedChange={v=>setLeadForm(x=>({...x,telephone_secondaire_whatsapp:v===true,telephone_principal_whatsapp:v===true?false:x.telephone_principal_whatsapp}))}/>Ce numéro utilise WhatsApp</label></div>
                            <div><Label>Email</Label><Input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} /></div>
              
                            <div className="sm:col-span-2">
                              <GeographieCascade
                                districtId={leadForm.district_id}
                                regionId={leadForm.region_id}
                                departementId={leadForm.departement_id}
                                sousPrefectureId={leadForm.sous_prefecture_id}
                                villageId={leadForm.village_id}
                                required
                                onChange={(g)=>setLeadForm(x=>({...x,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||"",localite:g.villageName||x.localite||"",region_residence:g.regionName||x.region_residence||""}))}
                              />
                            </div>
                            <div><Label>Lieu de résidence</Label><Input value={leadForm.lieu_residence} onChange={(e) => setLeadForm({ ...leadForm, lieu_residence: e.target.value })} placeholder="Lieu de résidence" /></div>
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
                                <SelectContent>{STATUTS.filter(s => formStage === "prospect" ? ["qualifie","interesse","tres_interesse","en_discussion","preparation_dossier","pret_souscrire","abandonne"].includes(s.v) : ["nouveau","contacte","abandonne"].includes(s.v)).map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
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
                <div className="space-y-1"><CountryPhoneInput label="Téléphone principal" required countryCode={leadForm.telephone_indicatif || undefined} localValue={leadForm.telephone_local || leadForm.telephone || ""} onChange={v => setLeadForm(x => ({ ...x, telephone_indicatif: v.callingCode, telephone_local: v.localValue, telephone: v.internationalValue }))}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!leadForm.telephone_principal_whatsapp} onCheckedChange={v=>setLeadForm(x=>({...x,telephone_principal_whatsapp:v===true,telephone_secondaire_whatsapp:v===true?false:x.telephone_secondaire_whatsapp}))}/>Ce numéro utilise WhatsApp</label></div>
                <div className="space-y-1"><CountryPhoneInput label="Téléphone secondaire" countryCode={leadForm.telephone_secondaire_indicatif || undefined} localValue={leadForm.telephone_secondaire_local || leadForm.telephone_secondaire || ""} onChange={v=>setLeadForm(x=>({...x,telephone_secondaire_indicatif:v.callingCode,telephone_secondaire_local:v.localValue,telephone_secondaire:v.internationalValue}))}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!leadForm.telephone_secondaire_whatsapp} onCheckedChange={v=>setLeadForm(x=>({...x,telephone_secondaire_whatsapp:v===true,telephone_principal_whatsapp:v===true?false:x.telephone_principal_whatsapp}))}/>Ce numéro utilise WhatsApp</label></div>
                <div className="sm:col-span-2"><Label>Email (facultatif)</Label><Input value={leadForm.email} onChange={e => setLeadForm(x => ({ ...x, email: e.target.value }))} placeholder="Adresse e-mail" type="email" /></div>
                <div className="sm:col-span-2"><Label>Lieu de résidence (facultatif)</Label><Input value={leadForm.lieu_residence} onChange={e => setLeadForm(x => ({ ...x, lieu_residence: e.target.value }))} placeholder="Village, ville ou quartier de résidence" /></div>
                {leadForm.type_lead === "client" && <div className="sm:col-span-2"><Label>Dispose d’un terrain ?</Label><Select value={leadForm.dispose_terrain} onValueChange={v => setLeadForm(x => ({ ...x, dispose_terrain: v }))}><SelectTrigger><SelectValue placeholder="Choisir Oui ou Non" /></SelectTrigger><SelectContent>{refs("oui_non").map((r:any) => <SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>}
                <div className="sm:col-span-2"><Label>Note rapide (facultatif)</Label><Textarea value={leadForm.commentaire} onChange={e => setLeadForm(x => ({ ...x, commentaire: e.target.value }))} placeholder="Besoin exprimé ou information utile…" rows={2} /></div>
              </div>
            )}
            </fieldset>
            <DialogFooter>
              {formReadOnly ? <><Button variant="outline" onClick={() => setCreateOpen(false)}>Fermer</Button>{canUpdateLeads && ((editingLead?.assigned_to === user?.id || editingLead?.created_by === user?.id) || isGlobalAdmin) && <Button onClick={() => setFormReadOnly(false)}>Modifier</Button>}</> : <><Button variant="outline" onClick={() => { setCreateOpen(false); setEditingLead(null); setFormReadOnly(false); setLeadForm({ ...emptyLead, assigned_to: hasCommercialAccess ? (user?.id || "") : "" }); }}>Annuler</Button><Button onClick={() => createLead.mutate()} disabled={createLead.isPending || (editingLead ? !canUpdateLeads : !canCreateLeads) || !leadForm.nom.trim() || !leadForm.prenoms.trim() || !leadForm.telephone.trim()}>{createLead.isPending ? "Enregistrement…" : editingLead ? "Enregistrer les modifications" : "Enregistrer"}</Button></>} 
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