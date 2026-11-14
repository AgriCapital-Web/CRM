import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, MapPin, UserRound, UsersRound, Sprout, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
interface Props { formData: any; updateFormData: (data: any) => void; }
const value=(v:any,empty="Non renseigné")=>v!==undefined&&v!==null&&String(v).trim()!==""?String(v):empty;
const money=(n:any)=>`${Math.round(Number(n||0)).toLocaleString("fr-FR")} FCFA`;
const fmtDate=(d:any)=>d?new Date(d).toLocaleDateString("fr-FR"):"—";
const DOC_LABELS:Record<string,string>={photo_profil:"Photo d'identité",photo_piece_recto:"Pièce d'identité (recto)",photo_piece_verso:"Pièce d'identité (verso)"};
const labelOf=(code:string)=>DOC_LABELS[code]||code.replace(/^doc_|^contrat_/,"").replace(/_/g," ").replace(/^\w/,c=>c.toUpperCase());
const STATUT:Record<string,{label:string;variant:"default"|"secondary"|"destructive"|"outline"}>={valide:{label:"Validé",variant:"default"},paye:{label:"Payé",variant:"default"},en_attente:{label:"En attente",variant:"secondary"},rejete:{label:"Rejeté",variant:"destructive"},annule:{label:"Annulé",variant:"outline"},rembourse:{label:"Remboursé",variant:"outline"}};

function useGeoNames(f:any){
  const [names,setNames]=useState<string>("");
  useEffect(()=>{let on=true;(async()=>{
    const q=async(t:string,id:any)=>{if(!id)return null;const {data}=await (supabase as any).from(t).select("nom").eq("id",id).maybeSingle();return data?.nom||null;};
    const parts=await Promise.all([q("districts",f.district_id),q("regions",f.region_id),q("departements",f.departement_id),q("sous_prefectures",f.sous_prefecture_id),q("villages",f.village_id)]);
    if(on)setNames(parts.filter(Boolean).join(" / ")||[f.district_nom,f.region_nom,f.departement_nom,f.sous_prefecture_nom,f.village_nom].filter(Boolean).join(" / "));
  })();return()=>{on=false;};},[f.district_id,f.region_id,f.departement_id,f.sous_prefecture_id,f.village_id]);
  return names;
}

function collectFiles(f:any,prefix:"doc"|"contrat"|"identity"){
  const out:{key:string;label:string;url:string|null;pending:boolean}[]=[];const seen=new Set<string>();
  const add=(code:string,file:any,url:any)=>{if(seen.has(code)||(!file&&!url))return;seen.add(code);out.push({key:code,label:labelOf(code),url:typeof url==="string"&&url?url:null,pending:Boolean(file)});};
  if(prefix==="identity"){for(const c of ["photo_profil","photo_piece_recto","photo_piece_verso"])add(c,f[c+"_file"],f[c+"_preview"]);return out;}
  const re=new RegExp(`^${prefix}_(.+)_(file|preview)$`);
  for(const k of Object.keys(f)){const m=k.match(re);if(!m)continue;const code=m[1];if(/^client_(photo_profil|piece_recto|piece_verso)/.test(code))continue;add(prefix+"_"+code,f[`${prefix}_${code}_file`],f[`${prefix}_${code}_preview`]);}
  return out;
}

