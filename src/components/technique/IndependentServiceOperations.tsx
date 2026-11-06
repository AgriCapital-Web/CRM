import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ClipboardList, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import InteractiveMap from "@/components/maps/InteractiveMap";

type Quote = {
  id: string; reference: string; title: string | null; client_id: string;
  client_name: string; client_phone: string; client_locality: string | null;
  status: string; total_amount: number; issued_at: string | null;
};
type ServiceEvent = { id: string; proforma_id: string; event_code: string; details: any; created_at: string; proforma?: { reference?: string; client_name?: string; client_phone?: string } | null };

const allowedRoles = ["pdg","dg","technicien","chef_equipe_technique","manager_technique_national","responsable_operations"];
const statusLabel: Record<string,string> = { acceptee:"Acceptée", en_cours:"En cours", planifiee:"Planifiée", terminee:"Terminée", bloquee:"Bloquée" };
const money = (v:number) => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(v)||0);

export default function IndependentServiceOperations() {
  const { user, userRoles } = useAuth();
  const canAccess = userRoles.some((role:string) => allowedRoles.includes(role));
  const [quotes,setQuotes] = useState<Quote[]>([]);
  const [events,setEvents] = useState<ServiceEvent[]>([]);
  const [items,setItems] = useState<any[]>([]);
  const [selectedId,setSelectedId] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [type,setType] = useState("mise_en_terre");
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [status,setStatus] = useState("en_cours");
  const [work,setWork] = useState("");
  const [observations,setObservations] = useState("");
  const [recommendations,setRecommendations] = useState("");
  const [clientSummary,setClientSummary] = useState("");
  const [plantsPlanned,setPlantsPlanned] = useState("");
  const [plantsRealized,setPlantsRealized] = useState("");
  const [plantsReplaced,setPlantsReplaced] = useState("");
  const [plantDensity,setPlantDensity] = useState("");
  const [latitude,setLatitude] = useState("");
  const [longitude,setLongitude] = useState("");

  const selected = useMemo(()=>quotes.find(q=>q.id===selectedId)||quotes[0]||null,[quotes,selectedId]);
  const selectedEvents = useMemo(()=>events.filter(e=>e.proforma_id===selected?.id),[events,selected]);
  const quotedArea = useMemo(()=>items.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.hectares||0)),0),[items]);
  const markers = useMemo(()=>selectedEvents.filter(e=>e.details?.latitude!=null&&e.details?.longitude!=null).map(e=>({
    id:e.id,lat:Number(e.details.latitude),lng:Number(e.details.longitude),
    label:e.proforma?.reference||selected?.reference||"Prestation indépendante",
    info:[selected?.client_name,e.details?.type_intervention,e.details?.travaux_realises].filter(Boolean).join(" · ")
  })),[selectedEvents,selected]);

  const load = useCallback(async()=>{
    if(!canAccess){setLoading(false);return;}
    setLoading(true);
    try {
      const [q,e] = await Promise.all([
        (supabase as any).from("independent_service_proformas")
          .select("id,reference,title,client_id,client_name,client_phone,client_locality,status,total_amount,issued_at")
          .in("status",["acceptee","en_cours","terminee"]).is("archived_at",null)
          .order("created_at",{ascending:false}).limit(300),
        (supabase as any).from("independent_service_events")
          .select("id,proforma_id,event_code,details,created_at,proforma:independent_service_proformas(reference,client_name,client_phone)")
          .eq("event_code","technical_intervention").order("created_at",{ascending:false}).limit(500)
      ]);
      if(q.error) throw q.error;
      if(e.error) throw e.error;
      setQuotes(q.data||[]);
      setEvents(e.data||[]);
      const nextId=selectedId && (q.data||[]).some((x:any)=>x.id===selectedId) ? selectedId : (q.data||[])[0]?.id||"";
      setSelectedId(nextId);
      if(!nextId) setItems([]);
    } catch(error:any) {
      toast.error("Chargement des prestations indépendantes impossible : "+(error?.message||"Erreur inconnue"));
      setQuotes([]);setEvents([]);setItems([]);
    } finally {setLoading(false);}
  },[canAccess,selectedId]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!selectedId)return;
    let active=true;
    (async()=>{
      const {data,error}=await (supabase as any).from("independent_service_items")
        .select("id,designation,quantity,unit,unit_price,amount,hectares,annexe_active,annexe_qualite,annexe_prix")
        .eq("proforma_id",selectedId).order("sort_order");
      if(!active)return;
      if(error){toast.error("Détail du devis inaccessible : "+error.message);setItems([]);}
      else setItems(data||[]);
    })();
    return ()=>{active=false;};
  },[selectedId]);

  const save=async()=>{
    if(!user?.id||!selected){toast.error("Sélectionnez un devis accepté.");return;}
    if(selected.status==="terminee"){toast.error("Ce dossier est clôturé. Son historique reste consultable, mais aucune nouvelle intervention ne peut être ajoutée.");return;}
    if(!type.trim()||!work.trim()){toast.error("La nature de l’intervention et les travaux réalisés sont obligatoires.");return;}
    const operationalNumbers=[plantsPlanned,plantsRealized,plantsReplaced,plantDensity].filter(v=>v.trim()!=="").map(Number);
    if(operationalNumbers.some(v=>!Number.isFinite(v)||v<0)){toast.error("Les quantités de plants et la densité doivent être des nombres positifs ou nuls.");return;}
    if((latitude&&!Number.isFinite(Number(latitude)))||(longitude&&!Number.isFinite(Number(longitude)))){toast.error("Les coordonnées GPS doivent être numériques.");return;}
    if(Boolean(latitude)!==Boolean(longitude)){toast.error("Renseignez les deux coordonnées GPS ou aucune.");return;}
    setSaving(true);
    try {
      const details={
        source:"operations_techniques",
        date_intervention:date,
        type_intervention:type,
        statut:status,
        travaux_realises:work.trim(),
        observations:observations.trim()||null,
        recommandations:recommendations.trim()||null,
        contenu_client:clientSummary.trim()||null,
        superficie_ha:quotedArea>0?quotedArea:null,
        nombre_plants_prevus:plantsPlanned.trim()?Number(plantsPlanned):null,
        nombre_plants_realises:plantsRealized.trim()?Number(plantsRealized):null,
        nombre_plants_remplaces:plantsReplaced.trim()?Number(plantsReplaced):null,
        densite_plants:plantDensity.trim()?Number(plantDensity):null,
        latitude:latitude?Number(latitude):null,
        longitude:longitude?Number(longitude):null,
        devis_reference:selected.reference,
        devis_titre:selected.title,
        client_independant_id:selected.client_id,
        client_nom:selected.client_name,
        client_telephone:selected.client_phone,
        lignes_devis:items.map(i=>({designation:i.designation,quantite:i.quantity,unite:i.unit}))
      };
      const {error}=await (supabase as any).from("independent_service_events").insert({
        proforma_id:selected.id,event_code:"technical_intervention",actor_type:"staff",actor_id:user.id,details
      });
      if(error) throw error;
      toast.success("Intervention indépendante enregistrée et rattachée au devis "+selected.reference+".");
      setWork("");setObservations("");setRecommendations("");setClientSummary("");
      setPlantsPlanned("");setPlantsRealized("");setPlantsReplaced("");setPlantDensity("");
      setLatitude("");setLongitude("");
      setDate(new Date().toISOString().slice(0,10));setStatus("en_cours");
      await load();
    } catch(error:any) {
      toast.error("Enregistrement impossible : "+(error?.message||"Vérifiez vos droits puis réessayez."));
    } finally {setSaving(false);}
  };

  if(!canAccess) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Votre rôle ne permet pas d’accéder aux prestations indépendantes en opérations techniques.</CardContent></Card>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold">Prestations indépendantes — suivi technique</h2><p className="text-sm text-muted-foreground">Les dossiers sont séparés des clients des offres commerciales. Seuls les devis acceptés ou en cours sont proposés.</p></div>
      <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Dossiers à traiter</p><p className="text-2xl font-bold">{quotes.filter(q=>q.status!=="terminee").length}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Dossiers terminés</p><p className="text-2xl font-bold">{quotes.filter(q=>q.status==="terminee").length}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Interventions enregistrées</p><p className="text-2xl font-bold">{events.length}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Sur ce dossier</p><p className="text-2xl font-bold">{selectedEvents.length}</p></CardContent></Card>
    </div>
    {loading ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Chargement des devis indépendants…</CardContent></Card> :
      quotes.length===0 ? <Card><CardContent className="p-8 text-center"><ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground"/><p className="font-medium">Aucun devis accepté à traiter</p><p className="mt-1 text-sm text-muted-foreground">Les devis apparaîtront ici dès qu’un client indépendant les aura acceptés.</p></CardContent></Card> :
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Dossiers indépendants</CardTitle></CardHeader><CardContent className="space-y-2">
          {quotes.map(q=><button key={q.id} type="button" onClick={()=>setSelectedId(q.id)} className={"w-full rounded-lg border p-3 text-left transition-colors "+(selected?.id===q.id?"border-primary bg-primary/5":"hover:bg-muted/50")}>
            <div className="flex items-start justify-between gap-2"><span className="font-semibold">{q.reference}</span><Badge variant="outline">{statusLabel[q.status]||q.status}</Badge></div>
            <p className="mt-1 text-sm">{q.client_name}</p><p className="text-xs text-muted-foreground">{q.client_phone}{q.client_locality?" · "+q.client_locality:""}</p>
            <p className="mt-2 text-sm font-semibold">{money(q.total_amount)}</p>
          </button>)}
        </CardContent></Card>
        {selected&&<div className="space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Détail du devis · {selected.reference}</CardTitle></CardHeader><CardContent className="space-y-2">
            <p className="font-medium">{selected.title||"Prestation indépendante"} — {selected.client_name}</p>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Prestation</th><th className="py-2">Quantité</th><th className="py-2">Unité</th><th className="py-2 text-right">Montant</th></tr></thead><tbody>
              {items.map(i=><tr key={i.id} className="border-b"><td className="py-2">{i.designation}{i.annexe_active&&<p className="text-xs text-muted-foreground">Annexe : {i.annexe_qualite}</p>}</td><td>{i.quantity}</td><td>{i.unit}</td><td className="text-right">{money(i.amount)}</td></tr>)}
            </tbody></table></div>
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">{selected.status==="terminee"?"Intervention clôturée":"Enregistrer une intervention"}</CardTitle></CardHeader><CardContent className="space-y-3">
            {selected.status==="terminee"&&<p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Ce dossier est terminé. L’historique et la localisation restent consultables ; les nouvelles interventions sont verrouillées.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nature de l’intervention *</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["defrichage","piquetage","trouaison","mise_en_terre","entretien","traitement","suivi","autre"].map(v=><SelectItem key={v} value={v}>{v.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Date *</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
              <div><Label>État de l’intervention</Label><Select value={status} onValueChange={setStatus} disabled={selected.status==="terminee"}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="planifiee">Planifiée</SelectItem><SelectItem value="en_cours">En cours</SelectItem><SelectItem value="terminee">Terminée</SelectItem><SelectItem value="bloquee">Bloquée</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div><Label>Superficie du devis (ha)</Label><Input readOnly value={quotedArea>0?quotedArea.toLocaleString("fr-FR",{maximumFractionDigits:3}):"Non renseignée"}/></div>
              <div><Label>Plants prévus</Label><Input type="number" min="0" step="1" value={plantsPlanned} onChange={e=>setPlantsPlanned(e.target.value)} disabled={selected.status==="terminee"}/></div>
              <div><Label>Plants réalisés</Label><Input type="number" min="0" step="1" value={plantsRealized} onChange={e=>setPlantsRealized(e.target.value)} disabled={selected.status==="terminee"}/></div>
              <div><Label>Plants remplacés</Label><Input type="number" min="0" step="1" value={plantsReplaced} onChange={e=>setPlantsReplaced(e.target.value)} disabled={selected.status==="terminee"}/></div>
              <div><Label>Densité (plants/ha)</Label><Input type="number" min="0" step="1" value={plantDensity} onChange={e=>setPlantDensity(e.target.value)} disabled={selected.status==="terminee"}/></div>
            </div>
            <div><Label>Travaux réalisés *</Label><Textarea value={work} onChange={e=>setWork(e.target.value)} rows={3} placeholder="Décrire précisément les travaux exécutés, les quantités et les résultats…"/></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Constats / observations</Label><Textarea value={observations} onChange={e=>setObservations(e.target.value)} rows={3} disabled={selected.status==="terminee"}/></div><div><Label>Recommandations / suite à donner</Label><Textarea value={recommendations} onChange={e=>setRecommendations(e.target.value)} rows={3} disabled={selected.status==="terminee"}/></div></div>
            <div><Label>Compte rendu destiné au client</Label><Textarea value={clientSummary} onChange={e=>setClientSummary(e.target.value)} rows={2} placeholder="Résumé clair des travaux et résultats à communiquer au client…" disabled={selected.status==="terminee"}/></div>
            <div className="rounded-lg border p-3 space-y-2"><div><Label>Localisation GPS (dans cette page uniquement)</Label><p className="text-xs text-muted-foreground">Cliquez sur la carte ou utilisez « Ma position » pour enregistrer le lieu réel de l’intervention.</p></div>
              <div className="grid gap-2 sm:grid-cols-2"><div><Label className="text-xs">Latitude</Label><Input type="number" step="any" value={latitude} onChange={e=>setLatitude(e.target.value)}/></div><div><Label className="text-xs">Longitude</Label><Input type="number" step="any" value={longitude} onChange={e=>setLongitude(e.target.value)}/></div></div>
              <InteractiveMap key={`${selected?.id}-${selectedEvents.length}`} mode="pick" position={latitude&&longitude?[Number(latitude),Number(longitude)]:null} onPositionChange={(lat,lng)=>{setLatitude(String(lat));setLongitude(String(lng));}} height="220px"/>
            </div>
            <Button className="w-full" onClick={()=>void save()} disabled={saving||selected.status==="terminee"}><CheckCircle2 className="mr-2 h-4 w-4"/>{saving?"Enregistrement…":selected.status==="terminee"?"Dossier clôturé":"Enregistrer l’intervention indépendante"}</Button>
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Historique technique</CardTitle></CardHeader><CardContent>
            {selectedEvents.length===0?<p className="py-4 text-sm text-muted-foreground">Aucune intervention enregistrée sur ce devis.</p>:<div className="space-y-3">{selectedEvents.map(e=><div key={e.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{e.details?.type_intervention||"Intervention"}</span><Badge variant="outline">{statusLabel[e.details?.statut]||e.details?.statut||"Enregistrée"}</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">{e.details?.date_intervention||new Date(e.created_at).toLocaleDateString("fr-FR")} · Enregistrée le {new Date(e.created_at).toLocaleString("fr-FR")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{e.details?.travaux_realises||"—"}</p>
              {e.details?.observations&&<p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Constat : {e.details.observations}</p>}
              {e.details?.recommandations&&<p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Suite : {e.details.recommandations}</p>}
              {e.details?.contenu_client&&<p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Compte rendu client : {e.details.contenu_client}</p>}
              {(e.details?.nombre_plants_prevus!=null||e.details?.nombre_plants_realises!=null||e.details?.nombre_plants_remplaces!=null)&&<p className="mt-1 text-xs text-muted-foreground">Plants : {e.details?.nombre_plants_realises??"—"} réalisés / {e.details?.nombre_plants_prevus??"—"} prévus · {e.details?.nombre_plants_remplaces??"—"} remplacés</p>}
              {e.details?.superficie_ha!=null&&<p className="mt-1 text-xs text-muted-foreground">Surface : {e.details.superficie_ha} ha{e.details?.densite_plants?" · Densité : "+e.details.densite_plants+" plants/ha":""}</p>}
              {e.details?.latitude!=null&&e.details?.longitude!=null&&<p className="mt-1 text-xs text-muted-foreground">GPS : {e.details.latitude}, {e.details.longitude}</p>}
            </div>)}</div>}
          </CardContent></Card>
        </div>}
      </div>}
    {markers.length>0&&<Card><CardHeader className="pb-2"><CardTitle className="text-base">Localisation des interventions indépendantes</CardTitle></CardHeader><CardContent><InteractiveMap mode="view" markers={markers} height="360px"/></CardContent></Card>}
  </div>;
}
