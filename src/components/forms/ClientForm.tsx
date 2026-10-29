import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { offlineUpdate, offlineUpsert } from "@/lib/offlineWrite";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { uploadFile, resolveStorageUrl } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import CountryNationalitySelect from "@/components/common/CountryNationalitySelect";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import GeographieCascade from "@/components/common/GeographieCascade";
import CommercialCombobox from "@/components/common/CommercialCombobox";
import { useSystemReferences } from "@/hooks/useSystemReferences";

interface ClientFormProps { client?: any; onSuccess: () => void; onCancel: () => void; readOnly?: boolean; lockCommercialAssignment?: boolean; }

const upperName=(value:string)=>value.toLocaleUpperCase("fr-FR");

const CLIENT_COLUMNS = new Set([
  "type_personne","nom_famille","denomination_sociale","nature_organisation_code","forme_juridique_code","numero_enregistrement","nombre_membres","responsable_legal_nom","responsable_legal_prenoms","responsable_legal_telephone",
  "civilite","nom","prenoms","date_naissance","lieu_naissance","statut_marital",
  "type_piece","numero_piece","date_delivrance_piece","telephone","telephone_secondaire","telephone_secondaire_indicatif","telephone_secondaire_local","telephone_principal_whatsapp","telephone_secondaire_whatsapp","whatsapp","email","domicile","domicile_residence",
  "district_id","region_id","departement_id","sous_prefecture_id","village_id","commercial_id","type_compte","banque_operateur",
  "numero_compte","nom_titulaire_compte","photo_profil_url","fichier_piece_url","fichier_piece_recto_url",
  "fichier_piece_verso_url","localite","nationalite","type_client","telephone_indicatif","telephone_local",
  "whatsapp_indicatif","whatsapp_local","latitude","longitude","updated_by"
]);