function FinancePanel({clientId}:{clientId:string}){
  const [rows,setRows]=useState<any[]|null>(null);const [acq,setAcq]=useState<any>(null);const [err,setErr]=useState(false);
  useEffect(()=>{let on=true;(async()=>{
    const [p,a]=await Promise.all([(supabase as any).from("paiements").select("id,date_paiement,date_echeance,reference,mode_paiement,type_paiement,montant,montant_paye,statut,est_paiement_initial,preuve_paiement_url,fichier_preuve_url").eq("client_id",clientId).order("date_paiement",{ascending:false,nullsFirst:false}),(supabase as any).from("acquisitions").select("*").eq("client_id",clientId).order("created_at",{ascending:false}).limit(1).maybeSingle()]);
    if(!on)return;if(p.error){setErr(true);setRows([]);return;}setRows(p.data||[]);setAcq(a.data||null);
  })();return()=>{on=false;};},[clientId]);
  if(err)return <p className="text-sm text-muted-foreground">Situation financière indisponible pour votre profil.</p>;
  if(!rows)return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const ok=rows.filter(r=>["valide","paye"].includes(String(r.statut)));
  const encaisse=ok.reduce((s,r)=>s+Number(r.montant_paye??r.montant??0),0);
  const total=Number(acq?.montant_total_contrat??0);
  const reste=Math.max(total-encaisse,0);
  const attente=rows.filter(r=>r.statut==="en_attente").length;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
      <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Montant du contrat</p><p className="font-semibold money-value">{total>0?money(total):"—"}</p></div>
      <div className="rounded-lg border border-l-4 border-l-primary p-3"><p className="text-xs text-muted-foreground">Encaissé</p><p className="font-semibold money-value">{money(encaisse)}</p></div>
      <div className={`rounded-lg border border-l-4 p-3 ${reste>0?"border-l-destructive":"border-l-primary"}`}><p className="text-xs text-muted-foreground">Reste à payer</p><p className="font-semibold money-value">{total>0?money(reste):"—"}</p></div>
      <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Opérations</p><p className="font-semibold">{rows.length}{attente>0&&<span className="text-muted-foreground font-normal"> · {attente} en attente</span>}</p></div>
    </div>
    {rows.length===0?<p className="text-sm text-muted-foreground">Aucune opération enregistrée.</p>:
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Date</th><th className="p-2">Référence</th><th className="p-2">Type</th><th className="p-2">Mode</th><th className="p-2 text-right">Montant</th><th className="p-2">Statut</th><th className="p-2">Reçu</th></tr></thead><tbody>
      {rows.map(r=>{const s=STATUT[String(r.statut)]||{label:value(r.statut,"—"),variant:"outline" as const};const proof=r.preuve_paiement_url||r.fichier_preuve_url;return <tr key={r.id} className="border-t">
        <td className="p-2 whitespace-nowrap">{fmtDate(r.date_paiement||r.date_echeance)}</td><td className="p-2">{value(r.reference,"—")}</td>
        <td className="p-2">{r.est_paiement_initial?"Paiement initial":value(r.type_paiement,"Mensualité")}</td><td className="p-2">{value(r.mode_paiement,"—")}</td>
        <td className="p-2 text-right money-value">{money(r.montant_paye??r.montant)}</td><td className="p-2"><Badge variant={s.variant}>{s.label}</Badge></td>
        <td className="p-2">{proof?<a className="text-primary underline" href={proof} target="_blank" rel="noreferrer">Voir</a>:"—"}</td></tr>;})}
    </tbody></table></div>}
  </div>;
}

