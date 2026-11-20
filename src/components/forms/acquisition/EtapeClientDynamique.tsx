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
 const { byCategory: refs } = useSystemReferences(["statut_marital", "type_personne", "nature_organisation", "civilite"]);
 const typePersonne = formData.type_personne || refs("type_personne")[0]?.code || "";
 const isPhysical = typePersonne === "personne_physique";
 const isFamily = typePersonne === "famille_informelle";
 const isOrganisation = typePersonne === "personne_morale";
 const offerFamily = String(formData.offre?.famille_offre || formData.famille_offre || formData.offre_snapshot?.offer?.famille_offre || "").toUpperCase();
 const isPalmTerroir = offerFamily === "PALMTERROIR";
 const isTerraPalm = offerFamily === "TERRAPALM";
 const isPalmInvest = offerFamily === "PALMINVEST";
 const isClientLandOffer = isPalmTerroir || isTerraPalm;
 const contractContext = isPalmTerroir
   ? { title: "Contrat d’accompagnement agricole", description: "Le dossier est préparé selon l’offre PalmTerroir et son contrat d’accompagnement agricole." }
   : { title: "Contrat d’acquisition", description: "Le dossier est préparé selon l’offre d’acquisition sélectionnée : PalmInvest ou TerraPalm." };

 const file=(field:string,label:string,accept=".pdf,image/*",ocr=false)=><FileUploadVisual label={label} field={field} accept={accept} required currentFile={formData[field+"_file"]||null} currentPreview={formData[field+"_preview"]||""} onFileChange={(f,value,preview)=>updateFormData({[field+"_file"]:value,[field+"_preview"]:preview})} onIdentityNumberDetected={ocr?n=>updateFormData({numero_piece:n}):undefined} identityDocumentType={formData.type_piece}/>;
 const phone=(field:"telephone"|"telephone_secondaire",label:string)=> <CountryPhoneInput label={label} required={field==="telephone"} countryCode={formData[field+"_indicatif"]||undefined} localValue={formData[field+"_local"]||formData[field]||""} onChange={v=>updateFormData({[field+"_indicatif"]:v.callingCode,[field+"_local"]:v.localValue,[field]:v.internationalValue})}/>;
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle>{contractContext.title}</CardTitle><CardDescription>{contractContext.description}</CardDescription></CardHeader></Card>
  <Card><CardHeader><CardTitle>Type de client</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Type de personne *</Label><Select value={typePersonne} onValueChange={v=>updateFormData({type_personne:v})}><SelectTrigger><SelectValue placeholder="Sélectionner le type"/></SelectTrigger><SelectContent>{refs("type_personne").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>
  {isOrganisation && <Card><CardHeader><CardTitle>Identité de l’organisation</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Dénomination sociale *</Label><Input value={formData.denomination_sociale||""} onChange={e=>updateFormData({denomination_sociale:e.target.value.trimStart()})} placeholder="Nom officiel de l’organisation"/></div><div className="grid md:grid-cols-2 gap-4"><div><Label>Nature de l’organisation *</Label><Select value={formData.nature_organisation_code||""} onValueChange={v=>updateFormData({nature_organisation_code:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("nature_organisation").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>Forme juridique</Label><Input value={formData.forme_juridique_code||""} onChange={e=>updateFormData({forme_juridique_code:e.target.value})} placeholder="SARL, SA, GIE…"/></div></div><div><Label>Numéro d’enregistrement</Label><Input value={formData.numero_enregistrement||""} onChange={e=>updateFormData({numero_enregistrement:e.target.value})}/></div><div className="grid md:grid-cols-2 gap-4"><div><Label>Nom du responsable légal *</Label><Input value={formData.responsable_legal_nom||""} onChange={e=>updateFormData({responsable_legal_nom:upperName(e.target.value)})}/></div><div><Label>Prénoms du responsable légal *</Label><Input value={formData.responsable_legal_prenoms||""} onChange={e=>updateFormData({responsable_legal_prenoms:upperName(e.target.value)})}/></div></div><div><Label>Nombre de membres</Label><Input type="number" min="1" value={formData.nombre_membres??""} onChange={e=>updateFormData({nombre_membres:e.target.value?Number(e.target.value):null})}/></div></CardContent></Card>}
  {isFamily && <Card><CardHeader><CardTitle>Famille ou groupement informel</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Nom du groupe / de la famille *</Label><Input value={formData.denomination_sociale||formData.nom_complet||""} onChange={e=>updateFormData({denomination_sociale:e.target.value,nom_complet:e.target.value})} placeholder="Nom usuel du groupe"/></div><div className="grid md:grid-cols-2 gap-4"><div><Label>Nom du représentant principal *</Label><Input value={formData.responsable_legal_nom||""} onChange={e=>updateFormData({responsable_legal_nom:upperName(e.target.value)})}/></div><div><Label>Prénoms du représentant principal *</Label><Input value={formData.responsable_legal_prenoms||formData.prenoms||""} onChange={e=>updateFormData({responsable_legal_prenoms:upperName(e.target.value),prenoms:upperName(e.target.value)})}/></div></div><div><Label>Nombre de membres *</Label><Input type="number" min="2" value={formData.nombre_membres??""} onChange={e=>updateFormData({nombre_membres:e.target.value?Number(e.target.value):null})}/></div></CardContent></Card>}
  {isPhysical && <Card><CardHeader><CardTitle>Identité du Client</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Civilité *</Label><Select value={formData.civilite||""} onValueChange={v=>updateFormData({civilite:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("civilite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div><div><Label>Nom *</Label><Input value={formData.nom||""} onChange={e=>updateFormData({nom:upperName(e.target.value)})}/></div><div><Label>Prénom *</Label><Input value={formData.prenoms||""} onChange={e=>updateFormData({prenoms:upperName(e.target.value)})}/></div></div>
   <div className="grid md:grid-cols-3 gap-4"><div><Label>Date de naissance *</Label><Input type="date" value={formData.date_naissance||""} onChange={e=>updateFormData({date_naissance:e.target.value})}/></div><div><Label>Lieu de naissance *</Label><Input value={formData.lieu_naissance||""} onChange={e=>updateFormData({lieu_naissance:e.target.value})}/></div><CountryNationalitySelect label="Nationalité" required value={formData.nationalite} onChange={v=>updateFormData({nationalite:v})} /></div>
   <div><Label>Situation matrimoniale *</Label><Select value={formData.statut_marital||""} onValueChange={v=>updateFormData({statut_marital:v})}><SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{refs("statut_marital").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>
  </CardContent></Card>}


  <Card><CardHeader><CardTitle>Coordonnées et résidence</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid md:grid-cols-2 gap-4">
    <div className="space-y-1">{phone("telephone","Téléphone principal *")}<label className="flex items-center gap-2 text-xs"><Checkbox checked={!!formData.telephone_principal_whatsapp} onCheckedChange={v=>updateFormData({telephone_principal_whatsapp:v===true,telephone_secondaire_whatsapp:v===true?false:!!formData.telephone_secondaire_whatsapp})}/>Dispose d'un compte WhatsApp !</label></div>
    <div className="space-y-1">{phone("telephone_secondaire","Téléphone secondaire")}<label className="flex items-center gap-2 text-xs"><Checkbox checked={!!formData.telephone_secondaire_whatsapp} onCheckedChange={v=>updateFormData({telephone_secondaire_whatsapp:v===true,telephone_principal_whatsapp:v===true?false:!!formData.telephone_principal_whatsapp})}/>Dispose d'un compte WhatsApp !</label></div>
   </div>
   <div><Label>Email</Label><Input type="email" value={formData.email||""} onChange={e=>updateFormData({email:e.target.value})}/></div>
   <GeographieCascade districtId={formData.district_id} regionId={formData.region_id} departementId={formData.departement_id} sousPrefectureId={formData.sous_prefecture_id} villageId={formData.village_id} required onChange={(g)=>updateFormData({district_id:g.districtId||"",region_id:g.regionId||"",departement_id:g.departementId||"",sous_prefecture_id:g.sousPrefectureId||"",village_id:g.villageId||""})}/>
   <div><Label>Adresse complète *</Label><Input value={formData.domicile||""} onChange={e=>updateFormData({domicile:e.target.value})} placeholder="Quartier, rue, campement, commune, ville et pays"/></div>
  </CardContent></Card>
  {(isClientLandOffer || isPalmInvest) && <Card>
    <CardHeader>
      <CardTitle>{isPalmTerroir ? "Parcelle objet de l’accompagnement" : isTerraPalm ? "Parcelle objet de l’acquisition" : "Foncier du programme PalmInvest"}</CardTitle>
      <CardDescription>
        {isPalmInvest
          ? "Le foncier relève d’AgriCapital ou de son partenaire. Son affectation au client pourra être renseignée progressivement."
          : "Ces informations décrivent la parcelle concernée par le contrat. Elles restent distinctes de l’adresse de résidence du client."}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <span className="font-medium">Propriété foncière : </span>{isPalmInvest ? "Partenaire AgriCapital" : "Client"}
        <span className="ml-2 text-muted-foreground">· Culture : Palmier à huile</span>
        {isTerraPalm && <div className="mt-1 text-muted-foreground">Superficie contractuelle : {formData.superficie_prevue || "—"} ha</div>}
      </div>
      {isPalmInvest && <div><Label>Site / domaine AgriCapital (si applicable)</Label><Input value={formData.site_agricapital||""} onChange={e=>updateFormData({site_agricapital:e.target.value})} placeholder="Nom du site ou du domaine"/></div>}
      <div>
        <Label>{isClientLandOffer ? "Statut foncier / justificatif *" : "Statut foncier du domaine (si connu)"}</Label>
        <Select value={formData.parcelle_statut_foncier||""} onValueChange={v=>updateFormData({parcelle_statut_foncier:v})}>
          <SelectTrigger><SelectValue placeholder="Sélectionner le statut foncier"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="coutumier">Droit coutumier</SelectItem>
            <SelectItem value="certifie">Certifié</SelectItem>
            <SelectItem value="titre">Titre foncier</SelectItem>
            <SelectItem value="autre">Autre</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <GeographieCascade
        districtId={formData.parcelle_district_id}
        regionId={formData.parcelle_region_id}
        departementId={formData.parcelle_departement_id}
        sousPrefectureId={formData.parcelle_sous_prefecture_id}
        villageId={formData.parcelle_village_id}
        required={isClientLandOffer}
        onChange={(g)=>updateFormData({
          parcelle_district_id:g.districtId||"",
          parcelle_region_id:g.regionId||"",
          parcelle_departement_id:g.departementId||"",
          parcelle_sous_prefecture_id:g.sousPrefectureId||"",
          parcelle_village_id:g.villageId||""
        })}
      />
      <div className="grid md:grid-cols-2 gap-4">
        <div><Label>Référence de la parcelle (si disponible)</Label><Input value={formData.parcelle_reference||""} onChange={e=>updateFormData({parcelle_reference:e.target.value})} placeholder="Référence cadastrale ou locale"/></div>
        <div><Label>Coordonnées GPS (si disponibles)</Label><Input value={formData.parcelle_coordonnees_gps||""} onChange={e=>updateFormData({parcelle_coordonnees_gps:e.target.value})} placeholder="6.997856,-6.214123"/></div>
      </div>
    </CardContent>
  </Card>}
  <EtapeDocumentsContratsDynamiques formData={formData} updateFormData={updateFormData} showIdentityAndContracts={true} showSignedContract={false} showAdditionalDocuments={false}/>
 </div>;
};