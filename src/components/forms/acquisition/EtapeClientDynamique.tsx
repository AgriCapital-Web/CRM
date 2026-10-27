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
 const { byCategory: refs } = useSystemReferences(["statut_marital","civilite","type_personne","nature_organisation","forme_juridique"]);

 const file=(field:string,label:string,accept=".pdf,image/*",ocr=false)=><FileUploadVisual label={label} field={field} accept={accept} required currentFile={formData[field+"_file"]||null} currentPreview={formData[field+"_preview"]||""} onFileChange={(f,value,preview)=>updateFormData({[field+"_file"]:value,[field+"_preview"]:preview})} onIdentityNumberDetected={ocr?n=>updateFormData({numero_piece:n}):undefined} identityDocumentType={formData.type_piece}/>;
 const phone=(field:"telephone"|"telephone_secondaire",label:string)=> <CountryPhoneInput label={label} required={field==="telephone"} countryCode={formData[field+"_indicatif"]||undefined} localValue={formData[field+"_local"]||formData[field]||""} onChange={v=>updateFormData({[field+"_indicatif"]:v.callingCode,[field+"_local"]:v.localValue,[field]:v.internationalValue})}/>;
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle>Identité du Client</CardTitle></CardHeader><CardContent className="space-y-4">
   <div><Label>Type de personne *</Label><Select value={formData.type_personne||"personne_physique"} onValueChange={v=>updateFormData({type_personne:v,civilite:v==="personne_physique"?formData.civilite:null})}><SelectTrigger><SelectValue placeholder="Sélectionner une catégorie"/></SelectTrigger><SelectContent>{refs("type_personne").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
   {(!formData.type_personne||formData.type_personne==="personne_physique") && <>
    <div className="grid md:grid-cols-3 gap-4"><div><Label>Civilité *</Label><Select value={formData.civilite||""} onValueChange={v=>updateFormData({civilite:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("civilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>Nom *</Label><Input value={formData.nom||formData.nom_famille||""} onChange={e=>updateFormData({nom:upperName(e.target.value),nom_famille:upperName(e.target.value)})} required/></div><div><Label>Prénom *</Label><Input value={formData.prenoms||""} onChange={e=>updateFormData({prenoms:upperName(e.target.value)})} required/></div></div>
    <div className="grid md:grid-cols-3 gap-4"><div><Label>Date de naissance *</Label><Input type="date" value={formData.date_naissance||""} onChange={e=>updateFormData({date_naissance:e.target.value})} required/></div><div><Label>Lieu de naissance *</Label><Input value={formData.lieu_naissance||""} onChange={e=>updateFormData({lieu_naissance:e.target.value})} required/></div><CountryNationalitySelect label="Nationalité" required value={formData.nationalite} onChange={v=>updateFormData({nationalite:v})} /></div>
    <div><Label>Situation matrimoniale</Label><Select value={formData.statut_marital||""} onValueChange={v=>updateFormData({statut_marital:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("statut_marital").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
   </>}
   {formData.type_personne==="personne_morale" && <>
    <div><Label>Dénomination sociale *</Label><Input value={formData.denomination_sociale||""} onChange={e=>updateFormData({denomination_sociale:e.target.value,nom_complet:e.target.value})} required/></div>
    <div className="grid md:grid-cols-2 gap-4"><div><Label>Nature de l’organisation *</Label><Select value={formData.nature_organisation_code||""} onValueChange={v=>updateFormData({nature_organisation_code:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("nature_organisation").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>Forme juridique</Label><Select value={formData.forme_juridique_code||""} onValueChange={v=>updateFormData({forme_juridique_code:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("forme_juridique").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>N° d’enregistrement</Label><Input value={formData.numero_enregistrement||""} onChange={e=>updateFormData({numero_enregistrement:e.target.value})}/></div><div><Label>Nom du responsable légal *</Label><Input value={formData.responsable_legal_nom||formData.nom||""} onChange={e=>updateFormData({responsable_legal_nom:upperName(e.target.value),nom:upperName(e.target.value)})} required/></div><div><Label>Prénom(s) du responsable légal *</Label><Input value={formData.responsable_legal_prenoms||formData.prenoms||""} onChange={e=>updateFormData({responsable_legal_prenoms:upperName(e.target.value),prenoms:upperName(e.target.value)})} required/></div><div><Label>Téléphone du responsable légal</Label><Input type="tel" value={formData.responsable_legal_telephone||""} onChange={e=>updateFormData({responsable_legal_telephone:e.target.value})}/></div></div>
   </>}
   {formData.type_personne==="famille_informelle" && <>
    <div><Label>Nom de la famille / organisation *</Label><Input value={formData.nom_famille||""} onChange={e=>updateFormData({nom_famille:upperName(e.target.value),nom_complet:upperName(e.target.value)})} required/></div>
    <div className="grid md:grid-cols-2 gap-4"><div><Label>Nombre de membres</Label><Input type="number" min="1" value={formData.nombre_membres||""} onChange={e=>updateFormData({nombre_membres:e.target.value})}/></div><div><Label>Nom du responsable familial *</Label><Input value={formData.responsable_legal_nom||formData.nom||""} onChange={e=>updateFormData({responsable_legal_nom:upperName(e.target.value),nom:upperName(e.target.value)})} required/></div><div><Label>Prénom(s) du responsable familial *</Label><Input value={formData.responsable_legal_prenoms||formData.prenoms||""} onChange={e=>updateFormData({responsable_legal_prenoms:upperName(e.target.value),prenoms:upperName(e.target.value)})} required/></div><div><Label>Téléphone du responsable familial</Label><Input type="tel" value={formData.responsable_legal_telephone||""} onChange={e=>updateFormData({responsable_legal_telephone:e.target.value})}/></div></div>
   </>}
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