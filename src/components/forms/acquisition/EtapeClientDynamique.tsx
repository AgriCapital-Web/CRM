import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import GeographieCascade from "@/components/common/GeographieCascade";
import { FileUploadVisual } from "@/components/ui/file-upload-visual";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import { useSystemReferences } from "@/hooks/useSystemReferences";

interface Props{formData:any;updateFormData:(data:any)=>void;}

const upperName=(value:string)=>value.toLocaleUpperCase("fr-FR");

export const EtapeClientDynamique=({formData,updateFormData}:Props)=>{
 const { byCategory: refs } = useSystemReferences(["civilite","statut_marital"]);

 const file=(field:string,label:string,accept=".pdf,image/jpeg,image/png",ocr=false)=><FileUploadVisual label={label} field={field} accept={accept} required currentFile={formData[field+"_file"]||null} currentPreview={formData[field+"_preview"]||""} onFileChange={(f,value,preview)=>updateFormData({[field+"_file"]:value,[field+"_preview"]:preview})} onIdentityNumberDetected={ocr?n=>updateFormData({numero_piece:n}):undefined} identityDocumentType={formData.type_piece}/>;
 const phone=(field:"telephone"|"whatsapp",label:string)=> <CountryPhoneInput label={label} required={field==="telephone"} countryCode={formData[field+"_indicatif"]||undefined} localValue={formData[field+"_local"]||""} onChange={v=>updateFormData({[field+"_indicatif"]:v.callingCode,[field+"_local"]:v.localValue,[field]:v.internationalValue})}/>;
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle>Identité du Client</CardTitle><CardDescription>Informations utilisées dans le dossier et les documents contractuels.</CardDescription></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Civilité *</Label><Select value={formData.civilite||""} onValueChange={v=>updateFormData({civilite:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("civilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>Nom de famille *</Label><Input value={formData.nom_famille||""} onChange={e=>updateFormData({nom_famille:upperName(e.target.value)})}/></div><div><Label>Prénoms *</Label><Input value={formData.prenoms||""} onChange={e=>updateFormData({prenoms:upperName(e.target.value)})}/></div></div>
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Date de naissance *</Label><Input type="date" value={formData.date_naissance||""} onChange={e=>updateFormData({date_naissance:e.target.value})}/></div><div><Label>Lieu de naissance *</Label><Input value={formData.lieu_naissance||""} onChange={e=>updateFormData({lieu_naissance:e.target.value})}/></div><div><Label>Nationalité *</Label><Input value={formData.nationalite||""} onChange={e=>updateFormData({nationalite:e.target.value})} placeholder="Ivoirienne"/></div></div>
   <div><Label>Situation matrimoniale</Label><Select value={formData.statut_marital||""} onValueChange={v=>updateFormData({statut_marital:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("statut_marital").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
  </CardContent></Card>

  <Card><CardHeader><CardTitle>Pièce d’identité et photos</CardTitle><CardDescription>La pièce recto/verso et la photo du Client font partie du dossier.</CardDescription></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Type de pièce *</Label><PieceTypeSelect value={formData.type_piece||""} onChange={v=>updateFormData({type_piece:v})}/></div><div><Label>Numéro de pièce *</Label><Input value={formData.numero_piece||""} onChange={e=>updateFormData({numero_piece:e.target.value})}/></div><div><Label>Date de délivrance</Label><Input type="date" value={formData.date_delivrance_piece||""} onChange={e=>updateFormData({date_delivrance_piece:e.target.value})}/></div></div>
   <div className="grid md:grid-cols-2 gap-4">{file("photo_piece_recto","Pièce d’identité — recto *",".pdf,image/jpeg,image/png",true)}{file("photo_piece_verso","Pièce d’identité — verso *")}</div>{file("photo_profil","Photo du Client *","image/*")}
  </CardContent></Card>

  <Card><CardHeader><CardTitle>Coordonnées et résidence</CardTitle><CardDescription>Téléphone avec indicatif international, WhatsApp, adresse et localisation administrative.</CardDescription></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-2 gap-4">{phone("telephone","Téléphone *")}{phone("whatsapp","WhatsApp")}</div>
   <div><Label>Email</Label><Input type="email" value={formData.email||""} onChange={e=>updateFormData({email:e.target.value})}/></div>
   <div><Label>Adresse complète *</Label><Input value={formData.domicile||""} onChange={e=>updateFormData({domicile:e.target.value})} placeholder="Quartier, rue, commune, ville"/></div>
   <GeographieCascade districtId={formData.district_id} regionId={formData.region_id} departementId={formData.departement_id} sousPrefectureId={formData.sous_prefecture_id} villageId={formData.village_id} required onChange={(g)=>updateFormData({district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||""})}/>
  </CardContent></Card>
 </div>;
};