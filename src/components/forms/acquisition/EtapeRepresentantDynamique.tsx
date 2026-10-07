import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUploadVisual } from "@/components/ui/file-upload-visual";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import RelationshipSelect from "@/components/common/RelationshipSelect";
import { useSystemReferences } from "@/hooks/useSystemReferences";
interface Props{formData:any;updateFormData:(data:any)=>void}

const upperName=(value:string)=>value.toLocaleUpperCase("fr-FR");

export const EtapeRepresentantDynamique=({formData,updateFormData}:Props)=>{
 const { byCategory: refs } = useSystemReferences(["representant_qualite","civilite"]);
 const active=Boolean(formData.has_representant);
 const file=(field:string,label:string,ocr=false)=><FileUploadVisual label={label} field={field} accept=".pdf,image/jpeg,image/png" required currentFile={formData[field+"_file"]||null} currentPreview={formData[field+"_preview"]||""} onFileChange={(f,v,p)=>updateFormData({[field+"_file"]:v,[field+"_preview"]:p})} onIdentityNumberDetected={ocr?n=>updateFormData({representant_numero_piece:n}):undefined} identityDocumentType={formData.representant_type_piece}/>;
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle>Cotitulaire ou mandataire</CardTitle><CardDescription>Cette personne n’est renseignée que si le Client la désigne.</CardDescription></CardHeader><CardContent><div className="flex items-center gap-2"><Checkbox id="has_representant" checked={active} onCheckedChange={v=>updateFormData({has_representant:Boolean(v),has_cotitulaire:Boolean(v)})}/><Label htmlFor="has_representant">Ajouter un cotitulaire ou un mandataire</Label></div></CardContent></Card>
  {active&&<Card><CardHeader><CardTitle>Identité du représentant</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Qualité *</Label><Select value={formData.representant_type||refs("representant_qualite")[0]?.code||""} onValueChange={v=>updateFormData({representant_type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{refs("representant_qualite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>Lien avec le Client</Label><RelationshipSelect value={formData.representant_lien||""} onChange={v=>updateFormData({representant_lien:v})}/></div><div><Label>Civilité</Label><Select value={formData.representant_civilite||""} onValueChange={v=>updateFormData({representant_civilite:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("civilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div></div>
   <div className="grid md:grid-cols-2 gap-4"><div><Label>Nom *</Label><Input value={formData.representant_nom||""} onChange={e=>updateFormData({representant_nom:upperName(e.target.value)})}/></div><div><Label>Prénoms *</Label><Input value={formData.representant_prenoms||""} onChange={e=>updateFormData({representant_prenoms:upperName(e.target.value)})}/></div></div>
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Date de naissance</Label><Input type="date" value={formData.representant_date_naissance||""} onChange={e=>updateFormData({representant_date_naissance:e.target.value})}/></div><div><Label>Lieu de naissance</Label><Input value={formData.representant_lieu_naissance||""} onChange={e=>updateFormData({representant_lieu_naissance:e.target.value})}/></div><div><Label>Nationalité</Label><Input value={formData.representant_nationalite||""} onChange={e=>updateFormData({representant_nationalite:e.target.value})}/></div></div>
  </CardContent></Card>}
  {active&&<Card><CardHeader><CardTitle>Pièce d’identité et photo</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Type de pièce *</Label><PieceTypeSelect value={formData.representant_type_piece||""} onChange={v=>updateFormData({representant_type_piece:v})}/></div><div><Label>Numéro de pièce *</Label><Input value={formData.representant_numero_piece||""} onChange={e=>updateFormData({representant_numero_piece:e.target.value})}/></div><div><Label>Date de délivrance</Label><Input type="date" value={formData.representant_date_delivrance||""} onChange={e=>updateFormData({representant_date_delivrance:e.target.value})}/></div></div>
   <div className="grid md:grid-cols-2 gap-4">{file("representant_piece_recto","Pièce d’identité — recto *",true)}{file("representant_piece_verso","Pièce d’identité — verso *")}</div>{file("representant_photo_profil","Photo du cotitulaire / mandataire *")}
  </CardContent></Card>}
  {active&&<Card><CardHeader><CardTitle>Coordonnées du représentant</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-4"><CountryPhoneInput label="Téléphone" countryCode={formData.representant_telephone_indicatif||undefined} localValue={formData.representant_telephone_local||""} onChange={v=>updateFormData({representant_telephone_indicatif:v.callingCode,representant_telephone_local:v.localValue,representant_telephone:v.internationalValue})}/><CountryPhoneInput label="WhatsApp" countryCode={formData.representant_whatsapp_indicatif||undefined} localValue={formData.representant_whatsapp_local||""} onChange={v=>updateFormData({representant_whatsapp_indicatif:v.callingCode,representant_whatsapp_local:v.localValue,representant_whatsapp:v.internationalValue})}/><div className="md:col-span-2"><Label>Adresse</Label><Input value={formData.representant_adresse||""} onChange={e=>updateFormData({representant_adresse:e.target.value})}/></div></CardContent></Card>}
 </div>
};