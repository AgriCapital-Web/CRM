import MediaUploadVisual from "@/components/ui/media-upload-visual";
import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { offlineInsert } from "@/lib/offlineWrite";
import { uploadOrQueueFile } from "@/lib/offlineFiles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InteractiveMap from "@/components/maps/InteractiveMap";

const isPalmInvest=(p:any)=>{
  const code=String(p?.formule_code||p?.client?.formule_code||"").toUpperCase();
  const family=String(p?.famille_offre||p?.client?.famille_offre||"").toUpperCase();
  return code.includes("PALMINVEST") || family.includes("PALMINVEST");
};
const TechnicienTerrain=()=>{
  const {user,userRoles}=useAuth();
  const {toast}=useToast();
  const {can}=usePermissions();
  const allowed=can("rapports.view_technique");
  const manager=can("rapports.manage_technique");
  const { byCategory: systemRefs } = useSystemReferences(["etape_plantation","intervention_statut","rapport_type_visite","etat_plantation"]);
  const stageRefs=systemRefs("etape_plantation");
  const reportTypeRefs=systemRefs("rapport_type_visite");
  const interventionStatusRefs=systemRefs("intervention_statut");
  const plantationStateRefs=systemRefs("etat_plantation");
  const [plantations,setPlantations]=useState<any[]>([]);
  const [clients,setClients]=useState<any[]>([]);
  const [parcelles,setParcelles]=useState<any[]>([]);
  const [reports,setReports]=useState<any[]>([]);
  const [interventions,setInterventions]=useState<any[]>([]);
  const [tickets,setTickets]=useState<any[]>([]);
  const [techniciens,setTechniciens]=useState<any[]>([]);
  const [reassignInterventionId,setReassignInterventionId]=useState("");
  const [reassignReportId,setReassignReportId]=useState("");
  const [reassignTechnicienId,setReassignTechnicienId]=useState("");
  const [conventions,setConventions]=useState<any[]>([]);
  const [lots,setLots]=useState<any[]>([]);
  const [localisationMode,setLocalisationMode]=useState<"automatic"|"manual">("automatic");
  const [loading,setLoading]=useState(true);
  const [activeTab,setActiveTab]=useState("rapport");
  const [saving,setSaving]=useState(false);
  const [report,setReport]=useState<any>({
    plantation_id:"",date_visite:new Date().toISOString().slice(0,16),type_visite:"suivi",
    constat:"",travaux_realises:"",etat_plantation:"",etat_plantation_autre:"",observations:"",recommandations:"",contenu_client:"",
    prochaine_intervention:"",localisation_gps_lat:"",localisation_gps_lng:""
  });
  const [media,setMedia]=useState<File[]>([]);
  const [intervention,setIntervention]=useState<any>({
    plantation_id:"",client_id:"",parcelle_id:"",convention_id:"",lot_id:"",localisation_gps_lat:"",localisation_gps_lng:"",type_intervention:"defrichage",date_intervention:new Date().toISOString().slice(0,10),
    observations:"",recommandations:"",statut:"planifiee",nombre_plants_prevus:"",nombre_plants_realises:"",nombre_plants_remplaces:"",densite_plants:""
  });

  const profileContext=async()=>{
    const uid=user?.id;
    if(!uid)return null;
    try {
      const {data}=await (supabase as any).from("profiles").select("id,equipe_id,nom_complet").eq("user_id",uid).maybeSingle();
      if(data) return data;
    } catch (error) { void error; }
    return null;
  };

  const load=async()=>{
    if(!allowed)return;
    setLoading(true);
    const profile=await profileContext();
    const [{data:p},{data:c},{data:pa},{data:r},{data:i},{data:t},{data:td}]=await Promise.all([
      (supabase as any).from("plantations").select("id,id_unique,nom_plantation,nom,superficie_ha,client_id,statut_global,prochaine_visite,date_plantation").order("nom_plantation"),
      (supabase as any).from("clients").select("id,id_unique,formule_code,formule_nom,famille_offre,nom_complet,total_hectares,parcelle_id").order("nom_complet"),
      (supabase as any).from("parcelles").select("id,id_unique,nom,village,surface_totale_ha,region_id,plantation_date_activation,plantation_type_culture,plantation_densite_plants,proprietaire_id,convention_id,code_parc,proprietaire:proprietaires_terres(id,nom_complet)").order("nom"),
      (supabase as any).from("rapports_visites_techniques").select("*,plantation:plantations(id_unique,nom_plantation),agent:profiles!rapports_visites_techniques_agent_technique_id_fkey(nom_complet)").order("date_visite",{ascending:false}).limit(100),
      (supabase as any).from("interventions_techniques").select("*,plantation:plantations(id_unique,nom_plantation),agent:profiles!interventions_techniques_agent_technique_id_fkey(nom_complet)").order("date_intervention",{ascending:false}).limit(100)
      ,(supabase as any).from("tickets_techniques").select("*,client:clients(nom_complet),plantation:plantations(id_unique,nom_plantation)").eq("assigne_a",profile?.id||"00000000-0000-0000-0000-000000000000").order("created_at",{ascending:false})
      ,(supabase as any).from("profiles").select("id,nom_complet,user_id").eq("actif",true).order("nom_complet")
    ]);
    setPlantations(p||[]);setClients(c||[]);setParcelles(pa||[]);setReports(r||[]);setInterventions(i||[]);setTickets(t||[]);
    setTechniciens((td||[]).map((x:any)=>({...x,id:x.id,profile_id:x.id})));
    setLoading(false);
  };

  useEffect(()=>{load();},[allowed]);

  const interventionClient=useMemo(()=>clients.find(c=>c.id===intervention.client_id)||null,[clients,intervention.client_id]);
  const interventionPlantation=useMemo(()=>plantations.find(p=>p.id===intervention.plantation_id)||null,[plantations,intervention.plantation_id]);
  const technicalPalmInvest=isPalmInvest(interventionClient||interventionPlantation);
  const technicalOwnLand=!technicalPalmInvest;

  useEffect(()=>{
    if(!interventionClient)return;
    if(technicalOwnLand){
      setIntervention((x:any)=>({...x,parcelle_id:interventionClient.parcelle_id||"",convention_id:"",lot_id:""}));
      return;
    }
    const parcelId=intervention.parcelle_id||interventionClient.parcelle_id||"";
    const parcel=parcelles.find((p:any)=>p.id===parcelId);
    setIntervention((x:any)=>({...x,parcelle_id:parcelId,convention_id:parcel?.convention_id||"",lot_id:""}));
  },[intervention.client_id,technicalOwnLand,parcelles]);

  useEffect(()=>{
    if(!intervention.parcelle_id)return;
    (async()=>{
      const {data}=await (supabase as any).from("parcelles").select("localisation_gps_lat,localisation_gps_lng").eq("id",intervention.parcelle_id).maybeSingle();
      if(data?.localisation_gps_lat!=null && data?.localisation_gps_lng!=null){
        setIntervention((x:any)=>({...x,localisation_gps_lat:String(data.localisation_gps_lat),localisation_gps_lng:String(data.localisation_gps_lng)}));
      }
    })();
  },[intervention.parcelle_id]);

  useEffect(()=>{
    if(!intervention.convention_id||!intervention.parcelle_id){setLots([]);return;}
    (async()=>{
      const {data}=await (supabase as any).from("lots_hectares")
        .select("id,reference,numero_h,surface_ha,statut,certifie_geometre,parcelle_id,client_id")
        .eq("convention_id",intervention.convention_id)
        .eq("parcelle_id",intervention.parcelle_id)
        .eq("statut","disponible")
        .is("client_id",null)
        .order("numero_h");
      setLots(data||[]);
    })();
  },[intervention.convention_id,intervention.parcelle_id]);

  const plantation=useMemo(()=>{
    const p=plantations.find(x=>x.id===report.plantation_id);
    if(!p)return null;
    return {...p,client:clients.find(c=>c.id===p.client_id)||null};
  },[plantations,clients,report.plantation_id]);
  const palmInvest=useMemo(()=>isPalmInvest(plantation),[plantation]);
  const applicableStages=!palmInvest?(plantation?.date_plantation?stageRefs.filter((x:any)=>["suivi_mensuel","autre"].includes(x.code)):stageRefs.filter((x:any)=>["validation_parcelle","piquetage","trouaison","mise_en_terre"].includes(x.code))):stageRefs;

  const saveReport=async(submit:boolean)=>{
    if(!report.plantation_id){toast({variant:"destructive",title:"Plantation requise"});return;}
    if(!report.constat&&!report.travaux_realises&&!report.observations){toast({variant:"destructive",title:"Rapport incomplet",description:"Renseignez au moins le constat ou les travaux réalisés."});return;}
    setSaving(true);
    try{
      const profile=await profileContext(); if(!profile?.id)throw new Error("Profil technicien introuvable");
      const id=crypto.randomUUID();
      const payload={
        id,plantation_id:report.plantation_id,client_id:plantation?.client_id||null,agent_technique_id:profile.id,equipe_id:profile.equipe_id||null,ticket_id:report.ticket_id||null,
        date_visite:new Date(report.date_visite).toISOString(),type_visite:report.type_visite,
        constat:report.constat||null,travaux_realises:report.travaux_realises||null,etat_plantation:report.etat_plantation==="autre" ? (report.etat_plantation_autre||null) : (report.etat_plantation||null),
        observations:report.observations||null,recommandations:report.recommandations||null,contenu_client:report.contenu_client||null,
        prochaine_intervention:report.prochaine_intervention||null,
        localisation_gps_lat:report.localisation_gps_lat?Number(report.localisation_gps_lat):null,
        localisation_gps_lng:report.localisation_gps_lng?Number(report.localisation_gps_lng):null,
        statut:submit?"soumis":"brouillon",client_visible:false,created_by:profile.id
      };
      const {error}=await offlineInsert("rapports_visites_techniques",payload);
      if(error)throw error;
      for(const file of media){
        const path=`plantations/${report.plantation_id}/rapports/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
        const uploaded=await uploadOrQueueFile({bucket:"rapports-techniques",path,file});
        await offlineInsert("rapports_visites_medias",{
          id:crypto.randomUUID(),rapport_id:id,plantation_id:report.plantation_id,
          media_type:file.type.startsWith("video/")?"video":"photo",storage_path:uploaded.path,
          mime_type:file.type,nom_fichier:file.name,client_visible:false,created_by:profile.id
        });
      }
      toast({title:submit?"Rapport soumis":"Brouillon enregistré",description:media.length?`${media.length} média(s) rattaché(s).`:undefined});
      setMedia([]);
      setReport({ticket_id:"",plantation_id:"",date_visite:new Date().toISOString().slice(0,16),type_visite:"suivi",constat:"",travaux_realises:"",etat_plantation:"",etat_plantation_autre:"",observations:"",recommandations:"",contenu_client:"",prochaine_intervention:"",localisation_gps_lat:"",localisation_gps_lng:""});
      load();
    }catch(e:any){toast({variant:"destructive",title:"Enregistrement impossible",description:e?.message||"Erreur inconnue"});}
    finally{setSaving(false);}
  };

  const reassignIntervention=async()=>{
    if(!reassignInterventionId||!reassignTechnicienId)return;
    try{
      const {error}=await (supabase as any).rpc("reassign_intervention",{_intervention_id:reassignInterventionId,_new_profile_id:reassignTechnicienId});
      if(error)throw error;
      toast({title:"Réaffectation effectuée",description:"L’intervention est désormais affectée au nouveau technicien."});
      setReassignInterventionId("");setReassignTechnicienId("");
      await load();
    }catch(error:any){
      toast({variant:"destructive",title:"Réaffectation impossible",description:error?.message||"Le technicien sélectionné n’est pas autorisé dans votre périmètre."});
    }
  };

  const saveIntervention=async()=>{
    const interventionPlantation=plantations.find(p=>p.id===intervention.plantation_id);
    const targetClientId=intervention.client_id||interventionPlantation?.client_id||null;
    const targetParcelleId=technicalPalmInvest ? (intervention.parcelle_id||interventionPlantation?.parcelle_id||null) : (intervention.parcelle_id||interventionClient?.parcelle_id||interventionPlantation?.parcelle_id||null);
    const isPrePlantationStage=["defrichage","piquetage","trouaison","mise_en_terre"].includes(intervention.type_intervention);
    if(!targetClientId){toast({variant:"destructive",title:"Client / dossier requis",description:"Sélectionnez le Client ou dossier concerné."});return;}
    if(!targetParcelleId){toast({variant:"destructive",title:"Identification de la parcelle requise",description:"La parcelle doit être identifiée dans le parcours technique avant l’enregistrement de cette intervention."});return;}
    if(technicalPalmInvest && (!intervention.convention_id || !intervention.lot_id)){toast({variant:"destructive",title:"Lot requis",description:"Sélectionnez une parcelle puis un lot disponible avant de commencer le suivi technique."});return;}
    if(!isPrePlantationStage && !intervention.plantation_id){toast({variant:"destructive",title:"Plantation requise",description:"Cette étape intervient après la création de la plantation."});return;}
    const technicalContext={...interventionPlantation,client:interventionClient,date_plantation:interventionPlantation?.date_plantation};
    const interventionStages=!isPalmInvest(technicalContext)
      ? (interventionPlantation?.date_plantation?stageRefs.filter((x:any)=>["suivi_mensuel","autre"].includes(x.code)):stageRefs.filter((x:any)=>["validation_parcelle","piquetage","trouaison","mise_en_terre"].includes(x.code)))
      : stageRefs;
    if(!interventionStages.some((x:any)=>x.code===intervention.type_intervention)){toast({variant:"destructive",title:"Étape non applicable",description:"Cette étape n’est pas autorisée pour le parcours ou la phase actuelle."});return;}
    setSaving(true);
    try{
      const profile=await profileContext(); if(!profile?.id)throw new Error("Profil technicien introuvable");
      if(intervention.localisation_gps_lat && intervention.localisation_gps_lng){
        const {error:geoError}=await (supabase as any).from("parcelles").update({localisation_gps_lat:Number(intervention.localisation_gps_lat),localisation_gps_lng:Number(intervention.localisation_gps_lng),updated_by:profile.id}).eq("id",targetParcelleId);
        if(geoError)throw geoError;
      }
      if(technicalPalmInvest){
        const {error:clientParcelError}=await (supabase as any).from("clients").update({parcelle_id:targetParcelleId,updated_at:new Date().toISOString()}).eq("id",targetClientId);
        if(clientParcelError)throw clientParcelError;
        const {data:lotRow,error:lotReadError}=await (supabase as any).from("lots_hectares").select("id,client_id,parcelle_id,convention_id,statut").eq("id",intervention.lot_id).maybeSingle();
        if(lotReadError)throw lotReadError;
        if(!lotRow||lotRow.parcelle_id!==targetParcelleId||lotRow.convention_id!==intervention.convention_id||lotRow.client_id){throw new Error("Le lot sélectionné n'est plus disponible pour cette parcelle.");}
        const {error:lotAssignError}=await (supabase as any).from("lots_hectares").update({client_id:targetClientId,statut:"attribue",date_attribution:new Date().toISOString().slice(0,10)}).eq("id",intervention.lot_id).is("client_id",null);
        if(lotAssignError)throw lotAssignError;
        if(intervention.plantation_id){
          const {error:plantationLotError}=await (supabase as any).from("plantations").update({lot_id:intervention.lot_id,parcelle_id:targetParcelleId,updated_at:new Date().toISOString()}).eq("id",intervention.plantation_id);
          if(plantationLotError)throw plantationLotError;
        }
      }
      const payload={...intervention,id:crypto.randomUUID(),agent_technique_id:profile.id,
        client_id:targetClientId,parcelle_id:targetParcelleId,plantation_id:intervention.plantation_id||null,
        convention_id:intervention.convention_id||null,lot_id:intervention.lot_id||null,
        nombre_plants_prevus:intervention.nombre_plants_prevus?Number(intervention.nombre_plants_prevus):null,
        nombre_plants_realises:intervention.nombre_plants_realises?Number(intervention.nombre_plants_realises):null,
        nombre_plants_remplaces:intervention.nombre_plants_remplaces?Number(intervention.nombre_plants_remplaces):null,
        densite_plants:intervention.densite_plants?Number(intervention.densite_plants):null
      };
      const {error}=await offlineInsert("interventions_techniques",payload);
      if(error)throw error;
      toast({title:intervention.type_intervention==="mise_en_terre"&&intervention.statut==="realisee"?"Mise en terre validée":"Intervention enregistrée",description:intervention.type_intervention==="mise_en_terre"&&intervention.statut==="realisee"?"Intervention technique enregistrée.":undefined});
      setIntervention({plantation_id:"",client_id:"",parcelle_id:"",convention_id:"",lot_id:"",localisation_gps_lat:"",localisation_gps_lng:"",type_intervention:stageRefs[0]?.code||"",date_intervention:new Date().toISOString().slice(0,10),observations:"",recommandations:"",statut:"planifiee",nombre_plants_prevus:"",nombre_plants_realises:"",nombre_plants_remplaces:"",densite_plants:""});
      load();
    }catch(e:any){toast({variant:"destructive",title:"Enregistrement impossible",description:e?.message||"Erreur inconnue"});}
    finally{setSaving(false);}
  };

  const reassignReport=async()=>{
    if(!reassignReportId||!reassignTechnicienId)return;
    const {error}=await (supabase as any).rpc("reassign_report",{_report_id:reassignReportId,_new_profile_id:reassignTechnicienId});
    if(error){
      toast({variant:"destructive",title:"Réaffectation impossible",description:error?.message||"Le technicien sélectionné n’est pas autorisé dans votre périmètre."});
      return;
    }
    toast({title:"Réaffectation effectuée",description:"Le rapport est désormais affecté au nouveau technicien."});
    setReassignReportId("");setReassignTechnicienId("");load();
  };

  const validateReport=async(r:any,publish:boolean)=>{
    if(!manager)return;
    const {error}=await (supabase as any).from("rapports_visites_techniques").update({statut:publish?"valide":"rejete",client_visible:publish}).eq("id",r.id);
    if(error)toast({variant:"destructive",title:"Validation impossible",description:error.message});
    else{toast({title:publish?"Rapport validé et publié":"Rapport refusé"});load();}
  };

  if(!allowed)return <ProtectedRoute><MainLayout><Card><CardHeader><CardTitle>Accès technicien</CardTitle><CardDescription>Cette interface est réservée aux accès techniques autorisés.</CardDescription></CardHeader></Card></MainLayout></ProtectedRoute>;

  return <ProtectedRoute><MainLayout><div className="min-w-0 w-full max-w-full space-y-6 overflow-hidden">
    <div><h1 className="text-3xl font-bold">Technique — suivi des plantations</h1><p className="text-muted-foreground">Visites, interventions, rapports et médias des plantations.</p></div>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 w-full">
      <div className="w-full min-w-0 overflow-x-auto pb-1"><TabsList className="inline-flex min-w-max whitespace-nowrap"><TabsTrigger value="demandes">Demandes à traiter {tickets.length>0&&<Badge className="ml-2">{tickets.length}</Badge>}</TabsTrigger><TabsTrigger value="rapport">Rapport de visite</TabsTrigger><TabsTrigger value="intervention">Intervention</TabsTrigger><TabsTrigger value="historique">Historique</TabsTrigger></TabsList></div>

      <TabsContent value="demandes" className="space-y-4">
        <Card><CardHeader><CardTitle>Demandes clients à traiter</CardTitle><CardDescription>Les demandes qui vous sont affectées apparaissent ici. Ouvrez une demande pour préparer directement votre rapport.</CardDescription></CardHeader><CardContent className="space-y-3">
          {tickets.length===0?<p className="text-sm text-muted-foreground">Aucune demande en attente.</p>:tickets.map(t=><div key={t.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{t.titre}</p><p className="text-sm text-muted-foreground">{t.client?.nom_complet||"Client"} · {t.plantation?.nom_plantation||t.plantation?.id_unique||"Plantation"}</p></div><Badge>{t.priorite}</Badge></div>
            <p className="text-sm mt-2">{t.description}</p>
            <div className="flex justify-end mt-3"><Button onClick={()=>{setReport((x:any)=>({...x,ticket_id:t.id,plantation_id:t.plantation_id,type_visite:"incident",constat:t.description||"",recommandations:t.action_recommandee||""}));setActiveTab("rapport");}}>Intervenir et faire le rapport</Button></div>
          </div>)}
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="rapport" className="space-y-5">
        <Card><CardHeader><CardTitle>Nouveau rapport terrain</CardTitle><CardDescription>Le rapport reste privé jusqu’à validation technique.</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Demande support</Label><Select value={report.ticket_id||"none"} onValueChange={v=>setReport((x:any)=>({...x,ticket_id:v==="none"?"":v}))}><SelectTrigger><SelectValue placeholder="Aucune demande liée"/></SelectTrigger><SelectContent><SelectItem value="none">Aucune</SelectItem>{tickets.map(t=><SelectItem key={t.id} value={t.id}>{t.titre}</SelectItem>)}</SelectContent></Select></div><div><Label>Plantation *</Label><Select value={report.plantation_id} onValueChange={v=>setReport((x:any)=>({...x,plantation_id:v}))}><SelectTrigger><SelectValue placeholder="Sélectionner une plantation"/></SelectTrigger><SelectContent>{plantations.map(p=><SelectItem key={p.id} value={p.id}>{p.nom_plantation||p.nom||p.id_unique}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Date et heure *</Label><Input type="datetime-local" value={report.date_visite} onChange={e=>setReport((x:any)=>({...x,date_visite:e.target.value}))}/></div>
            <div><Label>Type de visite</Label><Select value={report.type_visite} onValueChange={v=>setReport((x:any)=>({...x,type_visite:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{reportTypeRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div>
  <Label>État de la plantation</Label>
  <Select value={report.etat_plantation||"none"} onValueChange={v=>setReport((x:any)=>({...x,etat_plantation:v==="none"?"":v,etat_plantation_autre:v==="autre"?x.etat_plantation_autre:""}))}>
    <SelectTrigger><SelectValue placeholder="Sélectionner l’état"/></SelectTrigger>
    <SelectContent><SelectItem value="none">Sélectionner</SelectItem>{plantationStateRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent>
  </Select>
  {report.etat_plantation==="autre"&&<Input className="mt-2" value={report.etat_plantation_autre||""} onChange={e=>setReport((x:any)=>({...x,etat_plantation_autre:e.target.value}))} placeholder="Préciser l’état"/>}
</div>
          </div>
          <div className="grid md:grid-cols-2 gap-4"><div><Label>Constat</Label><Textarea value={report.constat} onChange={e=>setReport((x:any)=>({...x,constat:e.target.value}))}/></div><div><Label>{!palmInvest?"Actions d’encadrement / suivi":"Travaux réalisés"}</Label><Textarea value={report.travaux_realises} onChange={e=>setReport((x:any)=>({...x,travaux_realises:e.target.value}))}/></div></div>
          <div className="grid md:grid-cols-2 gap-4"><div><Label>Observations internes</Label><Textarea value={report.observations} onChange={e=>setReport((x:any)=>({...x,observations:e.target.value}))}/></div><div><Label>Recommandations internes</Label><Textarea value={report.recommandations} onChange={e=>setReport((x:any)=>({...x,recommandations:e.target.value}))}/></div></div>
          <div><Label>Message destiné au client</Label><Textarea value={report.contenu_client} onChange={e=>setReport((x:any)=>({...x,contenu_client:e.target.value}))} placeholder="Ce message pourra être publié dans l’espace client après validation technique."/></div>
          <div className="grid md:grid-cols-3 gap-4"><div><Label>Prochaine intervention</Label><Input type="date" value={report.prochaine_intervention} onChange={e=>setReport((x:any)=>({...x,prochaine_intervention:e.target.value}))}/></div><div><Label>Latitude</Label><Input value={report.localisation_gps_lat} onChange={e=>setReport((x:any)=>({...x,localisation_gps_lat:e.target.value}))}/></div><div><Label>Longitude</Label><Input value={report.localisation_gps_lng} onChange={e=>setReport((x:any)=>({...x,localisation_gps_lng:e.target.value}))}/></div></div>
          <div><Label>Photos / vidéos</Label><MediaUploadVisual label="Photos / vidéos" files={media} onChange={setMedia}/><p className="text-xs text-muted-foreground mt-1">Les médias restent privés jusqu’à validation du rapport.</p></div>
          <div className="flex gap-3 justify-end"><Button variant="outline" disabled={saving} onClick={()=>saveReport(false)}>Enregistrer brouillon</Button><Button disabled={saving} onClick={()=>saveReport(true)}>Soumettre le rapport</Button></div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="intervention" className="space-y-5">
        <Card><CardHeader><CardTitle>Intervention technique</CardTitle><CardDescription>Enregistrez l’intervention selon le dossier et l’étape technique.</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>Client / dossier *</Label><Select value={intervention.client_id} onValueChange={v=>setIntervention((x:any)=>({...x,client_id:v,parcelle_id:clients.find(c=>c.id===v)?.parcelle_id||"",plantation_id:"",convention_id:"",lot_id:""}))}><SelectTrigger><SelectValue placeholder="Sélectionner un Client"/></SelectTrigger><SelectContent>{clients.map(c=><SelectItem key={c.id} value={c.id}>{c.nom_complet} · {c.id_unique}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Parcours foncier</Label><div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center text-sm">{technicalOwnLand?"Parcelle propre au Client":"Foncier AgriCapital — convention / lot"}</div></div>
            <div><Label>Plantation</Label><Select value={intervention.plantation_id||"none"} onValueChange={v=>{const p=plantations.find(x=>x.id===v);setIntervention((x:any)=>({...x,plantation_id:v==="none"?"":v,client_id:p?.client_id||x.client_id,parcelle_id:p?.parcelle_id||x.parcelle_id}));}}><SelectTrigger><SelectValue placeholder="Aucune si avant plantation"/></SelectTrigger><SelectContent><SelectItem value="none">Aucune — avant plantation</SelectItem>{plantations.filter(p=>!intervention.client_id||p.client_id===intervention.client_id).map(p=><SelectItem key={p.id} value={p.id}>{p.nom_plantation||p.nom||p.id_unique}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Date *</Label><Input type="date" value={intervention.date_intervention} onChange={e=>setIntervention((x:any)=>({...x,date_intervention:e.target.value}))}/></div>
          </div>
          {technicalPalmInvest&&<div className="grid md:grid-cols-2 gap-4 rounded-xl border p-4">
            <div><Label>Convention foncière active *</Label><Select value={intervention.convention_id||""} onValueChange={v=>setIntervention((x:any)=>({...x,convention_id:v,lot_id:"",parcelle_id:""}))}><SelectTrigger><SelectValue placeholder="Sélectionner une convention"/></SelectTrigger><SelectContent>{conventions.map(c=><SelectItem key={c.id} value={c.id}>{c.reference} — {c.proprietaire?.nom_complet||"Propriétaire non renseigné"}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Lot disponible *</Label><Select value={intervention.lot_id||""} onValueChange={v=>{const lot=lots.find(l=>l.id===v);setIntervention((x:any)=>({...x,lot_id:v,parcelle_id:lot?.parcelle_id||""}));}} disabled={!intervention.convention_id}><SelectTrigger><SelectValue placeholder="Sélectionner un lot"/></SelectTrigger><SelectContent>{lots.map(l=><SelectItem key={l.id} value={l.id}>{l.reference||("H"+String(l.numero_h).padStart(2,"0"))} — {l.surface_ha} ha</SelectItem>)}</SelectContent></Select></div>
          </div>}
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Étape technique</Label><Select value={intervention.type_intervention} onValueChange={v=>setIntervention((x:any)=>({...x,type_intervention:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{((()=>{const p=plantations.find(x=>x.id===intervention.plantation_id);const c=clients.find(x=>x.id===(intervention.client_id||p?.client_id));const stages=!isPalmInvest({...p,client:c})?(p?.date_plantation?stageRefs.filter((x:any)=>["suivi_mensuel","autre"].includes(x.code)):stageRefs.filter((x:any)=>["validation_parcelle","piquetage","trouaison","mise_en_terre"].includes(x.code))):stageRefs;return stages;})()).map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Statut</Label><Select value={intervention.statut} onValueChange={v=>setIntervention((x:any)=>({...x,statut:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{interventionStatusRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="rounded-xl border p-4 space-y-4">
            <div><Label>Localisation GPS</Label><p className="text-xs text-muted-foreground">La localisation de la parcelle est identifiée par le technicien et rattachée au dossier.</p></div>
            <div className="flex gap-2">
              <Button type="button" variant={localisationMode==="automatic"?"default":"outline"} onClick={()=>setLocalisationMode("automatic")}>Localisation automatique</Button>
              <Button type="button" variant={localisationMode==="manual"?"default":"outline"} onClick={()=>setLocalisationMode("manual")}>Localisation manuelle</Button>
            </div>
            {localisationMode==="manual"&&<div className="grid md:grid-cols-2 gap-4">
              <div><Label>Latitude</Label><Input type="number" step="any" value={intervention.localisation_gps_lat||""} onChange={e=>setIntervention((x:any)=>({...x,localisation_gps_lat:e.target.value}))}/></div>
              <div><Label>Longitude</Label><Input type="number" step="any" value={intervention.localisation_gps_lng||""} onChange={e=>setIntervention((x:any)=>({...x,localisation_gps_lng:e.target.value}))}/></div>
            </div>}
            <InteractiveMap mode="pick" position={intervention.localisation_gps_lat&&intervention.localisation_gps_lng?[Number(intervention.localisation_gps_lat),Number(intervention.localisation_gps_lng)]:null} onPositionChange={(lat,lng)=>setIntervention((x:any)=>({...x,localisation_gps_lat:String(lat),localisation_gps_lng:String(lng)}))} height="320px" />
            {localisationMode==="automatic"&&<p className="text-xs text-muted-foreground">Utilisez « Ma position » sur la carte pour détecter automatiquement les coordonnées du terrain.</p>}
          </div>
          <div className="grid md:grid-cols-2 gap-4"><div><Label>Constat / observations</Label><Textarea value={intervention.observations} onChange={e=>setIntervention((x:any)=>({...x,observations:e.target.value}))}/></div><div><Label>Recommandations</Label><Textarea value={intervention.recommandations} onChange={e=>setIntervention((x:any)=>({...x,recommandations:e.target.value}))}/></div></div>
           {(intervention.type_intervention==="mise_en_terre"||intervention.type_intervention==="remplacement") && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl border bg-muted/20 p-4"><div><Label>Densité (plants/ha)</Label><Input type="number" min="1" value={intervention.densite_plants} onChange={e=>setIntervention((x:any)=>({...x,densite_plants:e.target.value}))}/><p className="text-[10px] text-muted-foreground mt-1">Valeur de référence fournie par la base de données.</p></div><div><Label>Plants prévus</Label><Input type="number" min="0" value={intervention.nombre_plants_prevus} onChange={e=>setIntervention((x:any)=>({...x,nombre_plants_prevus:e.target.value}))}/></div><div><Label>{intervention.type_intervention==="remplacement"?"Plants remplacés":"Plants mis en terre"}</Label><Input type="number" min="0" value={intervention.type_intervention==="remplacement"?intervention.nombre_plants_remplaces:intervention.nombre_plants_realises} onChange={e=>setIntervention((x:any)=>intervention.type_intervention==="remplacement"?({...x,nombre_plants_remplaces:e.target.value}):({...x,nombre_plants_realises:e.target.value}))}/></div><div><Label>Calcul prévu</Label><div className="h-10 rounded-md border bg-background px-3 flex items-center text-sm">{(()=>{const p=plantations.find(x=>x.id===intervention.plantation_id);const ha=Number(p?.superficie_ha||0);return ha && Number(intervention.densite_plants)>0?`${Math.round(ha*Number(intervention.densite_plants))} plants`:"Renseignez la densité";})()}</div></div></div>}
          <div className="flex justify-end"><Button disabled={saving} onClick={saveIntervention}>Enregistrer l’intervention</Button></div>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="historique"><div className="grid lg:grid-cols-2 gap-5">
        <Card><CardHeader><CardTitle>Rapports récents</CardTitle></CardHeader><CardContent className="space-y-3">{loading?"Chargement…":reports.length===0?"Aucun rapport.":reports.map(r=><div key={r.id} className="border rounded-lg p-3"><div className="flex justify-between gap-3"><div><p className="font-medium">{r.plantation?.nom_plantation||r.plantation?.id_unique}</p><p className="text-xs text-muted-foreground">{new Date(r.date_visite).toLocaleString("fr-FR")}</p></div><Badge variant={r.client_visible?"default":"outline"}>{r.client_visible?"Publié":"Privé · "+r.statut}</Badge></div><p className="text-sm mt-2">{r.constat||r.observations||"—"}</p>{manager&&<div className="flex flex-wrap gap-2 mt-3">
  {r.statut==="soumis"&&<><Button size="sm" onClick={()=>validateReport(r,true)}>Valider & publier</Button><Button size="sm" variant="outline" onClick={()=>validateReport(r,false)}>Refuser</Button></>}
  <Button size="sm" variant="outline" onClick={()=>{setReassignReportId(r.id);setReassignTechnicienId(r.agent_technique_id||"");}}>Réaffecter</Button>
</div>}
{manager&&reassignReportId===r.id&&<div className="mt-3 flex flex-col sm:flex-row gap-2">
  <Select value={reassignTechnicienId||""} onValueChange={setReassignTechnicienId}>
    <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Nouveau technicien" /></SelectTrigger>
    <SelectContent>{techniciens.map((t:any)=><SelectItem key={t.id} value={t.id}>{t.nom_complet}</SelectItem>)}</SelectContent>
  </Select>
  <Button size="sm" onClick={reassignReport}>Confirmer</Button>
  <Button size="sm" variant="ghost" onClick={()=>{setReassignReportId("");setReassignTechnicienId("");}}>Annuler</Button>
</div>}</div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Interventions récentes</CardTitle></CardHeader><CardContent className="space-y-3">{interventions.length===0?"Aucune intervention.":interventions.map(i=><div key={i.id} className="border rounded-lg p-3"><div className="flex justify-between"><p className="font-medium">{i.plantation?.nom_plantation||i.plantation?.id_unique}</p><Badge variant="outline">{i.type_intervention}</Badge></div><p className="text-xs text-muted-foreground mt-1">{new Date(i.date_intervention).toLocaleDateString("fr-FR")} · {i.statut}</p><p className="text-sm mt-2">{i.observations||"—"}</p>
              <div className="flex items-center justify-between gap-3 mt-3">
                <span className="text-xs text-muted-foreground">Technicien : {i.agent?.nom_complet||"—"}</span>
                {manager && <Button size="sm" variant="outline" onClick={()=>{setReassignInterventionId(i.id);setReassignTechnicienId(i.agent_technique_id||"");}}>Réaffecter</Button>}
{manager && reassignInterventionId===i.id && <div className="flex flex-col sm:flex-row gap-2 mt-2">
  <Select value={reassignTechnicienId||""} onValueChange={setReassignTechnicienId}>
    <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Nouveau technicien" /></SelectTrigger>
    <SelectContent>{techniciens.map((t:any)=><SelectItem key={t.id} value={t.id}>{t.nom_complet}</SelectItem>)}</SelectContent>
  </Select>
  <Button size="sm" onClick={reassignIntervention}>Confirmer</Button>
  <Button size="sm" variant="ghost" onClick={()=>{setReassignInterventionId("");setReassignTechnicienId("");}}>Annuler</Button>
</div>}
              </div></div>)}</CardContent></Card>
      </div></TabsContent>
    </Tabs>
  </div></MainLayout></ProtectedRoute>;
};
export default TechnicienTerrain;
