import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import RelationshipSelect from "@/components/common/RelationshipSelect";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import { offlineInsert } from "@/lib/offlineWrite";
import { getCachedItems, STORES, addToSyncQueue } from "@/lib/offlineDb";
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
  const { user } = useAuth();
  const [proprietaires, setProprietaires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [districts, setDistricts] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [departements, setDepartements] = useState<any[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { fetchFilteredDistricts, fetchFilteredRegions, fetchFilteredDepartements, fetchFilteredSousPrefectures } = useUserZones();

  const [formData, setFormData] = useState({
    type_proprietaire: "personne_physique",
    civilite: "", nom: "", prenoms: "", date_naissance: "", lieu_naissance: "",
    nom_pere: "", nom_mere: "",
    denomination_sociale: "", numero_enregistrement: "",
    nombre_membres: "", nom_representant: "",
    telephone: "", telephone_indicatif: "", telephone_local: "", whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "",
    type_piece: "", numero_piece: "", date_delivrance_piece: "",
    domicile: "",
    district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village: "",
    surface_totale_declaree_ha: "", coordonnees_gps: "", date_signature_convention: "",
    type_convention: "plante_partage", part_agricapital_pct: "50", nombre_lots_agricapital: "0",
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProprietaires(data || []);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); loadDistricts(); }, []);
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
    setUploading(true);
    try {
      const currentUser = user;
      if (!currentUser) throw new Error("Session utilisateur introuvable");
      if (!user) throw new Error("Non authentifié");
      const missingAnnex = ANNEXES_CONVENTION.find((a) => annexStatuses[a.field] === "joint" && !files[a.field]);
      if (missingAnnex) throw new Error(`${missingAnnex.label}: fichier obligatoire si “Joint” est coché`);

      let photo_profil_url = null, fichier_piece_recto_url = null, fichier_piece_verso_url = null;
      const annexUploads: Record<string, string | null> = {};
      const isOnline = navigator.onLine;
      if (isOnline) {
        if (files.photo_profil) photo_profil_url = await uploadFile('photos-profils', files.photo_profil, user.id);
        if (files.cni_recto) fichier_piece_recto_url = await uploadFile('pieces-identite', files.cni_recto, `proprietaires/${user.id}/pieces`);
        if (files.cni_verso) fichier_piece_verso_url = await uploadFile('pieces-identite', files.cni_verso, `proprietaires/${user.id}/pieces`);
        for (const annexe of ANNEXES_CONVENTION) {
          const file = files[annexe.field];
          annexUploads[annexe.field] = file ? await uploadFile('documents-fonciers', file, `conventions/${user.id}/annexes`) : null;
        }
      } else {
        for (const annexe of ANNEXES_CONVENTION) annexUploads[annexe.field] = null;
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
        whatsapp: formData.whatsapp || null, whatsapp_indicatif: formData.whatsapp_indicatif || null, whatsapp_local: formData.whatsapp_local || null,
        domicile: formData.domicile || null,
        numero_piece: formData.numero_piece || null,
        photo_profil_url, fichier_piece_recto_url, fichier_piece_verso_url,
        district_id: formData.district_id || null,
        region_id: formData.region_id || null,
        departement_id: formData.departement_id || null,
        sous_prefecture_id: formData.sous_prefecture_id || null,
        village: formData.village || null,
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
        statut: "actif",
      };
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
          district_id: formData.district_id || null,
          region_id: formData.region_id || null,
          departement_id: formData.departement_id || null,
          sous_prefecture_id: formData.sous_prefecture_id || null,
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
        statut: "active",
        notes: formData.notes || null,
        created_by: currentUser.id,
      };
      let conventionRef: any = null;
      if (isOnline) {
        const { data: convention, error: conventionError } = await (supabase as any).from("conventions_foncieres").insert(conventionPayload).select().single();
        if (conventionError) throw conventionError;
        conventionRef = convention;
      } else {
        await addToSyncQueue({ table: 'conventions_foncieres', operation: 'insert', record_id: proprietaire.id + '-conv', data: conventionPayload, timestamp: Date.now() });
      }

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
      if (isOnline) {
        const { error: docsError } = await (supabase as any).from("documents_convention").insert(documents);
        if (docsError) throw docsError;
      } else {
        for (const d of documents) {
          await addToSyncQueue({ table: 'documents_convention', operation: 'insert', record_id: proprietaire.id + '-' + d.type_document, data: d, timestamp: Date.now() });
        }
      }
      toast({
        title: isOnline ? "Succès" : "Enregistré hors ligne",
        description: isOnline
          ? `Propriétaire ${proprietaire.id_unique || proprietaire.id} enregistré`
          : "Propriétaire, parcelle et convention en attente de synchronisation. Les documents nécessitent une connexion.",
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
      telephone: "", telephone_indicatif: "", telephone_local: "", whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "", type_piece: "", numero_piece: "",
      date_delivrance_piece: "", domicile: "", district_id: "", region_id: "",
      departement_id: "", sous_prefecture_id: "", village: "",
      surface_totale_declaree_ha: "", coordonnees_gps: "", date_signature_convention: "",
      type_convention: "plante_partage", part_agricapital_pct: "50", nombre_lots_agricapital: "0",
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
  };

  const filtered = proprietaires.filter(p =>
    p.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id_unique?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.telephone?.includes(searchTerm)
  );

  const update = (field: string, value: any) => setFormData(f => ({ ...f, [field]: value }));
  const updateFormPhone = (v: any, field: string) => setFormData(f => ({ ...f, [field]: v.internationalValue, [field+"_indicatif"]: v.callingCode, [field+"_local"]: v.localValue }));

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}>
      <MainLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Propriétaires de Terres</h1>
              <p className="text-muted-foreground mt-1">{proprietaires.length} propriétaire(s)</p>
            </div>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Nouveau Propriétaire</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Convention Planté-Partagé — Identification du Propriétaire</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Tabs defaultValue="identite" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="identite">Identité</TabsTrigger>
                      <TabsTrigger value="localisation">Localisation</TabsTrigger>
                      <TabsTrigger value="parcelle">Parcelle</TabsTrigger>
                      <TabsTrigger value="documents">Documents</TabsTrigger>
                    </TabsList>

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
                          <CountryPhoneInput label="Téléphone" required countryCode={formData.telephone_indicatif||undefined} localValue={formData.telephone_local||formData.telephone||""} onChange={v=>updateFormPhone(v,"telephone")}/>
                          <CountryPhoneInput label="WhatsApp" countryCode={formData.whatsapp_indicatif||undefined} localValue={formData.whatsapp_local||formData.whatsapp||""} onChange={v=>updateFormPhone(v,"whatsapp")}/>
                          
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={formData.email} onChange={e => update('email', e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Adresse / Domicile</Label>
                            <Input value={formData.domicile} onChange={e => update('domicile', e.target.value)} />
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
                      <GeographieCascade districtId={formData.district_id} regionId={formData.region_id} departementId={formData.departement_id} sousPrefectureId={formData.sous_prefecture_id} required onChange={(g)=>setFormData((x:any)=>({...x,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village:g.villageName||""}))}/></TabsContent>

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
                          <Input type="number" min="0" step="1" value={formData.nombre_lots_agricapital} onChange={e => update('nombre_lots_agricapital', e.target.value)} />
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
                          <p>Part propriétaire : <strong>{ownerHa.toFixed(2)} ha</strong> ({ownerPct}%)</p>
                          <p>Part AgriCapital : <strong>{agriHa.toFixed(2)} ha</strong> ({agriPct}%)</p>
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
                      <h4 className="font-semibold mt-4">Co-titulaire / mandataire et signatures</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Nom co-titulaire / mandataire</Label><Input value={formData.co_titulaire_nom} onChange={e => update('co_titulaire_nom', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Lien avec le propriétaire</Label><RelationshipSelect value={formData.co_titulaire_lien} onChange={v=>update("co_titulaire_lien",v)}/></div>
                        <div className="space-y-2"><Label>Type de pièce du co-titulaire</Label><PieceTypeSelect value={formData.co_titulaire_piece} onChange={v=>update("co_titulaire_piece",v)}/></div>
                        <CountryPhoneInput label="Téléphone / WhatsApp" countryCode={formData.co_titulaire_telephone_indicatif||undefined} localValue={formData.co_titulaire_telephone_local||formData.co_titulaire_telephone||""} onChange={v=>updateFormPhone(v,"co_titulaire_telephone")}/>
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

                    {/* TAB 4: DOCUMENTS (Annexes Convention) */}
                    <TabsContent value="documents" className="space-y-4">
                      <h4 className="font-semibold">Documents d'identité</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FileUploadVisual label="Photo de profil" field="photo_profil" accept="image/*" currentFile={files.photo_profil||null} onFileChange={(_,f)=>setFiles(x=>({...x,photo_profil:f}))}/>
                        <FileUploadVisual label="CNI / Pièce (Recto)" field="cni_recto" accept="image/*,.pdf" currentFile={files.cni_recto||null} onFileChange={(_,f)=>setFiles(x=>({...x,cni_recto:f}))} onIdentityNumberDetected={n=>update("numero_piece",n)} identityDocumentType={formData.type_piece}/>
                        <FileUploadVisual label="CNI / Pièce (Verso)" field="cni_verso" accept="image/*,.pdf" currentFile={files.cni_verso||null} onFileChange={(_,f)=>setFiles(x=>({...x,cni_verso:f}))}/>
                      </div>

                      <h4 className="font-semibold mt-4 flex items-center gap-2"><FileText className="h-4 w-4" /> Annexes de la Convention</h4>
                      <p className="text-sm text-muted-foreground">Cochez “Joint” uniquement si le document est disponible : l’upload devient alors obligatoire.</p>
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
                  </Tabs>

                  <div className="flex gap-2 justify-end border-t pt-4">
                    <Button variant="outline" type="button" onClick={() => setIsFormOpen(false)}>Annuler</Button>
                    <Button type="submit" disabled={uploading}>{uploading ? "Enregistrement..." : "Enregistrer le Propriétaire"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg"><Users className="h-5 w-5 text-primary" /></div>
                <div><div className="text-2xl font-bold">{proprietaires.length}</div><div className="text-xs text-muted-foreground">Propriétaires</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-lg"><Layers className="h-5 w-5 text-accent" /></div>
                <div><div className="text-2xl font-bold">{proprietaires.reduce((s, p) => s + Number(p.parcelles?.[0]?.count || 0), 0)}</div><div className="text-xs text-muted-foreground">Parcelles</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><MapPin className="h-5 w-5 text-green-600" /></div>
                <div><div className="text-2xl font-bold">{proprietaires.reduce((s, p) => s + (p.surface_totale_ha || 0), 0).toFixed(1)}</div><div className="text-xs text-muted-foreground">ha total</div></div>
              </CardContent>
            </Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, ID ou téléphone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table className="responsive-data-table">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Nom Complet</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead>Parcelles</TableHead>
                  <TableHead>Surface (ha)</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Aucun propriétaire</TableCell></TableRow>
                ) : filtered.map(p => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono text-xs"><Link to={`/proprietaires-terres/${p.id}`} className="text-primary hover:underline">{p.id_unique}</Link></TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {p.type_proprietaire === 'personne_morale' ? 'Morale' : p.type_proprietaire === 'famille_groupement' ? 'Famille' : 'Physique'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium"><Link to={`/proprietaires-terres/${p.id}`} className="hover:underline">{p.nom_complet}</Link></TableCell>
                    <TableCell>{p.telephone}</TableCell>
                    <TableCell className="text-xs">{[p.districts?.nom, p.regions?.nom, p.departements?.nom].filter(Boolean).join(" > ") || "-"}</TableCell>
                    <TableCell>{p.parcelles?.[0]?.count ?? 0}</TableCell>
                    <TableCell>{(p.surface_totale_ha || 0).toFixed(1)}</TableCell>
                    <TableCell><Badge className={p.statut === "actif" ? "bg-green-500" : "bg-red-500"}>{p.statut}</Badge></TableCell>
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