export const EtapeConfirmationDossier=({formData,updateFormData}:Props)=>{
 const offre=formData.offre||{}; const ha=Number(formData.superficie_prevue||0); const rep=Boolean(formData.has_representant);
 const location=useGeoNames(formData);
 const identity=collectFiles(formData,"identity"),docs=collectFiles(formData,"doc"),contracts=collectFiles(formData,"contrat");
 const allDocs=[...identity,...docs];
 const clientName=(String(formData.nom||"")+" "+String(formData.prenoms||"")).trim();
 const repName=(String(formData.representant_nom||"")+" "+String(formData.representant_prenoms||"")).trim();
 const clientId=formData.id_unique?formData.id:null;
 const FileList=({items,empty}:{items:ReturnType<typeof collectFiles>;empty:string})=>items.length===0?<p className="text-sm text-muted-foreground">{empty}</p>:<div className="flex flex-wrap gap-2">{items.map(i=>i.url?<a key={i.key} href={i.url} target="_blank" rel="noreferrer"><Badge variant="outline" className="gap-1 hover:bg-muted"><FileText className="h-3 w-3"/>{i.label}</Badge></a>:<Badge key={i.key} variant="secondary" className="gap-1"><FileText className="h-3 w-3"/>{i.label}{i.pending&&" · à envoyer"}</Badge>)}</div>;
 return <div className="space-y-6">
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5"/>Récapitulatif du dossier</CardTitle></CardHeader><CardContent className="space-y-5">
   <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><Sprout className="h-4 w-4"/>Offre et projet</h3><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Offre</p><p className="font-medium">{value(offre.nom||formData.offre_code)}</p></div><div><p className="text-xs text-muted-foreground">Formule choisie</p><p className="font-medium">{value(formData.formule_nom)}</p></div><div><p className="text-xs text-muted-foreground">Code parcours</p><p>{value(formData.offre_code)}</p></div><div><p className="text-xs text-muted-foreground">Superficie</p><p>{ha>0?ha+" ha":"Non renseignée"}</p></div><div><p className="text-xs text-muted-foreground">Paiement</p><p>{formData.mode_paiement==="comptant"?"Comptant":"Échéancier"}</p></div></div></section>
   <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><UserRound className="h-4 w-4"/>Informations du client</h3><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Nom</p><p className="font-medium">{value(clientName)}</p></div><div><p className="text-xs text-muted-foreground">Pièce</p><p>{value(formData.type_piece)} — {value(formData.numero_piece)}</p></div><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{value(formData.telephone)}</p></div><div><p className="text-xs text-muted-foreground">WhatsApp</p><p>{value(formData.whatsapp)}</p></div><div><p className="text-xs text-muted-foreground">Email</p><p>{value(formData.email)}</p></div><div><p className="text-xs text-muted-foreground">Nationalité</p><p>{value(formData.nationalite)}</p></div></div></section>
   <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4"/>Lieu de résidence</h3><div className="grid sm:grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Lieu de résidence</p><p className="font-medium">{value(formData.domicile)}</p></div><div><p className="text-xs text-muted-foreground">Zone géographique</p><p>{value(location)}</p></div></div></section>
   <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><UsersRound className="h-4 w-4"/>Cotitulaire / mandataire</h3>{rep?<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Qualité</p><p>{value(formData.representant_type)}</p></div><div><p className="text-xs text-muted-foreground">Nom</p><p className="font-medium">{value(repName)}</p></div><div><p className="text-xs text-muted-foreground">Lien avec le Client</p><p>{value(formData.representant_lien)}</p></div><div><p className="text-xs text-muted-foreground">Pièce</p><p>{value(formData.representant_type_piece)} — {value(formData.representant_numero_piece)}</p></div><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{value(formData.representant_telephone)}</p></div><div><p className="text-xs text-muted-foreground">WhatsApp</p><p>{value(formData.representant_whatsapp)}</p></div></div>:<p className="text-sm text-muted-foreground">Aucun cotitulaire ou mandataire désigné.</p>}</section>
   <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4"/>Pièces du dossier ({allDocs.length})</h3><FileList items={allDocs} empty="Aucune pièce jointe."/></section>
   <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4"/>Contrats ({contracts.length})</h3><FileList items={contracts} empty="Aucun contrat joint."/></section>
   {clientId&&<section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4"/>Situation financière</h3><FinancePanel clientId={clientId}/></section>}
  </CardContent></Card>
  <Card><CardHeader><CardTitle>Validation finale</CardTitle></CardHeader><CardContent className="space-y-3">{[
   ["contrat_lu","Le Client a pris connaissance des documents contractuels applicables."],["documents_authentiques","Les documents fournis ont été contrôlés et déclarés authentiques."],["autorisation_donnees","Le Client autorise le traitement de ses données pour l’exécution du dossier."]
  ].map(([id,label])=><div className="flex items-start gap-2" key={id}><Checkbox id={id} checked={Boolean(formData[id])} onCheckedChange={v=>updateFormData({[id]:Boolean(v)})}/><Label htmlFor={id} className="font-normal">{label}</Label></div>)}</CardContent></Card>
 </div>;
};
