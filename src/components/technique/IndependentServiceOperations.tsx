import { useCallback,useEffect,useMemo,useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { RefreshCw,Plus,ClipboardList } from "lucide-react";
import { toast } from "sonner";
import InteractiveMap from "@/components/maps/InteractiveMap";

type Quote={id:string;reference:string;title:string|null;client_id:string;client_name:string;client_phone:string;client_locality:string|null;status:string};
type Event={id:string;proforma_id:string;details:any;created_at:string;proforma?:{reference?:string;client_name?:string;client_phone?:string}|null};
const labels:Record<string,string>={acceptee:"Acceptée",en_cours:"En cours",planifiee:"Planifiée",terminee:"Terminée",bloquee:"Bloquée"};
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(v)||0);

export default function IndependentServiceOperations(){
 const {user}=useAuth();const {capabilities}=usePermissions();const allowed=capabilities.independentServiceOperations;
 const [quotes,setQuotes]=useState<Quote[]>([]);const [events,setEvents]=useState<Event[]>([]);const [loading,setLoading]=useState(true);
 const [open,setOpen]=useState(false);const [saving,setSaving]=useState(false);const [quoteId,setQuoteId]=useState("");
 const [date,setDate]=useState(new Date().toISOString().slice(0,10));const [type,setType]=useState("suivi");const [status,setStatus]=useState("en_cours");
 const [work,setWork]=useState("");const [observations,setObservations]=useState("");const [recommendations,setRecommendations]=useState("");const [clientSummary,setClientSummary]=useState("");
 const [plantsPlanned,setPlantsPlanned]=useState("");const [plantsRealized,setPlantsRealized]=useState("");const [plantsReplaced,setPlantsReplaced]=useState("");const [density,setDensity]=useState("");const [latitude,setLatitude]=useState("");const [longitude,setLongitude]=useState("");
 const quoteById=useMemo(()=>new Map(quotes.map(q=>[q.id,q])),[quotes]);
 const load=useCallback(async()=>{
  if(!allowed){setLoading(false);return;}setLoading(true);
  try{
   const [q,e]=await Promise.all([
    (supabase as any).from("independent_service_proformas").select("id,reference,title,client_id,client_name,client_phone,client_locality,status").in("status",["acceptee","en_cours","terminee"]).is("archived_at",null).order("created_at",{ascending:false}).limit(500),
    (supabase as any).from("independent_service_events").select("id,proforma_id,details,created_at,proforma:independent_service_proformas(reference,client_name,client_phone)").eq("event_code","technical_intervention").order("created_at",{ascending:false}).limit(1000)
   ]);
   if(q.error)throw q.error;if(e.error)throw e.error;setQuotes(q.data||[]);setEvents(e.data||[]);
  }catch(err:any){toast.error("Chargement des interventions impossible : "+(err?.message||"Erreur"));setQuotes([]);setEvents([]);}
  finally{setLoading(false);}
 },[allowed]);
 useEffect(()=>{void load();},[load]);
 const eligible=quotes.filter(q=>q.status!=="terminee");
 const markers=events.filter(e=>e.details?.latitude!=null&&e.details?.longitude!=null).map(e=>({id:e.id,lat:Number(e.details.latitude),lng:Number(e.details.longitude),label:e.proforma?.reference||"Prestation indépendante",info:[e.proforma?.client_name,e.details?.travaux_realises].filter(Boolean).join(" · ")}));
 const reset=()=>{setQuoteId("");setDate(new Date().toISOString().slice(0,10));setType("suivi");setStatus("en_cours");setWork("");setObservations("");setRecommendations("");setClientSummary("");setPlantsPlanned("");setPlantsRealized("");setPlantsReplaced("");setDensity("");setLatitude("");setLongitude("");};
 const save=async()=>{
  const q=quoteById.get(quoteId);if(!user?.id||!q){toast.error("Sélectionnez une prestation indépendante acceptée ou en cours.");return;}
  if(!work.trim()){toast.error("Le compte rendu des travaux réalisés est obligatoire.");return;}
  const nums=[plantsPlanned,plantsRealized,plantsReplaced,density].filter(Boolean).map(Number);
  if(nums.some(n=>!Number.isFinite(n)||n<0)||((latitude&&!Number.isFinite(Number(latitude)))||(longitude&&!Number.isFinite(Number(longitude))))||(Boolean(latitude)!==Boolean(longitude))){toast.error("Vérifiez les quantités et les coordonnées GPS.");return;}
  setSaving(true);
  try{
   const details={source:"operations_techniques",date_intervention:date,type_intervention:type,statut:status,travaux_realises:work.trim(),observations:observations.trim()||null,recommandations:recommendations.trim()||null,contenu_client:clientSummary.trim()||null,nombre_plants_prevus:plantsPlanned?Number(plantsPlanned):null,nombre_plants_realises:plantsRealized?Number(plantsRealized):null,nombre_plants_remplaces:plantsReplaced?Number(plantsReplaced):null,densite_plants:density?Number(density):null,latitude:latitude?Number(latitude):null,longitude:longitude?Number(longitude):null,devis_reference:q.reference,devis_titre:q.title,client_independant_id:q.client_id,client_nom:q.client_name,client_telephone:q.client_phone};
   const {error}=await (supabase as any).from("independent_service_events").insert({proforma_id:q.id,event_code:"technical_intervention",actor_type:"staff",actor_id:user.id,details});
   if(error)throw error;toast.success("Rapport terrain enregistré.");setOpen(false);reset();await load();
  }catch(err:any){toast.error("Enregistrement impossible : "+(err?.message||"Erreur"));}
  finally{setSaving(false);}
 };
 if(!allowed)return <Card><CardContent className="p-5 text-sm text-muted-foreground">Accès réservé aux équipes techniques autorisées.</CardContent></Card>;
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Prestations indépendantes</h2><p className="text-sm text-muted-foreground">Interventions et rapports terrain des prestations indépendantes.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button><Button onClick={()=>{reset();setOpen(true);}} disabled={eligible.length===0}><Plus className="mr-2 h-4 w-4"/>Nouvelle intervention</Button></div></div>
  <Card><CardHeader className="pb-2"><CardTitle className="text-base">Tableau des interventions techniques</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Date</th><th className="p-3">Référence</th><th className="p-3">Client</th><th className="p-3">Intervention</th><th className="p-3">Compte rendu</th><th className="p-3">État</th></tr></thead><tbody>{loading?<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Chargement…</td></tr>:events.length===0?<tr><td colSpan={6} className="p-8 text-center"><ClipboardList className="mx-auto mb-2 h-7 w-7 text-muted-foreground"/><p>Aucune intervention technique enregistrée.</p><p className="mt-1 text-xs text-muted-foreground">Les interventions apparaîtront ici après l’enregistrement d’un rapport terrain.</p></td></tr>:events.map(e=>{const q=quoteById.get(e.proforma_id);return <tr key={e.id} className="border-b last:border-0"><td className="p-3 whitespace-nowrap">{e.details?.date_intervention||new Date(e.created_at).toLocaleDateString("fr-FR")}</td><td className="p-3 font-medium">{e.proforma?.reference||q?.reference||"—"}</td><td className="p-3">{e.proforma?.client_name||q?.client_name||e.details?.client_nom||"—"}<div className="text-xs text-muted-foreground">{e.proforma?.client_phone||q?.client_phone||""}</div></td><td className="p-3">{String(e.details?.type_intervention||"Intervention").replaceAll("_"," ")}</td><td className="p-3 max-w-xs truncate">{e.details?.travaux_realises||"—"}</td><td className="p-3"><Badge variant="outline">{labels[e.details?.statut]||e.details?.statut||"Enregistrée"}</Badge></td></tr>})}</tbody></table></div></CardContent></Card>
  <Card><CardHeader className="pb-2"><CardTitle className="text-base">Carte interactive des interventions</CardTitle></CardHeader><CardContent>{markers.length?<InteractiveMap mode="view" markers={markers} height="420px"/>:<p className="py-6 text-center text-sm text-muted-foreground">Les positions GPS des interventions s’afficheront ici après leur enregistrement.</p>}</CardContent></Card>
  <Dialog open={open} onOpenChange={v=>{setOpen(v);if(!v)reset();}}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Rapport terrain — prestation indépendante</DialogTitle></DialogHeader><div className="space-y-4">
   <div><Label>Prestation / devis concerné *</Label><Select value={quoteId} onValueChange={setQuoteId}><SelectTrigger><SelectValue placeholder="Sélectionner une prestation acceptée ou en cours"/></SelectTrigger><SelectContent>{eligible.map(q=><SelectItem key={q.id} value={q.id}>{q.reference} · {q.client_name} · {labels[q.status]||q.status}</SelectItem>)}</SelectContent></Select></div>
   <div className="grid gap-3 sm:grid-cols-3"><div><Label>Date *</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label>Nature de l’intervention *</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["visite","defrichage","piquetage","trouaison","mise_en_terre","entretien","traitement","suivi","remplacement","autre"].map(v=><SelectItem key={v} value={v}>{v.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></div><div><Label>État</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="planifiee">Planifiée</SelectItem><SelectItem value="en_cours">En cours</SelectItem><SelectItem value="terminee">Terminée</SelectItem><SelectItem value="bloquee">Bloquée</SelectItem></SelectContent></Select></div></div>
   <div className="grid gap-3 sm:grid-cols-4"><div><Label>Plants prévus</Label><Input type="number" min="0" value={plantsPlanned} onChange={e=>setPlantsPlanned(e.target.value)}/></div><div><Label>Plants réalisés</Label><Input type="number" min="0" value={plantsRealized} onChange={e=>setPlantsRealized(e.target.value)}/></div><div><Label>Plants remplacés</Label><Input type="number" min="0" value={plantsReplaced} onChange={e=>setPlantsReplaced(e.target.value)}/></div><div><Label>Densité (plants/ha)</Label><Input type="number" min="0" value={density} onChange={e=>setDensity(e.target.value)}/></div></div>
   <div><Label>Travaux réalisés / compte rendu terrain *</Label><Textarea rows={4} value={work} onChange={e=>setWork(e.target.value)} placeholder="Décrire les travaux effectués, les résultats et les quantités…"/></div>
   <div className="grid gap-3 sm:grid-cols-2"><div><Label>Constats / observations</Label><Textarea rows={3} value={observations} onChange={e=>setObservations(e.target.value)}/></div><div><Label>Recommandations / suite à donner</Label><Textarea rows={3} value={recommendations} onChange={e=>setRecommendations(e.target.value)}/></div></div>
   <div><Label>Compte rendu destiné au client</Label><Textarea rows={2} value={clientSummary} onChange={e=>setClientSummary(e.target.value)}/></div>
   <div className="space-y-2 rounded-lg border p-3"><Label>Localisation GPS de l’intervention</Label><div className="grid gap-2 sm:grid-cols-2"><Input type="number" step="any" placeholder="Latitude" value={latitude} onChange={e=>setLatitude(e.target.value)}/><Input type="number" step="any" placeholder="Longitude" value={longitude} onChange={e=>setLongitude(e.target.value)}/></div><InteractiveMap mode="pick" position={latitude&&longitude?[Number(latitude),Number(longitude)]:null} onPositionChange={(lat,lng)=>{setLatitude(String(lat));setLongitude(String(lng));}} height="220px"/></div>
   <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>Annuler</Button><Button onClick={()=>void save()} disabled={saving||!quoteId}>{saving?"Enregistrement…":"Enregistrer le rapport terrain"}</Button></div>
  </div></DialogContent></Dialog>
 </div>;
}
