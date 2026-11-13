import MediaUploadVisual from "@/components/ui/media-upload-visual";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, resolveStorageUrl } from "@/utils/storage";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import CountryNationalitySelect from "@/components/common/CountryNationalitySelect";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import { ArrowLeft, FileCheck2, LandPlot, UserRound, Sprout, Upload } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import GeographieCascade from "@/components/common/GeographieCascade";

type UploadState = { file: File | null; preview: string };

const BeneficiaireParticulier = () => {
  const navigate = useNavigate();
  const { id: recordId } = useParams();
  const isEditing = Boolean(recordId);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(Boolean(recordId));
  const [existingIds, setExistingIds] = useState<{client_id:string;proprietaire_id:string|null;parcelle_id:string|null;plantation_id:string|null}>({client_id:recordId||"",proprietaire_id:null,parcelle_id:null,plantation_id:null});
  const initialFullName = searchParams.get("nom_complet") || "";
  const initialNameParts = initialFullName.trim().split(/\s+/);
  const [beneficiaire, setBeneficiaire] = useState({
    civilite: "M",
    nom: initialNameParts[0] || "",
    prenoms: initialNameParts.slice(1).join(" "),
    nom_complet: initialFullName,
    date_naissance: "", lieu_naissance: "", nationalite: "",
    type_piece: "cni", numero_piece: "", date_delivrance_piece: "",
    telephone: searchParams.get("telephone") || "", telephone_indicatif: "", telephone_local: "",
    whatsapp: searchParams.get("whatsapp") || "", whatsapp_indicatif: "", whatsapp_local: "",
    email: searchParams.get("email") || "", domicile: "",
  });
  const [proprietaire, setProprietaire] = useState({
    nom: "",
    prenoms: "",
    nom_complet: "",
    telephone: "", telephone_indicatif: "", telephone_local: "",
    whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "",
    statut_foncier: "coutumier",
    village: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village_id: "",
  });
  const [parcelle, setParcelle] = useState({
    nom: "",
    surface_totale_ha: "4",
    village: "", code_parc: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village_id: "",
  });
  const [plantation, setPlantation] = useState({
    nom: "",
    superficie_ha: "2",
    superficie_activee: "2",
    date_plantation: "",
    date_activation: "",
    statut: "en_cours",
    statut_global: "en_cours",
  });
  const [files, setFiles] = useState<Record<string, UploadState>>({
    cni_recto: { file: null, preview: "" },
    cni_verso: { file: null, preview: "" },
    photo_officielle: { file: null, preview: "" },
    acte_remise: { file: null, preview: "" },
  });
  const [remisePhotos, setRemisePhotos] = useState<File[]>([]);
  const [pendingRegistration, setPendingRegistration] = useState<{
    client_id: string; proprietaire_id: string; parcelle_id: string; plantation_id: string;
  } | null>(null);

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    setRecordLoading(true);
    void (async () => {
      try {
        const { data: client, error: clientError } = await (supabase as any).from("clients").select("*").eq("id", recordId).maybeSingle();
        if (clientError) throw clientError;
        if (!client || !String(client.id_unique || "").startsWith("AC_B") || client.type_client !== "beneficiaire_particulier") {
          throw new Error("Cette référence n’est pas un dossier bénéficiaire AC_B.");
        }
        const { data: plantationRow, error: plantationError } = await (supabase as any).from("plantations").select("*").eq("client_id", client.id).eq("role_attribution", "beneficiaire_particulier").order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (plantationError) throw plantationError;
        if (!plantationRow) throw new Error("La plantation du bénéficiaire n’a pas été retrouvée.");
        const { data: parcel, error: parcelError } = plantationRow.parcelle_id
          ? await (supabase as any).from("parcelles").select("*").eq("id", plantationRow.parcelle_id).maybeSingle()
          : { data: null, error: null };
        if (parcelError) throw parcelError;
        const { data: owner, error: ownerError } = parcel?.proprietaire_id
          ? await (supabase as any).from("proprietaires_terres").select("*").eq("id", parcel.proprietaire_id).maybeSingle()
          : { data: null, error: null };
        if (ownerError) throw ownerError;
        const { data: documents, error: documentsError } = await (supabase as any).from("beneficiaire_documents").select("*").eq("client_id", client.id);
        if (documentsError) throw documentsError;
        if (!active) return;
        setExistingIds({ client_id: client.id, proprietaire_id: owner?.id || null, parcelle_id: parcel?.id || null, plantation_id: plantationRow.id });
        setBeneficiaire({
          civilite: client.civilite || "M", nom: client.nom || "", prenoms: client.prenoms || "", nom_complet: client.nom_complet || "",
          date_naissance: client.date_naissance || "", lieu_naissance: client.lieu_naissance || "", nationalite: client.nationalite || "",
          type_piece: client.type_piece || "cni", numero_piece: client.numero_piece || "", date_delivrance_piece: client.date_delivrance_piece || "",
          telephone: client.telephone || "", telephone_indicatif: client.telephone_indicatif || "", telephone_local: client.telephone_local || "",
          whatsapp: client.whatsapp || "", whatsapp_indicatif: client.whatsapp_indicatif || "", whatsapp_local: client.whatsapp_local || "",
          email: client.email || "", domicile: client.domicile || client.domicile_residence || "",
        });
        setProprietaire({
          nom: owner?.nom || "", prenoms: owner?.prenoms || "", nom_complet: owner?.nom_complet || "",
          telephone: owner?.telephone || "", telephone_indicatif: "", telephone_local: "", whatsapp: owner?.whatsapp || "", whatsapp_indicatif: "", whatsapp_local: "",
          statut_foncier: owner?.statut_foncier || "coutumier", village: owner?.village || parcel?.village || "",
          district_id: owner?.district_id || parcel?.district_id || "", region_id: owner?.region_id || parcel?.region_id || "",
          departement_id: owner?.departement_id || parcel?.departement_id || "", sous_prefecture_id: owner?.sous_prefecture_id || parcel?.sous_prefecture_id || "", village_id: parcel?.village_id || "",
        });
        setParcelle({
          nom: parcel?.nom || "", surface_totale_ha: String(parcel?.surface_totale_ha ?? ""), village: parcel?.village || "", code_parc: parcel?.code_parc || "",
          district_id: parcel?.district_id || "", region_id: parcel?.region_id || "", departement_id: parcel?.departement_id || "",
          sous_prefecture_id: parcel?.sous_prefecture_id || "", village_id: parcel?.village_id || "",
        });
        setPlantation({
          nom: plantationRow.nom_plantation || plantationRow.nom || "", superficie_ha: String(plantationRow.superficie_ha ?? client.total_hectares ?? "2"),
          superficie_activee: String(plantationRow.superficie_activee ?? ""), date_plantation: plantationRow.date_plantation || "",
          date_activation: plantationRow.date_activation || "", statut: plantationRow.statut || "en_cours", statut_global: plantationRow.statut_global || "en_cours",
        });
        const fileMap: Record<string,string> = { cni_recto: "cni_recto", cni_verso: "cni_verso", photo_officielle: "photo_officielle", acte_remise: "acte_remise" };
        const nextFiles: Record<string,UploadState> = { cni_recto:{file:null,preview:""}, cni_verso:{file:null,preview:""}, photo_officielle:{file:null,preview:""}, acte_remise:{file:null,preview:""} };
        for (const doc of documents || []) {
          const key = fileMap[doc.document_type];
          if (!key || !doc.fichier_url) continue;
          const preview = await resolveStorageUrl(doc.storage_bucket || "documents", doc.storage_path || doc.fichier_url);
          if (preview) nextFiles[key] = { file: null, preview };
        }
        if (active) setFiles(nextFiles);
      } catch (error: any) {
        if (active) {
          toast({ variant: "destructive", title: "Fiche bénéficiaire indisponible", description: getSafeErrorMessage(error) });
          navigate("/acquisitions", { replace: true });
        }
      } finally {
        if (active) setRecordLoading(false);
      }
    })();
    return () => { active = false; };
  }, [recordId, navigate, toast]);

  const setFile = (field: string, file: File | null, preview: string) => {
    setFiles((prev) => ({ ...prev, [field]: { file, preview } }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const beneficiaireNomComplet = [beneficiaire.nom, beneficiaire.prenoms].map((v: string) => String(v || "").trim()).filter(Boolean).join(" ");
    if (!beneficiaireNomComplet || !beneficiaire.numero_piece.trim()) {
      toast({ variant: "destructive", title: "Informations manquantes", description: "Le nom, le prénom et le numéro de pièce sont obligatoires." });
      return;
    }
    const proprietaireNomComplet = [proprietaire.nom, proprietaire.prenoms].filter(Boolean).join(" ").trim();
    if (!isEditing && (!proprietaire.nom.trim() || !proprietaire.prenoms.trim() || !parcelle.code_parc.trim())) {
      toast({ variant: "destructive", title: "Rattachement incomplet", description: "Le nom, les prénoms du propriétaire foncier et la référence de parcelle sont obligatoires." });
      return;
    }

    setLoading(true);
    try {
      const docs = [
        { document_type: "cni_recto", libelle: "CNI — recto", categorie: "beneficiaire" },
        { document_type: "cni_verso", libelle: "CNI — verso", categorie: "beneficiaire" },
        { document_type: "photo_officielle", libelle: "Photo officielle du bénéficiaire", categorie: "beneficiaire" },
        { document_type: "acte_remise", libelle: "Acte de remise d’actif agricole", categorie: "acte" },
      ];

      if (recordId) {
        const { error: updateError } = await (supabase as any).rpc("update_beneficiaire_particulier", {
          p_client_id: recordId,
          p_beneficiaire: { ...beneficiaire, nom_complet: beneficiaireNomComplet },
          p_superficie_ha: Number(plantation.superficie_ha),
        });
        if (updateError) throw updateError;
        for (const doc of docs) {
          const selected = files[doc.document_type]?.file;
          if (!selected) continue;
          const bucket = doc.document_type.startsWith("cni_") ? "pieces-identite" : doc.document_type === "photo_officielle" ? "photos-profils" : "documents";
          const uploaded = await uploadFile(bucket, selected, `beneficiaires/${recordId}`);
          if (!uploaded) throw new Error(`Échec du stockage de ${doc.libelle}`);
          const { error: documentSaveError } = await (supabase as any).rpc("save_beneficiaire_document", {
            p_client_id: recordId, p_document_type: doc.document_type, p_libelle: doc.libelle, p_categorie: doc.categorie,
            p_fichier_url: uploaded.path, p_storage_bucket: bucket, p_storage_path: uploaded.path,
            p_proprietaire_id: existingIds.proprietaire_id, p_parcelle_id: existingIds.parcelle_id, p_plantation_id: existingIds.plantation_id,
          });
          if (documentSaveError) throw documentSaveError;
        }
        for (const [photoIndex, photo] of remisePhotos.entries()) {
          const uploaded = await uploadFile("documents", photo, `beneficiaires/${recordId}/remise-acte`);
          if (!uploaded) throw new Error(`Échec du stockage de la photo de remise ${photo.name}`);
          const libelle = `Photo remise de l’acte ${photoIndex + 1} — ${photo.name}`;
          const { error: photoError } = await (supabase as any).rpc("save_beneficiaire_document", {
            p_client_id: recordId, p_document_type: "photo_remise_acte", p_libelle: libelle, p_categorie: "remise_acte",
            p_fichier_url: uploaded.path, p_storage_bucket: "documents", p_storage_path: uploaded.path,
            p_proprietaire_id: existingIds.proprietaire_id, p_parcelle_id: existingIds.parcelle_id, p_plantation_id: existingIds.plantation_id,
          });
          if (photoError) throw photoError;
        }
        toast({ title: "Fiche bénéficiaire mise à jour", description: "Les informations et la superficie de la plantation ont été enregistrées." });
        navigate("/acquisitions");
        return;
      }

      let ids = pendingRegistration;
      if (!ids) {
        const { data, error } = await (supabase as any).rpc("register_beneficiaire_particulier", {
          p_beneficiaire: { ...beneficiaire, nom_complet: beneficiaireNomComplet },
          p_proprietaire: { ...proprietaire, nom_complet: proprietaireNomComplet },
          p_parcelle: parcelle,
          p_plantation: plantation,
          p_documents: docs,
        });
        if (error) throw error;
        const createdIds = data as {
          client_id: string;
          proprietaire_id: string;
          parcelle_id: string;
          plantation_id: string;
        };
        if (!createdIds?.client_id || !createdIds?.proprietaire_id || !createdIds?.parcelle_id || !createdIds?.plantation_id) {
          throw new Error("La base de données n’a pas retourné tous les identifiants du dossier créé.");
        }
        ids = createdIds;
        setPendingRegistration(createdIds);
      }

      for (const doc of docs) {
        const selected = files[doc.document_type]?.file;
        if (!selected) continue;
        const bucket = doc.document_type.startsWith("cni_") ? "pieces-identite" : doc.document_type === "photo_officielle" ? "photos-profils" : "documents";
        const uploaded = await uploadFile(bucket, selected, `beneficiaires/${ids.client_id}`);
        if (!uploaded) throw new Error(`Échec du stockage de ${doc.libelle}`);
        const { data: updatedDocument, error: documentUpdateError } = await (supabase as any)
          .from("beneficiaire_documents")
          .update({ fichier_url: uploaded.path, storage_bucket: bucket, storage_path: uploaded.path, statut: "stocke" })
          .eq("client_id", ids.client_id)
          .eq("document_type", doc.document_type)
          .select("id")
          .maybeSingle();
        if (documentUpdateError) throw documentUpdateError;
        if (!updatedDocument) throw new Error(`Le document « ${doc.libelle} » n'a pas été rattaché à la base de données.`);
      }

      for (const [photoIndex, photo] of remisePhotos.entries()) {
        const uploaded = await uploadFile("documents", photo, `beneficiaires/${ids.client_id}/remise-acte`);
        if (!uploaded) throw new Error(`Échec du stockage de la photo de remise ${photo.name}`);
        // Une reprise après erreur réutilise la ligne du même fichier au même rang
        // au lieu d'ajouter une deuxième pièce au dossier.
        const libelle = `Photo remise de l’acte ${photoIndex + 1} — ${photo.name}`;
        const { data: existingPhoto, error: existingPhotoError } = await (supabase as any)
          .from("beneficiaire_documents").select("id").eq("client_id", ids.client_id)
          .eq("document_type", "photo_remise_acte").eq("libelle", libelle).maybeSingle();
        if (existingPhotoError) throw existingPhotoError;
        const photoPayload = {
          client_id: ids.client_id,
          proprietaire_id: ids.proprietaire_id,
          parcelle_id: ids.parcelle_id,
          plantation_id: ids.plantation_id,
          document_type: "photo_remise_acte",
          libelle,
          categorie: "remise_acte",
          fichier_url: uploaded.path,
          storage_bucket: "documents",
          storage_path: uploaded.path,
          statut: "stocke",
        };
        const photoQuery = existingPhoto?.id
          ? (supabase as any).from("beneficiaire_documents").update(photoPayload).eq("id", existingPhoto.id)
          : (supabase as any).from("beneficiaire_documents").insert(photoPayload);
        const { data: savedPhoto, error: documentSaveError } = await photoQuery.select("id").maybeSingle();
        if (documentSaveError) throw documentSaveError;
        if (!savedPhoto) throw new Error("La photo de remise n'a pas été rattachée à la base de données.");
      }

      toast({
        title: "Bénéficiaire enregistré",
        description: "Le bénéficiaire, le propriétaire foncier, la parcelle et l’actif agricole ont été enregistrés.",
      });
      setPendingRegistration(null);
      navigate(`/client/${ids.client_id}`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Enregistrement impossible", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredPermissionCode={isEditing ? "clients.update_private_beneficiary" : "beneficiaires.create"}>
      <MainLayout>
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {pendingRegistration && <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
        Le dossier principal a déjà été créé. La tentative précédente a échoué pendant l’enregistrement des pièces jointes. Relancez l’enregistrement pour terminer ce même dossier sans en créer un second.
      </div>}
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={() => navigate("/clients")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{isEditing ? "Fiche bénéficiaire" : "Bénéficiaire particulier"}</h1>
  
        </div>
      </div>

      {recordLoading && <div role="status" className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Chargement de la fiche bénéficiaire…</div>}
      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" /> Bénéficiaire</CardTitle>

          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Nom *</Label><Input value={beneficiaire.nom} onChange={e=>setBeneficiaire({...beneficiaire,nom:e.target.value.toLocaleUpperCase("fr-FR")})}/></div>
            <div><Label>Prénom *</Label><Input value={beneficiaire.prenoms} onChange={e=>setBeneficiaire({...beneficiaire,prenoms:e.target.value.toLocaleUpperCase("fr-FR")})}/></div>
            
            <div><Label>Date de naissance</Label><Input type="date" value={beneficiaire.date_naissance} onChange={e=>setBeneficiaire({...beneficiaire,date_naissance:e.target.value})}/></div>
            <div><Label>Lieu de naissance</Label><Input value={beneficiaire.lieu_naissance} onChange={e=>setBeneficiaire({...beneficiaire,lieu_naissance:e.target.value})}/></div>
            <CountryNationalitySelect value={beneficiaire.nationalite} onChange={v=>setBeneficiaire({...beneficiaire,nationalite:v})} />
            <div><Label>Type de pièce *</Label><PieceTypeSelect value={beneficiaire.type_piece} onChange={v=>setBeneficiaire({...beneficiaire,type_piece:v})}/></div><div><Label>N° CNI / pièce *</Label><Input value={beneficiaire.numero_piece} onChange={e=>setBeneficiaire({...beneficiaire,numero_piece:e.target.value})}/></div>
            <div><Label>Date d’émission</Label><Input type="date" value={beneficiaire.date_delivrance_piece} onChange={e=>setBeneficiaire({...beneficiaire,date_delivrance_piece:e.target.value})}/></div>
            <CountryPhoneInput label="Téléphone" countryCode={beneficiaire.telephone_indicatif||""} localValue={beneficiaire.telephone_local||""} onChange={v=>setBeneficiaire(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/>
            <CountryPhoneInput label="WhatsApp" countryCode={beneficiaire.whatsapp_indicatif||""} localValue={beneficiaire.whatsapp_local||""} onChange={v=>setBeneficiaire(x=>({...x,whatsapp_indicatif:v.callingCode,whatsapp_local:v.localValue,whatsapp:v.internationalValue}))}/>
            <div className="md:col-span-2"><Label>Adresse</Label><Input value={beneficiaire.domicile} onChange={e=>setBeneficiaire({...beneficiaire,domicile:e.target.value})}/></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><LandPlot className="h-5 w-5" /> Propriétaire foncier</CardTitle></CardHeader>
          {isEditing && <p className="px-6 text-xs text-muted-foreground">Rattachement foncier historique conservé sans modification : la localisation doit être confirmée avant toute réaffectation.</p>}
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <fieldset disabled={isEditing} className="contents">
            <div><Label>Nom</Label><Input value={proprietaire.nom} onChange={e=>setProprietaire({...proprietaire,nom:e.target.value.toLocaleUpperCase("fr-FR")})}/></div>
            <div><Label>Prénom</Label><Input value={proprietaire.prenoms} onChange={e=>setProprietaire({...proprietaire,prenoms:e.target.value.toLocaleUpperCase("fr-FR")})}/></div>
            <CountryPhoneInput label="Téléphone du propriétaire" countryCode={proprietaire.telephone_indicatif||""} localValue={proprietaire.telephone_local||""} onChange={v=>setProprietaire(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/>
            <div className="md:col-span-3"><Label>Localisation administrative</Label><GeographieCascade districtId={proprietaire.district_id} regionId={proprietaire.region_id} departementId={proprietaire.departement_id} sousPrefectureId={proprietaire.sous_prefecture_id} villageId={proprietaire.village_id} required onChange={(g)=>setProprietaire((x:any)=>({...x,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||"",village:g.villageName||""}))}/></div>
            <div><Label>Statut foncier</Label><Input value={proprietaire.statut_foncier} onChange={e=>setProprietaire({...proprietaire,statut_foncier:e.target.value})}/></div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><LandPlot className="h-5 w-5" /> Parcelle</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <fieldset disabled={isEditing} className="contents">
            <div><Label>Référence parcelle *</Label><Input value={parcelle.code_parc} onChange={e=>setParcelle({...parcelle,code_parc:e.target.value})}/></div>
            <div><Label>Superficie physique de la parcelle (ha) *</Label><Input type="number" step="0.01" min="0" value={parcelle.surface_totale_ha} onChange={e=>setParcelle({...parcelle,surface_totale_ha:e.target.value})}/></div>
            <div className="md:col-span-3"><Label>Localisation administrative</Label><GeographieCascade districtId={parcelle.district_id} regionId={parcelle.region_id} departementId={parcelle.departement_id} sousPrefectureId={parcelle.sous_prefecture_id} villageId={parcelle.village_id} required onChange={(g)=>{const next={...parcelle,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||"",village:g.villageName||""};setParcelle(next);setProprietaire((x:any)=>({...x,district_id:next.district_id,region_id:next.region_id,departement_id:next.departement_id,sous_prefecture_id:next.sous_prefecture_id,village_id:next.village_id,village:next.village}));}}/></div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Sprout className="h-5 w-5" /> Actif agricole</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Quote-part du bénéficiaire (ha)</Label><Input type="number" step="0.01" value={plantation.superficie_ha} onChange={e=>setPlantation({...plantation,superficie_ha:e.target.value})}/></div>
            <div><Label>Date de plantation / engagement</Label><Input type="date" value={plantation.date_plantation} onChange={e=>setPlantation({...plantation,date_plantation:e.target.value})}/></div>
            <div><Label>Date d’activation</Label><Input type="date" value={plantation.date_activation} onChange={e=>setPlantation({...plantation,date_activation:e.target.value})}/></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Documents disponibles</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FileUploadVisual label="CNI — recto" field="cni_recto" accept="image/jpeg,image/png" currentFile={files.cni_recto.file} currentPreview={files.cni_recto.preview} onFileChange={setFile} onIdentityNumberDetected={n=>setBeneficiaire(x=>({...x,numero_piece:n}))} identityDocumentType={beneficiaire.type_piece}/>
            <FileUploadVisual label="CNI — verso" field="cni_verso" accept="image/jpeg,image/png" currentFile={files.cni_verso.file} currentPreview={files.cni_verso.preview} onFileChange={setFile}/>
            <FileUploadVisual label="Photo officielle" field="photo_officielle" accept="image/jpeg,image/png" currentFile={files.photo_officielle.file} currentPreview={files.photo_officielle.preview} onFileChange={setFile}/>
            <FileUploadVisual label="Acte de remise" field="acte_remise" accept="application/pdf,image/jpeg,image/png" currentFile={files.acte_remise.file} currentPreview={files.acte_remise.preview} onFileChange={setFile}/>
            <div className="md:col-span-2 space-y-2">
              <Label>Photos de remise de l’acte</Label>
              <div className="border-2 border-dashed rounded-lg p-5">
                <MediaUploadVisual label="Photos de remise de l’acte" files={remisePhotos} onChange={setRemisePhotos}/>
                
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={()=>navigate("/acquisitions")}>Annuler</Button>
          <Button type="submit" disabled={loading || recordLoading}>
            <Upload className="h-4 w-4 mr-2" />{loading ? "Enregistrement..." : isEditing ? "Enregistrer les modifications" : "Enregistrer le bénéficiaire et les rattachements"}
          </Button>
        </div>
      </form>
    </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default BeneficiaireParticulier;
