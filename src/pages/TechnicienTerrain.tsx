import MediaUploadVisual from "@/components/ui/media-upload-visual";
import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { offlineInsert, offlineUpdate } from "@/lib/offlineWrite";
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
import { Pencil, Send, X, Plus } from "lucide-react";

const spacingForPlants = (surfaceHa:number, plants:number) => { if (!(surfaceHa > 0) || !(plants > 0)) return "À calculer"; const spacing = Math.sqrt((surfaceHa * 10000 * 2) / (plants * Math.sqrt(3))); const formatted = spacing.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }); return `${formatted} × ${formatted} m`; };

const TechnicienTerrain=()=>{
  const {user}=useAuth();
  const {toast}=useToast();
  const {can,roles}=usePermissions();
  const allowed=can("rapports.view_technique");
  const manager=can("rapports.manage_technique");
  const canReassignTechnician=roles.includes("pdg");
  const { byCategory: systemRefs } = useSystemReferences(["etape_plantation","intervention_statut","rapport_type_visite","etat_plantation"]);
  const stageRefs=systemRefs("etape_plantation");
  const reportTypeRefs=systemRefs("rapport_type_visite");
  const interventionStatusRefs=systemRefs("intervention_statut");
  const plantationStateRefs=systemRefs("etat_plantation");
  const [plantations,setPlantations]=useState<any[]>([]);
  const [clients,setClients]=useState<any[]>([]);
  const [clientAcquisitions,setClientAcquisitions]=useState<any[]>([]);
  const [offerConfigs,setOfferConfigs]=useState<any[]>([]);
  const [parcelles,setParcelles]=useState<any[]>([]);
  const [reports,setReports]=useState<any[]>([]);
  const [interventions,setInterventions]=useState<any[]>([]);
  const [tickets,setTickets]=useState<any[]>([]);
  const [selectedTicket,setSelectedTicket]=useState<any|null>(null);
  const [techniciens,setTechniciens]=useState<any[]>([]);
  const [reassignInterventionId,setReassignInterventionId]=useState("");
  const [reassignReportId,setReassignReportId]=useState("");
  const [reassignTechnicienId,setReassignTechnicienId]=useState("");
  const [editingInterventionId,setEditingInterventionId]=useState("");
  const [editingReportId,setEditingReportId]=useState("");
  const [reportEditEnabled,setReportEditEnabled]=useState(false);
  const [interventionEditEnabled,setInterventionEditEnabled]=useState(false);
  const [profileId,setProfileId]=useState("");
  const [profileName,setProfileName]=useState("");
  const [conventions,setConventions]=useState<any[]>([]);
  const [lots,setLots]=useState<any[]>([]);
  const [localisationMode,setLocalisationMode]=useState<"automatic"|"manual">("automatic");
  const [loading,setLoading]=useState(true);
  const [activeTab,setActiveTab]=useState("rapport");
  const [showReportForm,setShowReportForm]=useState(false);
  const [showInterventionForm,setShowInterventionForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [capturingReportPosition,setCapturingReportPosition]=useState(false);
  const [capturingInterventionPosition,setCapturingInterventionPosition]=useState(false);
  const [report,setReport]=useState<any>({
    client_id:"",plantation_id:"",date_visite:new Date().toISOString().slice(0,16),type_visite:"suivi",
    constat:"",travaux_realises:"",etat_plantation:"",etat_plantation_autre:"",observations:"",recommandations:"",contenu_client:"",
    prochaine_intervention:"",localisation_gps_lat:"",localisation_gps_lng:""
  });
  const [reportClientSearch,setReportClientSearch]=useState("");
  const [media,setMedia]=useState<File[]>([]);
  const [existingReportMedia,setExistingReportMedia]=useState<any[]>([]);
  const [intervention,setIntervention]=useState<any>({
    plantation_id:"",client_id:"",acquisition_id:"",parcelle_id:"",convention_id:"",lot_id:"",localisation_gps_lat:"",localisation_gps_lng:"",type_intervention:"defrichage",date_intervention:new Date().toISOString().slice(0,10),
    observations:"",recommandations:"",contenu_client:"",statut:"planifiee",nombre_plants_prevus:"",nombre_plants_realises:"",nombre_plants_remplaces:"",densite_plants:"",
    nouvelle_parcelle_nom:"",nouvelle_parcelle_surface:"",nouvelle_parcelle_village:""
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
    try {
      const profile=await profileContext();
      setProfileId(profile?.id||"");
      const rawTechnicianName=String(profile?.nom_complet||user?.user_metadata?.full_name||user?.user_metadata?.name||"Technicien AgriCapital").trim();
      const technicianNameParts=rawTechnicianName.split(/\s+/).filter(Boolean);
      // Accepte les deux formes courantes : « KOFFI Inocent » (nom d'abord)
      // et « Inocent KOFFI » (prénom d'abord). Affichage final : Prénom NOM.
      const firstPartIsSurname=technicianNameParts.length>1 && technicianNameParts[0]===technicianNameParts[0].toLocaleUpperCase("fr-FR") && technicianNameParts[0]!==technicianNameParts[0].toLocaleLowerCase("fr-FR");
      const givenNames=firstPartIsSurname?technicianNameParts.slice(1):technicianNameParts.slice(0,-1);
      const surname=firstPartIsSurname?technicianNameParts[0]:technicianNameParts[technicianNameParts.length-1];
      const titleCase=(value:string)=>value.toLocaleLowerCase("fr-FR").replace(/(^|[-'’])(\p{L})/gu,(_match:string,prefix:string,letter:string)=>prefix+letter.toLocaleUpperCase("fr-FR"));
      const formattedTechnicianName=technicianNameParts.length>1?`${givenNames.map(titleCase).join(" ")} ${surname.toLocaleUpperCase("fr-FR")}`:titleCase(rawTechnicianName);
      setProfileName(formattedTechnicianName);
      const results=await Promise.all([
        (supabase as any).from("plantations").select("id,id_unique,nom_plantation,nom,superficie_ha,client_id,parcelle_id,acquisition_id,statut_global,prochaine_visite,date_plantation,nombre_plants_prevus,nombre_plants_mis_en_terre,densite_plants,densite_cible,parcelles:parcelles(plantation_densite_plants)").order("nom_plantation"),
        (supabase as any).from("clients").select("id,id_unique,offre_id,formule_code,formule_nom,famille_offre,nom_complet,total_hectares,parcelle_id,proprietaire_id,district_id,region_id,departement_id,sous_prefecture_id,localite,is_internal,type_client_foncier").order("nom_complet"),
        (supabase as any).from("acquisitions").select("id,client_id,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,gestion_type,necessite_foncier_client,superficie_ha,parcelle_id,lot_id,statut,statut_technique,montant_pi_total,montant_total_contrat,parcelle:parcelles(plantation_densite_plants)").order("created_at",{ascending:false}),
        (supabase as any).from("parcelles").select("id,id_unique,nom,village,surface_totale_ha,region_id,plantation_date_activation,plantation_type_culture,plantation_densite_plants,proprietaire_id,convention_id,code_parc,proprietaire:proprietaires_terres(id,nom_complet)").order("nom"),
        (supabase as any).from("rapports_visites_techniques").select("*,plantation:plantations(id_unique,nom_plantation),agent:profiles!rapports_visites_techniques_agent_technique_id_fkey(nom_complet)").order("date_visite",{ascending:false}).limit(100),
        (supabase as any).from("interventions_techniques").select("*,plantation:plantations(id_unique,nom_plantation),agent:profiles!interventions_techniques_agent_technique_id_fkey(nom_complet)").order("date_intervention",{ascending:false}).limit(100),
        (supabase as any).from("tickets_techniques").select("*,client:clients(nom_complet),plantation:plantations(id_unique,nom_plantation),traiteur:profiles!tickets_techniques_traite_par_fkey(nom_complet)").eq("assigne_a",profile?.id||"00000000-0000-0000-0000-000000000000").order("created_at",{ascending:false}),
        (supabase as any).from("offres").select("id,code,nom,necessite_foncier_client,parcours_code,famille_offre,formule_code").eq("actif",true),
        (supabase as any).from("conventions_foncieres").select("id,parcelle_id,proprietaire_id,statut,part_agricapital_ha,part_proprietaire_ha").order("created_at",{ascending:false}),
        (supabase as any).rpc("list_assignable_technicians"),
      ]);
      const failed=results.find((result:any)=>result.error);
      if(failed?.error)throw failed.error;
      const [plantRes,clientRes,acquisitionRes,parcelRes,reportRes,interventionRes,ticketRes,offerRes,conventionRes,assignableTechniciansRes]=results;
      setPlantations(plantRes.data||[]);setClients(clientRes.data||[]);setClientAcquisitions(acquisitionRes.data||[]);setParcelles(parcelRes.data||[]);setReports(reportRes.data||[]);setInterventions(interventionRes.data||[]);setTickets(ticketRes.data||[]);
       setTechniciens((assignableTechniciansRes.data||[]).map((person:any)=>({...person,id:person.id,profile_id:person.id})));
      setOfferConfigs(offerRes.data||[]);setConventions(conventionRes.data||[]);
    } catch(error:any) {
      toast({variant:"destructive",title:"Chargement technique impossible",description:error?.message||"Vérifiez les accès aux données techniques."});
      setPlantations([]);setClients([]);setParcelles([]);setConventions([]);
    } finally { setLoading(false); }
  };

  useEffect(()=>{load();},[allowed]);
  useEffect(()=>{if(report.client_id&&!report.plantation_id){const owned=plantations.filter((p:any)=>p.client_id===report.client_id);if(owned.length===1)setReport((current:any)=>({...current,plantation_id:owned[0].id}));}},[plantations,report.client_id,report.plantation_id]);
  useRealtime({ table: "clients", onChange: load });
  useRealtime({ table: "plantations", onChange: load });
  useRealtime({ table: "parcelles", onChange: load });
  useRealtime({ table: "offres", onChange: load });
  useRealtime({ table: "interventions_techniques", onChange: load });
  useRealtime({ table: "rapports_visites_techniques", onChange: load });
  useRealtime({ table: "tickets_techniques", onChange: load });

  const interventionClient=useMemo(()=>clients.find(c=>c.id===intervention.client_id)||null,[clients,intervention.client_id]);
  const interventionPlantation=useMemo(()=>plantations.find(p=>p.id===intervention.plantation_id)||null,[plantations,intervention.plantation_id]);
  const interventionAcquisition=useMemo(()=>clientAcquisitions.find((s:any)=>s.id===intervention.acquisition_id)||null,[clientAcquisitions,intervention.acquisition_id]);
  const pendingClientAcquisitions=useMemo(()=>clientAcquisitions.filter((s:any)=>s.client_id===intervention.client_id&&s.statut_technique!=="mise_en_terre_realisee"),[clientAcquisitions,intervention.client_id]);
  const interventionOwnerClient=interventionClient || clients.find((c:any)=>c.id===interventionPlantation?.client_id) || null;
  const clientOffer=offerConfigs.find((o:any)=>o.id===(interventionAcquisition?.offre_id||interventionOwnerClient?.offre_id))
    || offerConfigs.find((o:any)=>o.famille_offre && o.famille_offre===(interventionAcquisition?.famille_offre||interventionOwnerClient?.famille_offre))
    || offerConfigs.find((o:any)=>o.code && o.code===(interventionAcquisition?.offre_code||interventionOwnerClient?.famille_offre))
    || null;
  const technicalPalmInvest=interventionAcquisition
    ? !interventionAcquisition.necessite_foncier_client
    : pendingClientAcquisitions.length>0 ? false
    : Boolean(clientOffer && [clientOffer.code,clientOffer.famille_offre,clientOffer.formule_code,clientOffer.nom].some((v:any)=>String(v||"").toUpperCase().replace(/[^A-Z]/g,"").includes("PALMINVEST")));
  const technicalOwnLand=interventionAcquisition
    ? !!interventionAcquisition.necessite_foncier_client
    : pendingClientAcquisitions.length>0 ? false
    : Boolean(clientOffer?.necessite_foncier_client===true);

  useEffect(()=>{
    if(!interventionClient)return;
    if(interventionAcquisition){
      setIntervention((x:any)=>({...x,parcelle_id:interventionAcquisition.parcelle_id||(interventionAcquisition.necessite_foncier_client?"":interventionClient.parcelle_id||""),convention_id:"",lot_id:interventionAcquisition.lot_id||""}));
      return;
    }
    if(technicalOwnLand){
      setIntervention((x:any)=>({...x,parcelle_id:interventionClient.parcelle_id||"",convention_id:"",lot_id:""}));
      return;
    }
    const parcelId=intervention.parcelle_id||interventionClient.parcelle_id||"";
    const parcel=parcelles.find((p:any)=>p.id===parcelId);
    setIntervention((x:any)=>({...x,parcelle_id:parcelId,convention_id:parcel?.convention_id||"",lot_id:""}));
  },[intervention.client_id,intervention.acquisition_id,interventionAcquisition,technicalOwnLand,parcelles]);



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
  const palmInvest=useMemo(()=>{
    const offer=offerConfigs.find((o:any)=>o.id===plantation?.client?.offre_id)
      || offerConfigs.find((o:any)=>o.famille_offre && o.famille_offre===plantation?.client?.famille_offre)
      || offerConfigs.find((o:any)=>o.code && o.code===plantation?.client?.famille_offre);
    return Boolean(offer && offer.necessite_foncier_client===false);
  },[plantation,offerConfigs]);
  // Le référentiel technique est partagé avec le Portail : on affiche toujours toutes les étapes actives, dans l'ordre du référentiel.
  const applicableStages=stageRefs;

  const captureReportPosition=()=>{
    if(!navigator.geolocation){
      toast({variant:"destructive",title:"Géolocalisation indisponible",description:"Votre appareil ou navigateur ne permet pas de récupérer la position."});
      return;
    }
    setCapturingReportPosition(true);
    navigator.geolocation.getCurrentPosition(({coords})=>{
      setReport((current:any)=>({...current,localisation_gps_lat:String(coords.latitude),localisation_gps_lng:String(coords.longitude)}));
      setCapturingReportPosition(false);
      toast({title:"Position enregistrée"});
    },(error)=>{
      setCapturingReportPosition(false);
      toast({variant:"destructive",title:"Position non enregistrée",description:error.code===1?"Autorisez l’accès à la position pour enregistrer les coordonnées.":"Impossible de récupérer la position. Vérifiez le GPS puis réessayez."});
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };

  const captureInterventionPosition=()=>{
    if(!navigator.geolocation){
      toast({variant:"destructive",title:"Géolocalisation indisponible",description:"Votre appareil ou navigateur ne permet pas de récupérer la position."});
      return;
    }
    setCapturingInterventionPosition(true);
    navigator.geolocation.getCurrentPosition(({coords})=>{
      setIntervention((current:any)=>({...current,localisation_gps_lat:String(coords.latitude),localisation_gps_lng:String(coords.longitude)}));
      setCapturingInterventionPosition(false);
      toast({title:"Position de l’intervention enregistrée"});
    },(error)=>{
      setCapturingInterventionPosition(false);
      toast({variant:"destructive",title:"Position non enregistrée",description:error.code===1?"Autorisez l’accès à la position pour enregistrer les coordonnées.":"Impossible de récupérer la position. Vérifiez le GPS puis réessayez."});
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };

  const openReport=async(item:any)=>{
    if(!manager && item.agent_technique_id!==profileId){
      toast({variant:"destructive",title:"Accès en lecture seule",description:"Vous ne pouvez modifier que vos propres rapports."});
    }
    setEditingReportId(item.id);
    setReportEditEnabled(false);
    setReport({
      ticket_id:item.ticket_id||"",client_id:item.client_id||plantations.find((p:any)=>p.id===item.plantation_id)?.client_id||"",plantation_id:item.plantation_id||"",
      date_visite:item.date_visite?new Date(item.date_visite).toISOString().slice(0,16):"",
      type_visite:item.type_visite||"suivi",constat:item.constat||"",travaux_realises:item.travaux_realises||"",
      etat_plantation:item.etat_plantation||"",etat_plantation_autre:"",
      observations:item.observations||"",recommandations:item.recommandations||"",contenu_client:item.contenu_client||"",
      prochaine_intervention:item.prochaine_intervention||"",localisation_gps_lat:item.localisation_gps_lat==null?"":String(item.localisation_gps_lat),
      localisation_gps_lng:item.localisation_gps_lng==null?"":String(item.localisation_gps_lng)
    });
    setMedia([]);
    setExistingReportMedia([]);
    const {data: savedMedia} = await (supabase as any).from("rapports_visites_medias").select("id,storage_path,media_type,nom_fichier").eq("rapport_id",item.id).order("created_at",{ascending:true});
    const mediaWithUrls = await Promise.all((savedMedia||[]).map(async(saved:any)=>{
      const {data: signed}=await supabase.storage.from("rapports-techniques").createSignedUrl(saved.storage_path,3600);
      return signed?.signedUrl ? {id:saved.id,url:signed.signedUrl,name:saved.nom_fichier||"Média enregistré",type:saved.media_type==="video"?"video":"photo"} : null;
    }));
    setExistingReportMedia(mediaWithUrls.filter(Boolean));
    setActiveTab("rapport");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const saveReport=async(submit:boolean)=>{
    if(!report.client_id){toast({variant:"destructive",title:"Client requis",description:"Sélectionnez le client avant de choisir sa plantation."});return;}
    if(!report.plantation_id){toast({variant:"destructive",title:"Plantation requise"});return;}
    if(!report.constat&&!report.travaux_realises&&!report.observations){toast({variant:"destructive",title:"Rapport incomplet",description:"Renseignez au moins le constat ou les travaux réalisés."});return;}
    setSaving(true);
    try{
      const profile=await profileContext(); if(!profile?.id)throw new Error("Profil technicien introuvable");
      if(editingReportId){
        const original=reports.find((item:any)=>item.id===editingReportId);
        if(!original)throw new Error("Rapport introuvable dans votre périmètre.");
        if(!manager && original.agent_technique_id!==profile.id)throw new Error("Vous pouvez modifier uniquement vos propres rapports.");
        const updatePayload={
          plantation_id:report.plantation_id,client_id:report.client_id||plantation?.client_id||original.client_id||null,ticket_id:report.ticket_id||null,
          type_visite:report.type_visite,
          constat:report.constat||null,travaux_realises:report.travaux_realises||null,
          etat_plantation:report.etat_plantation==="autre"?(report.etat_plantation_autre||null):(report.etat_plantation||null),
          observations:report.observations||null,recommandations:report.recommandations||null,contenu_client:report.contenu_client||null,
          prochaine_intervention:report.prochaine_intervention||null,
          localisation_gps_lat:report.localisation_gps_lat?Number(report.localisation_gps_lat):null,
          localisation_gps_lng:report.localisation_gps_lng?Number(report.localisation_gps_lng):null,
          statut:submit&&original.statut==="brouillon"?"soumis":original.statut,
          updated_at:new Date().toISOString()
        };
        const {error}=await offlineUpdate("rapports_visites_techniques",editingReportId,updatePayload);
        if(error)throw error;
        for(const file of media){
          const path="plantations/"+report.plantation_id+"/rapports/"+editingReportId+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
          const uploaded=await uploadOrQueueFile({bucket:"rapports-techniques",path,file});
          await offlineInsert("rapports_visites_medias",{
            id:crypto.randomUUID(),rapport_id:editingReportId,plantation_id:report.plantation_id,
            media_type:file.type.startsWith("video/")?"video":"photo",storage_path:uploaded.path,
            mime_type:file.type,nom_fichier:file.name,client_visible:false,created_by:profile.id
          });
        }
        toast({title:submit&&original.statut==="brouillon"?"Rapport soumis":"Rapport modifié",description:media.length?String(media.length)+" média(s) ajouté(s). La date de visite et le technicien sont conservés.":"La date de visite et le technicien responsable ont été conservés."});
        setEditingReportId("");setReportEditEnabled(false);setMedia([]);setExistingReportMedia([]);
        setReport({ticket_id:"",client_id:"",plantation_id:"",date_visite:new Date().toISOString().slice(0,16),type_visite:"suivi",constat:"",travaux_realises:"",etat_plantation:"",etat_plantation_autre:"",observations:"",recommandations:"",contenu_client:"",prochaine_intervention:"",localisation_gps_lat:"",localisation_gps_lng:""});
        await load();
        setActiveTab("rapport");
        return;
      }
      const id=crypto.randomUUID();
      const payload={
        id,plantation_id:report.plantation_id,client_id:report.client_id||plantation?.client_id||null,agent_technique_id:profile.id,equipe_id:profile.equipe_id||null,ticket_id:report.ticket_id||null,
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
      setExistingReportMedia([]);
      setReport({ticket_id:"",plantation_id:"",date_visite:new Date().toISOString().slice(0,16),type_visite:"suivi",constat:"",travaux_realises:"",etat_plantation:"",etat_plantation_autre:"",observations:"",recommandations:"",contenu_client:"",prochaine_intervention:"",localisation_gps_lat:"",localisation_gps_lng:""});
      load();
    }catch(e:any){toast({variant:"destructive",title:"Enregistrement impossible",description:e?.message||"Erreur inconnue"});}
    finally{setSaving(false);}
  };

  const reassignIntervention=async()=>{
    if(!canReassignTechnician){toast({variant:"destructive",title:"Réaffectation réservée au PDG",description:"Seul le PDG peut changer le technicien responsable d’une intervention."});return;}
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

  const resetInterventionForm=()=>{
    setEditingInterventionId("");
    setInterventionEditEnabled(false);
    setIntervention({plantation_id:"",client_id:"",acquisition_id:"",parcelle_id:"",convention_id:"",lot_id:"",localisation_gps_lat:"",localisation_gps_lng:"",type_intervention:stageRefs[0]?.code||"defrichage",date_intervention:new Date().toISOString().slice(0,10),observations:"",recommandations:"",contenu_client:"",statut:"planifiee",nombre_plants_prevus:"",nombre_plants_realises:"",nombre_plants_remplaces:"",densite_plants:"",nouvelle_parcelle_nom:"",nouvelle_parcelle_surface:"",nouvelle_parcelle_village:""});
  };

  const editIntervention=(item:any)=>{
    setEditingInterventionId(item.id);
    setInterventionEditEnabled(false);
    setIntervention({
      plantation_id:item.plantation_id||"",client_id:item.client_id||item.plantation?.client_id||"",
      acquisition_id:item.acquisition_id||"",parcelle_id:item.parcelle_id||"",convention_id:item.convention_id||"",lot_id:item.lot_id||"",
      localisation_gps_lat:item.localisation_gps_lat==null?"":String(item.localisation_gps_lat),
      localisation_gps_lng:item.localisation_gps_lng==null?"":String(item.localisation_gps_lng),
      type_intervention:item.type_intervention||stageRefs[0]?.code||"defrichage",
      date_intervention:item.date_intervention?String(item.date_intervention).slice(0,10):new Date().toISOString().slice(0,10),
      observations:item.observations||"",recommandations:item.recommandations||"",contenu_client:item.contenu_client||"",
      statut:item.statut||"brouillon",nombre_plants_prevus:item.nombre_plants_prevus==null?"":String(item.nombre_plants_prevus),
      nombre_plants_realises:item.nombre_plants_realises==null?"":String(item.nombre_plants_realises),
      nombre_plants_remplaces:item.nombre_plants_remplaces==null?"":String(item.nombre_plants_remplaces),
      densite_plants:item.densite_plants==null?"":String(item.densite_plants),
      nouvelle_parcelle_nom:"",nouvelle_parcelle_surface:"",nouvelle_parcelle_village:""
    });
    setActiveTab("intervention");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const submitInterventionDraft=async(item:any)=>{
    if(item.statut!=="brouillon" && item.statut!=="draft") return;
    if(!manager && item.agent_technique_id!==profileId){
      toast({variant:"destructive",title:"Soumission non autorisée",description:"Vous pouvez soumettre uniquement vos propres brouillons."});return;
    }
    setSaving(true);
    try{
      const {error}=await offlineUpdate("interventions_techniques",item.id,{statut:"soumise"});
      if(error)throw error;
      toast({title:"Intervention soumise",description:"Le brouillon a été soumis sans modifier sa date ni son technicien."});
      await load();
    }catch(error:any){
      toast({variant:"destructive",title:"Soumission impossible",description:error?.message||"Vérifiez vos droits puis réessayez."});
    }finally{setSaving(false);}
  };

  const saveIntervention=async()=>{
    const interventionPlantation=plantations.find(p=>p.id===intervention.plantation_id);
    const targetClientId=intervention.client_id||interventionPlantation?.client_id||null;
    let targetParcelleId=interventionAcquisition
      ? (intervention.parcelle_id||interventionAcquisition.parcelle_id||null)
      : technicalPalmInvest
        ? (intervention.parcelle_id||interventionPlantation?.parcelle_id||null)
        : (intervention.parcelle_id||interventionClient?.parcelle_id||interventionPlantation?.parcelle_id||null);
    const isPrePlantationStage=["defrichage","piquetage","trouaison","mise_en_terre"].includes(intervention.type_intervention);
    if(isPrePlantationStage && pendingClientAcquisitions.length>0 && !interventionAcquisition){
      toast({variant:"destructive",title:"Acquisition requise",description:"Choisissez la acquisition exacte à implanter afin de conserver sa formule, sa superficie et son échéancier."});return;
    }
    if(interventionAcquisition && interventionAcquisition.client_id!==targetClientId){
      toast({variant:"destructive",title:"Acquisition incompatible",description:"La acquisition choisie n’appartient pas au client sélectionné."});return;
    }
    if(!targetClientId){toast({variant:"destructive",title:"Client / dossier requis",description:"Sélectionnez le Client ou dossier concerné."});return;}
    if(!targetParcelleId && !technicalPalmInvest && (!intervention.nouvelle_parcelle_nom?.trim() || Number(intervention.nouvelle_parcelle_surface)<=0 || !intervention.nouvelle_parcelle_village?.trim())){toast({variant:"destructive",title:"Identification de la parcelle requise",description:"Lors de la première visite, renseignez le nom, la superficie et le village de la parcelle appartenant au Client."});return;}
    if(technicalPalmInvest && !interventionAcquisition && (!intervention.convention_id || !intervention.lot_id)){toast({variant:"destructive",title:"Lot requis",description:"Sélectionnez une parcelle puis un lot disponible avant de commencer le suivi technique."});return;}
    if(technicalPalmInvest && interventionAcquisition && !interventionAcquisition.lot_id){toast({variant:"destructive",title:"Lot de acquisition absent",description:"Cette acquisition partenaire doit être rattachée à un lot disponible avant l’intervention."});return;}
    if(!isPrePlantationStage && !intervention.plantation_id){toast({variant:"destructive",title:"Plantation requise",description:"Cette étape intervient après la création de la plantation."});return;}
    const technicalContext={...interventionPlantation,client:interventionClient,date_plantation:interventionPlantation?.date_plantation};
    // Même référentiel que le Portail : toutes les étapes actives sont disponibles dans l'ordre défini en base.
    const interventionStages=stageRefs;
    if(!interventionStages.some((x:any)=>x.code===intervention.type_intervention)){toast({variant:"destructive",title:"Étape non applicable",description:"Cette étape n’est pas autorisée pour le parcours ou la phase actuelle."});return;}
    setSaving(true);
    try{
      const profile=await profileContext(); if(!profile?.id)throw new Error("Profil technicien introuvable");
      if(editingInterventionId){
        const original=interventions.find((item:any)=>item.id===editingInterventionId);
        if(!original)throw new Error("Intervention introuvable ou hors de votre périmètre.");
        if(!manager && original.agent_technique_id!==profile.id)throw new Error("Vous pouvez modifier uniquement vos propres interventions.");
        const updatePayload={
          client_id:targetClientId,parcelle_id:targetParcelleId,plantation_id:intervention.plantation_id||null,
          acquisition_id:intervention.acquisition_id||null,convention_id:intervention.convention_id||null,
          lot_id:interventionAcquisition?.lot_id||intervention.lot_id||null,
          type_intervention:intervention.type_intervention,observations:intervention.observations||null,
          recommandations:intervention.recommandations||null,contenu_client:intervention.contenu_client||null,
          statut:original.statut||intervention.statut,
          nombre_plants_prevus:intervention.nombre_plants_prevus?Number(intervention.nombre_plants_prevus):null,
          nombre_plants_realises:intervention.nombre_plants_realises?Number(intervention.nombre_plants_realises):null,
          nombre_plants_remplaces:intervention.nombre_plants_remplaces?Number(intervention.nombre_plants_remplaces):null,
          densite_plants:intervention.densite_plants?Number(intervention.densite_plants):null,
          updated_at:new Date().toISOString()
        };
        // Keep the original date and assigned technician unchanged when editing.
        const {error}=await offlineUpdate("interventions_techniques",editingInterventionId,updatePayload);
        if(error)throw error;
        toast({title:"Modifications enregistrées",description:"La date de l’intervention et le technicien responsable ont été conservés."});
        resetInterventionForm();
        await load();
        return;
      }
      if(!targetParcelleId && !technicalPalmInvest){
        const {data:createdParcel,error:parcelCreateError}=await offlineInsert("parcelles",{
          nom:intervention.nouvelle_parcelle_nom.trim(),
          surface_totale_ha:Number(intervention.nouvelle_parcelle_surface),
          surface_proprietaire_ha:Number(intervention.nouvelle_parcelle_surface),
          surface_agricapital_ha:0,surface_attribuee_ha:0,surface_disponible_ha:0,
           proprietaire_id:interventionClient?.proprietaire_id||null,
          village:intervention.nouvelle_parcelle_village.trim(),
          district_id:interventionClient?.district_id||null,region_id:interventionClient?.region_id||null,
          departement_id:interventionClient?.departement_id||null,sous_prefecture_id:interventionClient?.sous_prefecture_id||null,
          localisation_gps_lat:intervention.localisation_gps_lat?Number(intervention.localisation_gps_lat):null,
          localisation_gps_lng:intervention.localisation_gps_lng?Number(intervention.localisation_gps_lng):null,
          statut:"disponible",mode_surface:"foncier",created_by:profile.id,updated_by:profile.id
        });
        if(parcelCreateError)throw parcelCreateError;
        targetParcelleId=createdParcel.id;
        const {error:linkClientError}=interventionAcquisition && interventionClient?.parcelle_id
           ? {error:null}
           : await offlineUpdate("clients",targetClientId,{parcelle_id:targetParcelleId,updated_at:new Date().toISOString()});
        if(linkClientError)throw linkClientError;
      }
      if(intervention.localisation_gps_lat && intervention.localisation_gps_lng){
        const {error:geoError}=await offlineUpdate("parcelles",targetParcelleId,{localisation_gps_lat:Number(intervention.localisation_gps_lat),localisation_gps_lng:Number(intervention.localisation_gps_lng),updated_by:profile.id});
        if(geoError)throw geoError;
      }
      if(technicalPalmInvest){
        if(!interventionAcquisition){
          const {error:clientParcelError}=await offlineUpdate("clients",targetClientId,{parcelle_id:targetParcelleId,updated_at:new Date().toISOString()});
          if(clientParcelError)throw clientParcelError;
        }
        if(interventionAcquisition){
          const {data:lotRow,error:lotReadError}=await (supabase as any).from("lots_hectares")
            .select("id,client_id,parcelle_id,convention_id,statut,acquisition_id")
            .eq("id",interventionAcquisition.lot_id).maybeSingle();
          if(lotReadError)throw lotReadError;
          if(!lotRow || lotRow.client_id!==targetClientId || lotRow.parcelle_id!==targetParcelleId || lotRow.acquisition_id!==interventionAcquisition.id){
            throw new Error("Le lot n’est plus rattaché à cette acquisition. Actualisez les données avant de poursuivre.");
          }
        } else {
          const {data:lotRow,error:lotReadError}=await (supabase as any).from("lots_hectares").select("id,client_id,parcelle_id,convention_id,statut").eq("id",intervention.lot_id).maybeSingle();
          if(lotReadError)throw lotReadError;
          if(!lotRow||lotRow.parcelle_id!==targetParcelleId||lotRow.convention_id!==intervention.convention_id||lotRow.client_id){throw new Error("Le lot sélectionné n'est plus disponible pour cette parcelle.");}
          const {error:lotAssignError}=await (supabase as any).from("lots_hectares").update({client_id:targetClientId,statut:"attribue",date_attribution:new Date().toISOString().slice(0,10)}).eq("id",intervention.lot_id).is("client_id",null);
          if(lotAssignError)throw lotAssignError;
          if(intervention.plantation_id){
            const {error:plantationLotError}=await offlineUpdate("plantations",intervention.plantation_id,{lot_id:intervention.lot_id,parcelle_id:targetParcelleId,updated_at:new Date().toISOString()});
            if(plantationLotError)throw plantationLotError;
          }
        }
      }
      // Les coordonnées GPS sont conservées dans le formulaire/parcelle, pas dans interventions_techniques.
      // La table des interventions ne possède pas les colonnes localisation_gps_lat/lng : elles ne doivent jamais bloquer la sauvegarde.
      const {localisation_gps_lat: _gpsLat, localisation_gps_lng: _gpsLng, nouvelle_parcelle_nom: _newParcelName, nouvelle_parcelle_surface: _newParcelSurface, nouvelle_parcelle_village: _newParcelVillage, ...interventionFields}=intervention;
      const payload={...interventionFields,contenu_client:intervention.contenu_client||null,id:crypto.randomUUID(),agent_technique_id:profile.id,
        client_id:targetClientId,parcelle_id:targetParcelleId,plantation_id:intervention.plantation_id||null,
        acquisition_id:intervention.acquisition_id||null,
        convention_id:intervention.convention_id||null,lot_id:interventionAcquisition?.lot_id||intervention.lot_id||null,
        nombre_plants_prevus:intervention.nombre_plants_prevus?Number(intervention.nombre_plants_prevus):null,
        nombre_plants_realises:intervention.nombre_plants_realises?Number(intervention.nombre_plants_realises):null,
        nombre_plants_remplaces:intervention.nombre_plants_remplaces?Number(intervention.nombre_plants_remplaces):null,
        densite_plants:intervention.densite_plants?Number(intervention.densite_plants):null
      };
      const {error}=await offlineInsert("interventions_techniques",payload);
      if(error)throw error;
      toast({title:intervention.type_intervention==="mise_en_terre"&&intervention.statut==="realisee"?"Mise en terre validée":"Intervention enregistrée",description:intervention.type_intervention==="mise_en_terre"&&intervention.statut==="realisee"?"Intervention technique enregistrée.":undefined});
      setIntervention({plantation_id:"",client_id:"",acquisition_id:"",parcelle_id:"",convention_id:"",lot_id:"",localisation_gps_lat:"",localisation_gps_lng:"",type_intervention:stageRefs[0]?.code||"",date_intervention:new Date().toISOString().slice(0,10),observations:"",recommandations:"",contenu_client:"",statut:"planifiee",nombre_plants_prevus:"",nombre_plants_realises:"",nombre_plants_remplaces:"",densite_plants:"",nouvelle_parcelle_nom:"",nouvelle_parcelle_surface:"",nouvelle_parcelle_village:""});
      load();
    }catch(e:any){toast({variant:"destructive",title:"Enregistrement impossible",description:e?.message||"Erreur inconnue"});}
    finally{setSaving(false);}
  };

  const reassignReport=async()=>{
    if(!canReassignTechnician){toast({variant:"destructive",title:"Réaffectation réservée au PDG",description:"Seul le PDG peut changer le technicien responsable d’un rapport."});return;}
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
    const {error:mediaError}=await (supabase as any).from("rapports_visites_medias").update({client_visible:publish}).eq("rapport_id",r.id);
    if(mediaError){toast({variant:"destructive",title:"Mise à jour des médias impossible",description:mediaError.message});return;}
    const {error}=await (supabase as any).from("rapports_visites_techniques").update({statut:publish?"valide":"rejete",client_visible:publish}).eq("id",r.id);
    if(error)toast({variant:"destructive",title:"Validation impossible",description:error.message});
    else{toast({title:publish?"Rapport validé et médias publiés au client":"Rapport refusé et médias masqués"});load();}
  };

  if(!allowed)return <ProtectedRoute><MainLayout><Card><CardHeader><CardTitle>Accès technicien</CardTitle></CardHeader></Card></MainLayout></ProtectedRoute>;

  return <ProtectedRoute><MainLayout><div className="technique-page min-w-0 w-full max-w-full space-y-3 overflow-hidden">
    <div><h1 className="text-3xl font-bold">Technique — suivi des plantations</h1></div>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 w-full">
      <div className="w-full min-w-0 overflow-x-auto pb-1"><TabsList className="inline-flex min-w-max whitespace-nowrap"><TabsTrigger value="demandes">Demandes à traiter {tickets.length>0&&<Badge className="ml-2">{tickets.length}</Badge>}</TabsTrigger><TabsTrigger value="rapport">Rapport de visite</TabsTrigger><TabsTrigger value="intervention">Intervention</TabsTrigger></TabsList></div>

      <TabsContent value="demandes" className="space-y-4">
        <Card><CardHeader><CardTitle>Demandes clients à traiter</CardTitle></CardHeader><CardContent className="p-0"><div className="w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Soumise le</th><th className="p-2 text-left">Demande / client</th><th className="p-2 text-left">Statut</th><th className="p-2 text-left">Traitée le</th><th className="p-2 text-left">Traitée par</th><th className="p-2 text-right">Action</th></tr></thead><tbody>{tickets.length===0?<tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Aucune demande en attente.</td></tr>:tickets.map((t:any)=><tr key={t.id} role="button" tabIndex={0} onClick={()=>setSelectedTicket(t)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedTicket(t);}}} className="cursor-pointer border-b last:border-0 hover:bg-muted/50"><td className="whitespace-nowrap p-2">{t.created_at?new Date(t.created_at).toLocaleString("fr-FR"):"—"}</td><td className="p-2"><div className="font-medium">{t.titre}</div><div className="text-xs text-muted-foreground">{t.client?.nom_complet||"Client"} · {t.plantation?.nom_plantation||t.plantation?.id_unique||"Plantation"}</div></td><td className="p-2"><Badge variant={["resolue","resolu","traitee","terminee"].includes(String(t.statut||"").toLowerCase())?"default":"outline"}>{t.statut||"En attente"}</Badge></td><td className="whitespace-nowrap p-2">{(t.traite_at||t.date_resolution)?new Date(t.traite_at||t.date_resolution).toLocaleString("fr-FR"):"—"}</td><td className="p-2">{t.traiteur?.nom_complet||techniciens.find((person:any)=>person.id===t.traite_par)?.nom_complet||"—"}</td><td className="p-2 text-right"><Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();setSelectedTicket(t);}}>Ouvrir</Button></td></tr>)}</tbody></table></div></CardContent></Card>
      </TabsContent>

      <TabsContent value="rapport" className="space-y-3">
        {(!editingReportId&&!showReportForm)&&<div className="flex justify-end"><Button onClick={()=>setShowReportForm(true)}><Plus className="mr-2 h-4 w-4"/>Nouveau rapport terrain</Button></div>}
         {(!editingReportId&&!showReportForm)&&<Card><CardHeader className="px-3 py-2"><CardTitle className="text-base">Rapports de visite</CardTitle></CardHeader><CardContent className="p-0"><div className="w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Plantation</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Technicien</th><th className="p-2 text-right">Action</th></tr></thead><tbody>{loading?<tr><td colSpan={5} className="p-4 text-center">Chargement…</td></tr>:reports.length===0?<tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Aucun rapport de visite.</td></tr>:reports.map((r:any)=><tr key={r.id} role="button" tabIndex={0} onClick={()=>void openReport(r)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();void openReport(r);}}} className="cursor-pointer border-b last:border-0 hover:bg-muted/50"><td className="whitespace-nowrap p-2">{r.date_visite?new Date(r.date_visite).toLocaleDateString("fr-FR"):"—"}</td><td className="p-2">{r.plantation?.nom_plantation||r.plantation?.id_unique||"—"}</td><td className="p-2">{r.type_visite||"—"}</td><td className="p-2">{r.agent?.nom_complet||"—"}</td><td className="p-2 text-right"><Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();void openReport(r);}}>Ouvrir</Button></td></tr>)}</tbody></table></div></CardContent></Card>}
        {(Boolean(editingReportId)||showReportForm)&&<Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>{editingReportId?"Consultation du rapport":"Nouveau rapport terrain"}</CardTitle>{!editingReportId&&<Button type="button" variant="outline" size="sm" onClick={()=>setShowReportForm(false)}>Fermer</Button>}</div></CardHeader><CardContent className="space-y-2"><fieldset disabled={Boolean(editingReportId)&&!reportEditEnabled} className="space-y-2">
          <div className="grid min-w-0 grid-cols-1 gap-2 technique-report-meta sm:grid-cols-2 lg:grid-cols-5">
            <div><Label className="mb-0 block text-xs leading-4">Demande support</Label><Select value={report.ticket_id||"none"} onValueChange={v=>setReport((x:any)=>({...x,ticket_id:v==="none"?"":v}))}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Aucune demande liée"/></SelectTrigger><SelectContent><SelectItem value="none">Aucune</SelectItem>{tickets.map(t=><SelectItem key={t.id} value={t.id}>{t.titre}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-0 block text-xs leading-4">Client *</Label><Input className="mb-1 h-7 min-h-0 px-2 py-0 text-xs" placeholder="Rechercher un client…" value={reportClientSearch} onChange={e=>setReportClientSearch(e.target.value)}/><Select value={report.client_id||"none"} onValueChange={v=>setReport((x:any)=>({...x,client_id:v==="none"?"":v,plantation_id:""}))}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Sélectionner un client"/></SelectTrigger><SelectContent><SelectItem value="none">Sélectionner un client</SelectItem>{clients.filter((c:any)=>String(c.nom_complet||"").toLocaleLowerCase("fr-FR").includes(reportClientSearch.toLocaleLowerCase("fr-FR"))||String(c.id_unique||"").toLocaleLowerCase("fr-FR").includes(reportClientSearch.toLocaleLowerCase("fr-FR"))).map((c:any)=><SelectItem key={c.id} value={c.id}>{c.nom_complet} · {c.id_unique}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-0 block text-xs leading-4">Plantation *</Label><Select value={report.plantation_id||"none"} disabled={!report.client_id} onValueChange={v=>{const p=plantations.find((item:any)=>item.id===v);setReport((x:any)=>({...x,plantation_id:v==="none"?"":v,client_id:p?.client_id||x.client_id}));}}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder={report.client_id?"Sélectionner une plantation du client":"Sélectionnez d’abord un client"}/></SelectTrigger><SelectContent><SelectItem value="none">Sélectionner une plantation</SelectItem>{plantations.filter((p:any)=>p.client_id===report.client_id).map(p=><SelectItem key={p.id} value={p.id}>{p.nom_plantation||p.nom||p.id_unique}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-0 block text-xs leading-4">Date et heure *</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="datetime-local" value={report.date_visite} disabled={Boolean(editingReportId)} onChange={e=>setReport((x:any)=>({...x,date_visite:e.target.value}))}/></div>
            <div><Label className="mb-0 block text-xs leading-4">Type de visite</Label><Select value={report.type_visite} onValueChange={v=>setReport((x:any)=>({...x,type_visite:v}))}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue/></SelectTrigger><SelectContent>{reportTypeRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div>
  <Label className="mb-0 block text-xs leading-4">État de la plantation</Label>
  <Select value={report.etat_plantation||"none"} onValueChange={v=>setReport((x:any)=>({...x,etat_plantation:v==="none"?"":v,etat_plantation_autre:v==="autre"?x.etat_plantation_autre:""}))}>
    <SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Sélectionner l’état"/></SelectTrigger>
    <SelectContent><SelectItem value="none">Sélectionner</SelectItem>{plantationStateRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent>
  </Select>
  {report.etat_plantation==="autre"&&<Input className="mt-2" value={report.etat_plantation_autre||""} onChange={e=>setReport((x:any)=>({...x,etat_plantation_autre:e.target.value}))} placeholder="Préciser l’état"/>}
</div>
          </div>
          <CompteRenduIA compact contexte={plantation?`Plantation : ${plantation.nom_plantation||plantation.nom||plantation.id_unique||""}. Client : ${plantation.client?.nom_complet||""}. Type de visite : ${report.type_visite}.`:""} onApply={(cr:any)=>{const normalize=(v:any)=>String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("fr-FR").replace(/[^\\p{L}\\p{N}]+/gu," ").trim();const unique=(values:any[])=>{const seen=new Set<string>();return values.map((v:any)=>String(v||"").trim()).filter((v:string)=>{const key=normalize(v);if(!key||seen.has(key)||/^par nom complet du technicien$/.test(key)||/^date non renseignee$/.test(key)||/^rapport de visite du /.test(key)||/^rapport d intervention du /.test(key)||/^par /.test(key))return false;seen.add(key);return true;});};const actions=unique(cr.actions_realisees||[]).map((x:string)=>`• ${x}`).join("\\n");const problems=unique(cr.problemes_constates||[]).map((x:string)=>`• ${x}`).join("\\n");const recs=unique(cr.recommandations||[]).map((x:string)=>`• ${x}`).join("\\n");const dateRapport=report.date_visite?new Date(String(report.date_visite).slice(0,10)+"T00:00:00").toLocaleDateString("fr-FR"):"Date non renseignée";const observations=unique([cr.resume,cr.observations]).join("\\n\\n");const constat=[observations,problems?"Points à corriger :\\n"+problems:""].filter(Boolean).join("\\n\\n");const clientBody=unique([cr.resume,...(cr.problemes_constates||[]),...(cr.recommandations||[])]).join("\\n\\n");const clientMessage=["Suivi de votre plantation — "+dateRapport,clientBody].filter(Boolean).join("\\n\\n");setReport((x:any)=>({...x,constat,observations:"",travaux_realises:actions,recommandations:recs,contenu_client:clientMessage}));}} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label className="mb-0 block text-xs leading-4">Constat / observations / actions / recommandations</Label><Textarea className="min-h-16 py-2 text-xs" rows={2} value={report.observations||report.constat||""} onChange={e=>setReport((x:any)=>({...x,constat:e.target.value,observations:e.target.value,travaux_realises:"",recommandations:""}))} placeholder="Décrire le constat, les travaux et actions d’encadrement, les observations, les problèmes et les recommandations…"/></div>
            <div><Label className="mb-0 block text-xs leading-4">Message destiné au client</Label><Textarea className="min-h-16 py-2 text-xs" rows={2} value={report.contenu_client} onChange={e=>setReport((x:any)=>({...x,contenu_client:e.target.value}))} placeholder="Message clair et adapté au client…"/></div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"><div><Label className="mb-0 block text-xs leading-4">Prochaine intervention</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="date" value={report.prochaine_intervention} onChange={e=>setReport((x:any)=>({...x,prochaine_intervention:e.target.value}))}/></div><div><Label className="mb-0 block text-xs leading-4">Latitude</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="number" step="any" value={report.localisation_gps_lat} onChange={e=>setReport((x:any)=>({...x,localisation_gps_lat:e.target.value}))}/></div><div><Label className="mb-0 block text-xs leading-4">Longitude</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="number" step="any" value={report.localisation_gps_lng} onChange={e=>setReport((x:any)=>({...x,localisation_gps_lng:e.target.value}))}/></div><div className="flex items-end"><Button type="button" variant="outline" className="w-full" disabled={capturingReportPosition} onClick={captureReportPosition}>{capturingReportPosition?"Localisation…":"Capturer la position GPS"}</Button></div></div>
          <div className="rounded-lg border p-2"><p className="mb-2 text-xs font-medium text-muted-foreground">Position du rapport — cliquer sur la carte pour ajuster</p><InteractiveMap mode="pick" position={report.localisation_gps_lat&&report.localisation_gps_lng?[Number(report.localisation_gps_lat),Number(report.localisation_gps_lng)]:null} onPositionChange={(lat,lng)=>setReport((current:any)=>({...current,localisation_gps_lat:String(lat),localisation_gps_lng:String(lng)}))} height="220px"/></div>
          <div><MediaUploadVisual label="Photos / vidéos" files={media} onChange={setMedia} existingMedia={existingReportMedia}/></div>
          </fieldset><div className="flex flex-wrap justify-end gap-2">{editingReportId&&!reportEditEnabled&&(manager||reports.find((item:any)=>item.id===editingReportId)?.agent_technique_id===profileId)&&<Button size="sm" onClick={()=>setReportEditEnabled(true)}><Pencil className="mr-1 h-4 w-4"/>Modifier</Button>}{editingReportId&&<Button size="sm" variant="outline" onClick={()=>{setEditingReportId("");setReportEditEnabled(false);setReport({ticket_id:"",plantation_id:"",date_visite:new Date().toISOString().slice(0,16),type_visite:"suivi",constat:"",travaux_realises:"",etat_plantation:"",etat_plantation_autre:"",observations:"",recommandations:"",contenu_client:"",prochaine_intervention:"",localisation_gps_lat:"",localisation_gps_lng:""});setActiveTab("rapport");}}>Fermer</Button>}{!editingReportId&&<><Button variant="outline" disabled={saving} onClick={()=>saveReport(false)}>Enregistrer brouillon</Button><Button disabled={saving} onClick={()=>saveReport(true)}>Soumettre le rapport</Button></>}{editingReportId&&reportEditEnabled&&<><Button variant="outline" disabled={saving} onClick={()=>saveReport(false)}>Enregistrer</Button>{reports.find((r:any)=>r.id===editingReportId)?.statut==="brouillon"&&<Button disabled={saving} onClick={()=>saveReport(true)}>Soumettre</Button>}</>}</div>
        </CardContent></Card>}
      </TabsContent>

      <TabsContent value="intervention" className="space-y-3">
        <div className="flex flex-wrap justify-end gap-2">{allowed&&<Button onClick={()=>setShowInterventionForm(true)}><Plus className="mr-2 h-4 w-4"/>Nouvelle intervention</Button>}</div>
        {(!editingInterventionId&&!showInterventionForm)&&<Card><CardHeader className="px-3 py-2"><CardTitle className="text-base">Interventions techniques</CardTitle></CardHeader><CardContent className="p-0"><div className="w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Plantation</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Technicien</th><th className="p-2 text-right">Action</th></tr></thead><tbody>{interventions.length===0?<tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Aucune intervention.</td></tr>:interventions.map((i:any)=><tr key={i.id} role="button" tabIndex={0} onClick={()=>editIntervention(i)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();editIntervention(i);}}} className="cursor-pointer border-b last:border-0 hover:bg-muted/50"><td className="whitespace-nowrap p-2">{i.date_intervention?new Date(i.date_intervention).toLocaleDateString("fr-FR"):"—"}</td><td className="p-2">{i.plantation?.nom_plantation||i.plantation?.id_unique||"—"}</td><td className="p-2">{i.type_intervention||"—"}</td><td className="p-2">{i.agent?.nom_complet||"—"}</td><td className="p-2 text-right"><Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();editIntervention(i);}}>Ouvrir</Button></td></tr>)}</tbody></table></div></CardContent></Card>}

        {(Boolean(editingInterventionId)||showInterventionForm)&&<Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>{editingInterventionId?"Consultation de l’intervention":"Intervention technique"}</CardTitle>{!editingInterventionId&&<Button type="button" variant="outline" size="sm" onClick={()=>setShowInterventionForm(false)}>Fermer</Button>}</div></CardHeader><CardContent className="space-y-2 p-3 sm:p-4"><fieldset disabled={Boolean(editingInterventionId)&&!interventionEditEnabled} className="space-y-2">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div><Label className="mb-0 block text-xs leading-4">Client / dossier *</Label><Select value={intervention.client_id} onValueChange={v=>{const clientPlantations=plantations.filter((p:any)=>p.client_id===v);const selectedPlantation=clientPlantations.length===1?clientPlantations[0]:null;const density=Number(selectedPlantation?.densite_plants||selectedPlantation?.parcelles?.plantation_densite_plants||143);const planned=selectedPlantation?Number(selectedPlantation.nombre_plants_prevus||Math.round(Number(selectedPlantation.superficie_ha||0)*density)):0;setIntervention((x:any)=>({...x,client_id:v,acquisition_id:selectedPlantation?.acquisition_id||"",parcelle_id:selectedPlantation?.parcelle_id||clients.find(c=>c.id===v)?.parcelle_id||"",plantation_id:selectedPlantation?.id||"",densite_plants:String(density),nombre_plants_prevus:planned?String(planned):"",convention_id:"",lot_id:"",nouvelle_parcelle_nom:"",nouvelle_parcelle_surface:"",nouvelle_parcelle_village:""}));}}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Sélectionner un Client"/></SelectTrigger><SelectContent>{clients.map(c=><SelectItem key={c.id} value={c.id}>{c.nom_complet} · {c.id_unique}</SelectItem>)}</SelectContent></Select></div>
            {technicalPalmInvest && <div><Label className="mb-0 block text-xs leading-4">Parcours foncier</Label><div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">Foncier AgriCapital — convention / lot</div></div>}
            {pendingClientAcquisitions.length>0 && <div><Label className="mb-0 block text-xs leading-4">Acquisition à implanter *</Label><Select value={intervention.acquisition_id||""} onValueChange={v=>{const sub=clientAcquisitions.find((item:any)=>item.id===v);const density=Number(sub?.parcelle?.plantation_densite_plants||143);setIntervention((x:any)=>({...x,acquisition_id:v,plantation_id:"",parcelle_id:sub?.parcelle_id||"",convention_id:"",lot_id:sub?.lot_id||"",densite_plants:String(density),nombre_plants_prevus:sub?String(Math.round(Number(sub.superficie_ha||0)*density)):x.nombre_plants_prevus}));}}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Choisir l’offre et la formule à implanter"/></SelectTrigger><SelectContent>{pendingClientAcquisitions.map((sub:any)=><SelectItem key={sub.id} value={sub.id}>{sub.formule_nom||sub.offre_nom} · {Number(sub.superficie_ha||0)} ha · {sub.formule_code}</SelectItem>)}</SelectContent></Select></div>}
             <div><Label className="mb-0 block text-xs leading-4">Plantation</Label><Select value={intervention.plantation_id||"none"} disabled={!intervention.client_id} onValueChange={v=>{const p=plantations.find(x=>x.id===v);const density=Number(p?.densite_plants||p?.parcelles?.plantation_densite_plants||143);const planned=p?Number(p.nombre_plants_prevus||Math.round(Number(p.superficie_ha||0)*density)):0;setIntervention((x:any)=>({...x,plantation_id:v==="none"?"":v,acquisition_id:p?.acquisition_id||"",parcelle_id:p?.parcelle_id||x.parcelle_id,densite_plants:String(density),nombre_plants_prevus:planned?String(planned):x.nombre_plants_prevus}));}}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder={intervention.client_id?"Choisir une plantation du client":"Sélectionner d’abord un client"}/></SelectTrigger><SelectContent><SelectItem value="none">Aucune — avant plantation</SelectItem>{plantations.filter(p=>p.client_id===intervention.client_id).map(p=><SelectItem key={p.id} value={p.id}>{p.nom_plantation||p.nom||p.id_unique}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-0 block text-xs leading-4">Date *</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="date" value={intervention.date_intervention} disabled={Boolean(editingInterventionId)} onChange={e=>setIntervention((x:any)=>({...x,date_intervention:e.target.value}))}/>{editingInterventionId&&<p className="mt-1 text-xs text-muted-foreground">Date d’origine verrouillée</p>}</div>
          </div>
          {!technicalPalmInvest && (!pendingClientAcquisitions.length || !!interventionAcquisition) && !intervention.parcelle_id && !interventionPlantation?.parcelle_id && intervention.client_id && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4"><div><h3 className="font-semibold">Identification foncière — première visite</h3></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><div><Label className="mb-0 block text-xs leading-4">Nom / référence de la parcelle *</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" value={intervention.nouvelle_parcelle_nom||""} onChange={e=>setIntervention((x:any)=>({...x,nouvelle_parcelle_nom:e.target.value}))} placeholder="Nom ou référence terrain"/></div><div><Label className="mb-0 block text-xs leading-4">Superficie (ha) *</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="number" min="0.1" step="0.1" value={intervention.nouvelle_parcelle_surface||""} onChange={e=>setIntervention((x:any)=>({...x,nouvelle_parcelle_surface:e.target.value}))}/></div><div><Label className="mb-0 block text-xs leading-4">Village / localité *</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" value={intervention.nouvelle_parcelle_village||""} onChange={e=>setIntervention((x:any)=>({...x,nouvelle_parcelle_village:e.target.value}))}/></div></div></div>}
          {technicalPalmInvest && interventionAcquisition && <div className="rounded-xl border p-4 text-sm"><p className="font-semibold">Lot partenaire déjà réservé pour cette acquisition</p><p className="text-muted-foreground mt-1">{interventionAcquisition.formule_nom} · {Number(interventionAcquisition.superficie_ha||0)} ha · {interventionAcquisition.lot_id}</p></div>}
           {technicalPalmInvest&&!interventionAcquisition&&<div className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-2">
            <div><Label className="mb-0 block text-xs leading-4">Convention foncière active *</Label><Select value={intervention.convention_id||""} onValueChange={v=>{const conv=conventions.find((item:any)=>item.id===v);setIntervention((x:any)=>({...x,convention_id:v,lot_id:"",parcelle_id:conv?.parcelle_id||""}));}}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Sélectionner une convention"/></SelectTrigger><SelectContent>{conventions.map(c=><SelectItem key={c.id} value={c.id}>{c.reference} — {c.proprietaire?.nom_complet||"Propriétaire non renseigné"}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-0 block text-xs leading-4">Lot disponible *</Label><Select value={intervention.lot_id||""} onValueChange={v=>{const lot=lots.find(l=>l.id===v);setIntervention((x:any)=>({...x,lot_id:v,parcelle_id:lot?.parcelle_id||""}));}} disabled={!intervention.convention_id}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Sélectionner un lot"/></SelectTrigger><SelectContent>{lots.map(l=><SelectItem key={l.id} value={l.id}>{l.reference||("H"+String(l.numero_h).padStart(2,"0"))} — {l.surface_ha} ha</SelectItem>)}</SelectContent></Select></div>
          </div>}
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label className="mb-0 block text-xs leading-4">Étape technique</Label><Select value={intervention.type_intervention} onValueChange={v=>setIntervention((x:any)=>({...x,type_intervention:v}))}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue/></SelectTrigger><SelectContent>{stageRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-0 block text-xs leading-4">Statut</Label><Select value={intervention.statut} onValueChange={v=>setIntervention((x:any)=>({...x,statut:v}))}><SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue/></SelectTrigger><SelectContent>{interventionStatusRefs.map((x:any)=><SelectItem key={x.code} value={x.code}>{x.libelle}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="rounded-xl border p-4 space-y-4">
            <div><Label className="mb-0 block text-xs leading-4">Localisation GPS</Label></div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={localisationMode==="automatic"?"default":"outline"} onClick={()=>setLocalisationMode("automatic")}>Localisation automatique</Button>
              <Button type="button" variant={localisationMode==="manual"?"default":"outline"} onClick={()=>setLocalisationMode("manual")}>Localisation manuelle</Button>
              <Button type="button" variant="outline" disabled={capturingInterventionPosition} onClick={captureInterventionPosition}>{capturingInterventionPosition?"Localisation…":"Capturer la position GPS"}</Button>
            </div>
            {localisationMode==="manual"&&<div className="grid md:grid-cols-2 gap-4">
              <div><Label className="mb-0 block text-xs leading-4">Latitude</Label><Input type="number" step="any" value={intervention.localisation_gps_lat||""} onChange={e=>setIntervention((x:any)=>({...x,localisation_gps_lat:e.target.value}))}/></div>
              <div><Label className="mb-0 block text-xs leading-4">Longitude</Label><Input type="number" step="any" value={intervention.localisation_gps_lng||""} onChange={e=>setIntervention((x:any)=>({...x,localisation_gps_lng:e.target.value}))}/></div>
            </div>}
            <InteractiveMap mode="pick" position={intervention.localisation_gps_lat&&intervention.localisation_gps_lng?[Number(intervention.localisation_gps_lat),Number(intervention.localisation_gps_lng)]:null} onPositionChange={(lat,lng)=>setIntervention((x:any)=>({...x,localisation_gps_lat:String(lat),localisation_gps_lng:String(lng)}))} height="220px" />
            
          </div>
          <CompteRenduIA compact contexte={`Intervention technique AgriCapital. Client : ${interventionClient?.nom_complet||""}. Plantation : ${interventionPlantation?.nom_plantation||interventionPlantation?.nom||interventionPlantation?.id_unique||""}. Étape technique : ${stageRefs.find((x:any)=>x.code===intervention.type_intervention)?.libelle||intervention.type_intervention||""}. Date : ${intervention.date_intervention||""}.`} onApply={(cr:any)=>{const actions=(cr.actions_realisees||[]).map((x:string)=>`• ${x}`).join("\n");const problems=(cr.problemes_constates||[]).map((x:string)=>`• ${x}`).join("\n");const recs=(cr.recommandations||[]).map((x:string)=>`• ${x}`).join("\n");const dateRapport=intervention.date_intervention?new Date(String(intervention.date_intervention).slice(0,10)+"T00:00:00").toLocaleDateString("fr-FR"):"Date non renseignée";const titreIntervention=String(intervention.type_intervention||"").toLowerCase().includes("visite")?"Rapport de visite":"Rapport d’intervention";const header=(titreIntervention+" du "+dateRapport).toLocaleUpperCase("fr-FR")+"\nPar : "+(profileName||"Technicien AgriCapital");const body=[cr.resume?"Observations : "+cr.resume:"",cr.observations&&cr.observations!==cr.resume?"Observations complémentaires : "+cr.observations:"",cr.nombre_plants_realises!=null?"Nombre de plants mis en terre / réalisés : "+cr.nombre_plants_realises:"",actions?"Travaux réalisés :\n"+actions:"",problems?"Points à corriger :\n"+problems:"",recs?"Recommandations :\n"+recs:""].filter(Boolean).join("\n\n");const unified=[header,body].filter(Boolean).join("\n\n");const clientMessage=[header,body].filter(Boolean).join("\n\n");setIntervention((x:any)=>({...x,observations:unified,recommandations:recs,contenu_client:clientMessage,...(cr.nombre_plants_realises!=null?{nombre_plants_realises:String(cr.nombre_plants_realises)}:{})}));}} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><div><Label className="mb-0 block text-xs leading-4">Constat / observations / actions / recommandations</Label><Textarea className="min-h-16 py-2 text-xs" rows={2} value={intervention.observations||""} onChange={e=>setIntervention((x:any)=>({...x,observations:e.target.value,recommandations:""}))} placeholder="Décrire le constat, les actions réalisées, le suivi, les problèmes et les recommandations…"/></div><div><Label className="mb-0 block text-xs leading-4">Message destiné au client</Label><Textarea className="min-h-16 py-2 text-xs" rows={2} value={intervention.contenu_client||""} onChange={e=>setIntervention((x:any)=>({...x,contenu_client:e.target.value}))} placeholder="Message clair et adapté au client…"/></div></div>
           {(intervention.type_intervention==="mise_en_terre"||intervention.type_intervention==="remplacement") && <div className="grid grid-cols-1 gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-3"><div><Label className="mb-0 block text-xs leading-4">Espacement estimé entre plants</Label><div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm font-semibold">{(()=>{const p=plantations.find((x:any)=>x.id===intervention.plantation_id);const ha=Number(p?.superficie_ha||interventionAcquisition?.superficie_ha||0);const plants=Number(intervention.nombre_plants_realises||intervention.nombre_plants_prevus||Math.round(ha*Number(intervention.densite_plants||143)));return spacingForPlants(ha,plants);})()}</div><p className="mt-1 text-[10px] text-muted-foreground">Calcul triangulaire · 143 plants/ha ≈ 9 × 9 m</p></div><div><Label className="mb-0 block text-xs leading-4">Plants prévus</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="number" min="0" value={intervention.nombre_plants_prevus} onChange={e=>setIntervention((x:any)=>({...x,nombre_plants_prevus:e.target.value}))}/></div><div><Label className="mb-0 block text-xs leading-4">{intervention.type_intervention==="remplacement"?"Plants remplacés":"Plants mis en terre"}</Label><Input className="h-7 min-h-0 px-2 py-0 text-xs" type="number" min="0" value={intervention.type_intervention==="remplacement"?intervention.nombre_plants_remplaces:intervention.nombre_plants_realises} onChange={e=>setIntervention((x:any)=>intervention.type_intervention==="remplacement"?({...x,nombre_plants_remplaces:e.target.value}):({...x,nombre_plants_realises:e.target.value}))}/></div></div>}
          </fieldset><div className="flex flex-wrap justify-end gap-2">{editingInterventionId&&!interventionEditEnabled&&(manager||interventions.find((item:any)=>item.id===editingInterventionId)?.agent_technique_id===profileId)&&<Button type="button" size="sm" onClick={()=>setInterventionEditEnabled(true)}><Pencil className="mr-1 h-4 w-4"/>Modifier</Button>}{editingInterventionId&&(interventions.find((item:any)=>item.id===editingInterventionId)?.statut==="brouillon"||interventions.find((item:any)=>item.id===editingInterventionId)?.statut==="draft")&&<Button type="button" size="sm" disabled={saving} onClick={()=>void submitInterventionDraft(interventions.find((item:any)=>item.id===editingInterventionId))}><Send className="mr-1 h-4 w-4"/>Soumettre</Button>}{editingInterventionId&&<Button type="button" size="sm" variant="outline" disabled={saving} onClick={resetInterventionForm}>Annuler</Button>}{(!editingInterventionId||interventionEditEnabled)&&<Button size="sm" disabled={saving} onClick={saveIntervention}>{editingInterventionId?"Enregistrer les modifications":"Enregistrer l’intervention"}</Button>}</div>
        </CardContent></Card>}
      </TabsContent>
      
    </Tabs>
      <Dialog open={Boolean(selectedTicket)} onOpenChange={open=>{if(!open)setSelectedTicket(null);}}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto overscroll-contain">
          <DialogHeader><DialogTitle>{selectedTicket?.titre||"Détail de la demande"}</DialogTitle></DialogHeader>
          {selectedTicket&&<div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Date de soumission</Label><p className="rounded-md border bg-muted/30 p-2 text-sm">{selectedTicket.created_at?new Date(selectedTicket.created_at).toLocaleString("fr-FR"):"—"}</p></div>
            <div><Label>Statut</Label><p className="rounded-md border bg-muted/30 p-2 text-sm">{selectedTicket.statut||"En attente"}</p></div>
            <div><Label>Client</Label><p className="rounded-md border bg-muted/30 p-2 text-sm">{selectedTicket.client?.nom_complet||"—"}</p></div>
            <div><Label>Plantation</Label><p className="rounded-md border bg-muted/30 p-2 text-sm">{selectedTicket.plantation?.nom_plantation||selectedTicket.plantation?.id_unique||"—"}</p></div>
            <div><Label>Priorité</Label><p className="rounded-md border bg-muted/30 p-2 text-sm">{selectedTicket.priorite||"—"}</p></div>
            <div><Label>Traitée le</Label><p className="rounded-md border bg-muted/30 p-2 text-sm">{(selectedTicket.traite_at||selectedTicket.date_resolution)?new Date(selectedTicket.traite_at||selectedTicket.date_resolution).toLocaleString("fr-FR"):"Non traitée"}</p></div>
            <div className="sm:col-span-2"><Label>Description</Label><p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{selectedTicket.description||"—"}</p></div>
            <div className="sm:col-span-2"><Label>Compte rendu du traitement</Label><p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{selectedTicket.resolution_note||"Aucun compte rendu enregistré."}</p></div>
            <div className="sm:col-span-2 flex justify-end"><Button variant="outline" onClick={()=>setSelectedTicket(null)}>Fermer</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reassignReportId||reassignInterventionId)} onOpenChange={(open)=>{if(!open){setReassignReportId("");setReassignInterventionId("");setReassignTechnicienId("");}}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Réaffecter à un technicien</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={reassignTechnicienId||""} onValueChange={setReassignTechnicienId}>
              <SelectTrigger className="h-7 min-h-0 px-2 py-0 text-xs"><SelectValue placeholder="Choisir un technicien autorisé"/></SelectTrigger>
              <SelectContent>{techniciens.map((technicien:any)=><SelectItem key={technicien.id} value={technicien.id}>{technicien.nom_complet}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{setReassignReportId("");setReassignInterventionId("");setReassignTechnicienId("");}}>Annuler</Button>
              <Button disabled={!reassignTechnicienId} onClick={()=>void (reassignReportId?reassignReport():reassignIntervention())}>Confirmer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  </div></MainLayout></ProtectedRoute>;
};
export default TechnicienTerrain;
