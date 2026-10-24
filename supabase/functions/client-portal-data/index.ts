import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const coalesceNumber=(v:any)=>Number(v||0);
const normalizeStatus=(v:any)=>{
  const s=String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(["termine","terminee","valide","validee","realise","realisee","acheve","achevee","complete","complet"].includes(s)) return "termine";
  if(["en_cours","encours","en cours","demarre","demarree"].includes(s)) return "en_cours";
  return "pending";
};
async function sha256(v:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders});
  try{
    const body=await req.json().catch(()=>({}));
    const token=String(body?.access_token||"");
    if(!token) return json({success:false,error:"Session portail manquante."},401);

    const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,secret);
    const tokenHash=await sha256(token);

    const {data:session}=await supabase
      .from("client_portal_sessions")
      .select("client_id,expires_at,revoked_at")
      .eq("token_hash",tokenHash)
      .maybeSingle();

    if(!session || session.revoked_at || new Date(session.expires_at).getTime()<=Date.now())
      return json({success:false,error:"Session portail expirée. Veuillez vous reconnecter."},401);

    await supabase.from("client_portal_sessions")
      .update({last_seen_at:new Date().toISOString()})
      .eq("token_hash",tokenHash);

    const {data:client,error:clientError}=await supabase
      .from("clients")
      .select("*,offres(*),regions(id,nom),departements(id,nom),districts(id,nom),sous_prefectures(id,nom),promotions:promotion_id(id,nom,code,pourcentage_reduction,montant_fixe_reduction,date_debut,date_fin,cible,active,applique_toutes_offres,offre_ids)")
      .eq("id",session.client_id)
      .maybeSingle();

    if(clientError) throw clientError;
    const isPreActivation = Boolean(client && !client.compte_actif && client.validation_statut === "valide" && !["beneficiaire_particulier","proprietaire_foncier"].includes(String(client.type_client||"")) && !client.is_internal);
    if(!client || (!client.compte_actif && client.type_client!=="beneficiaire_particulier" && !isPreActivation)) return json({success:false,error:"Compte portail inactif ou dossier client non validé."},403);

    if (isPreActivation) {
      const [{data: financialState, error: financialError}, {data: initialPayments, error: paymentsError}] = await Promise.all([
        supabase.rpc("portal_current_payment_state", {_client_id: client.id}),
        supabase.from("paiements")
          .select("id,client_id,plantation_id,acquisition_id,type_paiement,est_paiement_initial,montant,montant_paye,statut,reference,mode_paiement,date_paiement,created_at")
          .eq("client_id", client.id)
          .eq("est_paiement_initial", true)
          .in("statut", ["en_attente","valide"])
          .order("created_at", {ascending:false})
          .limit(10)
      ]);
      if (financialError) throw financialError;
      if (paymentsError) throw paymentsError;
      const preActivationClient = {
        id: client.id,
        id_unique: client.id_unique,
        nom_complet: client.nom_complet,
        telephone: client.telephone || client.whatsapp || client.telephone_local || client.whatsapp_local,
        email: client.email,
        compte_actif: false,
        validation_statut: client.validation_statut,
        pre_activation: true,
        type_client: client.type_client,
        is_beneficiaire_particulier: false,
        offre_id: client.offre_id,
        offres: client.offres ? {nom: client.offres.nom, couleur: client.offres.couleur} : null,
        montant_total_contrat: client.montant_total_contrat,
        total_hectares: client.total_hectares,
        contrat_solde_at: client.contrat_solde_at,
        paiement_personnalise: client.paiement_personnalise,
        paiement_etat: financialState || {},
        portal_primary_role: "client",
        portal_roles: ["client"],
        portal_config: {}
      };
      return json({success:true,pre_activation:true,client:preActivationClient,portal_roles:["client"],parcelles:[],attributions:[],plantations:[],paiements:initialPayments||[],notifications:[]});
    }

    const isOwnerType=client.type_client==="proprietaire_foncier";
    const isBeneficiary=client.type_client==="beneficiaire_particulier";

    const [ownerRes, attributionRes, directPlantationRes, payRes, commercialRes, notificationRes, interventionRes, documentRes, configRes, referenceRes, acquisitionRes] = await Promise.all([
      client.proprietaire_id
        ? supabase.from("proprietaires_terres").select("*").eq("id",client.proprietaire_id).maybeSingle()
        : Promise.resolve({data:null}),
      supabase.from("beneficiaire_attributions")
        .select("id,client_id,parcelle_id,plantation_id,surface_attribuee_ha,role_attribution,statut,reference_acte,notes,created_at")
        .eq("client_id",client.id).eq("statut","active").order("created_at",{ascending:true}),
      supabase.from("plantations")
        .select("*,regions(id,nom),departements(id,nom),districts(id,nom),sous_prefectures(id,nom)")
        .eq("client_id",client.id).order("created_at",{ascending:false}),
      supabase.from("paiements").select("*").eq("client_id",client.id).eq("statut","valide").order("date_paiement",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false}).limit(500),
      client.commercial_id
        ? supabase.from("profiles").select("id,user_id,nom_complet,telephone,email,photo_url,whatsapp,poste,telephone_indicatif,telephone_local,whatsapp_indicatif,whatsapp_local").or(`user_id.eq.${client.commercial_id},id.eq.${client.commercial_id}`).maybeSingle()
        : Promise.resolve({data:null}),
      supabase.from("portail_notifications").select("id,type,title,message,data,read,created_at")
        .eq("client_id",client.id).order("created_at",{ascending:false}).limit(50),
      supabase.from("interventions_techniques")
        .select("id,plantation_id,client_id,parcelle_id,agent_technique_id,type_intervention,date_intervention,statut,observations,recommandations,nombre_plants_prevus,nombre_plants_realises,densite_plants,updated_at")
        .eq("client_id",client.id).order("date_intervention",{ascending:true}),
      supabase.from("documents_acquisition")
        .select("id,client_id,type_document,fichier_url,statut,observations,code_document,categorie,obligatoire,source_contractuelle,created_at,updated_at")
        .eq("client_id",client.id).order("created_at",{ascending:false}),
      supabase.from("configurations_systeme").select("cle,valeur").in("cle",["contact_telephone","contact_whatsapp","contact_email","paiement_kkiapay_mobile_money_fee_rate","plantation_densite_defaut"]),
      supabase.from("referentiels_systeme").select("code,libelle,ordre").eq("categorie","etape_plantation").eq("actif",true).order("ordre").order("libelle"),
      supabase.from("acquisitions").select("id,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,superficie_ha,montant_pi_total,montant_total_contrat,mensualite_montant,duree_paiement_mois,parcelle_id,lot_id,statut,metadata,created_at").eq("client_id",client.id).order("created_at",{ascending:true})
    ]);

    // La photo du commercial peut être stockée comme chemin privé dans le bucket
    // photos-profils. Convertir ce chemin en URL signée utilisable par le portail.
    if (commercialRes.data?.photo_url) {
      const rawPhoto = String(commercialRes.data.photo_url).trim();
      let photoPath = rawPhoto.replace(/^\/+/, "");
      const relativeMatch = photoPath.match(/^storage\/v1\/object\/(?:public|sign)\/photos-profils\/(.+)$/);
      if (relativeMatch) photoPath = decodeURIComponent(relativeMatch[1]);
      try {
        const parsed = new URL(rawPhoto);
        const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/photos-profils\/(.+)$/);
        photoPath = match ? decodeURIComponent(match[1]) : (/^https?:\/\//i.test(rawPhoto) ? "" : photoPath);
      } catch {
        // Valeur stockée comme chemin relatif.
      }
      if (photoPath) {
        const { data: signedPhoto, error: signedPhotoError } = await supabase.storage
          .from("photos-profils").createSignedUrl(photoPath, 7 * 24 * 60 * 60);
        if (!signedPhotoError && signedPhoto?.signedUrl) commercialRes.data.photo_url = signedPhoto.signedUrl;
        else console.warn("[client-portal-data] Photo commerciale indisponible", { profileId: commercialRes.data.id });
      }
    }

    const owner=ownerRes.data||null;
    const normalizeIdentityName=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/gi,"").toLowerCase();
    // Un compte lié à sa propre fiche foncière est un compte propriétaire; un bénéficiaire lié à un tiers ne l'est pas.
    const isOwner=isOwnerType || Boolean(client.proprietaire_id && owner && normalizeIdentityName(client.nom_complet)===normalizeIdentityName(owner.nom_complet));
    const attributions=attributionRes.data||[];
    const directPlantations=directPlantationRes.data||[];
    const paiements=payRes.data||[];
    const notificationRows=notificationRes.data||[];
    const interventions=interventionRes.data||[];
    const documents=documentRes.data||[];
    const acquisitionRows=acquisitionRes.data||[];
    const financialSubscriptions=acquisitionRows.filter((a:any)=>!["annule","annulee","annulée","cancelled","supprime","supprimee","supprimé","refuse","refusee","refusé"].includes(String(a.statut||"").toLowerCase()));
    const hasFinancialSubscriptions=financialSubscriptions.length>0;
    // Un compte propriétaire est toujours un espace foncier, jamais un compte de paiement.
    // Un bénéficiaire particulier sans souscription financière reste également un compte non financier.
    const isStakeholder=isOwner || (isBeneficiary && !hasFinancialSubscriptions);
    const portalRoles=[
      ...(isOwner?["proprietaire_foncier"]:[]),
      ...(isBeneficiary?["beneficiaire_particulier"]:[]),
      ...(!isOwner && (hasFinancialSubscriptions||!isBeneficiary)?["client"]:[])
    ];
    if(configRes.error) throw configRes.error;
    if(referenceRes.error) throw referenceRes.error;
    const configMap=new Map((configRes.data||[]).map((x:any)=>[x.cle,x.valeur]));
    const portalConfig={
      contact_telephone:String(configMap.get("contact_telephone")||""),
      contact_whatsapp:String(configMap.get("contact_whatsapp")||""),
      contact_email:String(configMap.get("contact_email")||""),
      kkiapay_mobile_money_fee_rate:Number(configMap.get("paiement_kkiapay_mobile_money_fee_rate")||0),
      plantation_densite_defaut:Number(configMap.get("plantation_densite_defaut")||0)
    };
    const technicianIds=[...new Set(interventions.map((i:any)=>i.agent_technique_id).filter(Boolean))];
    let technicianRows:any[]=[];
    if(technicianIds.length){
      const {data:rows}=await supabase.from("profiles").select("id,user_id,nom_complet,telephone,email,photo_url").in("id",technicianIds);
      technicianRows=rows||[];
    }
    const technicianMap=new Map(technicianRows.map((p:any)=>[p.id,p]));
    const technicians=technicianIds.map((id:string)=>technicianMap.get(id)).filter(Boolean);

    let parcelleIds:string[]=[];
    let parcelles:any[]=[];
    if(owner?.id){
      const {data:ownerParcelles}=await supabase.from("parcelles").select("*")
        .eq("proprietaire_id",owner.id).order("created_at",{ascending:false});
      parcelles=ownerParcelles||[];
      parcelleIds=parcelles.map((p:any)=>p.id);
    } else if(client.parcelle_id) {
      // Le portail d'un client standard doit aussi recevoir sa parcelle et ses coordonnées GPS.
      const {data:clientParcelle}=await supabase.from("parcelles").select("*")
        .eq("id",client.parcelle_id).maybeSingle();
      parcelles=clientParcelle?[clientParcelle]:[];
      parcelleIds=clientParcelle?[clientParcelle.id]:[];
    } else {
      parcelleIds=[...new Set(attributions.map((a:any)=>a.parcelle_id).filter(Boolean))];
      if(parcelleIds.length){
        const {data:benefParcelles}=await supabase.from("parcelles").select("*")
          .in("id",parcelleIds).order("created_at",{ascending:false});
        parcelles=benefParcelles||[];
      } else {
        parcelles=[];
      }
    }

    let sharedPlantations:any[]=[];
    if(parcelleIds.length){
      const {data:byParcel}=await supabase.from("plantations")
        .select("*,regions(id,nom),departements(id,nom),districts(id,nom),sous_prefectures(id,nom)")
        .in("parcelle_id",parcelleIds).order("created_at",{ascending:false});
      sharedPlantations=byParcel||[];
    }

    const plantationMap=new Map<string,any>();
    for(const p of [...directPlantations,...sharedPlantations]) plantationMap.set(p.id,p);
    const plantations=[...plantationMap.values()];

    // L'état financier est exclusivement calculé en DB à partir des paiements validés.
    // Aucune échéance future n'est créée et aucune règle tarifaire n'est reproduite dans le portail.
    const paymentStateResult = isStakeholder
      ? {data:null,error:null}
      : await supabase.rpc("portal_current_payment_state",{_client_id:client.id});
    if(paymentStateResult.error) throw paymentStateResult.error;
    const financialState=paymentStateResult.data||{
      paiement_initial:{montant_officiel:0,deja_paye:0,solde:0,disponible:false},
      mensualite:{montant:0,montant_a_payer:0,disponible:false,jours_retard:0,montant_arriere:0,hectares_actifs:0},
      total_paye:0
    };
    const plantationsWithPaymentState=await Promise.all(plantations.map(async (p:any)=>{
      if(isStakeholder || p.client_id!==client.id) return {...p,paiement_etat:null};
      const {data:plantationPaymentState,error:plantationPaymentStateError}=await supabase.rpc("portal_plantation_payment_state",{_client_id:client.id,_plantation_id:p.id});
      if(plantationPaymentStateError){
        console.warn("[client-portal-data] État financier de plantation indisponible",{plantationId:p.id});
        return {...p,paiement_etat:null};
      }
      return {...p,paiement_etat:plantationPaymentState||null};
    }));

    for(const p of plantationsWithPaymentState){
      p.attributions=attributions.filter((a:any)=>a.plantation_id===p.id || (!a.plantation_id && a.parcelle_id===p.parcelle_id));
    }

    const ids=plantationsWithPaymentState.map((p:any)=>p.id);
    let tickets:any[]=[]; let reports:any[]=[]; let media:any[]=[]; let plantationPhotos:any[]=[];
    if(ids.length){
      const [tRes,rRes,photoRes]=await Promise.all([
        supabase.from("tickets_techniques").select("id,titre,description,plantation_id,priorite,statut,date_resolution,created_at,updated_at")
          .in("plantation_id",ids).order("updated_at",{ascending:false}),
        supabase.from("rapports_visites_techniques").select("id,plantation_id,date_visite,type_visite,etat_plantation,contenu_client,prochaine_intervention,client_visible,statut")
          .in("plantation_id",ids).eq("client_visible",true).eq("statut","valide").order("date_visite",{ascending:false}),
        supabase.from("photos_plantation").select("id,plantation_id,url,type_photo,phase,description,date_prise").in("plantation_id",ids).order("date_prise",{ascending:false})
      ]);
      tickets=tRes.data||[];
      reports=rRes.data||[];
      plantationPhotos=photoRes.data||[];
      const reportIds=reports.map((r:any)=>r.id);
      if(reportIds.length){
        const {data:m}=await supabase.from("rapports_visites_medias")
          .select("id,rapport_id,plantation_id,media_type,storage_path,mime_type,nom_fichier,description,client_visible,created_at")
          .in("rapport_id",reportIds).eq("client_visible",true).order("created_at",{ascending:false});
        media=m||[];
        for(const item of media){
          if(item.storage_path){
            const {data:signed}=await supabase.storage.from("rapports-techniques").createSignedUrl(item.storage_path,3600);
            item.url=signed?.signedUrl||null;
          }
        }
      }
    }

    let dailyRate=Number(client.taux_journalier_ha||0);
    if(!isStakeholder){
      const {data:rate}=await supabase.rpc("portal_client_daily_rate",{_client_id:client.id,_at_date:new Date().toISOString().slice(0,10)});
      dailyRate=Number(rate||dailyRate||0);
    }

    for(const p of plantations){
      p.rapports_visites=reports.filter((r:any)=>r.plantation_id===p.id)
        .map((r:any)=>({...r,medias:media.filter((m:any)=>m.rapport_id===r.id)}));
      p.tickets_techniques=tickets.filter((t:any)=>t.plantation_id===p.id);
      p.medias=plantationPhotos.filter((m:any)=>m.plantation_id===p.id).map((m:any)=>({
        id:m.id,type:m.type_photo==="video"?"video":"photo",url:m.url,operation:m.phase,commentaire:m.description,date:m.date_prise
      }));
      const plantationInterventions=interventions.filter((i:any)=>
        i.plantation_id===p.id ||
        (!i.plantation_id && i.parcelle_id && i.parcelle_id===p.parcelle_id) ||
        (!i.plantation_id && !i.parcelle_id && plantations.length===1)
      );
      p.interventions=plantationInterventions;
      p.etapes=plantationInterventions.map((i:any)=>({
        key:i.type_intervention,type:i.type_intervention,statut:normalizeStatus(i.statut),date_realisation:i.date_intervention,commentaire:i.observations
      }));
      p.taux_journalier_ha=isStakeholder ? null : dailyRate;
    }

    let ownerActivationRows:any[]=[];
    if(isOwner && owner?.id){
      let ownerActivationQuery=supabase.from("plantation_activations")
        .select("id,lot_id,parcelle_id,proprietaire_id,client_id,surface_proprietaire_ha,statut,date_activation,created_at,notes")
        .eq("proprietaire_id",owner.id).eq("statut","active")
        .order("date_activation",{ascending:false});
      if(parcelleIds.length) ownerActivationQuery=ownerActivationQuery.in("parcelle_id",parcelleIds);
      const {data:rows,error:ownerActivationError}=await ownerActivationQuery;
      if(ownerActivationError) throw ownerActivationError;
      ownerActivationRows=rows||[];
    }
    const portalAttributions=isOwner
      ? ownerActivationRows.map((a:any)=>({id:a.id,client_id:client.id,parcelle_id:a.parcelle_id,plantation_id:(plantationsWithPaymentState.find((p:any)=>p.lot_id===a.lot_id && p.parcelle_id===a.parcelle_id)?.id || a.id),surface_attribuee_ha:a.surface_proprietaire_ha,role_attribution:"part_proprietaire",statut:a.statut,reference_acte:null,notes:"Part du propriétaire enregistrée par l’activation foncière.",created_at:a.created_at}))
      : attributions;

    const progressionKeys=(referenceRes.data||[]).map((x:any)=>[x.code,x.libelle]);
    const techniqueProgression=progressionKeys.map(([key,label])=>{
      const rows=interventions.filter((i:any)=>String(i.type_intervention||"").toLowerCase()===key);
      const found=rows.find((i:any)=>normalizeStatus(i.statut)==="termine")||rows.find((i:any)=>normalizeStatus(i.statut)==="en_cours")||rows[0];
      return {key,label,statut:normalizeStatus(found?.statut),date:found?.date_intervention,commentaire:found?.observations};
    }).filter((e:any)=>e.statut!=="pending" || interventions.length>0);
    const parcel=parcelles.find((p:any)=>p.id===client.parcelle_id)||parcelles[0]||null;
    const technician=technicians[0]||null;
    const safe:any={...client,site_gps:{
      latitude:client.latitude ?? parcel?.localisation_gps_lat ?? null,
      longitude:client.longitude ?? parcel?.localisation_gps_lng ?? null,
      source:client.latitude != null && client.longitude != null ? "client" : (parcel?.localisation_gps_lat != null && parcel?.localisation_gps_lng != null ? "parcelle" : null)
    },portal_roles:portalRoles,portal_primary_role:isOwner?"proprietaire_foncier":(hasFinancialSubscriptions?"client":(portalRoles[0]||"client")),
      is_proprietaire_foncier:isOwner,is_beneficiaire_particulier:isBeneficiary,
      promotion_active:client.promotions||null,
      has_financial_subscriptions:isStakeholder ? false : hasFinancialSubscriptions,
      financial_subscriptions:isStakeholder ? [] : financialSubscriptions,
      proprietaire:owner,
      parcelle:parcel,
      parcelles,
      attributions:portalAttributions,
      documents:documents.map((d:any)=>({...d,nom:d.type_document||d.code_document||"Document",url:d.fichier_url})),
      technique_interventions:interventions,
      technique_progression:techniqueProgression,
      commercial:commercialRes.data?{...commercialRes.data,nom:commercialRes.data.nom_complet,fonction:commercialRes.data.poste||"Conseiller AgriCapital",telephone:commercialRes.data.telephone||[(commercialRes.data.telephone_indicatif||"+225"),commercialRes.data.telephone_local||""].filter(Boolean).join(""),whatsapp:commercialRes.data.whatsapp||[(commercialRes.data.whatsapp_indicatif||commercialRes.data.telephone_indicatif||"+225"),(commercialRes.data.whatsapp_local||commercialRes.data.telephone_local||commercialRes.data.telephone||"")].filter(Boolean).join("")}:null,
      technicien:technician?{...technician,nom:technician.nom_complet,fonction:"Technicien terrain"}:null,
      techniciens:technicians,
      demo:false,
      _demo:false,
      taux_journalier_actuel_ha:dailyRate,
      portal_config:portalConfig,
      portail_notifications_unread:notificationRows.filter((n:any)=>!n.read).length,
      ...(!isStakeholder ? {paiement_situation:{
        etat:financialState.mensualite?.jours_retard>0?"arriere":"a_jour",
        jours_ecart:Number(financialState.mensualite?.jours_retard||0),
        montant_ecart:Math.round(Number(financialState.mensualite?.montant_arriere||0)),
        montant_prochaine_echeance:Number(financialState.mensualite?.montant_a_payer||0),
        prochaine_echeance:null
      },paiement_etat:financialState} : {})

    };
    delete safe.user_id; delete safe.created_by; delete safe.updated_by; delete safe.numero_piece;
    delete safe.fichier_piece_url; delete safe.fichier_piece_recto_url; delete safe.fichier_piece_verso_url; delete safe.numero_compte;
    if(isStakeholder){
      // Défense en profondeur : aucune donnée tarifaire ou de paiement ne quitte cette fonction
      // pour un compte propriétaire/bénéficiaire, même si un ancien lien financier existe.
      for (const key of Object.keys(safe)) {
        if (/paiement|montant|solde|echeance|financier|finance|offre|promotion|commission|jours_payes|jours_retard|taux_journalier|acquisition|contrat|retard/i.test(key)) delete safe[key];
      }
      safe.portal_config = {
        contact_telephone: portalConfig.contact_telephone,
        contact_whatsapp: portalConfig.contact_whatsapp,
        contact_email: portalConfig.contact_email,
        plantation_densite_defaut: portalConfig.plantation_densite_defaut,
      };
    }

    const ownerPortalPlantations=isOwner ? ownerActivationRows.map((a:any)=>{
      const source=plantationsWithPaymentState.find((p:any)=>p.lot_id===a.lot_id && p.parcelle_id===a.parcelle_id);
      const ownerArea=Math.max(0,Number(a.surface_proprietaire_ha||0));
      const sourceArea=Math.max(0,Number(source?.superficie_ha||0));
      const plantRatio=source && sourceArea>0 ? ownerArea/sourceArea : 0;
      const ownerPlantation:any={...(source||{}),
        id:source?.id||a.id,
        id_unique:source?.id_unique||("PART-"+String(a.lot_id||a.id).slice(0,8)),
        nom_plantation:"Plantation de la part du propriétaire",
        nom:"Plantation de la part du propriétaire",
        superficie_ha:ownerArea,
        superficie_activee:ownerArea,
        surface_reellement_plantee:ownerArea,
        nombre_plants:source && sourceArea>0 ? Math.round(Number(source.nombre_plants||0)*plantRatio) : null,
        nombre_plants_prevus:source && sourceArea>0 ? Math.round(Number(source.nombre_plants_prevus||source.nombre_plants||0)*plantRatio) : null,
        parcelle_id:a.parcelle_id,
        role_attribution:"part_proprietaire",
        statut:a.statut,
        statut_global:a.statut,
        date_activation:a.date_activation,
        owner_activation_id:a.id,
        portal_has_source_plantation:Boolean(source),
        paiement_etat:null,
        taux_journalier_ha:null,
      };
      for (const key of Object.keys(ownerPlantation)) {
        if (/paiement|montant|solde|echeance|offre|promotion|commission|acquisition|client_id|lot_id|taux_journalier|alerte_non_paiement|notes_internes|created_by|updated_by/i.test(key)) delete ownerPlantation[key];
      }
      return ownerPlantation;
    }) : [];
    const ownPlantations=plantationsWithPaymentState.filter((p:any)=>p.client_id===client.id || attributions.some((a:any)=>a.plantation_id===p.id));
    const portalPlantations = isOwner
      ? ownerPortalPlantations
      : isStakeholder
        ? ownPlantations.map((p:any)=>{
            const safePlantation:any={...p,paiement_etat:null,taux_journalier_ha:null};
            for(const key of Object.keys(safePlantation)){
              if(/paiement|montant|solde|echeance|offre|promotion|commission|acquisition|taux_journalier|alerte_non_paiement|notes_internes|created_by|updated_by/i.test(key)) delete safePlantation[key];
            }
            return safePlantation;
          })
        : ownPlantations;

    return json({
      success:true,client:safe,
      portal_roles:portalRoles,parcelles,attributions:portalAttributions,plantations:portalPlantations,
      paiements:isStakeholder ? [] : paiements,
      notifications:notificationRows
    });
  }catch(e:any){
    console.error("client-portal-data internal error:",e);
    return json({success:false,code:"TEMPORARY_SERVICE_ERROR",error:"Nous rencontrons une difficulté technique. Veuillez réessayer dans quelques instants. Si le problème persiste, contactez AgriCapital au +225 05 64 55 17 17."},500);
  }
});