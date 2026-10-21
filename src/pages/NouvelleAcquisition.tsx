import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, BriefcaseBusiness, UserRound, UserCog, FileText, CheckCircle2 } from "lucide-react";
import { Etape0Offre } from "@/components/forms/acquisition/Etape0Offre";
import { EtapeClientDynamique } from "@/components/forms/acquisition/EtapeClientDynamique";
import { EtapeRepresentantDynamique } from "@/components/forms/acquisition/EtapeRepresentantDynamique";
import { EtapeDocumentsContratsDynamiques } from "@/components/forms/acquisition/EtapeDocumentsContratsDynamiques";
import { EtapeConfirmationDossier } from "@/components/forms/acquisition/EtapeConfirmationDossier";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/utils/storage";
import { offlineDelete, offlineInsert, offlineUpdate, offlineUpsert } from "@/lib/offlineWrite";
import { useToast } from "@/hooks/use-toast";
import { SyncStatusBadge, type SyncState } from "@/components/offline/SyncStatusBadge";
import { getSafeErrorMessage } from "@/lib/safeError";
import { calculPrixEffectif } from "@/lib/pricing";
import { usePromotionActive } from "@/hooks/usePromotionActive";
import { useAuth } from "@/hooks/useAuth";
import { getCachedItems, STORES } from "@/lib/offlineDb";

type Step = { code:string; titre:string; description?:string; ordre:number; obligatoire:boolean };

const IDENTITY_DOCUMENT_FIELDS: Record<string, { field: string; column: string; bucket: string }> = {
  client_photo_profil: { field: "photo_profil", column: "photo_profil_url", bucket: "photos-profils" },
  client_piece_recto: { field: "photo_piece_recto", column: "fichier_piece_recto_url", bucket: "pieces-identite" },
  client_piece_verso: { field: "photo_piece_verso", column: "fichier_piece_verso_url", bucket: "pieces-identite" },
};

function recoverFile(file: any, preview: string | undefined, baseName: string): File | null {
  if (typeof File !== "undefined" && file instanceof File) return file;
  if (typeof preview !== "string" || !preview.startsWith("data:")) return null;
  try {
    const comma = preview.indexOf(",");
    if (comma < 0) return null;
    const header = preview.slice(0, comma);
    const mime = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
    const encoded = preview.slice(comma + 1);
    const bytes = header.includes(";base64")
      ? Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(encoded));
    const extension = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "bin";
    return new File([bytes], baseName + "." + extension, { type: mime });
  } catch {
    return null;
  }
}

function restoreDraftFiles(draft: any): any {
  const restored = { ...(draft || {}) };
  for (const key of Object.keys(restored)) {
    if (!key.endsWith("_file")) continue;
    const base = key.slice(0, -5);
    const recovered = recoverFile(restored[key], restored[base + "_preview"], base);
    if (recovered) restored[key] = recovered;
  }
  // Older drafts stored a second copy of identity uploads in the documents step.
  // Keep the canonical identity fields as the single source of truth.
  for (const [code, { field }] of Object.entries(IDENTITY_DOCUMENT_FIELDS)) {
    const duplicateBase = "doc_" + code;
    if (!restored[field + "_preview"] && restored[duplicateBase + "_preview"]) restored[field + "_preview"] = restored[duplicateBase + "_preview"];
    if (!restored[field + "_file"] || !(restored[field + "_file"] instanceof File)) {
      const file = recoverFile(restored[field + "_file"], restored[field + "_preview"], field);
      if (file) restored[field + "_file"] = file;
    }
    delete restored[duplicateBase + "_file"];
    delete restored[duplicateBase + "_preview"];
  }
  return restored;
}

function stableUuid(namespace: string, key: string): string {
  const input = namespace + ":" + key;
  const hashes: number[] = [];
  for (const seed of [2166136261, 2246822519, 3266489917, 668265263]) {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index++) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hashes.push(hash);
  }
  const hex = hashes.map((value) => value.toString(16).padStart(8, "0")).join("").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return value.slice(0, 8) + "-" + value.slice(8, 12) + "-" + value.slice(12, 16) + "-" + value.slice(16, 20) + "-" + value.slice(20);
}