const ClientForm = ({ client, onSuccess, onCancel, readOnly = false, lockCommercialAssignment = false }: ClientFormProps) => {
  const { user, userRoles } = useAuth();
  const { can } = usePermissions();
  const canEditClient = can("clients.update") || Boolean(user?.id && client?.validation_statut === "modification_demandee" && (client?.created_by === user.id || client?.commercial_id === user.id || (userRoles || []).some((role: string) => ["chef_equipe_commercial", "responsable_commercial"].includes(role))));
  const [isEditing, setIsEditing] = useState(!readOnly);
  const { toast } = useToast();
  const [form, setForm] = useState<any>(() => ({ ...client }));
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pieceRectoFile, setPieceRectoFile] = useState<File | null>(null);
  const [pieceVersoFile, setPieceVersoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [storedPhotoPreview, setStoredPhotoPreview] = useState("");
  const [storedRectoPreview, setStoredRectoPreview] = useState("");
  const [storedVersoPreview, setStoredVersoPreview] = useState("");
  const [pieceRectoPreview, setPieceRectoPreview] = useState("");
  const [pieceVersoPreview, setPieceVersoPreview] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractPreview, setContractPreview] = useState("");
  const [storedContractPreview, setStoredContractPreview] = useState("");
  const [contractDocument, setContractDocument] = useState<any>(null);
  const { byCategory: refs } = useSystemReferences(["civilite","statut_marital","type_personne","nature_organisation","forme_juridique"]);

  const setField = (key: string, value: any) => setForm((x: any) => ({ ...x, [key]: value }));

  // Reuse du composant d'édition entre deux clients : ne jamais conserver les
  // valeurs ou les médias du client précédent lorsque l'identifiant change.
  useEffect(() => {
    setForm({ ...(client || {}) });
    setIsEditing(!readOnly);
    setPhotoFile(null);
    setPieceRectoFile(null);
    setPieceVersoFile(null);
    setPhotoPreview("");
    setStoredPhotoPreview("");
    setPieceRectoPreview("");
    setStoredRectoPreview("");
    setPieceVersoPreview("");
    setStoredVersoPreview("");
    setContractFile(null);
    setContractPreview("");
    setStoredContractPreview("");
    setContractDocument(null);  }, [client?.id, readOnly]);

  useEffect(() => {
    let active = true;
    const loadStoredPreviews = async () => {
      const [photo, recto, verso] = await Promise.all([
        resolveStorageUrl("photos-profils", client?.photo_profil_url || null),
        resolveStorageUrl("pieces-identite", client?.fichier_piece_recto_url || null),
        resolveStorageUrl("pieces-identite", client?.fichier_piece_verso_url || null),
      ]);
      let storedContract = null;
      let contractUrl = "";
      if (client?.id) {
        const { data: contractRows, error: contractError } = await (supabase as any)
          .from("documents_acquisition")
          .select("id,client_id,type_document,code_document,categorie,source_contractuelle,fichier_url,statut,metadata,created_at")
          .eq("client_id", client.id)
          .eq("type_document", "fiche_contrat")
          .order("created_at", { ascending: false })
          .limit(1);
        if (!contractError && contractRows?.length) {
          storedContract = contractRows[0];
          const bucket = storedContract.metadata?.storage_bucket || "documents";
          contractUrl = await resolveStorageUrl(bucket, storedContract.fichier_url) ||
            await resolveStorageUrl("documents-fonciers", storedContract.fichier_url) ||
            await resolveStorageUrl("documents", storedContract.fichier_url) || "";
        }
      }
      if (active) {
        setStoredPhotoPreview(photo || "");
        setStoredRectoPreview(recto || "");
        setStoredVersoPreview(verso || "");
        setContractDocument(storedContract);
        setStoredContractPreview(contractUrl);
      }
    };
    void loadStoredPreviews();
    return () => { active = false; };
  }, [client?.id, client?.photo_profil_url, client?.fichier_piece_recto_url, client?.fichier_piece_verso_url]);



  // Une fiche client existante lit uniquement son instantané contractuel.
  // Le catalogue courant ne doit jamais recalculer ni réécrire une vente historique.
  const offerSnapshot = form.offre_snapshot && typeof form.offre_snapshot === "object"
    ? form.offre_snapshot : (client?.offre_snapshot || {});
  const snapshotContract = offerSnapshot.contract && typeof offerSnapshot.contract === "object" ? offerSnapshot.contract : {};
  const snapshotFormula = offerSnapshot.formula && typeof offerSnapshot.formula === "object" ? offerSnapshot.formula : {};
  const formulaConfiguration = snapshotFormula.configuration && typeof snapshotFormula.configuration === "object"
    ? snapshotFormula.configuration : {};
  const offer = offerSnapshot.offer && typeof offerSnapshot.offer === "object" ? offerSnapshot.offer
    : (form.offre_id ? { id: form.offre_id, nom: form.formule_nom || form.famille_offre || "Offre enregistrée",
        code: form.famille_offre || form.parcours_code || "", famille_offre: form.famille_offre,
        parcours_code: form.parcours_code, formules_configuration: [] }
      : (form.paiement_personnalise && Object.keys(form.paiement_personnalise).length
        ? { nom: form.formule_nom || "Offre personnalisée", code: form.formule_code || "PERSONNALISEE" } : null));
  const selectedFormula = snapshotFormula.code || form.formule_code
    ? { ...formulaConfiguration, code: snapshotFormula.code || form.formule_code,
        nom: snapshotFormula.nom || form.formule_nom || formulaConfiguration.nom } : null;
  const hectares = Math.max(Number(snapshotContract.superficie_ha ?? form.total_hectares ?? 0), 0);
  const perHa = (amount: unknown) => hectares > 0 ? Number(amount || 0) / hectares : Number(amount || 0);
  const effectiveOffer = offer ? {
    ...offer, ...formulaConfiguration, nom: offer.nom || form.famille_offre || "Offre enregistrée",
    montant_pi_par_ha: perHa(snapshotContract.paiement_initial_montant ?? form.paiement_initial_montant),
    montant_total_par_ha: perHa(snapshotContract.montant_total_contrat ?? form.montant_total_contrat),
    mensualite_par_ha: perHa(snapshotContract.mensualite_montant ?? form.mensualite_montant),
    duree_paiement_mois: Number(snapshotContract.duree_paiement_mois ??
      (Number(snapshotContract.jours_contrat_total ?? form.jours_contrat_total ?? 0) / 30)),
    tranches_paiement: Array.isArray(snapshotContract.echeancier) ? snapshotContract.echeancier
      : (Array.isArray(formulaConfiguration.tranches_paiement) ? formulaConfiguration.tranches_paiement : []),
    type_offre: offer.type_offre || form.type_client, actif: undefined,
  } : null;
  const offerFormulas = Array.isArray(offer?.formules_configuration) ? offer.formules_configuration : [];
  const paymentTranches = Array.isArray(effectiveOffer?.tranches_paiement)
    ? effectiveOffer.tranches_paiement.filter((tranche: any) =>
        tranche.type !== "paiement_initial" && Number(tranche.mensualite_par_ha || 0) > 0) : [];

  const formatOfferAmount = (value: unknown) => {
    const amount = Number(value);
    return value !== null && value !== undefined && value !== "" && Number.isFinite(amount)
      ? `${new Intl.NumberFormat("fr-FR").format(amount)} F/ha`
      : "Non configuré";
  };
  const paymentTranches = Array.isArray(effectiveOffer?.tranches_paiement)
    ? effectiveOffer.tranches_paiement.filter((tranche: any) => tranche.type !== "paiement_initial" && Number(tranche.mensualite_par_ha || 0) > 0)
    : [];

  const isBeneficiary = form.type_client === "beneficiaire_particulier";
  const hasActivity = Number(form.nombre_plantations || 0) > 0 || Boolean(form.pi_paye_at || form.paiement_initial_paye_at);

  const onSubmit = async () => {
    if (!canEditClient) {
      toast({ variant: "destructive", title: "Accès refusé", description: "Seuls les rôles Relation client et les responsables autorisés peuvent modifier un dossier client." });
      return;
    }
    if (!user || !client?.id) return;
    setLoading(true);
    try {
      let photo_profil_url = form.photo_profil_url || null;
      let fichier_piece_recto_url = form.fichier_piece_recto_url || null;
      let fichier_piece_verso_url = form.fichier_piece_verso_url || null;
      let filesQueued = false;

      if (photoFile) {
        const result = await uploadFile("photos-profils", photoFile, `${user.id}/clients/${client.id}`, undefined, { table: "clients", record_id: client.id, column: "photo_profil_url", field: "photo_profil" });
        if (!result?.path) throw new Error("La photo de profil n’a pas été enregistrée. Réessayez.");
        photo_profil_url = result.path;
        filesQueued ||= result.queued;
      }
      if (pieceRectoFile) {
        const result = await uploadFile("pieces-identite", pieceRectoFile, `${user.id}/clients/${client.id}`, undefined, { table: "clients", record_id: client.id, column: "fichier_piece_recto_url", field: "piece_recto" });
        if (!result?.path) throw new Error("Le recto de la pièce d’identité n’a pas été enregistré. Réessayez.");
        fichier_piece_recto_url = result.path;
        filesQueued ||= result.queued;
      }
      if (pieceVersoFile) {
        const result = await uploadFile("pieces-identite", pieceVersoFile, `${user.id}/clients/${client.id}`, undefined, { table: "clients", record_id: client.id, column: "fichier_piece_verso_url", field: "piece_verso" });
        if (!result?.path) throw new Error("Le verso de la pièce d’identité n’a pas été enregistré. Réessayez.");
        fichier_piece_verso_url = result.path;
        filesQueued ||= result.queued;
      }

      if (contractFile) {
        const contractId = contractDocument?.id || crypto.randomUUID();
        const contractUpload = await uploadFile("documents", contractFile, `${user.id}/clients/${client.id}/contrats`, undefined, {
          table: "documents_acquisition", record_id: contractId, column: "fichier_url", field: "fiche_contrat",
        });
        if (!contractUpload?.path) throw new Error("Le contrat n’a pas été enregistré. Réessayez.");
        filesQueued ||= contractUpload.queued;
        const { data: savedContract, error: contractSaveError, offline: contractOffline } = await offlineUpsert("documents_acquisition", {
          id: contractId,
          client_id: client.id,
          type_document: "fiche_contrat",
          code_document: "fiche_contrat",
          categorie: "souscription",
          obligatoire: false,
          source_contractuelle: "fiche_contrat",
          fichier_url: contractUpload.path,
          statut: "en_attente",
          uploaded_by: user.id,
          metadata: { libelle: "Contrat", source_formulaire: "client", storage_bucket: "documents" },
        });
        if (contractSaveError) throw contractSaveError;
        if (!savedContract) throw new Error("Le fichier a été envoyé, mais son rattachement au dossier client n’a pas été confirmé.");
        setContractDocument(savedContract);
        setStoredContractPreview(await resolveStorageUrl("documents", contractUpload.path) || "");
        setContractFile(null);
        setContractPreview("");
        filesQueued ||= contractOffline;
      }

      if (form.type_personne === "personne_morale" && (!String(form.denomination_sociale || "").trim() || !String(form.nature_organisation_code || "").trim() || !String(form.responsable_legal_nom || form.nom || "").trim() || !String(form.responsable_legal_prenoms || form.prenoms || "").trim())) {
        throw new Error("Pour une personne morale, renseignez la dénomination sociale, la nature de l’organisation, le nom et le prénom du responsable légal.");
      }
      if (form.type_personne === "famille_informelle" && (!String(form.nom_famille || "").trim() || !String(form.responsable_legal_nom || form.nom || "").trim() || !String(form.responsable_legal_prenoms || form.prenoms || "").trim())) {
        throw new Error("Pour une famille informelle, renseignez le nom de la famille ainsi que le nom et le prénom du responsable.");
      }

      // IMPORTANT : seules les colonnes métier de clients sont envoyées.
      // Les relations chargées pour l'affichage ne doivent jamais être réinjectées dans UPDATE.
      const clientPayload: any = {};
      for (const key of CLIENT_COLUMNS) if (key in form) clientPayload[key] = form[key];
      clientPayload.photo_profil_url = photo_profil_url;
      clientPayload.fichier_piece_recto_url = fichier_piece_recto_url;
      clientPayload.fichier_piece_verso_url = fichier_piece_verso_url;
      clientPayload.type_personne = form.type_personne || "personne_physique";
      clientPayload.nom = String(form.type_personne === "personne_morale" || form.type_personne === "famille_informelle" ? (form.responsable_legal_nom || form.nom) : (form.nom || form.nom_famille || "")).trim();
      clientPayload.prenoms = String(form.type_personne === "personne_physique" ? form.prenoms : (form.responsable_legal_prenoms || form.prenoms || "")).trim();
      clientPayload.nom_famille = form.type_personne === "famille_informelle" ? String(form.nom_famille || "").trim() : clientPayload.nom; // compatibilité des dossiers historiques
      clientPayload.nom_complet = form.type_personne === "personne_morale" ? String(form.denomination_sociale || "").trim() : form.type_personne === "famille_informelle" ? String(form.nom_famille || "").trim() : [clientPayload.prenoms, clientPayload.nom].filter(Boolean).join(" ").trim();
      clientPayload.whatsapp = form.telephone_principal_whatsapp ? form.telephone : form.telephone_secondaire_whatsapp ? (form.telephone_secondaire || null) : null;
      clientPayload.updated_by = user.id;
      if (client?.validation_statut === "modification_demandee") {
        clientPayload.validation_statut = "a_valider";
        clientPayload.validation_commentaire = null;
        clientPayload.validation_demande_at = null;
        clientPayload.validation_at = null;
      }

      const { error, offline: clientOffline } = await offlineUpdate("clients", client.id, clientPayload);
      if (error) throw error;
      filesQueued ||= clientOffline;

      toast({
        title: filesQueued ? "Enregistrement en attente de synchronisation" : "Dossier mis à jour",
        description: filesQueued
          ? "Les modifications et/ou fichiers ont été conservés dans la file locale. La synchronisation les transmettra au serveur dès que possible."
          : `${clientPayload.nom_complet || "Le Client"} a été modifié avec succès.`,
      });
      if (readOnly) setIsEditing(false);
      onSuccess();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Modification impossible", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const fileUpload = (
    label: string,
    field: string,
    file: File | null,
    current: string | null,
    currentPreview: string,
    onSelect: (f: File | null) => void,
    onPreview: (s: string) => void,
    ocr = false
  ) => (
    <FileUploadVisual
      label={label}
      field={field}
      accept="image/*,.pdf"
      currentFile={file}
      currentPreview={currentPreview}
      existingPreview={field === "photo_profil" ? storedPhotoPreview : field === "piece_recto" ? storedRectoPreview : storedVersoPreview}
      onFileChange={(_, f, p) => { onSelect(f); onPreview(p); }}
      onIdentityNumberDetected={ocr ? n => { if (!String(form.numero_piece || "").trim()) setField("numero_piece", n); } : undefined}
      identityDocumentType={form.type_piece}
      compact
    />
  );
  return (
    <div className="space-y-3">
      {readOnly && <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"><div><p className="font-semibold">Fiche complète du client</p><p className="text-xs text-muted-foreground">{isEditing ? "Mode modification activé" : "Consultation seule — les champs sont verrouillés"}</p></div>{!isEditing && canEditClient && <Button type="button" onClick={() => setIsEditing(true)}>Modifier</Button>}</div>}
      <fieldset disabled={!isEditing} className="space-y-3 min-w-0">
      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Commercial</CardTitle>
          
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <CommercialCombobox
            value={form.commercial_id || null}
            onChange={(value) => setField("commercial_id", value)}
            disabled={isEditing && (lockCommercialAssignment || client?.validation_statut === "modification_demandee")}
            placeholder="Rechercher ou sélectionner un commercial"
          />
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/30 p-2 flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs text-muted-foreground">Dossier</p><p className="font-mono font-semibold">{client?.id_unique || "—"}</p></div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{isBeneficiary ? "Bénéficiaire particulier" : "Client officiel"}</Badge>
          {offer?.nom && <Badge>{offer.nom}</Badge>}

        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Identité</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-2 px-4 pb-3 pt-0">
          <div><Label className="text-xs">Type de personne *</Label><Select value={form.type_personne || "personne_physique"} onValueChange={v=>setForm((x:any)=>({...x,type_personne:v,civilite:v==="personne_physique"?x.civilite:null}))}><SelectTrigger className="h-8"><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("type_personne").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
          {form.type_personne === "personne_physique" && <div><Label className="text-xs">Civilité</Label><Select value={form.civilite || ""} onValueChange={v=>setField("civilite",v)}><SelectTrigger className="h-8"><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("civilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>}
          <div><Label className="text-xs">{form.type_personne === "personne_physique" ? "Nom" : "Nom du responsable légal *"}</Label><Input className="h-8" value={form.type_personne === "personne_physique" ? (form.nom || form.nom_famille || "") : (form.responsable_legal_nom || form.nom || "")} onChange={e=>{setField("nom",e.target.value);setField("responsable_legal_nom",form.type_personne==="personne_physique"?null:e.target.value);if(form.type_personne==="personne_physique")setField("nom_famille",e.target.value);}} required/></div>
          <div><Label className="text-xs">{form.type_personne === "personne_physique" ? "Prénom" : "Prénom(s) du responsable légal *"}</Label><Input className="h-8" value={form.type_personne === "personne_physique" ? (form.prenoms || "") : (form.responsable_legal_prenoms || form.prenoms || "")} onChange={e=>{setField("prenoms",e.target.value);setField("responsable_legal_prenoms",form.type_personne==="personne_physique"?null:e.target.value);}} required/></div>
          {form.type_personne === "personne_morale" && <>
            <div><Label className="text-xs">Dénomination sociale *</Label><Input className="h-8" value={form.denomination_sociale || ""} onChange={e=>setField("denomination_sociale",e.target.value)} required/></div>
            <div><Label className="text-xs">Nature de l’organisation *</Label><Select value={form.nature_organisation_code || ""} onValueChange={v=>setField("nature_organisation_code",v)}><SelectTrigger className="h-8"><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("nature_organisation").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Forme juridique</Label><Select value={form.forme_juridique_code || ""} onValueChange={v=>setField("forme_juridique_code",v)}><SelectTrigger className="h-8"><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("forme_juridique").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">N° d’enregistrement</Label><Input className="h-8" value={form.numero_enregistrement || ""} onChange={e=>setField("numero_enregistrement",e.target.value)}/></div>
            <div><Label className="text-xs">Téléphone du responsable légal</Label><Input className="h-8" type="tel" value={form.responsable_legal_telephone || ""} onChange={e=>setField("responsable_legal_telephone",e.target.value)}/></div>
          </>}
          {form.type_personne === "famille_informelle" && <>
            <div><Label className="text-xs">Nom de la famille / organisation *</Label><Input className="h-8" value={form.nom_famille || ""} onChange={e=>setField("nom_famille",e.target.value)} required/></div>
            <div><Label className="text-xs">Nombre de membres</Label><Input className="h-8" type="number" min="1" value={form.nombre_membres || ""} onChange={e=>setField("nombre_membres",e.target.value)}/></div>
            <div><Label className="text-xs">Téléphone du responsable familial</Label><Input className="h-8" type="tel" value={form.responsable_legal_telephone || ""} onChange={e=>setField("responsable_legal_telephone",e.target.value)}/></div>
          </>}
          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="min-w-0"><Label className="text-xs">Naissance</Label><Input className="h-8" type="date" value={form.date_naissance || ""} onChange={e=>setField("date_naissance",e.target.value)}/></div>
            <div className="min-w-0"><Label className="text-xs">Lieu de naissance</Label><Input className="h-8" value={form.lieu_naissance || ""} onChange={e=>setField("lieu_naissance",e.target.value)}/></div>
            <div className="min-w-0"><CountryNationalitySelect value={form.nationalite} onChange={v=>setField("nationalite",v)} compact /></div>
            <div className="min-w-0"><Label className="text-xs">Situation matrimoniale</Label><Select value={form.statut_marital || ""} onValueChange={v=>setField("statut_marital",v)}><SelectTrigger className="h-8"><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("statut_marital").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Coordonnées et résidence</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 px-4 pb-3 pt-0">
          <div className="space-y-1"><CountryPhoneInput compact label="Téléphone principal" required countryCode={form.telephone_indicatif || undefined} localValue={form.telephone_local || form.telephone || ""} onChange={v=>{setField("telephone_indicatif",v.callingCode);setField("telephone_local",v.localValue);setField("telephone",v.internationalValue)}}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!form.telephone_principal_whatsapp} onCheckedChange={v=>{setField("telephone_principal_whatsapp",v===true);if(v===true)setField("telephone_secondaire_whatsapp",false);}}/>Ce numéro utilise WhatsApp</label></div>
          <div className="space-y-1"><CountryPhoneInput compact label="Téléphone secondaire" countryCode={form.telephone_secondaire_indicatif || undefined} localValue={form.telephone_secondaire_local || form.telephone_secondaire || ""} onChange={v=>{setField("telephone_secondaire_indicatif",v.callingCode);setField("telephone_secondaire_local",v.localValue);setField("telephone_secondaire",v.internationalValue)}}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!form.telephone_secondaire_whatsapp} onCheckedChange={v=>{setField("telephone_secondaire_whatsapp",v===true);if(v===true)setField("telephone_principal_whatsapp",false);}}/>Ce numéro utilise WhatsApp</label></div>
          <div><Label className="text-xs">Email</Label><Input className="h-8" type="email" value={form.email || ""} onChange={e=>setField("email",e.target.value)}/></div>
          <div className="md:col-span-2 min-w-0"><GeographieCascade className="grid grid-cols-1 md:grid-cols-3 gap-2" districtId={form.district_id} regionId={form.region_id} departementId={form.departement_id} sousPrefectureId={form.sous_prefecture_id} villageId={form.village_id} required extraField={<div className="space-y-1 min-w-0"><Label className="text-xs">Lieu de résidence</Label><Input className="h-8" value={form.domicile_residence || form.domicile || ""} onChange={e=>{setField("domicile_residence",e.target.value);setField("domicile",e.target.value);}} /></div>} onChange={(g)=>setForm((x:any)=>({...x,...(Object.prototype.hasOwnProperty.call(g,"districtId")?{district_id:g.districtId||null}:{}),...(Object.prototype.hasOwnProperty.call(g,"regionId")?{region_id:g.regionId||null}:{}),...(Object.prototype.hasOwnProperty.call(g,"departementId")?{departement_id:g.departementId||null}:{}),...(Object.prototype.hasOwnProperty.call(g,"sousPrefectureId")?{sous_prefecture_id:g.sousPrefectureId||null}:{}),...(Object.prototype.hasOwnProperty.call(g,"villageId")?{village_id:g.villageId||null}:{}),...(Object.prototype.hasOwnProperty.call(g,"villageName")?{localite:g.villageName??x.localite??""}:{})}))}/></div>
          <div className="md:col-span-2 rounded-md border p-3 space-y-2">
            <p className="text-xs font-semibold">Coordonnées GPS du site client</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label className="text-xs">Latitude</Label><Input className="h-8" type="number" step="any" value={form.latitude ?? ""} onChange={e=>setField("latitude",e.target.value === "" ? null : Number(e.target.value))} placeholder="Ex. -6.2107333" /></div>
              <div><Label className="text-xs">Longitude</Label><Input className="h-8" type="number" step="any" value={form.longitude ?? ""} onChange={e=>setField("longitude",e.target.value === "" ? null : Number(e.target.value))} placeholder="Ex. 6.925555" /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Ces coordonnées alimentent la carte des plantations et sont disponibles dans les données de l’espace client.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Pièce d’identité</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-2 px-4 pb-3 pt-0">
          <div><Label className="text-xs">Type de pièce</Label><PieceTypeSelect compact value={form.type_piece||""} onChange={v=>setField("type_piece",v)}/></div>
          <div><Label className="text-xs">Numéro de pièce</Label><Input className="h-8" value={form.numero_piece || ""} onChange={e=>setField("numero_piece",e.target.value)}/></div>
          <div><Label className="text-xs">Date de délivrance</Label><Input className="h-8" type="date" value={form.date_delivrance_piece || ""} onChange={e=>setField("date_delivrance_piece",e.target.value)}/></div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Offre et parcours</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-4 pb-3 pt-0">
          <div className="grid md:grid-cols-3 gap-2">
            <div><Label className="text-xs">Type de dossier</Label><Input className="h-8" value={isBeneficiary ? "Bénéficiaire particulier" : "Client officiel"} disabled /></div>
            <div><Label className="text-xs">Offre enregistrée</Label><Input className="h-8" value={offer?.nom || "Offre personnalisée"} disabled readOnly /></div>
            <div><Label className="text-xs">Formule contractuelle</Label><Input className="h-8" value={selectedFormula?.nom || form.formule_nom || form.formule_code || "Personnalisée"} disabled readOnly /></div>
          </div>
          {effectiveOffer && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{effectiveOffer.nom}{selectedFormula?.nom ? ` — ${selectedFormula.nom}` : ""}</p>
                  <p className="text-xs text-muted-foreground">Conditions enregistrées à la souscription · valeurs historiques par hectare</p>
                </div>
                <Badge variant="outline">Conditions figées</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="rounded-md border bg-background p-2">
                  <p className="text-xs text-muted-foreground">Paiement initial</p>
                  <p className="font-semibold tabular-nums">{formatOfferAmount(effectiveOffer.montant_pi_par_ha ?? effectiveOffer.paiement_signature_par_ha)}</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <p className="text-xs text-muted-foreground">Mensualité configurée</p>
                  <p className="font-semibold tabular-nums">{formatOfferAmount(effectiveOffer.mensualite_par_ha)}</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <p className="text-xs text-muted-foreground">Coût total configuré</p>
                  <p className="font-semibold tabular-nums">{formatOfferAmount(effectiveOffer.montant_total_par_ha ?? effectiveOffer.montant_cash_par_ha)}</p>
                </div>
              </div>
              {paymentTranches.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Échéancier configuré</p>
                  {paymentTranches.map((tranche: any, index: number) => (
                    <div key={`${tranche.annee || index}-${tranche.mois_debut || 0}`} className="flex flex-wrap justify-between gap-2 border-t pt-1 text-xs">
                      <span>{["mensualite","mensualite_unique"].includes(String(tranche.type || "").toLowerCase()) ? `Mensualité · ${tranche.mois ?? (Number(tranche.mois_fin || 0) - Number(tranche.mois_debut || 1) + 1)} mois` : `An ${tranche.annee || index + 1} · mois ${tranche.mois_debut ?? "—"} à ${tranche.mois_fin ?? "—"} (${tranche.mois ?? (Number(tranche.mois_fin || 0) - Number(tranche.mois_debut || 1) + 1)} mois)`}</span>
                      <span className="font-medium tabular-nums">{formatOfferAmount(tranche.mensualite_par_ha)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune tranche annuelle n’est configurée pour cette offre/formule dans la base.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">Applicable : {effectiveOffer.type_offre === "sans_terre" ? "sans terre" : effectiveOffer.type_offre === "avec_terre" ? "avec terre" : "type non précisé"}</Badge>
                <Badge variant="outline">{effectiveOffer.necessite_foncier_client ? "Foncier client requis" : "Foncier client non requis"}</Badge>
                {effectiveOffer.necessite_cotitulaire && <Badge variant="outline">Cotitulaire requis</Badge>}
                {effectiveOffer.contrat_acquisition_requis && <Badge variant="outline">Contrat d’acquisition requis</Badge>}
                {effectiveOffer.contrat_accompagnement_requis && <Badge variant="outline">Contrat d’accompagnement requis</Badge>}
                {effectiveOffer.gestion_type && <Badge variant="outline">Gestion : {String(effectiveOffer.gestion_type)}</Badge>}
              </div>
            </div>
          )}
          {hasActivity && <div className="flex gap-2 items-start rounded-lg border p-3 text-sm"><AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground"/><span>Les conditions commerciales sont figées dans ce dossier. La modification des coordonnées, de l’identité ou des documents ne change ni le tarif contractuel ni une promotion passée ou en cours.</span></div>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Photos et pièces d’identité</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 px-4 pb-3 pt-0">
          <div className="min-w-0"><Label className="text-xs">Photo profil</Label>{fileUpload("Photo profil","photo_profil",photoFile,form.photo_profil_url,photoPreview,setPhotoFile,setPhotoPreview)}</div>
          <div className="min-w-0"><Label className="text-xs">Pièce recto</Label>{fileUpload("Pièce recto","piece_recto",pieceRectoFile,form.fichier_piece_recto_url,pieceRectoPreview,setPieceRectoFile,setPieceRectoPreview,true)}</div>
          <div className="min-w-0"><Label className="text-xs">Pièce verso</Label>{fileUpload("Pièce verso","piece_verso",pieceVersoFile,form.fichier_piece_verso_url,pieceVersoPreview,setPieceVersoFile,setPieceVersoPreview)}</div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 py-2"><CardTitle className="text-sm">Contrat du client</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-4 pb-3 pt-0">
          {contractDocument && !contractFile && <p className="text-xs text-muted-foreground">Un contrat est déjà rattaché à ce dossier. Sélectionnez un autre fichier pour le remplacer.</p>}
          <FileUploadVisual
            label="Importer le contrat (PDF ou image)"
            field="fiche_contrat"
            accept="application/pdf,image/*"
            currentFile={contractFile}
            currentPreview={contractPreview}
            existingPreview={storedContractPreview}
            onFileChange={(_, file, preview) => { setContractFile(file); setContractPreview(preview); }}
            compact
          />
        </CardContent>
      </Card>

      </fieldset>
      <div className="flex justify-end gap-3 sticky bottom-0 bg-background py-2 border-t">
        <Button type="button" variant="secondary" onClick={() => { if (readOnly) { setForm({ ...(client || {}) }); setIsEditing(false); setPhotoFile(null); setPieceRectoFile(null); setPieceVersoFile(null); } else onCancel(); }}>{isEditing ? "Annuler" : "Retour"}</Button>
        {isEditing && canEditClient && <Button type="button" onClick={onSubmit} disabled={loading}>{loading ? "Enregistrement..." : "Enregistrer les modifications"}</Button>}
      </div>
    </div>
  );
};

export default ClientForm;
