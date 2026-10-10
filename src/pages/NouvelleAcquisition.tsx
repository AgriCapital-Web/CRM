import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, BriefcaseBusiness, UserRound, UserCog, MapPin, FileText, CheckCircle2 } from "lucide-react";
import { Etape0Offre } from "@/components/forms/acquisition/Etape0Offre";
import { EtapeClientDynamique } from "@/components/forms/acquisition/EtapeClientDynamique";
import { EtapeRepresentantDynamique } from "@/components/forms/acquisition/EtapeRepresentantDynamique";
import { EtapeParcelleDynamique } from "@/components/forms/acquisition/EtapeParcelleDynamique";
import { EtapeEnqueteClient } from "@/components/forms/acquisition/EtapeEnqueteClient";
import { EtapeDocumentsContratsDynamiques } from "@/components/forms/acquisition/EtapeDocumentsContratsDynamiques";
import { EtapeConfirmationDossier } from "@/components/forms/acquisition/EtapeConfirmationDossier";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/utils/storage";
import { offlineInsert } from "@/lib/offlineWrite";
import { useToast } from "@/hooks/use-toast";
import { SyncStatusBadge, type SyncState } from "@/components/offline/SyncStatusBadge";
import { getSafeErrorMessage } from "@/lib/safeError";
import { calculPrixEffectif } from "@/lib/pricing";
import { usePromotionActive } from "@/hooks/usePromotionActive";
import { useAuth } from "@/hooks/useAuth";
import { getCachedItems, STORES } from "@/lib/offlineDb";

type Step = { code:string; titre:string; description?:string; ordre:number; obligatoire:boolean };
const STEP_ICONS: Record<string, any> = { offre: BriefcaseBusiness, client: UserRound, cotitulaire: UserCog, parcelle: MapPin, enquete: UserRound, documents: FileText, confirmation: CheckCircle2 };

