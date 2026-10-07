import MediaUploadVisual from "@/components/ui/media-upload-visual";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/utils/storage";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import { ArrowLeft, FileCheck2, LandPlot, UserRound, Sprout, Upload } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import GeographieCascade from "@/components/common/GeographieCascade";

type UploadState = { file: File | null; preview: string };

const BeneficiaireParticulier = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [beneficiaire, setBeneficiaire] = useState({
    civilite: "M",
    nom_famille: "",
    prenoms: "",
    nom_complet: "",
    date_naissance: "",
    lieu_naissance: "",
    nationalite: "Ivoirienne",
    type_piece: "cni",
    numero_piece: "",
    date_delivrance_piece: "",
    telephone: "", telephone_indicatif: "+225", telephone_local: "",
    whatsapp: "", whatsapp_indicatif: "+225", whatsapp_local: "",
    email: "",
    domicile: "",
  });
  const [proprietaire, setProprietaire] = useState({
    nom: "",
    prenoms: "",
    nom_complet: "",
    telephone: "", telephone_indicatif: "+225", telephone_local: "",
    whatsapp: "", whatsapp_indicatif: "+225", whatsapp_local: "",
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

  const setFile = (field: string, file: File | null, preview: string) => {
    setFiles((prev) => ({ ...prev, [field]: { file, preview } }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!beneficiaire.nom_complet.trim() || !beneficiaire.numero_piece.trim()) {
      toast({ variant: "destructive", title: "Informations manquantes", description: "Le nom complet et le numéro de pièce sont obligatoires." });
      return;
    }
    const proprietaireNomComplet = [proprietaire.nom, proprietaire.prenoms].filter(Boolean).join(" ").trim();
    if (!proprietaire.nom.trim() || !proprietaire.prenoms.trim() || !parcelle.code_parc.trim()) {
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

      const { data, error } = await (supabase as any).rpc("register_beneficiaire_particulier", {
        p_beneficiaire: beneficiaire,
        p_proprietaire: { ...proprietaire, nom_complet: proprietaireNomComplet },
        p_parcelle: parcelle,
        p_plantation: plantation,
        p_documents: docs,
      });
      if (error) throw error;

      const ids = data as {
        client_id: string;
        proprietaire_id: string;
        parcelle_id: string;
        plantation_id: string;
      };

      for (const doc of docs) {
        const selected = files[doc.document_type]?.file;
        if (!selected) continue;
        const bucket = doc.document_type.startsWith("cni_") ? "pieces-identite" : doc.document_type === "photo_officielle" ? "photos-profils" : "documents";
        const uploaded = await uploadFile(bucket, selected, `beneficiaires/${ids.client_id}`);
        if (!uploaded) throw new Error(`Échec du stockage de ${doc.libelle}`);
        await (supabase as any)
          .from("beneficiaire_documents")
          .update({ fichier_url: uploaded.url, storage_bucket: bucket, storage_path: uploaded.path, statut: "stocke" })
          .eq("client_id", ids.client_id)
          .eq("document_type", doc.document_type);
      }

      for (const photo of remisePhotos) {
        const uploaded = await uploadFile("documents", photo, `beneficiaires/${ids.client_id}/remise-acte`);
        if (!uploaded) continue;
        await (supabase as any).from("beneficiaire_documents").insert({
          client_id: ids.client_id,
          proprietaire_id: ids.proprietaire_id,
          parcelle_id: ids.parcelle_id,
          plantation_id: ids.plantation_id,
          document_type: "photo_remise_acte",
          libelle: `Photo remise de l’acte — ${photo.name}`,
          categorie: "remise_acte",
          fichier_url: uploaded.url,
          storage_bucket: "documents",
          storage_path: uploaded.path,
          statut: "stocke",
        });
      }

      toast({
        title: "Bénéficiaire enregistré",
        description: "Le bénéficiaire, le propriétaire foncier, la parcelle et l’actif agricole ont été enregistrés.",
      });
      navigate(`/client/${ids.client_id}`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Enregistrement impossible", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredPermissionCode="beneficiaires.create">
      <MainLayout>
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={() => navigate("/clients")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Bénéficiaire particulier</h1>
  
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" /> Bénéficiaire</CardTitle>

          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Nom de famille *</Label><Input value={beneficiaire.nom_famille} onChange={e=>setBeneficiaire({...beneficiaire,nom_famille:e.target.value})}/></div>
            <div><Label>Prénoms *</Label><Input value={beneficiaire.prenoms} onChange={e=>setBeneficiaire({...beneficiaire,prenoms:e.target.value})}/></div>
            <div><Label>Nom complet *</Label><Input value={beneficiaire.nom_complet} onChange={e=>setBeneficiaire({...beneficiaire,nom_complet:e.target.value})}/></div>
            <div><Label>Date de naissance</Label><Input type="date" value={beneficiaire.date_naissance} onChange={e=>setBeneficiaire({...beneficiaire,date_naissance:e.target.value})}/></div>
            <div><Label>Lieu de naissance</Label><Input value={beneficiaire.lieu_naissance} onChange={e=>setBeneficiaire({...beneficiaire,lieu_naissance:e.target.value})}/></div>
            <div><Label>Nationalité</Label><Input value={beneficiaire.nationalite} onChange={e=>setBeneficiaire({...beneficiaire,nationalite:e.target.value})}/></div>
            <div><Label>Type de pièce *</Label><PieceTypeSelect value={beneficiaire.type_piece} onChange={v=>setBeneficiaire({...beneficiaire,type_piece:v})}/></div><div><Label>N° CNI / pièce *</Label><Input value={beneficiaire.numero_piece} onChange={e=>setBeneficiaire({...beneficiaire,numero_piece:e.target.value})}/></div>
            <div><Label>Date d’émission</Label><Input type="date" value={beneficiaire.date_delivrance_piece} onChange={e=>setBeneficiaire({...beneficiaire,date_delivrance_piece:e.target.value})}/></div>
            <CountryPhoneInput label="Téléphone" countryCode={beneficiaire.telephone_indicatif||"+225"} localValue={beneficiaire.telephone_local||""} onChange={v=>setBeneficiaire(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/>
            <CountryPhoneInput label="WhatsApp" countryCode={beneficiaire.whatsapp_indicatif||"+225"} localValue={beneficiaire.whatsapp_local||""} onChange={v=>setBeneficiaire(x=>({...x,whatsapp_indicatif:v.callingCode,whatsapp_local:v.localValue,whatsapp:v.internationalValue}))}/>
            <div className="md:col-span-2"><Label>Adresse</Label><Input value={beneficiaire.domicile} onChange={e=>setBeneficiaire({...beneficiaire,domicile:e.target.value})}/></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><LandPlot className="h-5 w-5" /> Propriétaire foncier</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div><Label>Nom</Label><Input value={proprietaire.nom} onChange={e=>setProprietaire({...proprietaire,nom:e.target.value})}/></div>
            <div><Label>Prénoms</Label><Input value={proprietaire.prenoms} onChange={e=>setProprietaire({...proprietaire,prenoms:e.target.value})}/></div>
            <CountryPhoneInput label="Téléphone du propriétaire" countryCode={proprietaire.telephone_indicatif||"+225"} localValue={proprietaire.telephone_local||""} onChange={v=>setProprietaire(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/>
            <div className="md:col-span-3"><Label>Localisation administrative</Label><GeographieCascade districtId={proprietaire.district_id} regionId={proprietaire.region_id} departementId={proprietaire.departement_id} sousPrefectureId={proprietaire.sous_prefecture_id} villageId={proprietaire.village_id} required onChange={(g)=>setProprietaire((x:any)=>({...x,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||"",village:g.villageName||""}))}/></div>
            <div><Label>Statut foncier</Label><Input value={proprietaire.statut_foncier} onChange={e=>setProprietaire({...proprietaire,statut_foncier:e.target.value})}/></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><LandPlot className="h-5 w-5" /> Parcelle</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Référence parcelle *</Label><Input value={parcelle.code_parc} onChange={e=>setParcelle({...parcelle,code_parc:e.target.value})}/></div>
            <div><Label>Superficie physique de la parcelle (ha) *</Label><Input type="number" step="0.01" min="0" value={parcelle.surface_totale_ha} onChange={e=>setParcelle({...parcelle,surface_totale_ha:e.target.value})}/></div>
            <div className="md:col-span-3"><Label>Localisation administrative</Label><GeographieCascade districtId={parcelle.district_id} regionId={parcelle.region_id} departementId={parcelle.departement_id} sousPrefectureId={parcelle.sous_prefecture_id} villageId={parcelle.village_id} required onChange={(g)=>{const next={...parcelle,district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||"",village:g.villageName||""};setParcelle(next);setProprietaire((x:any)=>({...x,district_id:next.district_id,region_id:next.region_id,departement_id:next.departement_id,sous_prefecture_id:next.sous_prefecture_id,village_id:next.village_id,village:next.village}));}}/></div>
            
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
                <p className="text-xs text-muted-foreground mt-2">Plusieurs photos peuvent être ajoutées. Les photos du propriétaire et de la parcelle pourront être ajoutées plus tard.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={()=>navigate("/clients")}>Annuler</Button>
          <Button type="submit" disabled={loading}>
            <Upload className="h-4 w-4 mr-2" />{loading ? "Enregistrement..." : "Enregistrer le bénéficiaire et les rattachements"}
          </Button>
        </div>
      </form>
    </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default BeneficiaireParticulier;
