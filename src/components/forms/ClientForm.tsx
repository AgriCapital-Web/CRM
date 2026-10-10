import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { offlineUpdate } from "@/lib/offlineWrite";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface ClientFormProps { client?: any; onSuccess: () => void; onCancel: () => void; }

const upperName=(value:string)=>value.toLocaleUpperCase("fr-FR");

const CLIENT_COLUMNS = new Set([
  "civilite","nom_famille","prenoms","nom_complet","nom","date_naissance","lieu_naissance","statut_marital",
  "type_piece","numero_piece","date_delivrance_piece","telephone","whatsapp","email","domicile","domicile_residence",
  "district_id","region_id","departement_id","sous_prefecture_id","village_id","offre_id","famille_offre","formule_code","formule_nom","parcours_code","commercial_id","type_compte","banque_operateur",
  "numero_compte","nom_titulaire_compte","photo_profil_url","fichier_piece_url","fichier_piece_recto_url",
  "fichier_piece_verso_url","localite","nationalite","type_client","telephone_indicatif","telephone_local",
  "whatsapp_indicatif","whatsapp_local","updated_by"
]);

const ClientForm = ({ client, onSuccess, onCancel }: ClientFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<any>(() => ({ ...client }));
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pieceRectoFile, setPieceRectoFile] = useState<File | null>(null);
  const [pieceVersoFile, setPieceVersoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [pieceRectoPreview, setPieceRectoPreview] = useState("");
  const [pieceVersoPreview, setPieceVersoPreview] = useState("");
  const { byCategory: refs } = useSystemReferences(["civilite","statut_marital"]);

  const setField = (key: string, value: any) => setForm((x: any) => ({ ...x, [key]: value }));

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("offres").select("id,code,nom,famille_offre,formule_code,formule_nom,parcours_code,type_offre,necessite_foncier_client,actif").eq("actif", true).order("ordre").order("nom");
      setOffers(data || []);
    })();
  }, []);

  const offer = useMemo(() => offers.find(o => o.id === form.offre_id) || null, [offers, form.offre_id]);

  const isBeneficiary = form.type_client === "beneficiaire_particulier";
  const hasActivity = Number(form.nombre_plantations || 0) > 0 || Boolean(form.pi_paye_at || form.paiement_initial_paye_at);

  const onSubmit = async () => {
    if (!user || !client?.id) return;
    setLoading(true);
    try {
      let photo_profil_url = form.photo_profil_url || null;
      let fichier_piece_recto_url = form.fichier_piece_recto_url || null;
      let fichier_piece_verso_url = form.fichier_piece_verso_url || null;

      if (photoFile) {
        const result = await uploadFile("photos-profils", photoFile);
        if (result) photo_profil_url = result.url;
      }
      if (pieceRectoFile) {
        const result = await uploadFile("pieces-identite", pieceRectoFile);
        if (result) fichier_piece_recto_url = result.url;
      }
      if (pieceVersoFile) {
        const result = await uploadFile("pieces-identite", pieceVersoFile);
        if (result) fichier_piece_verso_url = result.url;
      }

      // IMPORTANT : seules les colonnes métier de clients sont envoyées.
      // Les relations chargées pour l'affichage ne doivent jamais être réinjectées dans UPDATE.
      const clientPayload: any = {};
      for (const key of CLIENT_COLUMNS) if (key in form) clientPayload[key] = form[key];
      clientPayload.photo_profil_url = photo_profil_url;
      clientPayload.fichier_piece_recto_url = fichier_piece_recto_url;
      clientPayload.fichier_piece_verso_url = fichier_piece_verso_url;
      clientPayload.nom_complet = form.nom_complet || [form.nom_famille || form.nom, form.prenoms].filter(Boolean).join(" ").trim();
      clientPayload.updated_by = user.id;

      const { error } = await offlineUpdate("clients", client.id, clientPayload);
      if (error) throw error;

      toast({ title: "Dossier mis à jour", description: `${clientPayload.nom_complet || "Le Client"} a été modifié avec succès.` });
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
    onSelect: (f: File) => void,
    onPreview: (s: string) => void,
    ocr = false
  ) => (
    <FileUploadVisual
      label={label}
      field={field}
      accept="image/*,.pdf"
      currentFile={file}
      currentPreview={currentPreview}
      onFileChange={(_, f, p) => { if (f) onSelect(f); onPreview(p); }}
      onIdentityNumberDetected={ocr ? n => setField("numero_piece", n) : undefined}
      identityDocumentType={form.type_piece}
    />
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Commercial</CardTitle>
          <CardDescription>Commercial ayant réalisé la vente. La recherche et la liste sont disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <CommercialCombobox
            value={form.commercial_id || null}
            onChange={(value) => setField("commercial_id", value)}
            placeholder="Rechercher ou sélectionner un commercial"
          />
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-muted-foreground">Dossier</p><p className="font-mono font-semibold">{client?.id_unique || "—"}</p></div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{isBeneficiary ? "Bénéficiaire particulier" : "Client officiel"}</Badge>
          {offer?.nom && <Badge>{offer.nom}</Badge>}

        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Identité</CardTitle><CardDescription>Informations personnelles du dossier.</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div><Label>Civilité</Label><Select value={form.civilite || ""} onValueChange={v=>setField("civilite",v)}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("civilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Nom de famille</Label><Input value={form.nom_famille || form.nom || ""} onChange={e=>{setField("nom_famille",e.target.value);setField("nom_complet",[e.target.value,form.prenoms].filter(Boolean).join(" "));}}/></div>
          <div><Label>Prénoms</Label><Input value={form.prenoms || ""} onChange={e=>{setField("prenoms",e.target.value);setField("nom_complet",[form.nom_famille || form.nom,e.target.value].filter(Boolean).join(" "));}}/></div>
          <div><Label>Date de naissance</Label><Input type="date" value={form.date_naissance || ""} onChange={e=>setField("date_naissance",e.target.value)}/></div>
          <div><Label>Lieu de naissance</Label><Input value={form.lieu_naissance || ""} onChange={e=>setField("lieu_naissance",e.target.value)}/></div>
          <CountryNationalitySelect value={form.nationalite} onChange={v=>setField("nationalite",v)} />
          <div><Label>Situation matrimoniale</Label><Select value={form.statut_marital || ""} onValueChange={v=>setField("statut_marital",v)}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("statut_marital").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Coordonnées et résidence</CardTitle><CardDescription>Coordonnées utilisées pour le dossier et le portail.</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <CountryPhoneInput label="Téléphone" required countryCode={form.telephone_indicatif||undefined} localValue={form.telephone_local||form.telephone||""} onChange={v=>{setField("telephone_indicatif",v.callingCode);setField("telephone_local",v.localValue);setField("telephone",v.internationalValue)}}/>
          <CountryPhoneInput label="WhatsApp" countryCode={form.whatsapp_indicatif||undefined} localValue={form.whatsapp_local||form.whatsapp||""} onChange={v=>{setField("whatsapp_indicatif",v.callingCode);setField("whatsapp_local",v.localValue);setField("whatsapp",v.internationalValue)}}/>
          <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={e=>setField("email",e.target.value)}/></div>
          <div><Label>Domicile / résidence</Label><Input value={form.domicile_residence || form.domicile || ""} onChange={e=>{setField("domicile_residence",e.target.value);setField("domicile",e.target.value);}}/></div>
          <div className="md:col-span-2"><Label>Localisation administrative</Label><GeographieCascade districtId={form.district_id} regionId={form.region_id} departementId={form.departement_id} sousPrefectureId={form.sous_prefecture_id} villageId={form.village_id} required onChange={(g)=>setForm((x:any)=>({...x,district_id:g.districtId||null,region_id:g.regionId||null,departement_id:g.departementId||null,sous_prefecture_id:g.sousPrefectureId||null,village_id:g.villageId||null,localite:g.villageName||x.localite||""}))}/></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pièce d’identité</CardTitle><CardDescription>Informations d’identification du Client.</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div><Label>Type de pièce</Label><PieceTypeSelect value={form.type_piece||""} onChange={v=>setField("type_piece",v)}/></div>
          <div><Label>Numéro de pièce</Label><Input value={form.numero_piece || ""} onChange={e=>setField("numero_piece",e.target.value)}/></div>
          <div><Label>Date de délivrance</Label><Input type="date" value={form.date_delivrance_piece || ""} onChange={e=>setField("date_delivrance_piece",e.target.value)}/></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Offre et parcours</CardTitle><CardDescription>L’offre détermine notamment le parcours foncier et technique. Les éléments contractuels déjà activés ne sont pas recalculés ici.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>Type de dossier</Label><Input value={isBeneficiary ? "Bénéficiaire particulier" : "Client officiel"} disabled /></div>
            <div><Label>Offre / formule</Label><Select value={form.offre_id || ""} onValueChange={v=>{if(hasActivity)return;const selected=offers.find(o=>o.id===v);if(!selected)return;setForm((x:any)=>({...x,offre_id:selected.id,famille_offre:selected.famille_offre||null,formule_code:selected.formule_code||selected.code,formule_nom:selected.formule_nom||selected.nom,parcours_code:selected.parcours_code||selected.code,type_client:selected.type_offre==="sans_terre"?"sans_terre":"avec_terre"}));}} disabled={hasActivity}><SelectTrigger><SelectValue placeholder={offer?.formule_nom || offer?.nom || "Sélectionner une offre"}/></SelectTrigger><SelectContent>{offers.map(o=><SelectItem key={o.id} value={o.id}>{o.formule_nom || o.nom}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Formule</Label><Input value={form.formule_nom || form.formule_code || "—"} disabled /></div>
          </div>
          {hasActivity && <div className="flex gap-2 items-start rounded-lg border p-3 text-sm"><AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground"/><span>L’offre est verrouillée car le dossier possède déjà une activation, un paiement initial ou une plantation. Toute modification contractuelle doit passer par le parcours contractuel.</span></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Documents d’identité</CardTitle><CardDescription>Remplacez uniquement les fichiers nécessaires.</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div><Label>Photo profil</Label>{fileUpload("Choisir une photo","photo_profil",photoFile,form.photo_profil_url,photoPreview,setPhotoFile,setPhotoPreview)}</div>
          <div><Label>Pièce recto</Label>{fileUpload("Choisir recto","piece_recto",pieceRectoFile,form.fichier_piece_recto_url,pieceRectoPreview,setPieceRectoFile,setPieceRectoPreview,true)}</div>
          <div><Label>Pièce verso</Label>{fileUpload("Choisir verso","piece_verso",pieceVersoFile,form.fichier_piece_verso_url,pieceVersoPreview,setPieceVersoFile,setPieceVersoPreview)}</div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 sticky bottom-0 bg-background py-3 border-t">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="button" onClick={onSubmit} disabled={loading}>{loading ? "Enregistrement..." : "Enregistrer les modifications"}</Button>
      </div>
    </div>
  );
};

export default ClientForm;