function hasDocumentFile(formData: any, code: string): boolean {
  const identity = IDENTITY_DOCUMENT_FIELDS[code];
  if (identity) return Boolean(recoverFile(formData[identity.field + "_file"], formData[identity.field + "_preview"], identity.field));
  return Boolean(recoverFile(formData["doc_" + code + "_file"], formData["doc_" + code + "_preview"], code));
}
const STEP_ICONS: Record<string, any> = { offre: BriefcaseBusiness, client: UserRound, cotitulaire: UserCog, documents: FileText, confirmation: CheckCircle2 };

const NouvelleAcquisition = () => {
  const [formData,setFormData]=useState<any>({});
  const [steps,setSteps]=useState<Step[]>([]);
  const [current,setCurrent]=useState(0);
  const [brouillonId,setBrouillonId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [draftLoading,setDraftLoading]=useState(true);
  const [loadingSteps,setLoadingSteps]=useState(false);
  const [syncState,setSyncState]=useState<SyncState>("draft");
  const queuedMutationCountRef = useRef(0);
  const {toast}=useToast();
  const navigate=useNavigate();
  const { user } = useAuth();
  const [searchParams]=useSearchParams();
  const {data:promotionActive}=usePromotionActive(formData.offre_id);

  const updateFormData=(data:any)=>setFormData((prev:any)=>({...prev,...data}));

  useEffect(() => {
    const onQueued = () => {
      queuedMutationCountRef.current += 1;
      setSyncState("queued");
    };
    window.addEventListener("offline-mutation-queued", onQueued);
    return () => window.removeEventListener("offline-mutation-queued", onQueued);
  }, []);

  useEffect(()=>{
    const leadId=searchParams.get("lead_id");
    const prospectId=searchParams.get("prospect_id");
    if(!(leadId || prospectId)) return;
    const params: Record<string, string> = {
      lead_id: leadId || "",
      prospect_id: prospectId || "",
      commercial_id: searchParams.get("commercial_id") || "",
      nom_famille: searchParams.get("nom") || "",
      prenoms: searchParams.get("prenoms") || "",
      telephone: searchParams.get("telephone") || "",
      whatsapp: searchParams.get("whatsapp") || "",
      email: searchParams.get("email") || "",
      district_id: searchParams.get("district_id") || "",
      region_id: searchParams.get("region_id") || "",
      departement_id: searchParams.get("departement_id") || "",
      sous_prefecture_id: searchParams.get("sous_prefecture_id") || "",
      village_id: searchParams.get("village_id") || "",
      domicile: searchParams.get("village") || "",
    };
    // Une URL ne doit préremplir que les valeurs réellement fournies.
    updateFormData(Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "")));
  },[searchParams]);

  useEffect(()=>{
    const prospectId=searchParams.get("prospect_id");
    const leadId=searchParams.get("lead_id");
    const sourceId=prospectId||leadId;
    if(!sourceId) return;
    const isProspect=!!prospectId;
    let active=true;
    void (async()=>{
      const {data:source,error}=await (supabase as any).from(isProspect?"prospects":"leads").select("*").eq("id",sourceId).maybeSingle();
      if(error || !source || !active) return;
      let offerId="";
      if(source.offre_code){
        const {data:offer}=await (supabase as any).from("offres").select("id").eq("code",source.offre_code).maybeSingle();
        offerId=offer?.id||"";
      }
      if(!active) return;
      const sourceValues = {
        ...(isProspect ? {prospect_id:source.id,lead_id:source.lead_id||undefined} : {lead_id:source.id,prospect_id:source.prospect_id||undefined}),
        nom_famille:source.nom_famille||source.nom||"", prenoms:source.prenoms||"",
        telephone:source.telephone||"", whatsapp:source.whatsapp||"", email:source.email||"",
        district_id:source.district_id||"", region_id:source.region_id||"",
        departement_id:source.departement_id||"", sous_prefecture_id:source.sous_prefecture_id||"",
        village_id:source.village_id||"", domicile:source.lieu_residence||source.domicile||source.campement_quartier||source.region_residence||source.localite||"",
        offre_id:offerId, formule_code:source.formule_code||"",
        commercial_id:source.assigned_to||undefined,
      };
      // Empty values from an incomplete lead/prospect must not erase a recovered draft.
      updateFormData(Object.fromEntries(Object.entries(sourceValues).filter(([, value]) => value !== "" && value !== null && value !== undefined)));
    })();
    return ()=>{active=false;};
  },[searchParams]);

  // Restaurer le brouillon avant d'autoriser la saisie : un chargement réseau tardif
  // ne doit jamais interférer avec les premières modifications de l'utilisateur.
  useEffect(()=>{
    let mounted=true;
    setDraftLoading(true);
    (async()=>{
      try {
        const currentUser = user;
        if(!currentUser) return;
        let data: any[] = [];
        try {
          const result = await (supabase as any).from("acquisitions_brouillon").select("*").eq("created_by",currentUser.id).order("updated_at",{ascending:false}).limit(1);
          if (result.error) throw result.error;
          data = result.data || [];
        } catch {
          const cached = await getCachedItems(STORES.ACQUISITIONS_BROUILLON);
          data = cached
            .filter((x: any) => x?.created_by === currentUser.id)
            .sort((a: any,b: any) => String(b?.updated_at||"").localeCompare(String(a?.updated_at||"")))
            .slice(0,1);
        }
        if(!mounted) return;
        if(data?.[0]) {
          const draft=data[0];
          setBrouillonId(draft.id);
          const restoredDraft = restoreDraftFiles(draft.donnees);
          setFormData((current:any)=>({...restoredDraft,...current}));
          setCurrent((current:number)=>current===0?Math.max(0,Number(draft.etape_actuelle||0)):current);
        }
      } catch (error) {
        console.error("[Acquisition] Impossible de restaurer le brouillon",error);
      } finally {
        if(mounted) setDraftLoading(false);
      }
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
      // Le foncier relève exclusivement de la première intervention technique, jamais du parcours commercial.
      // Filtrer aussi côté client protège contre une ancienne configuration ou un cache de configuration.
      const configuredSteps=(data||[]).filter((item:any)=>!["parcelle","enquete"].includes(String(item.code).toLowerCase()));
      setSteps(configuredSteps);
      setCurrent(v=>Math.min(v,Math.max(0,configuredSteps.length-1)));
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
    if(step.code==="offre"&&!formData.formule_code){
      toast({variant:"destructive",title:"Formule obligatoire",description:"Choisissez d’abord la formule exacte de l’offre avant de passer à l’étape Client."}); return false;
    }
    if(step.code==="client"){
      const fields=["civilite","nom_famille","prenoms","date_naissance","lieu_naissance","nationalite","type_piece","numero_piece","telephone","domicile"];
      if(fields.some(f=>!formData[f])||(!formData.photo_piece_recto_file&&!formData.photo_piece_recto_preview)||(!formData.photo_piece_verso_file&&!formData.photo_piece_verso_preview)||(!formData.photo_profil_file&&!formData.photo_profil_preview)){
        toast({variant:"destructive",title:"Client incomplet",description:"L’identité, les coordonnées, la photo et les deux faces de la pièce sont obligatoires."}); return false;
      }
    }
    if(step.code==="cotitulaire"){
      if(formData.offre?.necessite_cotitulaire&&!formData.has_representant){toast({variant:"destructive",title:"Cotitulaire / mandataire requis",description:"Cette offre exige de renseigner un cotitulaire ou mandataire."});return false;}
      if(formData.has_representant){
        const repFields=["representant_type","representant_nom","representant_prenoms","representant_type_piece","representant_numero_piece","representant_telephone"];
        if(repFields.some(f=>!formData[f])||!formData.representant_piece_recto_file||!formData.representant_piece_verso_file||!formData.representant_photo_profil_file){toast({variant:"destructive",title:"Cotitulaire / mandataire incomplet",description:"Renseignez l’identité, le lien, les coordonnées et les pièces/photos."});return false;}
      }
    }
    if(step.code==="documents"){
      const {data:docs}=await (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id",formData.offre_id).eq("actif",true).order("ordre");
      for(const doc of docs||[]){
        const c=doc.condition||{};
        if(c.when==="representant_active"&&!formData.has_representant)continue;
        if(c.relation==="mandataire"&&formData.representant_type!=="mandataire")continue;
        if(c.when==="offre_plus"&&!(/PLUS|DELEGUE|\+/i.test(String(formData.formule_code||"")+" "+String(formData.formule_nom||""))))continue;
        if(c.when==="client_land"&&!formData.offre?.necessite_foncier_client)continue;
        if(c.when==="acquisition"&&!formData.offre?.contrat_acquisition_requis)continue;
        if(doc.obligatoire&&!hasDocumentFile(formData, doc.code)){toast({variant:"destructive",title:"Pièce obligatoire manquante",description:doc.libelle});return false;}
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

  const draftSaveInFlight = useRef(false);
  const draftSaveAgain = useRef(false);
  const saveDraft=async(index:number):Promise<string|null>=>{
    const currentUser = user;
    if(!currentUser)return null;
    const payload={...formData,parcours_code:formData.offre_code||null};
    // File objects cannot be serialized to JSONB. The data-URL previews are the
    // durable copy from which files are reconstructed after a reload/reconnect.
    for (const [code, { field }] of Object.entries(IDENTITY_DOCUMENT_FIELDS)) {
      delete payload["doc_" + code + "_file"];
      delete payload["doc_" + code + "_preview"];
      delete payload[field + "_file"];
      if (!payload[field + "_preview"] && formData["doc_" + code + "_preview"]) payload[field + "_preview"] = formData["doc_" + code + "_preview"];
    }
    let savedId = brouillonId;
    if(savedId) {
      const {error}=await offlineUpdate("acquisitions_brouillon",savedId,{etape_actuelle:index,donnees:payload,offre_id:formData.offre_id||null,parcours_code:formData.offre_code||null,updated_at:new Date().toISOString()});
      if(error) throw error;
    } else {
      const {data,error}=await offlineInsert("acquisitions_brouillon",{etape_actuelle:index,donnees:payload,offre_id:formData.offre_id||null,parcours_code:formData.offre_code||null,created_by:currentUser.id});
      if(error) throw error;
      if(data?.id) { savedId = data.id; setBrouillonId(data.id); }
    }
    setSyncState(navigator.onLine ? "synced" : "queued");
    return savedId;
  };

  // Sauvegarde automatique après une courte pause de saisie. Le brouillon reste
  // conservé même si l’étape finale échoue; aucune actualisation n’est requise.
  useEffect(() => {
    if (draftLoading || saving || !user || !Object.keys(formData).length) return;
    const hasMeaningfulData = Boolean(formData.offre_id || formData.lead_id || formData.prospect_id || formData.nom_famille || formData.telephone);
    if (!hasMeaningfulData) return;
    const timer = window.setTimeout(async () => {
      if (draftSaveInFlight.current) { draftSaveAgain.current = true; return; }
      draftSaveInFlight.current = true;
      try {
        await saveDraft(current);
      } catch (error) {
        console.warn("[Acquisition] Sauvegarde automatique en attente", error);
        setSyncState("queued");
      } finally {
        draftSaveInFlight.current = false;
        if (draftSaveAgain.current) {
          draftSaveAgain.current = false;
          window.setTimeout(() => {
            if (!draftSaveInFlight.current) {
              draftSaveInFlight.current = true;
              void saveDraft(current).catch((error) => {
                console.warn("[Acquisition] Reprise de sauvegarde en attente", error);
                setSyncState("queued");
              }).finally(() => { draftSaveInFlight.current = false; });
            }
          }, 250);
        }
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [formData, current, brouillonId, draftLoading, saving, user]);

  const next=async()=>{if(!(await validateStep()))return;setSaving(true);try{const i=Math.min(activeSteps.length-1,current+1);await saveDraft(i);setCurrent(i);}finally{setSaving(false);}};

  const submit=async(retryAttempt = 0)=>{
    if(!(await validateStep()))return;
    if(!formData.contrat_lu||!formData.documents_authentiques||!formData.autorisation_donnees){
      toast({variant:"destructive",title:"Validation incomplète",description:"Les validations finales sont obligatoires."});return;
    }
    const queuedBeforeSubmit = queuedMutationCountRef.current;
    setSaving(true);
    try{
      const currentUser = user;
      if(!currentUser)throw new Error("Session utilisateur introuvable");
      const savedDraftId = await saveDraft(current);
      const stableClientId = savedDraftId || stableUuid(currentUser.id, "client:" + String(formData.telephone || formData.nom_famille || "draft"));
      const {data:baseOffer,error:offerError}=await (supabase as any).from("offres").select("*").eq("id",formData.offre_id).single();
      if(offerError)throw offerError;
      if(!baseOffer)throw new Error("Offre sélectionnée introuvable");
      const formulas = Array.isArray(baseOffer.formules_configuration) ? baseOffer.formules_configuration : [];
      const selectedFormula = formulas.find((formula: any) => formula.code === formData.formule_code) || formulas[0] || null;
      const offer: any = selectedFormula ? {
        ...baseOffer,
        formule_code: selectedFormula.code || baseOffer.formule_code || baseOffer.code,
        formule_nom: selectedFormula.nom || baseOffer.formule_nom || baseOffer.nom,
        gestion_type: selectedFormula.gestion_type ?? baseOffer.gestion_type,
        ...Object.fromEntries(
          ["montant_pi_par_ha", "montant_cash_par_ha", "mensualite_par_ha", "montant_total_par_ha", "duree_paiement_mois", "tranches_paiement"]
            .filter((key) => selectedFormula[key] !== undefined && selectedFormula[key] !== null)
            .map((key) => [key, selectedFormula[key]])
        ),
      } : baseOffer;
      const ha=Number(formData.superficie_prevue);
      // The client contract workflow currently enforces the échéancier mode in the DB.
      const modePaiement = "echeancier" as const;
      const prix=calculPrixEffectif(offer,promotionActive?[promotionActive as any]:[],{modePaiement});
      const total=Number(prix.montant_total_effectif||prix.montant_total_base||0)*ha;
      const paiementInitial=Number(prix.pi_effectif||0)*ha;
      const mensualite=Number(prix.mensualite_effective||0)*ha;
      const reduction=Number(prix.reduction_montant||0)*ha;
      const external=!offer.necessite_foncier_client;
      const nomComplet=(String(formData.nom_famille||"")+" "+String(formData.prenoms||"")).trim();
      const {data:client,error:clientError}=await offlineUpsert("clients",{id:stableClientId,
        offre_id:offer.id,commercial_id:formData.commercial_id||null,parcelle_id:null,type_client:external?"sans_terre":"avec_terre",type_client_foncier:external?"EXT":"OWN",
        nom:formData.nom_famille||"",nom_famille:formData.nom_famille||"",prenoms:formData.prenoms||"",nom_complet:nomComplet,
        civilite:formData.civilite||null,date_naissance:formData.date_naissance||null,lieu_naissance:formData.lieu_naissance||null,nationalite:formData.nationalite||null,
        statut_marital:formData.statut_marital||null,type_piece:formData.type_piece||null,numero_piece:formData.numero_piece||null,date_delivrance_piece:formData.date_delivrance_piece||null,
        telephone:formData.telephone||"",telephone_indicatif:formData.telephone_indicatif||null,telephone_local:formData.telephone_local||null,whatsapp:formData.whatsapp||null,
        whatsapp_indicatif:formData.whatsapp_indicatif||null,whatsapp_local:formData.whatsapp_local||null,email:formData.email||null,domicile:formData.domicile||null,
        district_id:formData.district_id||null,region_id:formData.region_id||null,departement_id:formData.departement_id||null,sous_prefecture_id:formData.sous_prefecture_id||null,village_id:formData.village_id||null,
        localite:formData.domicile||null,montant_total_contrat:total,
        mode_paiement:modePaiement,paiement_initial_montant:paiementInitial,mensualite_montant:mensualite,
        montant_promo_applique:reduction,promotion_id:prix.promotion_id||null,
        famille_offre:offer.famille_offre||null,formule_code:offer.formule_code||offer.code,formule_nom:offer.formule_nom||offer.nom,parcours_code:offer.parcours_code||offer.code,
        statut:"actif",statut_global:"actif",contrat_acquisition_statut:offer.contrat_acquisition_requis?"a_signer":"non_requis",contrat_accompagnement_statut:offer.contrat_accompagnement_requis?"a_signer":"non_requis",
        created_by:currentUser.id,updated_by:currentUser.id,compte_actif:false,phase_actuelle:"pre_activation",total_hectares:ha
      });
      if(clientError||!client)throw clientError||new Error("Client non créé");

      // Conserver les liens du dossier d'origine sans fabriquer de lead pour un prospect autonome.
      const convertedAt=new Date().toISOString();
      if(formData.lead_id){
        const {error:leadError}=await offlineUpdate("leads",formData.lead_id,{client_id:client.id,statut:"converti",etape_pipeline:"converti",converti_at:convertedAt,updated_at:convertedAt});
        if(leadError) throw leadError;
        if (formData.prospect_id) {
          const {error:prospectError}=await offlineUpdate("prospects",formData.prospect_id,{client_id:client.id,statut:"converti",converted_client_at:convertedAt,updated_at:convertedAt});
          if(prospectError) throw prospectError;
        }
      } else if(formData.prospect_id) {
        const {error:prospectError}=await offlineUpdate("prospects",formData.prospect_id,{client_id:client.id,statut:"converti",converted_client_at:convertedAt,updated_at:convertedAt});
        if(prospectError) throw prospectError;
      }

      const identityUploadedPaths: Record<string, { path: string; bucket: string }> = {};
      for (const [code, config] of Object.entries(IDENTITY_DOCUMENT_FIELDS)) {
        const existingPath = (client as any)[config.column];
        if (existingPath) identityUploadedPaths[code] = { path: existingPath, bucket: config.bucket };
      }
      for(const [field,column,bucket,docCode] of [
        ["photo_profil","photo_profil_url","photos-profils","client_photo_profil"],
        ["photo_piece_recto","fichier_piece_recto_url","pieces-identite","client_piece_recto"],
        ["photo_piece_verso","fichier_piece_verso_url","pieces-identite","client_piece_verso"]
      ] as const){
        const file=recoverFile(formData[field+"_file"],formData[field+"_preview"],field);
        if(!file)continue;
        const uploaded=await uploadFile(bucket,file,user.id+"/clients/"+client.id,"identity-"+field);
        if(!uploaded)throw new Error("Téléversement impossible : "+field);
        identityUploadedPaths[docCode] = { path: uploaded.path, bucket };
        if ((client as any)[column] !== uploaded.path) {
          const {error:mediaLinkError}=await offlineUpdate("clients",client.id,{[column]:uploaded.path});
          if(mediaLinkError)throw mediaLinkError;
        }
      }


      if(formData.has_representant){
        const {data:rep,error:repError}=await offlineUpsert("client_cotitulaires_mandataires",{
          id: stableUuid(stableClientId, "representant"),
          client_id:client.id,type_relation:formData.representant_type||"cotitulaire",lien_client:formData.representant_lien||null,civilite:formData.representant_civilite||null,
          nom:formData.representant_nom,prenoms:formData.representant_prenoms,date_naissance:formData.representant_date_naissance||null,lieu_naissance:formData.representant_lieu_naissance||null,
          nationalite:formData.representant_nationalite||null,type_piece:formData.representant_type_piece||null,numero_piece:formData.representant_numero_piece||null,date_delivrance_piece:formData.representant_date_delivrance||null,
          telephone:formData.representant_telephone||null,whatsapp:formData.representant_whatsapp||null,adresse:formData.representant_adresse||null,created_by:currentUser.id,updated_by:currentUser.id
        });
        if(repError||!rep)throw repError||new Error("Cotitulaire / mandataire non enregistré");
        for(const [field,column,bucket] of [["representant_photo_profil","photo_profil_url","photos-profils"],["representant_piece_recto","piece_recto_url","pieces-identite"],["representant_piece_verso","piece_verso_url","pieces-identite"]] as const){
          const file=recoverFile(formData[field+"_file"],formData[field+"_preview"],field);if(!file)continue;const uploaded=await uploadFile(bucket,file,user.id+"/clients/"+client.id+"/representant","representant-"+field);if(!uploaded)throw new Error("Téléversement impossible : "+field);
          const {error:mediaLinkError}=await offlineUpdate("client_cotitulaires_mandataires",rep.id,{[column]:uploaded.path});
          if(mediaLinkError)throw mediaLinkError;
        }
      }

      const {data:docs,error:docsError}=await (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id",offer.id).eq("actif",true).order("ordre");
      if (docsError) throw docsError;
      if (!docs) throw new Error("Impossible de vérifier les pièces requises pour cette offre.");
      for(const doc of docs){
        const c=doc.condition||{};
        if(c.when==="representant_active"&&!formData.has_representant)continue;
        if(c.relation==="mandataire"&&formData.representant_type!=="mandataire")continue;
        if(c.when==="offre_plus"&&!(/PLUS|DELEGUE|\+/i.test(String(offer.formule_code||"")+" "+String(offer.formule_nom||""))))continue;
        if(c.when==="client_land"&&!offer.necessite_foncier_client)continue;
        if(c.when==="acquisition"&&!offer.contrat_acquisition_requis)continue;
        if(doc.obligatoire&&!hasDocumentFile(formData,doc.code))throw new Error("Pièce obligatoire manquante : "+doc.libelle);

        const identity = IDENTITY_DOCUMENT_FIELDS[doc.code];
        let file: File | null = null;
        let path = "";
        let storageBucket = "documents";
        if (identity) {
          const existing = identityUploadedPaths[doc.code];
          if (existing?.path) {
            path = existing.path;
            storageBucket = existing.bucket;
          } else {
            file = recoverFile(formData[identity.field+"_file"],formData[identity.field+"_preview"],identity.field);
            if (!file) continue;
            const uploaded = await uploadFile(identity.bucket,file,user.id+"/clients/"+client.id,"identity-"+identity.field);
            if (!uploaded) throw new Error("Téléversement impossible : "+doc.libelle);
            path = uploaded.path;
            storageBucket = identity.bucket;
            identityUploadedPaths[doc.code] = { path, bucket: identity.bucket };
            const {error:mediaLinkError}=await offlineUpdate("clients",client.id,{[identity.column]:path});
            if(mediaLinkError)throw mediaLinkError;
          }
        } else {
          file = recoverFile(formData["doc_"+doc.code+"_file"],formData["doc_"+doc.code+"_preview"],doc.code);
          if(!file)continue;
          const uploaded=await uploadFile("documents",file,user.id+"/clients/"+client.id+"/pieces","document-"+doc.code);
          if(!uploaded)throw new Error("Téléversement impossible : "+doc.libelle);
          path = uploaded.path;
        }
        const {error}=await offlineUpsert("documents_acquisition",{
          id: stableUuid(stableClientId, "document:"+doc.code),
          client_id:client.id,type_document:doc.code,code_document:doc.code,categorie:doc.categorie,obligatoire:doc.obligatoire,source_contractuelle:doc.source_contractuelle,
          fichier_url:path,statut:"en_attente",uploaded_by:user.id,
          metadata:{offre_id:offer.id,parcours_code:offer.parcours_code||offer.code,storage_bucket:storageBucket}
        });
        if(error)throw error;
      }

      const {data:contracts,error:contractsError}=await (supabase as any).from("offre_formulaire_contrats").select("*").eq("offre_id",offer.id).eq("actif",true);
      if (contractsError) throw contractsError;
      if (!contracts) throw new Error("Impossible de vérifier les contrats requis pour cette offre.");
      for(const contract of contracts){
        const key="contrat_"+contract.type_contrat;
        const file=recoverFile(formData[key+"_file"],formData[key+"_preview"],key);
        if(file){
          const uploaded=await uploadFile("documents",file,user.id+"/clients/"+client.id+"/contrats","contrat-"+contract.type_contrat);
          if(!uploaded?.path)throw new Error("Upload contrat impossible");
          const {error:contractDocError}=await offlineUpsert("documents_acquisition",{
            id: stableUuid(stableClientId, "contract:"+contract.type_contrat),
            client_id:client.id,type_document:contract.type_contrat,code_document:contract.type_contrat,
            categorie:"contrat",obligatoire:!!contract.obligatoire,source_contractuelle:contract.type_contrat,
            fichier_url:uploaded.path,statut:"en_attente",uploaded_by:user.id,
            metadata:{offre_id:offer.id,parcours_code:offer.parcours_code||offer.code,nom_contrat:contract.nom||contract.libelle||contract.type_contrat,storage_bucket:"documents"}
          });
          if(contractDocError)throw contractDocError;
        }
        const {error:contractStatusError}=await offlineUpdate("clients",client.id,{
          [contract.type_contrat==="contrat_acquisition_client"?"contrat_acquisition_statut":"contrat_accompagnement_statut"]:formData[key+"_statut"]||"a_preparer"
        });
        if(contractStatusError)throw contractStatusError;
      }

      if(brouillonId) {
        const {error:draftDeleteError}=await offlineDelete("acquisitions_brouillon",brouillonId);
        if(draftDeleteError) throw draftDeleteError;
      }
      const savedOffline = !navigator.onLine || queuedMutationCountRef.current > queuedBeforeSubmit;
      toast({title:savedOffline ? "Dossier conservé — synchronisation en attente" : "Client enregistré",description:savedOffline ? "Le dossier, les pièces et les liens sont conservés localement. La synchronisation reprendra automatiquement sans actualisation dès que le serveur sera disponible." : "Le dossier Client et son parcours ont été enregistrés dans la base."});
      setSyncState(savedOffline ? "queued" : "synced");
      navigate("/clients");
    }catch(error:any){
      const message = String(error?.message || getSafeErrorMessage(error) || "");
      const statusCode = Number(error?.status || error?.statusCode || error?.cause?.status || 0);
      const retryable = navigator.onLine && (statusCode >= 500 || /timeout|temporarily unavailable|network|failed to fetch|connection|gateway|warp server|thread killed|502|503|504|server error/i.test(message));
      if (retryable && retryAttempt < 4) {
        setSyncState("queued");
        if (retryAttempt === 0) toast({title:"Dossier conservé",description:"Le serveur répond difficilement. Votre dossier reste sauvegardé et une nouvelle tentative automatique va être effectuée sans actualiser la page."});
        window.setTimeout(() => { void submit(retryAttempt + 1); }, Math.min(15000, 1800 * Math.pow(2, retryAttempt)));
      } else {
        setSyncState(retryable ? "queued" : "error");
        toast({variant:"destructive",title:retryable ? "Dossier conservé — reprise en attente" : "Erreur d’enregistrement",description:retryable ? "Vos informations restent dans le brouillon. Le formulaire pourra reprendre automatiquement dès que le serveur sera disponible." : getSafeErrorMessage(error)});
      }
    }finally{setSaving(false);}
  };

  const autoResumeAttempted = useRef(false);
  useEffect(() => {
    if (autoResumeAttempted.current || draftLoading || loadingSteps || saving || !user || !brouillonId) return;
    if (!formData.offre_id || current !== activeSteps.length - 1) return;
    if (!formData.contrat_lu || !formData.documents_authentiques || !formData.autorisation_donnees) return;
    const requiredIdentityReady = ["photo_profil", "photo_piece_recto", "photo_piece_verso"].every((field) =>
      Boolean(recoverFile(formData[field + "_file"], formData[field + "_preview"], field))
    );
    if (!requiredIdentityReady) return;
    autoResumeAttempted.current = true;
    const timer = window.setTimeout(() => { void submit(); }, 900);
    return () => window.clearTimeout(timer);
  }, [draftLoading, loadingSteps, saving, user, brouillonId, formData, current, activeSteps.length]);

  const renderStep=()=>{
    if(!step)return <Etape0Offre formData={formData} updateFormData={updateFormData}/>;
    switch(step.code){
      case "offre":return <Etape0Offre formData={formData} updateFormData={updateFormData}/>;
      case "client":return <EtapeClientDynamique formData={formData} updateFormData={updateFormData}/>;
      case "cotitulaire":return <EtapeRepresentantDynamique formData={formData} updateFormData={updateFormData}/>;
      case "documents":return <EtapeDocumentsContratsDynamiques formData={formData} updateFormData={updateFormData}/>;
      case "confirmation":return <EtapeConfirmationDossier formData={formData} updateFormData={updateFormData}/>;
      default:return <Etape0Offre formData={formData} updateFormData={updateFormData}/>;
    }
  };

  const last=current===activeSteps.length-1&&activeSteps.length>0;
  return <ProtectedRoute requiredPermissionCode="clients.create"><MainLayout><div className="max-w-7xl mx-auto page-section space-y-5">
    <div><h1 className="text-3xl font-bold">Nouveau Client</h1><SyncStatusBadge state={syncState} className="mt-2"/></div>
    <div className="flex min-w-0 gap-2 overflow-x-auto pb-2 scrollbar-thin">{activeSteps.map((s,i)=>{const Icon=STEP_ICONS[s.code]||FileText;return <Button key={s.code} size="sm" variant={i===current?"default":"outline"} className="shrink-0 gap-1.5 px-2.5 sm:px-3" title={s.titre} aria-label={`Étape ${i+1}: ${s.titre}`} onClick={()=>i<=current&&setCurrent(i)}><Icon className="h-4 w-4"/><span className="hidden sm:inline">{i+1}. {s.titre}</span><span className="sm:hidden text-xs">{i+1}</span></Button>})}</div>
    <Card className="min-w-0 overflow-hidden p-3 sm:p-6 rounded-2xl shadow-sm">{draftLoading||loadingSteps?<div className="p-8 text-center"><Loader2 className="mx-auto animate-spin"/></div>:renderStep()}</Card>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
      <Button variant="outline" onClick={()=>setCurrent(v=>Math.max(0,v-1))} disabled={current===0||saving||draftLoading||loadingSteps}><ChevronLeft className="mr-2 h-4 w-4"/>Précédent</Button>
      {!last?<Button onClick={next} disabled={saving||draftLoading||loadingSteps}>{saving?"Sauvegarde…":"Suivant"}<ChevronRight className="ml-2 h-4 w-4"/></Button>:<Button size="lg" onClick={submit} disabled={saving||draftLoading}>{saving?"Enregistrement…":"✓ Enregistrer le Client"}</Button>}
    </div>
  </div></MainLayout></ProtectedRoute>;
};
export default NouvelleAcquisition;