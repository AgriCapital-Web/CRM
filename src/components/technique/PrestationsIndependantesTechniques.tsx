import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { uploadOrQueueFile } from "@/lib/offlineFiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InteractiveMap from "@/components/maps/InteractiveMap";
import CompteRenduIA from "@/components/technique/CompteRenduIA";
import MediaUploadVisual from "@/components/ui/media-upload-visual";
import { MapPin, Plus, RefreshCw, Eye } from "lucide-react";

type Proforma = { id:string; reference:string; client_name:string; client_phone:string; status:string; total_amount:number };
type TechEvent = { id:string; proforma_id:string; event_code:string; actor_id:string|null; details:any; created_at:string; proforma?:Proforma };
const emptyForm=()=>({proforma_id:"",date_intervention:new Date().toISOString().slice(0,10),travaux_realises:"",observations:"",recommandations:"",contenu_client:"",quantite_realisee:"",unite_realisee:"",localisation_gps_lat:"",localisation_gps_lng:""});
export default function PrestationsIndependantesTechniques(){
 const {user}=useAuth(); const {toast}=useToast(); const {can,roles}=usePermissions();
 const canManage=roles.some(r=>["pdg","dg","technicien","technicien_terrain","chef_equipe_technique","responsable_operations"].includes(r))||can("rapports.manage_technique");
 const [proformas,setProformas]=useState<Proforma[]>([]); const [events,setEvents]=useState<TechEvent[]>([]);
 const [form,setForm]=useState<any>(emptyForm()); const [files,setFiles]=useState<File[]>([]);
 const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false); const [gpsMode,setGpsMode]=useState<"automatic"|"manual">("automatic"); const [capturing,setCapturing]=useState(false);
 const [selected,setSelected]=useState<TechEvent|null>(null); const [activeTab,setActiveTab]=useState("interventions");
 const load=useCallback(async()=>{
  const [p,e]=await Promise.all([
   (supabase as any).from("independent_service_proformas").select("id,reference,client_name,client_phone,status,total_amount").in("status",["acceptee","en_cours"]).is("archived_at",null).order("created_at",{ascending:false}),
   (supabase as any).from("independent_service_events").select("id,proforma_id,event_code,actor_id,details,created_at,proforma:independent_service_proformas(reference,client_name,client_phone,status)").eq("event_code","technical_intervention").order("created_at",{ascending:false}).limit(300)
  ]);
  if(p.error||e.error){toast({variant:"destructive",title:"Chargement impossible",description:p.error?.message||e.error?.message});return;}
  setProformas(p.data||[]);setEvents(e.data||[]);
 },[toast]);
 useEffect(()=>{void load();},[load]);
 const markers=useMemo(()=>events.filter(e=>e.details?.latitude!=null&&e.details?.longitude!=null).map(e=>({id:e.id,lat:Number(e.details.latitude),lng:Number(e.details.longitude),label:e.proforma?.reference||"Prestation indépendante",info:[e.proforma?.client_name,e.details?.travaux_realises].filter(Boolean).join(" · ")})),[events]);
 const capture=()=>{
  if(!navigator.geolocation){toast({variant:"destructive",title:"GPS indisponible"});return;}
  setCapturing(true);navigator.geolocation.getCurrentPosition(({coords})=>{setForm((x:any)=>({...x,localisation_gps_lat:String(coords.latitude),localisation_gps_lng:String(coords.longitude)}));setCapturing(false);toast({title:"Position enregistrée"});},()=>{setCapturing(false);toast({variant:"destructive",title:"Position non récupérée",description:"Autorisez la géolocalisation ou saisissez les coordonnées manuellement."});},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 };
 const save=async()=>{
  if(!canManage||!user?.id)return;
  const proforma=proformas.find(p=>p.id===form.proforma_id);
  if(!proforma){toast({variant:"destructive",title:"Proforma acceptée obligatoire"});return;}
  if(!form.travaux_realises.trim()&&!form.observations.trim()){toast({variant:"destructive",title:"Compte rendu incomplet",description:"Décrivez les travaux réalisés ou les observations."});return;}
  const lat=form.localisation_gps_lat.trim(),lng=form.localisation_gps_lng.trim();
  if((lat&&!lng)||(!lat&&lng)){toast({variant:"destructive",title:"Coordonnées incomplètes",description:"Renseignez latitude et longitude ensemble."});return;}
  if(lat&&(!Number.isFinite(Number(lat))||Math.abs(Number(lat))>90||!Number.isFinite(Number(lng))||Math.abs(Number(lng))>180)){toast({variant:"destructive",title:"Coordonnées GPS invalides"});return;}
  setSaving(true);
  try{
   const eventId=crypto.randomUUID();
   const mediaPaths:string[]=[];
   for(const file of files){
    const path="independent-services/"+proforma.id+"/"+eventId+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const result=await uploadOrQueueFile({bucket:"rapports-techniques",path,file});
    mediaPaths.push(result.path);
   }
   const details={date_intervention:form.date_intervention,technician_user_id:user.id,travaux_realises:form.travaux_realises||null,observations:form.observations||null,recommandations:form.recommandations||null,contenu_client:form.contenu_client||null,quantite_realisee:form.quantite_realisee?Number(form.quantite_realisee):null,unite_realisee:form.unite_realisee||null,latitude:lat?Number(lat):null,longitude:lng?Number(lng):null,media_paths:mediaPaths};
   const {error}=await (supabase as any).from("independent_service_events").insert({id:eventId,proforma_id:proforma.id,event_code:"technical_intervention",actor_type:"staff",actor_id:user.id,details});
   if(error)throw error;
   if(proforma.status==="acceptee"){
    const {error:updateError}=await (supabase as any).from("independent_service_proformas").update({status:"en_cours",updated_by:user.id}).eq("id",proforma.id).eq("status","acceptee");
    if(updateError)throw updateError;
   }
   toast({title:"Intervention indépendante enregistrée",description:"Le compte rendu et la localisation réellement relevée sont enregistrés."});
   setOpen(false);setFiles([]);setForm(emptyForm());await load();
  }catch(error:any){toast({variant:"destructive",title:"Enregistrement impossible",description:error?.message||"Erreur inconnue"});}
  finally{setSaving(false);}
 };
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-semibold">Prestations indépendantes — interventions</h2><p className="text-sm text-muted-foreground">Les dossiers apparaissent ici après acceptation de leur proforma. La position n’est enregistrée qu’après la visite terrain.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>{canManage&&<Button onClick={()=>setOpen(true)}><Plus className="mr-2 h-4 w-4"/>Nouvelle intervention</Button>}</div></div>
  <Tabs value={activeTab} onValueChange={setActiveTab}><TabsList><TabsTrigger value="interventions">Comptes rendus ({events.length})</TabsTrigger><TabsTrigger value="carte">Carte des interventions ({markers.length})</TabsTrigger></TabsList>
   <TabsContent value="interventions"><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Date</th><th className="p-3 text-left">Proforma</th><th className="p-3 text-left">Client</th><th className="p-3 text-left">Travaux réalisés</th><th className="p-3 text-left">Localisation</th><th className="p-3 text-right">Détail</th></tr></thead><tbody>{events.length===0?<tr><td colSpan={6} className="p-5 text-center text-muted-foreground">Aucune intervention indépendante enregistrée.</td></tr>:events.map(e=><tr key={e.id} className="border-b"><td className="p-3">{e.details?.date_intervention||new Date(e.created_at).toLocaleDateString("fr-FR")}</td><td className="p-3">{e.proforma?.reference||"—"}</td><td className="p-3">{e.proforma?.client_name||"—"}</td><td className="p-3">{e.details?.travaux_realises||e.details?.observations||"—"}</td><td className="p-3">{e.details?.latitude!=null?<Badge variant="outline"><MapPin className="mr-1 h-3 w-3"/>GPS enregistré</Badge>:"Non relevée"}</td><td className="p-3 text-right"><Button size="sm" variant="outline" onClick={()=>setSelected(e)}><Eye className="mr-1 h-4 w-4"/>Voir</Button></td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
   <TabsContent value="carte">{markers.length?<InteractiveMap mode="view" markers={markers} height="480px"/>:<Card><CardContent className="p-6 text-center text-muted-foreground">Aucun point GPS réel n’est encore enregistré. La carte se remplira après les visites des techniciens.</CardContent></Card>}</TabsContent>
  </Tabs>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Compte rendu — prestation indépendante</DialogTitle></DialogHeader><div className="space-y-4">
   <div className="grid gap-3 sm:grid-cols-2"><div><Label>Proforma acceptée *</Label><Select value={form.proforma_id} onValueChange={v=>setForm((x:any)=>({...x,proforma_id:v}))}><SelectTrigger><SelectValue placeholder="Sélectionner un dossier accepté"/></SelectTrigger><SelectContent>{proformas.map(p=><SelectItem key={p.id} value={p.id}>{p.reference} · {p.client_name}</SelectItem>)}</SelectContent></Select></div><div><Label>Date de l’intervention *</Label><Input type="date" value={form.date_intervention} onChange={e=>setForm((x:any)=>({...x,date_intervention:e.target.value}))}/></div></div>
   <div className="rounded-xl border p-3 space-y-3"><Label>Localisation relevée pendant la visite</Label><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={gpsMode==="automatic"?"default":"outline"} onClick={()=>setGpsMode("automatic")}>Automatique</Button><Button type="button" size="sm" variant={gpsMode==="manual"?"default":"outline"} onClick={()=>setGpsMode("manual")}>Manuelle</Button>{gpsMode==="automatic"&&<Button type="button" size="sm" variant="outline" disabled={capturing} onClick={capture}>{capturing?"Localisation…":"Capturer ma position"}</Button>}</div>{gpsMode==="manual"&&<div className="grid gap-3 sm:grid-cols-2"><div><Label>Latitude</Label><Input type="number" step="any" value={form.localisation_gps_lat} onChange={e=>setForm((x:any)=>({...x,localisation_gps_lat:e.target.value}))}/></div><div><Label>Longitude</Label><Input type="number" step="any" value={form.localisation_gps_lng} onChange={e=>setForm((x:any)=>({...x,localisation_gps_lng:e.target.value}))}/></div></div>}{form.localisation_gps_lat&&form.localisation_gps_lng&&<InteractiveMap mode="pick" position={[Number(form.localisation_gps_lat),Number(form.localisation_gps_lng)]} onPositionChange={(lat,lng)=>setForm((x:any)=>({...x,localisation_gps_lat:String(lat),localisation_gps_lng:String(lng)}))} height="220px"/>}</div>
   <CompteRenduIA compact contexte={`Intervention d’une prestation indépendante AgriCapital. Client : ${proformas.find(p=>p.id===form.proforma_id)?.client_name||""}. Proforma : ${proformas.find(p=>p.id===form.proforma_id)?.reference||""}. Date : ${form.date_intervention}. Travaux réalisés : ${form.travaux_realises}.`} onApply={(cr:any)=>setForm((x:any)=>({...x,observations:cr.resume||cr.observations||x.observations,travaux_realises:(cr.actions_realisees||[]).join("\n"),recommandations:(cr.recommandations||[]).join("\n"),contenu_client:[cr.resume,...(cr.recommandations||[])].filter(Boolean).join("\n")}))}/>
   <div className="grid gap-3 sm:grid-cols-2"><div><Label>Travaux réalisés *</Label><Textarea rows={4} value={form.travaux_realises} onChange={e=>setForm((x:any)=>({...x,travaux_realises:e.target.value}))}/></div><div><Label>Observations / constats</Label><Textarea rows={4} value={form.observations} onChange={e=>setForm((x:any)=>({...x,observations:e.target.value}))}/></div><div><Label>Recommandations</Label><Textarea rows={3} value={form.recommandations} onChange={e=>setForm((x:any)=>({...x,recommandations:e.target.value}))}/></div><div><Label>Message destiné au client</Label><Textarea rows={3} value={form.contenu_client} onChange={e=>setForm((x:any)=>({...x,contenu_client:e.target.value}))}/></div></div>
   <div className="grid gap-3 sm:grid-cols-2"><div><Label>Quantité réalisée (si applicable)</Label><Input type="number" min="0" step="0.001" value={form.quantite_realisee} onChange={e=>setForm((x:any)=>({...x,quantite_realisee:e.target.value}))}/></div><div><Label>Unité</Label><Input value={form.unite_realisee} onChange={e=>setForm((x:any)=>({...x,unite_realisee:e.target.value}))}/></div></div>
   <div><Label>Photos / vidéos de l’intervention</Label><MediaUploadVisual value={files} onChange={setFiles} accept="image/*,video/*" multiple/></div>
   <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>Annuler</Button><Button disabled={saving} onClick={()=>void save()}>{saving?"Enregistrement…":"Enregistrer le compte rendu"}</Button></div>
  </div></DialogContent></Dialog>
  <Dialog open={!!selected} onOpenChange={v=>!v&&setSelected(null)}><DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Compte rendu technique</DialogTitle></DialogHeader>{selected&&<div className="space-y-3 text-sm"><p><b>Proforma :</b> {selected.proforma?.reference}</p><p><b>Client :</b> {selected.proforma?.client_name}</p><p><b>Date :</b> {selected.details?.date_intervention}</p><p><b>Travaux :</b> {selected.details?.travaux_realises||"—"}</p><p><b>Observations :</b> {selected.details?.observations||"—"}</p><p><b>Recommandations :</b> {selected.details?.recommandations||"—"}</p><p><b>Message client :</b> {selected.details?.contenu_client||"—"}</p><p><b>Coordonnées :</b> {selected.details?.latitude??"—"}, {selected.details?.longitude??"—"}</p><p><b>Médias :</b> {selected.details?.media_paths?.length||0} fichier(s) enregistré(s)</p></div>}</DialogContent></Dialog>
 </div>;
}