const NouvelleAcquisition = () => {
  const [formData,setFormData]=useState<any>({});
  const [steps,setSteps]=useState<Step[]>([]);
  const [current,setCurrent]=useState(0);
  const [brouillonId,setBrouillonId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [loadingSteps,setLoadingSteps]=useState(false);
  const [syncState,setSyncState]=useState<SyncState>("draft");
  const {toast}=useToast();
  const navigate=useNavigate();
  const { user } = useAuth();
  const [searchParams]=useSearchParams();
  const {data:promotionActive}=usePromotionActive(formData.offre_id);

  const updateFormData=(data:any)=>setFormData((prev:any)=>({...prev,...data}));

  useEffect(()=>{
    const leadId=searchParams.get("lead_id");
    if(leadId) updateFormData({
      lead_id:leadId, commercial_id:searchParams.get("commercial_id")||undefined, nom_famille:searchParams.get("nom")||"", prenoms:searchParams.get("prenoms")||"",
      telephone:searchParams.get("telephone")||"", whatsapp:searchParams.get("whatsapp")||"", email:searchParams.get("email")||""
    });
  },[searchParams]);

  // Reprise du dernier brouillon Client. L'étape enregistrée est respectée ; sans brouillon, le parcours démarre TOUJOURS à 1.
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const currentUser = user;
      if(!currentUser) return;
      let data: any[] = [];
      try {
        const result = await (supabase as any).from("acquisitions_brouillon").select("*").eq("created_by",currentUser.id).order("updated_at",{ascending:false}).limit(1);
        data = result.data || [];
      } catch {
        const cached = await getCachedItems(STORES.ACQUISITIONS_BROUILLON);
        data = cached
          .filter((x: any) => x?.created_by === currentUser.id)
          .sort((a: any,b: any) => String(b?.updated_at||"").localeCompare(String(a?.updated_at||"")))
          .slice(0,1);
      }
      if(!mounted||!data?.[0])return;
      const draft=data[0];
      setBrouillonId(draft.id);
      setFormData(draft.donnees||{});
      setCurrent(Math.max(0,Number(draft.etape_actuelle||0)));
    })();
    return()=>{mounted=false;};
  },[user]);

  useEffect(()=>{
    if(!formData.offre_id){ setSteps([]); setCurrent(0); return; }
    let mounted=true;
    (async()=>{
      setLoadingSteps(true);
      const {data,error}=await (supabase as any).from("offre_formulaire_etapes")
        .select("code,titre,description,ordre,obligatoire").eq("offre_id",formData.offre_id).eq("actif",true).order("ordre");
      if(!mounted)return;
      if(error)toast({variant:"destructive",title:"Parcours indisponible",description:getSafeErrorMessage(error)});
      setSteps(data||[]);
      setCurrent(v=>Math.min(v,Math.max(0,(data||[]).length-1)));
      setLoadingSteps(false);
    })();
    return()=>{mounted=false;};
  },[formData.offre_id]);

  const activeSteps=useMemo(()=>formData.offre_id?steps:[{code:"offre",titre:"Offre et superficie",ordre:1,obligatoire:true}], [formData.offre_id,steps]);
  const step=activeSteps[current];

  const validateStep=async()=>{
    if(!step)return false;
    if(step.code==="offre"&&(!formData.commercial_id||!formData.offre_id||Number(formData.superficie_prevue)<=0)){
      toast({variant:"destructive",title:"Étape incomplète",description:"Sélectionnez le commercial responsable, une offre et renseignez la superficie."}); return false;
    }
    if(step.code==="client"){
      const fields=["civilite","nom_famille","prenoms","date_naissance","lieu_naissance","nationalite","type_piece","numero_piece","telephone","domicile"];
      if(fields.some(f=>!formData[f])||!formData.photo_piece_recto_file||!formData.photo_piece_verso_file||!formData.photo_profil_file){
        toast({variant:"destructive",title:"Client incomplet",description:"L’identité, les coordonnées, la photo et les deux faces de la pièce sont obligatoires."}); return false;
      }
      if(!formData.enquete_objectif){
        toast({variant:"destructive",title:"Enquête client incomplète",description:"L’objectif du Client est obligatoire."}); return false;
      }
    }
    if(step.code==="parcelle"){
      const external=!formData.offre?.necessite_foncier_client;
      if(Number(formData.superficie_prevue)<=0||!formData.village_propre){
        toast({variant:"destructive",title:"Parcelle incomplète",description:"La superficie et la localité sont obligatoires."}); return false;
      }
      if(external&&(!formData.convention_id||!formData.lot_id)){
        toast({variant:"destructive",title:"Foncier externe incomplet",description:"La convention et le lot disponible sont obligatoires pour cette offre."}); return false;
      }
    }
    if(step.code==="cotitulaire"){
      if(formData.offre?.necessite_cotitulaire&&!formData.has_representant){toast({variant:"destructive",title:"Cotitulaire / mandataire requis",description:"Cette offre exige de renseigner un cotitulaire ou mandataire."});return false;}
      if(formData.has_representant){
        const repFields=["representant_type","representant_nom","representant_prenoms","representant_type_piece","representant_numero_piece","representant_telephone"];
        if(repFields.some(f=>!formData[f])||!formData.representant_piece_recto_file||!formData.representant_piece_verso_file||!formData.representant_photo_profil_file){toast({variant:"destructive",title:"Cotitulaire / mandataire incomplet",description:"Renseignez l’identité, le lien, les coordonnées et les pièces/photos."});return false;}
      }
    }
    if(step.code==="enquete"&&!formData.enquete_objectif){
      toast({variant:"destructive",title:"Enquête incomplète",description:"L’objectif du Client est obligatoire."}); return false;
    }
    if(step.code==="documents"){
      const {data:docs}=await (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id",formData.offre_id).eq("actif",true).order("ordre");
      for(const doc of docs||[]){
        const c=doc.condition||{};
        if(c.when==="representant_active"&&!formData.has_representant)continue;
        if(c.relation==="mandataire"&&formData.representant_type!=="mandataire")continue;
        if(c.when==="offre_plus"&&!String(formData.offre_code||"").endsWith("-plus"))continue;
        if(c.when==="client_land"&&!formData.offre?.necessite_foncier_client)continue;
        if(c.when==="acquisition"&&!formData.offre?.contrat_acquisition_requis)continue;
        if(doc.obligatoire&&!formData["doc_"+doc.code+"_file"]){toast({variant:"destructive",title:"Pièce obligatoire manquante",description:doc.libelle});return false;}
      }
    }
    if(step.code==="documents"){
      const {data:contracts}=await (supabase as any).from("offre_formulaire_contrats").select("*").eq("offre_id",formData.offre_id).eq("actif",true);
      for(const contract of contracts||[]) if(contract.obligatoire&&!["a_signer","signe"].includes(formData["contrat_"+contract.type_contrat+"_statut"]||"a_preparer")){
        toast({variant:"destructive",title:"Contrat à traiter",description:"Indiquez le statut du contrat applicable avant de continuer."});return false;
      }
    }
    if(step.code==="confirmation"&&!formData.contrat_lu){
      toast({variant:"destructive",title:"Validation finale requise",description:"Le Client doit avoir pris connaissance des documents contractuels."});return false;
    }
    return true;
  };

  const saveDraft=async(index:number)=>{
    const currentUser = user;
    if(!currentUser)return;
    const payload={...formData,parcours_code:formData.offre_code||null};
    if(brouillonId) await (supabase as any).from("acquisitions_brouillon").update({etape_actuelle:index,donnees:payload,offre_id:formData.offre_id||null,parcours_code:formData.offre_code||null,updated_at:new Date().toISOString()}).eq("id",brouillonId);
    else {const {data}=await (supabase as any).from("acquisitions_brouillon").insert({etape_actuelle:index,donnees:payload,offre_id:formData.offre_id||null,parcours_code:formData.offre_code||null,created_by:currentUser.id}).select().single();if(data)setBrouillonId(data.id);}
    setSyncState(navigator.onLine ? "synced" : "queued");
  };

  const next=async()=>{if(!(await validateStep()))return;setSaving(true);try{const i=Math.min(activeSteps.length-1,current+1);await saveDraft(i);setCurrent(i);}finally{setSaving(false);}};

  const submit=async()=>{
    if(!(await validateStep()))return;
    if(!formData.contrat_lu||!formData.documents_authentiques||!formData.autorisation_donnees){
      toast({variant:"destructive",title:"Validation incomplète",description:"Les validations finales sont obligatoires."});return;
    }
    setSaving(true);
    try{
      const currentUser = user;
      if(!currentUser)throw new Error("Session utilisateur introuvable");
      const {data:baseOffer,error:offerError}=await (supabase as any).from("offres").select("*").eq("id",formData.offre_id).single();
      if(offerError||!baseOffer)throw new Error("Offre sélectionnée introuvable");
      const formulas = Array.isArray(baseOffer.formules_configuration) ? baseOffer.formules_configuration : [];
      const selectedFormula = formulas.find((formula: any) => formula.code === formData.formule_code) || formulas[0] || null;
      const offer: any = selectedFormula ? {
        ...baseOffer,
        formule_code: selectedFormula.code || baseOffer.formule_code || baseOffer.code,
        formule_nom: selectedFormula.nom || baseOffer.formule_nom || baseOffer.nom,
        gestion_type: selectedFormula.gestion_type ?? baseOffer.gestion_type,
        ...(selectedFormula.utilise_tarif_commun === false ? Object.fromEntries(
          ["montant_pi_par_ha", "montant_cash_par_ha", "mensualite_par_ha", "montant_total_par_ha", "duree_paiement_mois", "tranches_paiement"]
            .filter((key) => selectedFormula[key] !== undefined && selectedFormula[key] !== null)
            .map((key) => [key, selectedFormula[key]])
        ) : {}),
      } : baseOffer;
      const ha=Number(formData.superficie_prevue);
      const prix=calculPrixEffectif(offer,promotionActive?[promotionActive as any]:[],{modePaiement:"echeancier"});
      const total=Number(prix.montant_total_effectif||prix.montant_total_base||0)*ha;
      const external=!offer.necessite_foncier_client;

      let parcelleId=formData.parcelle_id||null;
      if(external&&formData.lot_id){
        const {data:lot,error:lotError}=await (supabase as any).from("lots_hectares").select("parcelle_id").eq("id",formData.lot_id).maybeSingle();
        if(lotError) throw lotError;
        if(!lot?.parcelle_id) throw new Error("Le lot sélectionné n’est pas rattaché à une parcelle foncière.");
        parcelleId=lot.parcelle_id;
      }
      const nomComplet=(String(formData.nom_famille||"")+" "+String(formData.prenoms||"")).trim();
      const {data:client,error:clientError}=await offlineInsert("clients",{
        offre_id:offer.id,commercial_id:formData.commercial_id||null,parcelle_id:parcelleId,type_client:external?"sans_terre":"avec_terre",type_client_foncier:external?"EXT":"OWN",
        nom:formData.nom_famille||"",nom_famille:formData.nom_famille||"",prenoms:formData.prenoms||"",nom_complet:nomComplet,
        civilite:formData.civilite||null,date_naissance:formData.date_naissance||null,lieu_naissance:formData.lieu_naissance||null,nationalite:formData.nationalite||null,
        statut_marital:formData.statut_marital||null,type_piece:formData.type_piece||null,numero_piece:formData.numero_piece||null,date_delivrance_piece:formData.date_delivrance_piece||null,
        telephone:formData.telephone||"",telephone_indicatif:formData.telephone_indicatif||null,telephone_local:formData.telephone_local||null,whatsapp:formData.whatsapp||null,
        whatsapp_indicatif:formData.whatsapp_indicatif||null,whatsapp_local:formData.whatsapp_local||null,email:formData.email||null,domicile:formData.domicile||null,
        district_id:formData.district_id||null,region_id:formData.region_id||null,departement_id:formData.departement_id||null,sous_prefecture_id:formData.sous_prefecture_id||null,village_id:formData.village_id||null,
        localite:formData.domicile||null,montant_total_contrat:total,
        famille_offre:offer.famille_offre||null,formule_code:offer.formule_code||offer.code,formule_nom:offer.formule_nom||offer.nom,parcours_code:offer.parcours_code||offer.code,
        statut:"actif",statut_global:"actif",contrat_acquisition_statut:offer.contrat_acquisition_requis?"a_signer":"non_requis",contrat_accompagnement_statut:offer.contrat_accompagnement_requis?"a_signer":"non_requis",
        created_by:currentUser.id,updated_by:currentUser.id,compte_actif:false,phase_actuelle:"pre_activation",total_hectares:ha
      });
      if(clientError||!client)throw clientError||new Error("Client non créé");

      // Si le dossier provient d’un lead, conserver la traçabilité de l’affectation commerciale.
      if(formData.lead_id){
        const {error:leadError}=await (supabase as any).from("leads").update({client_id:client.id,statut:"converti",converti_at:new Date().toISOString()}).eq("id",formData.lead_id);
        if(leadError) throw leadError;
      }

      for(const [field,column] of [["photo_profil","photo_profil_url"],["photo_piece_recto","fichier_piece_recto_url"],["photo_piece_verso","fichier_piece_verso_url"]] as const){
        const file=formData[field+"_file"];if(!file)continue;const uploaded=await uploadFile("documents",file,user.id+"/clients/"+client.id);if(!uploaded)throw new Error("Upload impossible : "+field);
        await (supabase as any).from("clients").update({[column]:uploaded.url}).eq("id",client.id);
      }

       if(external&&formData.lot_id){
         const {error}=await (supabase as any).from("lots_hectares").update({
           client_id:client.id,
           statut:"attribue",
           date_attribution:new Date().toISOString().slice(0,10),
         }).eq("id",formData.lot_id);
         if(error) throw error;
         // Le commercial s'arrête à l'attribution du lot.
         // L'activation Planté-Partagé du propriétaire est déclenchée
         // automatiquement après validation du paiement initial.
       }

      if(formData.has_representant){
        const {data:rep,error:repError}=await (supabase as any).from("client_cotitulaires_mandataires").insert({
          client_id:client.id,type_relation:formData.representant_type||"cotitulaire",lien_client:formData.representant_lien||null,civilite:formData.representant_civilite||null,
          nom:formData.representant_nom,prenoms:formData.representant_prenoms,date_naissance:formData.representant_date_naissance||null,lieu_naissance:formData.representant_lieu_naissance||null,
          nationalite:formData.representant_nationalite||null,type_piece:formData.representant_type_piece||null,numero_piece:formData.representant_numero_piece||null,date_delivrance_piece:formData.representant_date_delivrance||null,
          telephone:formData.representant_telephone||null,whatsapp:formData.representant_whatsapp||null,adresse:formData.representant_adresse||null,created_by:currentUser.id,updated_by:currentUser.id
        }).select().single();
        if(repError||!rep)throw repError||new Error("Cotitulaire / mandataire non enregistré");
        for(const [field,column] of [["representant_photo_profil","photo_profil_url"],["representant_piece_recto","piece_recto_url"],["representant_piece_verso","piece_verso_url"]] as const){
          const file=formData[field+"_file"];if(!file)continue;const uploaded=await uploadFile("documents",file,user.id+"/clients/"+client.id+"/representant");if(!uploaded)throw new Error("Upload impossible : "+field);
          await (supabase as any).from("client_cotitulaires_mandataires").update({[column]:uploaded.url}).eq("id",rep.id);
        }
      }

      const {data:docs}=await (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id",offer.id).eq("actif",true).order("ordre");
      for(const doc of docs||[]){
        const c=doc.condition||{};
        if(c.when==="representant_active"&&!formData.has_representant)continue;
        if(c.relation==="mandataire"&&formData.representant_type!=="mandataire")continue;
        if(c.when==="offre_plus"&&!(/PLUS|DELEGUE|\+/i.test(String(offer.formule_code||"")+" "+String(offer.formule_nom||""))))continue;
        if(c.when==="client_land"&&!offer.necessite_foncier_client)continue;
        if(c.when==="acquisition"&&!offer.contrat_acquisition_requis)continue;
        if(doc.obligatoire&&!formData["doc_"+doc.code+"_file"])throw new Error("Pièce obligatoire manquante : "+doc.libelle);
        const file=formData["doc_"+doc.code+"_file"];if(!file)continue;
        const uploaded=await uploadFile("documents",file,user.id+"/clients/"+client.id+"/pieces");if(!uploaded)throw new Error("Upload impossible : "+doc.libelle);
        const {error}=await (supabase as any).from("documents_acquisition").insert({client_id:client.id,type_document:doc.code,code_document:doc.code,categorie:doc.categorie,obligatoire:doc.obligatoire,source_contractuelle:doc.source_contractuelle,fichier_url:uploaded.url,statut:"en_attente",uploaded_by:user.id,metadata:{offre_id:offer.id,parcours_code:offer.parcours_code||offer.code}});
        if(error)throw error;
      }

      const {data:contracts}=await (supabase as any).from("offre_formulaire_contrats").select("*").eq("offre_id",offer.id).eq("actif",true);
      for(const c of contracts||[]){
        const key="contrat_"+c.type_contrat;
        const file=formData[key+"_file"];
        if(file){const uploaded=await uploadFile("documents",file,user.id+"/clients/"+client.id+"/contrats");if(!uploaded)throw new Error("Upload contrat impossible");}
        await (supabase as any).from("clients").update({[c.type_contrat==="contrat_acquisition_client"?"contrat_acquisition_statut":"contrat_accompagnement_statut"]:formData[key+"_statut"]||"a_preparer"}).eq("id",client.id);
      }

      await (supabase as any).from("client_enquetes").insert({
        client_id:client.id,offre_id:offer.id,parcours_code:offer.parcours_code||offer.code,niveau_detail:String(offer.famille_offre||"").toUpperCase()==="PALMTERROIR"?"light":"standard",
        reponses:{objectif:formData.enquete_objectif,experience:formData.enquete_experience,disponibilite:formData.enquete_disponibilite,source:formData.enquete_source,observations:formData.enquete_observations},
        statut:"complete",created_by:currentUser.id,updated_by:currentUser.id
      });

      if(brouillonId)await (supabase as any).from("acquisitions_brouillon").delete().eq("id",brouillonId);
      toast({title:"Client enregistré",description:"Le dossier Client et son parcours ont été enregistrés."});
      setSyncState("synced");
      navigate("/clients");
    }catch(error:any){
      setSyncState("error");toast({variant:"destructive",title:"Erreur d’enregistrement",description:getSafeErrorMessage(error)});
    }finally{setSaving(false);}
  };

  const renderStep=()=>{
    if(!step)return <Etape0Offre formData={formData} updateFormData={updateFormData}/>;
    switch(step.code){
      case "offre":return <Etape0Offre formData={formData} updateFormData={updateFormData}/>;
      case "client":return <div className="space-y-6"><EtapeClientDynamique formData={formData} updateFormData={updateFormData}/><EtapeEnqueteClient formData={formData} updateFormData={updateFormData}/></div>;
      case "cotitulaire":return <EtapeRepresentantDynamique formData={formData} updateFormData={updateFormData}/>;
      case "parcelle":return <EtapeParcelleDynamique formData={formData} updateFormData={updateFormData}/>;
      case "documents":return <EtapeDocumentsContratsDynamiques formData={formData} updateFormData={updateFormData}/>;
      case "confirmation":return <EtapeConfirmationDossier formData={formData} updateFormData={updateFormData}/>;
      default:return <Etape0Offre formData={formData} updateFormData={updateFormData}/>;
    }
  };

  const last=current===activeSteps.length-1&&activeSteps.length>0;
  return <ProtectedRoute requiredPermissionCode="clients.create"><MainLayout><div className="max-w-7xl mx-auto page-section space-y-5">
    <div><h1 className="text-3xl font-bold">Nouveau Client</h1><p className="text-muted-foreground">Parcours Client : offre, informations du client, cotitulaire / mandataire, foncier, documents et confirmation.</p><SyncStatusBadge state={syncState} className="mt-2"/></div>
    <div className="flex min-w-0 gap-2 overflow-x-auto pb-2 scrollbar-thin">{activeSteps.map((s,i)=>{const Icon=STEP_ICONS[s.code]||FileText;return <Button key={s.code} size="sm" variant={i===current?"default":"outline"} className="shrink-0 gap-1.5 px-2.5 sm:px-3" title={s.titre} aria-label={`Étape ${i+1}: ${s.titre}`} onClick={()=>i<=current&&setCurrent(i)}><Icon className="h-4 w-4"/><span className="hidden sm:inline">{i+1}. {s.titre}</span><span className="sm:hidden text-xs">{i+1}</span></Button>})}</div>
    <Card className="min-w-0 overflow-hidden p-3 sm:p-6 rounded-2xl shadow-sm">{loadingSteps?<div className="p-8 text-center"><Loader2 className="mx-auto animate-spin"/></div>:renderStep()}</Card>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
      <Button variant="outline" onClick={()=>setCurrent(v=>Math.max(0,v-1))} disabled={current===0||saving}><ChevronLeft className="mr-2 h-4 w-4"/>Précédent</Button>
      {!last?<Button onClick={next} disabled={saving||loadingSteps}>{saving?"Sauvegarde…":"Suivant"}<ChevronRight className="ml-2 h-4 w-4"/></Button>:<Button size="lg" onClick={submit} disabled={saving}>{saving?"Enregistrement…":"✓ Enregistrer le Client"}</Button>}
    </div>
  </div></MainLayout></ProtectedRoute>;
};
export default NouvelleAcquisition;