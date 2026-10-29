import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Users, MapPin, Layers, Upload, FileText } from "lucide-react";
import { useUserZones } from "@/hooks/useUserZones";
import GeographieCascade from "@/components/common/GeographieCascade";
import { uploadFile as uploadToStorage } from "@/utils/storage";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import ContactLauncher from "@/components/common/ContactLauncher";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import RelationshipSelect from "@/components/common/RelationshipSelect";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import { offlineInsert, offlineUpdate } from "@/lib/offlineWrite";
import { getCachedItems, STORES } from "@/lib/offlineDb";
import { getSafeErrorMessage } from "@/lib/safeError";

const ANNEXES_CONVENTION = [
  { field: "annexe_1_pv_delimitation_croquis", label: "Annexe 1 — Procès-verbal de délimitation / croquis parcellaire" },
  { field: "annexe_2_pv_consentement_familial", label: "Annexe 2 — Procès-verbal de consentement familial signé" },
  { field: "annexe_3_acte_reconnaissance_parts", label: "Annexe 3 — Acte de délimitation et reconnaissance des parts" },
  { field: "annexe_4_acte_remise_jouissance", label: "Annexe 4 — Acte de Remise en Jouissance (36 mois)" },
  { field: "annexe_5_procuration_mandataire", label: "Annexe 5 — Procuration co-titulaire / mandataire" },
  { field: "annexe_6_copies_cni_signataires", label: "Annexe 6 — Copies CNI d’au moins six signataires" },
  { field: "annexe_7_acte_mariage", label: "Annexe 7 — Acte de mariage (si applicable)" },
  { field: "annexe_8_guide_villageois_attestation", label: "Annexe 8 — Guide villageois / attestation foncière du chef" },
];

const createInitialAnnexStatuses = (): Record<string, "joint" | "a_fournir"> =>
  ANNEXES_CONVENTION.reduce<Record<string, "joint" | "a_fournir">>((acc, a) => {
    acc[a.field] = "a_fournir";
    return acc;
  }, {});

