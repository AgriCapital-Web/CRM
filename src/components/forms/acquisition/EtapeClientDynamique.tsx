import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import GeographieCascade from "@/components/common/GeographieCascade";
import { FileUploadVisual } from "@/components/ui/file-upload-visual";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import CountryNationalitySelect from "@/components/common/CountryNationalitySelect";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { EtapeDocumentsContratsDynamiques } from "@/components/forms/acquisition/EtapeDocumentsContratsDynamiques";

interface Props{formData:any;updateFormData:(data:any)=>void;}

const upperName=(value:string)=>value.toLocaleUpperCase("fr-FR");

export const EtapeClientDynamique=({formData,updateFormData}:Props)=>{
 const { byCategory: refs } = useSystemReferences(["statut_marital"]);

 const file=(field:string,label:string,accept=".pdf,image/*",ocr=false)=><FileUploadVisual label={label} field={field} accept={accept} required currentFile={formData[field+"_file"]||null} currentPreview={formData[field+"_preview"]||""} onFileChange={(f,value,preview)=>updateFormData({[field+"_file"]:value,[field+"_preview"]:preview})} onIdentityNumberDetected={ocr?n=>updateFormData({numero_piece:n}):undefined} identityDocumentType={formData.type_piece}/>;
 const phone=(field:"telephone"|"telephone_secondaire",label:string)=> <CountryPhoneInput label={label} required={field==="telephone"} countryCode={formData[field+"_indicatif"]||undefined} localValue={formData[field+"_local"]||formData[field]||""} onChange={v=>updateFormData({[field+"_indicatif"]:v.callingCode,[field+"_local"]:v.localValue,[field]:v.internationalValue})}/>;
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle>Identité du Client</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Civilité *</Label><Select value={formData.civilite||""} onValueChange={v=>updateFormData({civilite:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent><SelectItem value="M">M.</SelectItem><SelectItem value="Mme">Mme</SelectItem><SelectItem value="Mlle">Mlle</SelectItem></SelectContent></Select></div><div><Label>Nom *</Label><Input value={formData.nom||formData.nom_famille||""} onChange={e=>updateFormData({nom:upperName(e.target.value),nom_famille:upperName(e.target.value)})}/></div><div><Label>Prénom *</Label><Input value={formData.prenoms||""} onChange={e=>updateFormData({prenoms:upperName(e.target.value)})}/></div></div>
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Date de naissance *</Label><Input type="date" value={formData.date_naissance||""} onChange={e=>updateFormData({date_naissance:e.target.value})}/></div><div><Label>Lieu de naissance *</Label><Input value={formData.lieu_naissance||""} onChange={e=>updateFormData({lieu_naissance:e.target.value})}/></div><CountryNationalitySelect label="Nationalité" required value={formData.nationalite} onChange={v=>updateFormData({nationalite:v})} /></div>
   <div><Label>Situation matrimoniale</Label><Select value={formData.statut_marital||""} onValueChange={v=>updateFormData({statut_marital:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("statut_marital").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
  </CardContent></Card>


  <Card><CardHeader><CardTitle>Coordonnées et résidence</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-2 gap-4">
    <div className="space-y-1">{phone("telephone","Téléphone principal *")}<label className="flex items-center gap-2 text-xs"><Checkbox checked={!!formData.telephone_principal_whatsapp} onCheckedChange={v=>updateFormData({telephone_principal_whatsapp:v===true,telephone_secondaire_whatsapp:v===true?false:!!formData.telephone_secondaire_whatsapp})}/>Ce numéro utilise WhatsApp</label></div>
    <div className="space-y-1">{phone("telephone_secondaire","Téléphone secondaire")}<label className="flex items-center gap-2 text-xs"><Checkbox checked={!!formData.telephone_secondaire_whatsapp} onCheckedChange={v=>updateFormData({telephone_secondaire_whatsapp:v===true,telephone_principal_whatsapp:v===true?false:!!formData.telephone_principal_whatsapp})}/>Ce numéro utilise WhatsApp</label></div>
   </div>
   <div><Label>Email</Label><Input type="email" value={formData.email||""} onChange={e=>updateFormData({email:e.target.value})}/></div>
   <GeographieCascade districtId={formData.district_id} regionId={formData.region_id} departementId={formData.departement_id} sousPrefectureId={formData.sous_prefecture_id} villageId={formData.village_id} required onChange={(g)=>updateFormData({district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||""})}/>
   <div><Label>Lieu de résidence *</Label><Input value={formData.domicile||""} onChange={e=>updateFormData({domicile:e.target.value})} placeholder="Quartier, campement, rue ou commune"/></div>
  </CardContent></Card>
 </div>;
};