const ProprietairesTerres = () => {
  const navigate = useNavigate();
  const { user, userRoles = [] } = useAuth();
  const { can } = usePermissions();
  const canCreateProprietaire = can("proprietaires.create");
  const canEditProprietaire = can("proprietaires.update") && (userRoles || []).some((role:string) => ["pdg","service_client","chef_equipe_service_client","support","relation_client"].includes(role));
  const canValidateOwners = can("proprietaires.validate");
  const [searchParams] = useSearchParams();
  const conversionLeadId = searchParams.get("lead_id");
  const conversionProspectId = searchParams.get("prospect_id");
  const [proprietaires, setProprietaires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingOnly, setPendingOnly] = useState(searchParams.get("validation") === "a_valider");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<any>(null);
  const [ownerReadOnly, setOwnerReadOnly] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState("identite");
  const [districts, setDistricts] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [departements, setDepartements] = useState<any[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { fetchFilteredDistricts, fetchFilteredRegions, fetchFilteredDepartements, fetchFilteredSousPrefectures } = useUserZones();

  const [formData, setFormData] = useState<Record<string, any>>({
    type_proprietaire: "personne_physique",
    civilite: "", nom: "", prenoms: "", date_naissance: "", lieu_naissance: "",
    nom_pere: "", nom_mere: "",
    denomination_sociale: "", numero_enregistrement: "",
    nombre_membres: "", nom_representant: "",
    telephone: "", telephone_indicatif: "", telephone_local: "", telephone_secondaire: "", telephone_secondaire_indicatif: "", telephone_secondaire_local: "", telephone_principal_whatsapp: false, telephone_secondaire_whatsapp: false, whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "",
    type_piece: "", numero_piece: "", date_delivrance_piece: "",
    lieu_residence: "",
    district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village_id: "", village: "", localite: "",
    surface_totale_declaree_ha: "", coordonnees_gps: "", date_signature_convention: "",
    type_convention: "plante_partage", part_agricapital_pct: "50", nombre_lots_agricapital: "",
    statut_foncier: "coutumier", reference_cadastrale: "",
    limites_nord: "", limites_sud: "", limites_est: "", limites_ouest: "",
    servitudes: "", croquis_joint: false,
    plantation_partagee_activee: true, plantation_surface_cible_ha: "",
    plantation_type_culture: "Palmier à huile", plantation_densite_plants: "143", plantation_date_activation: "",
    co_titulaire_nom: "", co_titulaire_lien: "", co_titulaire_piece: "", co_titulaire_telephone: "", co_titulaire_telephone_indicatif: "", co_titulaire_telephone_local: "",
    temoin_proprietaire_nom: "", temoin_proprietaire_qualite: "", representant_agricapital_nom: "", representant_agricapital_qualite: "",
    leader_communautaire_nom: "", leader_communautaire_qualite: "", voisin_1_nom: "", voisin_1_cote: "", voisin_2_nom: "", voisin_2_cote: "",
    notes: "",
  });

  const [files, setFiles] = useState<{ [key: string]: File | null }>({
    photo_profil: null, cni_recto: null, cni_verso: null,
  });
  const [annexStatuses, setAnnexStatuses] = useState<Record<string, "joint" | "a_fournir">>(createInitialAnnexStatuses);

  const fetchData = async () => {
    try {
      if (!navigator.onLine) {
        const cached = await getCachedItems(STORES.PROPRIETAIRES_TERRES);
        setProprietaires(cached);
        setLoading(false);
        return;
      }
      const { data, error } = await (supabase as any)
        .from("proprietaires_terres")
        .select("*, districts(nom), regions(nom), departements(nom), sous_prefectures(nom), parcelles(count)")
        .order("id_unique", { ascending: false });
      if (error) throw error;
      setProprietaires(data || []);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); loadDistricts(); }, []);
  useEffect(() => {
    const editId = searchParams.get("edit_id");
    if (!editId) return;
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).from("proprietaires_terres").select("*").eq("id", editId).maybeSingle();
      if (!active) return;
      if (error || !data) {
        toast({ variant: "destructive", title: "Dossier indisponible", description: "Impossible d'ouvrir le formulaire de modification du propriétaire." });
        return;
      }
      setEditingOwner(data);
      setOwnerReadOnly(true);
      setFormData((current:any) => Object.fromEntries(Object.keys(current).map((key) => {
        const value = data[key];
        return [key, value == null ? (typeof current[key] === "boolean" ? false : "") : String(value)];
      })));
      setFiles({ photo_profil: null, cni_recto: null, cni_verso: null });
      setIsFormOpen(true);
    })();
    return () => { active = false; };
  }, [searchParams]);
  useEffect(() => {
    if (!conversionLeadId) return;
    setFormData((current:any) => ({
      ...current,
      nom: searchParams.get("nom") || current.nom,
      prenoms: searchParams.get("prenoms") || current.prenoms,
      telephone: searchParams.get("telephone") || current.telephone,
      whatsapp: searchParams.get("whatsapp") || current.whatsapp,
      email: searchParams.get("email") || current.email,
      district_id: searchParams.get("district_id") || current.district_id,
      region_id: searchParams.get("region_id") || current.region_id,
      departement_id: searchParams.get("departement_id") || current.departement_id,
      sous_prefecture_id: searchParams.get("sous_prefecture_id") || current.sous_prefecture_id,
      village: searchParams.get("village") || current.village,
      lieu_residence: searchParams.get("lieu_residence") || current.lieu_residence,
    }));
    setIsFormOpen(true);
  }, [conversionLeadId, searchParams]);
  const loadDistricts = async () => { setDistricts(await fetchFilteredDistricts()); };

  const handleDistrictChange = async (v: string) => {
    setFormData(f => ({ ...f, district_id: v, region_id: "", departement_id: "", sous_prefecture_id: "" }));
    setRegions(await fetchFilteredRegions(v));
    setDepartements([]); setSousPrefectures([]);
  };
  const handleRegionChange = async (v: string) => {
    setFormData(f => ({ ...f, region_id: v, departement_id: "", sous_prefecture_id: "" }));
    setDepartements(await fetchFilteredDepartements(v));
    setSousPrefectures([]);
  };
  const handleDeptChange = async (v: string) => {
    setFormData(f => ({ ...f, departement_id: v, sous_prefecture_id: "" }));
    setSousPrefectures(await fetchFilteredSousPrefectures(v));
  };

  const uploadFile = async (bucket: string, file: File, folder: string): Promise<string | null> => {
    const result = await uploadToStorage(bucket, file, folder);
    if (!result?.url) throw new Error(`Upload impossible: ${file.name}`);
    return result.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOwner ? !canEditProprietaire : !canCreateProprietaire) {
      toast({ variant: "destructive", title: "Accès refusé", description: editingOwner ? "Seuls le PDG et les rôles Relation client & Support autorisés peuvent modifier un propriétaire foncier." : "Votre rôle ne permet pas de créer un propriétaire foncier." });
      return;
    }
    const type = formData.type_proprietaire;
    if (type === "personne_physique" && (!formData.civilite || !formData.nom.trim())) {
      setActiveFormTab("identite");
      toast({ variant: "destructive", title: "Informations manquantes", description: "Renseignez la civilité et le nom du propriétaire." });
      return;
    }
    if (type === "personne_morale" && (!formData.denomination_sociale.trim() || !formData.nom_representant.trim())) {
      setActiveFormTab("identite");
      toast({ variant: "destructive", title: "Informations manquantes", description: "Renseignez la dénomination sociale et le représentant." });
      return;
    }
    if (type === "famille_groupement" && (!formData.nom.trim() || !formData.nom_representant.trim())) {
      setActiveFormTab("identite");
      toast({ variant: "destructive", title: "Informations manquantes", description: "Renseignez le nom du groupement et son représentant." });
      return;
    }
    if (!String(formData.telephone || "").trim()) {
      setActiveFormTab("identite");
      toast({ variant: "destructive", title: "Téléphone obligatoire", description: "Renseignez le numéro de téléphone du propriétaire." });
      return;
    }
    if (!formData.surface_totale_declaree_ha || Number(formData.surface_totale_declaree_ha) <= 0) {
      setActiveFormTab("parcelle");
      toast({ variant: "destructive", title: "Superficie obligatoire", description: "Renseignez une superficie supérieure à zéro." });
      return;
    }
    setUploading(true);
    try {
      const currentUser = user;
      if (!currentUser) throw new Error("Session utilisateur introuvable");
      if (!user) throw new Error("Non authentifié");
      const missingAnnex = ANNEXES_CONVENTION.find((a) => annexStatuses[a.field] === "joint" && !files[a.field]);
      if (missingAnnex) throw new Error(`${missingAnnex.label}: fichier obligatoire si “Joint” est coché`);

      let photo_profil_url = editingOwner?.photo_profil_url || null, fichier_piece_recto_url = editingOwner?.fichier_piece_recto_url || null, fichier_piece_verso_url = editingOwner?.fichier_piece_verso_url || null;
      const annexUploads: Record<string, string | null> = {};
      const isOnline = navigator.onLine;
      // uploadToStorage conserve aussi les blobs en IndexedDB hors ligne : on
      // garde donc les chemins des pièces au lieu de déclarer les annexes absentes.
      if (files.photo_profil) photo_profil_url = await uploadFile('photos-profils', files.photo_profil, user.id);
      if (files.cni_recto) fichier_piece_recto_url = await uploadFile('pieces-identite', files.cni_recto, `proprietaires/${user.id}/pieces`);
      if (files.cni_verso) fichier_piece_verso_url = await uploadFile('pieces-identite', files.cni_verso, `proprietaires/${user.id}/pieces`);
      for (const annexe of ANNEXES_CONVENTION) {
        const file = files[annexe.field];
        annexUploads[annexe.field] = file ? await uploadFile('documents-fonciers', file, `conventions/${user.id}/annexes`) : null;
      }

      const nomComplet = formData.type_proprietaire === 'personne_morale' 
        ? formData.denomination_sociale 
        : formData.type_proprietaire === 'famille_groupement'
        ? formData.nom_representant
        : `${formData.nom} ${formData.prenoms}`.trim();

      const surfaceTotale = formData.surface_totale_declaree_ha ? parseFloat(formData.surface_totale_declaree_ha) : null;
      const typeConvention = formData.type_convention || "plante_partage";
      const agriPct = typeConvention === "achat" ? 100 : Math.max(0, Math.min(100, Number(formData.part_agricapital_pct || 50)));
      const ownerPct = 100 - agriPct;
      const partAgriHa = surfaceTotale ? (surfaceTotale * agriPct) / 100 : null;
      const partProprietaireHa = surfaceTotale ? (surfaceTotale * ownerPct) / 100 : null;
      const nombreLots = Math.max(0, parseInt(formData.nombre_lots_agricapital || "0", 10) || 0);
      const maxLots = typeConvention === "plante_partage"
        ? Math.min(Math.floor(partAgriHa || 0), Math.floor(partProprietaireHa || 0))
        : Math.floor(partAgriHa || 0);
      if (surfaceTotale && nombreLots > maxLots) {
        throw new Error(`Le nombre de lots AgriCapital ne peut pas dépasser ${maxLots} lot(s) de 1 ha pour cette répartition.`);
      }
      const cautionTotale = typeConvention === "plante_partage" && partAgriHa ? partAgriHa * 50000 : 0;
      const gps = String(formData.coordonnees_gps || "").split(/[,;\s]+/).map(Number).filter(Number.isFinite);
      const gpsLat = gps.length >= 2 ? gps[0] : null;
      const gpsLng = gps.length >= 2 ? gps[1] : null;

      const propPayload: any = {
        nom_complet: nomComplet,
        nom: formData.nom || nomComplet,
        type_proprietaire: formData.type_proprietaire,
        civilite: formData.civilite || null,
        prenoms: formData.prenoms || null,
        lieu_naissance: formData.lieu_naissance || null,
        nom_pere: formData.nom_pere || null,
        nom_mere: formData.nom_mere || null,
        denomination_sociale: formData.denomination_sociale || null,
        numero_enregistrement: formData.numero_enregistrement || null,
        nom_representant: formData.nom_representant || null,
        telephone: formData.telephone, telephone_indicatif: formData.telephone_indicatif || null, telephone_local: formData.telephone_local || null,
        telephone_secondaire: formData.telephone_secondaire || null, telephone_secondaire_indicatif: formData.telephone_secondaire_indicatif || null, telephone_secondaire_local: formData.telephone_secondaire_local || null,
        telephone_principal_whatsapp: !!formData.telephone_principal_whatsapp, telephone_secondaire_whatsapp: !!formData.telephone_secondaire_whatsapp,
        whatsapp: formData.telephone_principal_whatsapp ? formData.telephone : formData.telephone_secondaire_whatsapp ? (formData.telephone_secondaire || null) : null, whatsapp_indicatif: null, whatsapp_local: null,

        lieu_residence: formData.lieu_residence || null,
        numero_piece: formData.numero_piece || null,
        photo_profil_url, fichier_piece_recto_url, fichier_piece_verso_url,
        district_id: formData.district_id || null,
        region_id: formData.region_id || null,
        departement_id: formData.departement_id || null,
        sous_prefecture_id: formData.sous_prefecture_id || null,
        village_id: formData.village_id || null,
        village: formData.village || formData.localite || null,
        nombre_membres: formData.nombre_membres ? parseInt(formData.nombre_membres) : null,
        date_naissance: formData.date_naissance || null,
        date_delivrance_piece: formData.date_delivrance_piece || null,
        type_piece: formData.type_piece || null,
        email: formData.email || null,
        statut_foncier: formData.statut_foncier || "coutumier",
        reference_cadastrale: formData.reference_cadastrale || null,
        coordonnees_gps: formData.coordonnees_gps || null,
        surface_totale_declaree_ha: surfaceTotale,
        part_proprietaire_pct: ownerPct,
        part_agricapital_pct: agriPct,
        nombre_lots_agricapital: nombreLots,
        part_proprietaire_ha: partProprietaireHa,
        part_agricapital_ha: partAgriHa,
        caution_par_ha: typeConvention === "plante_partage" ? 50000 : 0,
        caution_totale: cautionTotale,
        limites_nord: formData.limites_nord || null,
        limites_sud: formData.limites_sud || null,
        limites_est: formData.limites_est || null,
        limites_ouest: formData.limites_ouest || null,
        servitudes: formData.servitudes || null,
        croquis_joint: formData.croquis_joint,
        co_titulaire_nom: formData.co_titulaire_nom || null,
        co_titulaire_lien: formData.co_titulaire_lien || null,
        co_titulaire_piece: formData.co_titulaire_piece || null,
        co_titulaire_telephone: formData.co_titulaire_telephone || null, co_titulaire_telephone_indicatif: formData.co_titulaire_telephone_indicatif || null, co_titulaire_telephone_local: formData.co_titulaire_telephone_local || null,
        temoin_proprietaire_nom: formData.temoin_proprietaire_nom || null,
        temoin_proprietaire_qualite: formData.temoin_proprietaire_qualite || null,
        representant_agricapital_nom: formData.representant_agricapital_nom || null,
        representant_agricapital_qualite: formData.representant_agricapital_qualite || null,
        leader_communautaire_nom: formData.leader_communautaire_nom || null,
        leader_communautaire_qualite: formData.leader_communautaire_qualite || null,
        voisin_1_nom: formData.voisin_1_nom || null,
        voisin_1_cote: formData.voisin_1_cote || null,
        voisin_2_nom: formData.voisin_2_nom || null,
        voisin_2_cote: formData.voisin_2_cote || null,
        notes: formData.notes || null,
        created_by: currentUser.id,
        updated_by: user.id,
        statut: "en_attente_validation",
        validation_statut: "a_valider",
        validated_by: null,
        validated_at: null,
      };
      if (editingOwner) {
        const { error: updateError } = await offlineUpdate("proprietaires_terres", editingOwner.id, {
          ...propPayload,
          updated_by: currentUser.id,
          // Une modification ne réinitialise pas l'état de validation du dossier.
          statut: editingOwner.statut,
          validation_statut: editingOwner.validation_statut,
          validated_by: editingOwner.validated_by,
          validated_at: editingOwner.validated_at,
        });
        if (updateError) throw updateError;
        toast({ title: "Propriétaire mis à jour", description: "Les informations et les nouveaux fichiers ont été enregistrés." });
        setIsFormOpen(false);
        setEditingOwner(null);
        setFiles({ photo_profil: null, cni_recto: null, cni_verso: null });
        await fetchData();
        return;
      }
      const { data: proprietaire, error } = await offlineInsert("proprietaires_terres", propPayload);
      if (error) throw error;

      let parcelleId: string | null = null;
      if (surfaceTotale) {
        const { data: parcelle, error: parcelleError } = await offlineInsert("parcelles", {
          proprietaire_id: proprietaire.id,
          nom: `${nomComplet} — ${formData.village || "Parcelle PP"}`,
          surface_totale_ha: surfaceTotale,
          mode_surface: typeConvention === "achat" ? "achat" : "plante_partage",
          surface_proprietaire_ha: partProprietaireHa || 0,
          surface_agricapital_ha: partAgriHa || 0,
          surface_attribuee_ha: 0,
          plantation_partagee_activee: typeConvention === "plante_partage",
          plantation_surface_cible_ha: surfaceTotale || null,
          plantation_type_culture: formData.plantation_type_culture || "Palmier à huile",
          plantation_densite_plants: 143,
          plantation_date_activation: formData.plantation_date_activation || null,
          statut: "a_valider",
          district_id: formData.district_id || null,
          region_id: formData.region_id || null,
          departement_id: formData.departement_id || null,
          sous_prefecture_id: formData.sous_prefecture_id || null,
          village_id: formData.village_id || null,
          village: formData.village || null,
          localisation_gps_lat: gpsLat,
          localisation_gps_lng: gpsLng,
          duree_convention: 30,
          date_convention: formData.date_signature_convention || null,
          notes: formData.notes || null,
          created_by: currentUser.id,
          updated_by: user.id,
        });
        if (parcelleError) throw parcelleError;
        parcelleId = parcelle?.id || null;
      }

      const conventionPayload = {
        proprietaire_id: proprietaire.id,
        parcelle_id: parcelleId,
        sous_prefecture_id: formData.sous_prefecture_id || null,
        type_convention: typeConvention,
        duree_ans: 30,
        date_signature: formData.date_signature_convention || null,
        date_debut: formData.date_signature_convention || null,
        surface_totale_ha: surfaceTotale || 0,
        part_proprietaire_pct: ownerPct,
        part_agricapital_pct: agriPct,
        nombre_lots_agricapital: nombreLots,
        part_proprietaire_ha: partProprietaireHa,
        part_agricapital_ha: partAgriHa,
        caution_par_ha: typeConvention === "plante_partage" ? 50000 : 0,
        caution_totale: cautionTotale,
        statut: "a_valider",
        notes: formData.notes || null,
        created_by: currentUser.id,
      };
      const { data: convention, error: conventionError } = await offlineInsert("conventions_foncieres", conventionPayload);
      if (conventionError || !convention) throw conventionError || new Error("La convention n’a pas été enregistrée.");
      const conventionRef: any = convention;

      const documents = ANNEXES_CONVENTION.map((a) => ({
        proprietaire_id: proprietaire.id,
        parcelle_id: parcelleId,
        type_document: a.field,
        designation: a.label,
        statut: annexStatuses[a.field],
        fichier_url: annexUploads[a.field],
        uploaded_by: annexUploads[a.field] ? user.id : null,
        notes: conventionRef?.id ? `Convention ${conventionRef.reference || conventionRef.id}` : null,
      }));
      for (const document of documents) {
        const { error: docsError } = await offlineInsert("documents_convention", document);
        if (docsError) throw docsError;
      }
      if (conversionLeadId) {
        const { error: leadUpdateError } = await offlineUpdate("leads", conversionLeadId, {
          statut: "converti", etape_pipeline: "converti",
          converti_at: new Date().toISOString(), proprietaire_id: proprietaire.id,
        });
        if (leadUpdateError) throw leadUpdateError;
      }
      if (conversionProspectId) {
        const { error: prospectUpdateError } = await offlineUpdate("prospects", conversionProspectId, {
          statut: "converti", proprietaire_id: proprietaire.id, updated_at: new Date().toISOString(),
        });
        if (prospectUpdateError) throw prospectUpdateError;
      }
      toast({
        title: isOnline ? "Succès" : "Enregistré hors ligne",
        description: isOnline
          ? `Dossier ${proprietaire.id_unique || proprietaire.id} enregistré et soumis à validation.`
          : "Dossier foncier enregistré localement ; la soumission à validation sera synchronisée dès le retour du réseau.",
      });
      setIsFormOpen(false);
      resetForm();
      fetchData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally { setUploading(false); }
  };

  const resetForm = () => {
    setFormData({
      type_proprietaire: "personne_physique", civilite: "", nom: "", prenoms: "",
      date_naissance: "", lieu_naissance: "", nom_pere: "", nom_mere: "",
      denomination_sociale: "", numero_enregistrement: "", nombre_membres: "", nom_representant: "",
      telephone: "", telephone_indicatif: "", telephone_local: "", telephone_secondaire: "", telephone_secondaire_indicatif: "", telephone_secondaire_local: "", telephone_principal_whatsapp: false, telephone_secondaire_whatsapp: false, whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "", type_piece: "", numero_piece: "",
      date_delivrance_piece: "", lieu_residence: "", district_id: "", region_id: "",
      departement_id: "", sous_prefecture_id: "", village_id: "", village: "", localite: "",
      surface_totale_declaree_ha: "", coordonnees_gps: "", date_signature_convention: "",
      type_convention: "plante_partage", part_agricapital_pct: "50", nombre_lots_agricapital: "",
      statut_foncier: "coutumier", reference_cadastrale: "",
      limites_nord: "", limites_sud: "", limites_est: "", limites_ouest: "",
      servitudes: "", croquis_joint: false,
      plantation_partagee_activee: true, plantation_surface_cible_ha: "",
      plantation_type_culture: "Palmier à huile", plantation_densite_plants: "143", plantation_date_activation: "",
      co_titulaire_nom: "", co_titulaire_lien: "", co_titulaire_piece: "", co_titulaire_telephone: "", co_titulaire_telephone_indicatif: "", co_titulaire_telephone_local: "",
      temoin_proprietaire_nom: "", temoin_proprietaire_qualite: "", representant_agricapital_nom: "", representant_agricapital_qualite: "",
      leader_communautaire_nom: "", leader_communautaire_qualite: "", voisin_1_nom: "", voisin_1_cote: "", voisin_2_nom: "", voisin_2_cote: "",
      notes: "",
    });
    setFiles({ photo_profil: null, cni_recto: null, cni_verso: null });
    setAnnexStatuses(createInitialAnnexStatuses());
    setEditingOwner(null);
    setOwnerReadOnly(false);
    setActiveFormTab("identite");
  };

  const pendingOwnerCount = proprietaires.filter(p => p.validation_statut === "a_valider").length;
  const filtered = proprietaires.filter(p =>
    (!pendingOnly || p.validation_statut === "a_valider") &&
    (
      p.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id_unique?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.telephone?.includes(searchTerm)
    )
  );

  const update = (field: string, value: any) => setFormData(f => ({ ...f, [field]: value }));
  const updateFormPhone = (v: any, field: string) => setFormData(f => ({ ...f, [field]: v.internationalValue, [field+"_indicatif"]: v.callingCode, [field+"_local"]: v.localValue }));

  const formSteps = [
    { value: "identite", label: "Identité et contacts", short: "Identité" },
    { value: "localisation", label: "Localisation", short: "Localisation" },
    { value: "parcelle", label: "Parcelle et convention", short: "Parcelle" },
    { value: "parties", label: "Cotitulaires et témoins", short: "Parties" },
    { value: "documents", label: "Documents et validation", short: "Documents" },
  ];
  const activeStepIndex = Math.max(0, formSteps.findIndex(step => step.value === activeFormTab));
  const validateCurrentStep = () => {
    if (activeFormTab === "identite") {
      const type = formData.type_proprietaire;
      const identityMissing =
        (type === "personne_physique" && (!formData.civilite || !String(formData.nom || "").trim())) ||
        (type === "personne_morale" && (!String(formData.denomination_sociale || "").trim() || !String(formData.nom_representant || "").trim())) ||
        (type === "famille_groupement" && (!String(formData.nom || "").trim() || !String(formData.nom_representant || "").trim()));
      if (identityMissing) {
        toast({ variant: "destructive", title: "Identité incomplète", description: "Complétez les champs obligatoires du type de propriétaire sélectionné." });
        return false;
      }
      if (!String(formData.telephone || "").trim()) {
        toast({ variant: "destructive", title: "Téléphone obligatoire", description: "Renseignez le numéro de téléphone du propriétaire avant de continuer." });
        return false;
      }
    }
    if (activeFormTab === "parcelle" && (!formData.surface_totale_declaree_ha || Number(formData.surface_totale_declaree_ha) <= 0)) {
      toast({ variant: "destructive", title: "Superficie obligatoire", description: "Renseignez une superficie supérieure à zéro hectare." });
      return false;
    }
    return true;
  };
  const goToNextFormStep = () => {
    if (!validateCurrentStep()) return;
    const nextStep = formSteps[activeStepIndex + 1];
    if (nextStep) setActiveFormTab(nextStep.value);
  };
  const goToPreviousFormStep = () => {
    const previousStep = formSteps[activeStepIndex - 1];
    if (previousStep) setActiveFormTab(previousStep.value);
  };

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PROPRIETAIRES}>
      <MainLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Conventions foncières</h1>
              <p className="text-muted-foreground mt-1">{filtered.length} affiché(s) · {proprietaires.length} propriétaire(s)</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) { resetForm(); setEditingOwner(null); setOwnerReadOnly(false); } }}>
              {canCreateProprietaire && <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setEditingOwner(null); setOwnerReadOnly(false); setActiveFormTab("identite"); }}><Plus className="mr-2 h-4 w-4" />Nouvelle convention</Button>
              </DialogTrigger>}
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Convention Planté-Partagé — Identification du Propriétaire</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} noValidate className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Étape {activeStepIndex + 1} sur {formSteps.length}</p>
                        <h3 className="text-base font-semibold">{formSteps[activeStepIndex]?.label}</h3>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{Math.round(((activeStepIndex + 1) / formSteps.length) * 100)} %</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((activeStepIndex + 1) / formSteps.length) * 100)}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((activeStepIndex + 1) / formSteps.length) * 100}%` }} />
                    </div>
                  </div>
                  <Tabs value={activeFormTab} onValueChange={setActiveFormTab} className="space-y-4">
                    <TabsList className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-xl bg-muted/70 p-1">
                      {formSteps.map((step, index) => (
                        <TabsTrigger type="button" key={step.value} value={step.value} onClick={() => setActiveFormTab(step.value)} className="min-w-0 shrink-0 rounded-lg px-3 py-2 text-xs sm:text-sm">
                          <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">{index + 1}</span>
                          <span>{step.short}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <fieldset disabled={ownerReadOnly} className="contents">
                    {/* TAB 1: IDENTITÉ */}
                    <TabsContent value="identite" className="space-y-4">
                      <div className="space-y-2">
                        <Label className="font-semibold">Type de propriétaire *</Label>
                        <Select value={formData.type_proprietaire} onValueChange={v => update('type_proprietaire', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="personne_physique">☐ Personne physique</SelectItem>
                            <SelectItem value="personne_morale">☐ Personne morale</SelectItem>
                            <SelectItem value="famille_groupement">☐ Famille / Groupement</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.type_proprietaire === 'personne_physique' && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Civilité *</Label>
                              <Select value={formData.civilite} onValueChange={v => update('civilite', v)}>
                                <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="M">M.</SelectItem>
                                  <SelectItem value="Mme">Mme</SelectItem>
                                  <SelectItem value="Mlle">Mlle</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Nom *</Label>
                              <Input value={formData.nom} onChange={e => update('nom', e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                              <Label>Prénom(s)</Label>
                              <Input value={formData.prenoms} onChange={e => update('prenoms', e.target.value)} />
                            </div>
                          </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Nom & Prénom(s) du père</Label>
                              <Input value={formData.nom_pere} onChange={e => update('nom_pere', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Nom & Prénom(s) de la mère</Label>
                              <Input value={formData.nom_mere} onChange={e => update('nom_mere', e.target.value)} />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Né(e) le</Label>
                              <Input type="date" value={formData.date_naissance} onChange={e => update('date_naissance', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Lieu de naissance</Label>
                              <Input value={formData.lieu_naissance} onChange={e => update('lieu_naissance', e.target.value)} />
                            </div>
                          </div>
                        </>
                      )}

                      {formData.type_proprietaire === 'personne_morale' && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Dénomination sociale *</Label>
                              <Input value={formData.denomination_sociale} onChange={e => update('denomination_sociale', e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                              <Label>N° d'enregistrement</Label>
                              <Input value={formData.numero_enregistrement} onChange={e => update('numero_enregistrement', e.target.value)} />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Nom & Prénom(s) du représentant *</Label>
                              <Input value={formData.nom_representant} onChange={e => update('nom_representant', e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                              <Label>Né(e) le</Label>
                              <Input type="date" value={formData.date_naissance} onChange={e => update('date_naissance', e.target.value)} />
                            </div>
                          </div>
                        </>
                      )}

                      {formData.type_proprietaire === 'famille_groupement' && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Nom référentiel *</Label>
                              <Input value={formData.nom} onChange={e => update('nom', e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                              <Label>Nombre de membres</Label>
                              <Input type="number" value={formData.nombre_membres} onChange={e => update('nombre_membres', e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Nom & Prénom(s) du représentant *</Label>
                            <Input value={formData.nom_representant} onChange={e => update('nom_representant', e.target.value)} required />
                          </div>
                        </>
                      )}

                      {/* Common fields: contact + pièce d'identité */}
                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-3">Contact & Pièce d'identité</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2"><CountryPhoneInput label="Téléphone principal" required countryCode={formData.telephone_indicatif||undefined} localValue={formData.telephone_local||formData.telephone||""} onChange={v=>updateFormPhone(v,"telephone")}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!formData.telephone_principal_whatsapp} onCheckedChange={v=>{update("telephone_principal_whatsapp",v===true);if(v===true)update("telephone_secondaire_whatsapp",false);}}/>Dispose d'un compte WhatsApp !</label></div>
                          <div className="space-y-2"><CountryPhoneInput label="Téléphone secondaire" countryCode={formData.telephone_secondaire_indicatif||undefined} localValue={formData.telephone_secondaire_local||formData.telephone_secondaire||""} onChange={v=>updateFormPhone(v,"telephone_secondaire")}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!formData.telephone_secondaire_whatsapp} onCheckedChange={v=>{update("telephone_secondaire_whatsapp",v===true);if(v===true)update("telephone_principal_whatsapp",false);}}/>Dispose d'un compte WhatsApp !</label></div>
                          
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={formData.email} onChange={e => update('email', e.target.value)} />
                          </div>
                          <div className="space-y-2">

                          </div>
                          <div className="space-y-2">
                            <Label>Lieu de résidence</Label>
                            <Input value={formData.lieu_residence} onChange={e => update('lieu_residence', e.target.value)} placeholder="Lieu de résidence" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                          <div className="space-y-2">
                            <Label>Nature pièce d'identité</Label>
                            <PieceTypeSelect value={formData.type_piece} onChange={v=>update("type_piece",v)}/>
                          </div>
                          <div className="space-y-2">
                            <Label>N° Pièce d'identité</Label>
                            <Input value={formData.numero_piece} onChange={e => update('numero_piece', e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Date délivrance</Label>
                            <Input type="date" value={formData.date_delivrance_piece} onChange={e => update('date_delivrance_piece', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* TAB 2: LOCALISATION */}
                    <TabsContent value="localisation" className="space-y-4">
                      <h4 className="font-semibold">Localisation géographique</h4>
                      <GeographieCascade districtId={formData.district_id} regionId={formData.region_id} departementId={formData.departement_id} sousPrefectureId={formData.sous_prefecture_id} villageId={formData.village_id} required onChange={(g)=>setFormData((x:any)=>({...x,...(Object.prototype.hasOwnProperty.call(g,"districtId")?{district_id:g.districtId||""}:{}),...(Object.prototype.hasOwnProperty.call(g,"regionId")?{region_id:g.regionId||""}:{}),...(Object.prototype.hasOwnProperty.call(g,"departementId")?{departement_id:g.departementId||""}:{}),...(Object.prototype.hasOwnProperty.call(g,"sousPrefectureId")?{sous_prefecture_id:g.sousPrefectureId||""}:{}),...(Object.prototype.hasOwnProperty.call(g,"villageId")?{village_id:g.villageId||""}:{}),...(Object.prototype.hasOwnProperty.call(g,"villageName")?{village:g.villageName??x.village}:{})}))}/></TabsContent>

                    {/* TAB 3: PARCELLE */}
                    <TabsContent value="parcelle" className="space-y-4">
                      <h4 className="font-semibold">Description de la parcelle (Section II Convention)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Type de convention *</Label>
                          <Select value={formData.type_convention} onValueChange={v => update('type_convention', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="plante_partage">Planté-partagé</SelectItem>
                              <SelectItem value="achat">Achat</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Superficie totale de la parcelle (ha) *</Label>
                          <Input type="number" min="0.1" step="0.1" value={formData.surface_totale_declaree_ha} onChange={e => update('surface_totale_declaree_ha', e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label>Part AgriCapital (%)</Label>
                          <Input type="number" min="0" max="100" step="1" disabled={formData.type_convention === "achat"} value={formData.type_convention === "achat" ? "100" : formData.part_agricapital_pct} onChange={e => update('part_agricapital_pct', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Nombre de lots AgriCapital (1 ha / lot)</Label>
                          <Input type="number" min="0" step="1" value={formData.nombre_lots_agricapital ?? ""} onChange={e => update('nombre_lots_agricapital', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Date de signature convention</Label>
                          <Input type="date" value={formData.date_signature_convention} onChange={e => update('date_signature_convention', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Statut foncier</Label>
                          <Select value={formData.statut_foncier} onValueChange={v => update('statut_foncier', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="certifie">Certifié</SelectItem>
                              <SelectItem value="titre">Titré</SelectItem>
                              <SelectItem value="coutumier">Coutumier</SelectItem>
                              <SelectItem value="autre">Autre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Réf. cadastrale / IDUFCI</Label>
                          <Input value={formData.reference_cadastrale} onChange={e => update('reference_cadastrale', e.target.value)} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Coordonnées GPS (si disponibles)</Label>
                          <Input value={formData.coordonnees_gps} onChange={e => update('coordonnees_gps', e.target.value)} placeholder="Ex: 6.8891, -6.4502 ou polygone GPS" />
                        </div>
                      </div>
                      {formData.surface_totale_declaree_ha && parseFloat(formData.surface_totale_declaree_ha) > 0 && (() => {
                        const total = parseFloat(formData.surface_totale_declaree_ha);
                        const agriPct = formData.type_convention === "achat" ? 100 : Number(formData.part_agricapital_pct || 50);
                        const ownerPct = 100 - agriPct;
                        const agriHa = total * agriPct / 100;
                        const ownerHa = total * ownerPct / 100;
                        const lots = Number(formData.nombre_lots_agricapital || 0);
                        return <div className="p-3 rounded-md bg-primary/10 text-sm space-y-1">
                          <p>Part propriétaire : <strong>{Math.round(ownerHa).toLocaleString("fr-FR")} ha</strong> ({ownerPct}%)</p>
                          <p>Part AgriCapital : <strong>{Math.round(agriHa).toLocaleString("fr-FR")} ha</strong> ({agriPct}%)</p>
                          <p>Lots AgriCapital : <strong>{lots}</strong> × 1 ha</p>
                          {formData.type_convention === "plante_partage" && <p>Caution foncière : <strong>{(agriHa * 50000).toLocaleString('fr-FR')} FCFA</strong></p>}
                        </div>;
                      })()}
                      <h4 className="font-semibold mt-4">Limites de la parcelle</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Limites Nord</Label>
                          <Input value={formData.limites_nord} onChange={e => update('limites_nord', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Limites Sud</Label>
                          <Input value={formData.limites_sud} onChange={e => update('limites_sud', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Limites Est</Label>
                          <Input value={formData.limites_est} onChange={e => update('limites_est', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Limites Ouest</Label>
                          <Input value={formData.limites_ouest} onChange={e => update('limites_ouest', e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Servitudes ou restrictions éventuelles</Label>
                        <Textarea value={formData.servitudes} onChange={e => update('servitudes', e.target.value)} rows={2} />
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea value={formData.notes} onChange={e => update('notes', e.target.value)} rows={2} />
                      </div>

                    </TabsContent>

                    {/* TAB 4: DOCUMENTS (Annexes Convention) */}
                    <TabsContent value="parties" className="space-y-4">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <h3 className="font-semibold">Cotitulaires, mandataires et signatures</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Renseignez séparément les personnes associées au dossier foncier et les témoins de la convention.</p>
                      </div>
                      <h4 className="font-semibold mt-4">Co-titulaire / mandataire et signatures</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Nom co-titulaire / mandataire</Label><Input value={formData.co_titulaire_nom} onChange={e => update('co_titulaire_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Lien avec le propriétaire</Label><RelationshipSelect value={formData.co_titulaire_lien} onChange={v=>update("co_titulaire_lien",v)}/></div>
                        <div className="space-y-2"><Label>Type de pièce du co-titulaire</Label><PieceTypeSelect value={formData.co_titulaire_piece} onChange={v=>update("co_titulaire_piece",v)}/></div>
                        <CountryPhoneInput label="Téléphone principal du cotitulaire" countryCode={formData.co_titulaire_telephone_indicatif||undefined} localValue={formData.co_titulaire_telephone_local||formData.co_titulaire_telephone||""} onChange={v=>updateFormPhone(v,"co_titulaire_telephone")}/>
                        <div className="space-y-2"><Label>Témoin propriétaire — Nom</Label><Input value={formData.temoin_proprietaire_nom} onChange={e => update('temoin_proprietaire_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Témoin propriétaire — Qualité</Label><Input value={formData.temoin_proprietaire_qualite} onChange={e => update('temoin_proprietaire_qualite', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Représentant AgriCapital — Nom</Label><Input value={formData.representant_agricapital_nom} onChange={e => update('representant_agricapital_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Représentant AgriCapital — Qualité</Label><Input value={formData.representant_agricapital_qualite} onChange={e => update('representant_agricapital_qualite', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Leader communautaire — Nom</Label><Input value={formData.leader_communautaire_nom} onChange={e => update('leader_communautaire_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Leader communautaire — Qualité</Label><Input value={formData.leader_communautaire_qualite} onChange={e => update('leader_communautaire_qualite', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Voisin riverain n°1 — Nom</Label><Input value={formData.voisin_1_nom} onChange={e => update('voisin_1_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Côté</Label><Input value={formData.voisin_1_cote} onChange={e => update('voisin_1_cote', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Voisin riverain n°2 — Nom</Label><Input value={formData.voisin_2_nom} onChange={e => update('voisin_2_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Côté</Label><Input value={formData.voisin_2_cote} onChange={e => update('voisin_2_cote', e.target.value)} /></div>
                      </div>
                    </TabsContent>

                    <TabsContent value="documents" className="space-y-4">
                      <h4 className="font-semibold">Documents d'identité</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FileUploadVisual label="Photo de profil" field="photo_profil" accept="image/*" currentFile={files.photo_profil||null} existingPreview={formData.photo_profil_url || ""} onFileChange={(_,f)=>setFiles(x=>({...x,photo_profil:f}))}/>
                        <FileUploadVisual label="CNI / Pièce (Recto)" field="cni_recto" accept="image/*,.pdf" currentFile={files.cni_recto||null} existingPreview={formData.fichier_piece_recto_url || ""} onFileChange={(_,f)=>setFiles(x=>({...x,cni_recto:f}))} onIdentityNumberDetected={n=>update("numero_piece",n)} identityDocumentType={formData.type_piece}/>
                        <FileUploadVisual label="CNI / Pièce (Verso)" field="cni_verso" accept="image/*,.pdf" currentFile={files.cni_verso||null} existingPreview={formData.fichier_piece_verso_url || ""} onFileChange={(_,f)=>setFiles(x=>({...x,cni_verso:f}))}/>
                      </div>

                      <h4 className="font-semibold mt-4 flex items-center gap-2"><FileText className="h-4 w-4" /> Annexes de la Convention</h4>
                      
                      <div className="space-y-3 text-sm">
                        {ANNEXES_CONVENTION.map((annexe, index) => {
                          const isJoint = annexStatuses[annexe.field] === "joint";
                          return (
                            <div key={annexe.field} className="rounded-md border p-3 space-y-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">Annexe {index + 1}</Badge>
                                  <span>{annexe.label.replace(/^Annexe \d+ — /, "")}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <Label className="flex items-center gap-2 text-xs font-normal">
                                    <Checkbox checked={isJoint} onCheckedChange={(checked) => setAnnexStatuses(s => ({ ...s, [annexe.field]: checked ? "joint" : "a_fournir" }))} />
                                    Joint
                                  </Label>
                                  <Label className="flex items-center gap-2 text-xs font-normal">
                                    <Checkbox checked={!isJoint} onCheckedChange={(checked) => checked && setAnnexStatuses(s => ({ ...s, [annexe.field]: "a_fournir" }))} />
                                    À fournir
                                  </Label>
                                </div>
                              </div>
                              {isJoint && (
                                <FileUploadVisual label="Fichier" field={annexe.field} accept="image/*,.pdf" required currentFile={files[annexe.field]||null} onFileChange={(_,f)=>setFiles(x=>({...x,[annexe.field]:f}))}/>
                              )}
                              {files[annexe.field] && <p className="text-xs text-muted-foreground">Fichier sélectionné: {files[annexe.field]?.name}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>
                    </fieldset>
                  </Tabs>

                  <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    {ownerReadOnly ? (
                      <div className="flex w-full justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => { setIsFormOpen(false); resetForm(); }}>Fermer</Button>
                        {canEditProprietaire && <Button type="button" onClick={() => setOwnerReadOnly(false)}>Modifier</Button>}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                          <Button type="button" variant="outline" onClick={() => { setIsFormOpen(false); resetForm(); }}>Annuler</Button>
                          <Button type="button" variant="outline" onClick={goToPreviousFormStep} disabled={activeStepIndex === 0 || uploading}>Précédent</Button>
                        </div>
                        {activeStepIndex < formSteps.length - 1 ? (
                          <Button type="button" onClick={goToNextFormStep}>Suivant</Button>
                        ) : (
                          <Button type="submit" disabled={uploading || (editingOwner ? !canEditProprietaire : !canCreateProprietaire)}>{uploading ? "Enregistrement..." : editingOwner ? "Enregistrer les modifications" : "Enregistrer la convention"}</Button>
                        )}
                      </>
                    )}
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            {canValidateOwners && <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">Conventions foncières à valider</p>
                  <p className="text-sm text-muted-foreground">{pendingOwnerCount} dossier(s) soumis par les équipes terrain</p>
                </div>
                <Button type="button" variant={pendingOnly ? "default" : "outline"} onClick={() => setPendingOnly(value => !value)}>
                  {pendingOnly ? "Afficher tous les propriétaires" : "Voir les dossiers à valider"}
                </Button>
              </CardContent>
            </Card>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Card>
              <CardContent className="p-2 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3 min-w-0">
                <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg"><Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /></div>
                <div className="min-w-0"><div className="text-lg sm:text-2xl font-bold">{proprietaires.length}</div><div className="text-[10px] sm:text-xs leading-tight text-muted-foreground break-words">Propriétaires</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3 min-w-0">
                <div className="p-1.5 sm:p-2 bg-accent/10 rounded-lg"><Layers className="h-4 w-4 sm:h-5 sm:w-5 text-accent" /></div>
                <div className="min-w-0"><div className="text-lg sm:text-2xl font-bold">{proprietaires.reduce((s, p) => s + Number(p.parcelles?.[0]?.count || 0), 0)}</div><div className="text-[10px] sm:text-xs leading-tight text-muted-foreground">Parcelles</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3 min-w-0">
                <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg"><MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" /></div>
                <div className="min-w-0"><div className="text-lg sm:text-2xl font-bold">{proprietaires.reduce((s, p) => s + (p.surface_totale_ha || 0), 0).toLocaleString("fr-FR")}</div><div className="text-[10px] sm:text-xs leading-tight text-muted-foreground">ha total</div></div>
              </CardContent>
            </Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, ID ou téléphone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table className="responsive-data-table owners-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Nom Complet</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead>Parcelles</TableHead>
                  <TableHead>Surface (ha)</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Validation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Aucun propriétaire</TableCell></TableRow>
                ) : filtered.map(p => (
                  <TableRow key={p.id} role="button" tabIndex={0} aria-label={`Ouvrir la fiche propriétaire ${p.nom_complet || ""}`} onClick={() => navigate(`/proprietaires-terres?edit_id=${p.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/proprietaires-terres?edit_id=${p.id}`); } }} className="cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {p.type_proprietaire === 'personne_morale' ? 'Morale' : p.type_proprietaire === 'famille_groupement' ? 'Famille' : 'Physique'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap" onClick={(event) => event.stopPropagation()}><Link to={`/proprietaires-terres?edit_id=${p.id}`} className="whitespace-nowrap hover:underline">{p.nom_complet}</Link></TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}><ContactLauncher phone={p.telephone} whatsapp={p.whatsapp} email={p.email} name={p.nom_complet || [p.prenoms,p.nom].filter(Boolean).join(" ")} kind="proprietaire" status={p.statut || ""}/></TableCell>
                    <TableCell className="text-xs">{[p.districts?.nom, p.regions?.nom, p.departements?.nom].filter(Boolean).join(" > ") || "-"}</TableCell>
                    <TableCell>{p.parcelles?.[0]?.count ?? 0}</TableCell>
                    <TableCell>{Math.round(Number(p.surface_totale_ha || 0)).toLocaleString("fr-FR")}</TableCell>
                    <TableCell><Badge className={p.statut === "actif" ? "bg-green-500" : "bg-red-500"}>{p.statut}</Badge></TableCell>
                    <TableCell><Badge variant={p.validation_statut === "valide" ? "default" : p.validation_statut === "refuse" ? "destructive" : "outline"}>{p.validation_statut === "valide" ? "Validé" : p.validation_statut === "refuse" ? "Refusé" : "À valider"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default ProprietairesTerres;
