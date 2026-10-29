import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, BriefcaseBusiness, UserRound, UserCog, FileText, CheckCircle2 } from "lucide-react";
import { Etape0Offre } from "@/components/forms/acquisition/Etape0Offre";
import { EtapeClientDynamique } from "@/components/forms/acquisition/EtapeClientDynamique";
import { EtapeRepresentantDynamique } from "@/components/forms/acquisition/EtapeRepresentantDynamique";
import { EtapeDocumentsContratsDynamiques } from "@/components/forms/acquisition/EtapeDocumentsContratsDynamiques";
import { EtapeConfirmationDossier } from "@/components/forms/acquisition/EtapeConfirmationDossier";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, resolveStorageUrl } from "@/utils/storage";
import { offlineUpdate, offlineUpsert } from "@/lib/offlineWrite";
import { useToast } from "@/hooks/use-toast";
import { SyncStatusBadge, type SyncState } from "@/components/offline/SyncStatusBadge";
import { getSafeErrorMessage } from "@/lib/safeError";
import { calculPrixEffectif } from "@/lib/pricing";
import { usePromotionActive } from "@/hooks/usePromotionActive";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/roles";


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
const StoredAttachmentLinks=({formData}:{formData:any})=>{
  const [items,setItems]=useState<Array<{label:string;url:string;image:boolean}>>([]);
  const signature=Object.entries(formData||{}).filter(([key,value])=>key.endsWith("_preview")&&typeof value==="string"&&Boolean(value)).map(([key,value])=>key+":"+String(value)).join("|");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      const entries=Object.entries(formData||{}).filter(([key,value])=>key.endsWith("_preview")&&typeof value==="string"&&Boolean(value));
      const resolved=await Promise.all(entries.map(async([key,value])=>{
        const source=String(value);
        if(/^(https?:|data:|blob:)/i.test(source)) return {label:key.replace(/_preview$/,"").replace(/^(doc_|contrat_)/,"").replace(/_/g," "),url:source,image:/^data:image\//i.test(source)||/\.(png|jpe?g|webp|gif)(\?|$)/i.test(source)};
        const name=key.toLowerCase();
        const buckets=name.includes("photo")||name.includes("profil")?["photos-profils","documents","documents-fonciers","pieces-identite"]:name.includes("foncier")||name.includes("croquis")?["documents-fonciers","documents","pieces-identite"]:name.includes("contrat")||name.startsWith("doc_")?["documents","documents-fonciers","pieces-identite"]:["pieces-identite","documents","documents-fonciers"];
        for(const bucket of buckets){try{const url=await resolveStorageUrl(bucket,source);if(url)return {label:key.replace(/_preview$/,"").replace(/^(doc_|contrat_)/,"").replace(/_/g," "),url,image:/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)};}catch{ continue; }}
        return null;
      }));
      if(active)setItems(resolved.filter(Boolean) as any[]);
    })();
    return()=>{active=false;};
  },[signature]);
  if(!items.length)return null;
  return <Card className="border-primary/20"><CardHeader className="pb-2"><CardTitle className="text-sm">Aperçu des photos et documents enregistrés</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item,index)=><div key={item.label+index} className="min-w-0 rounded-lg border p-3"><p className="mb-2 truncate text-xs font-medium capitalize">{item.label}</p>{item.image?<a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.label} className="h-36 w-full rounded object-contain bg-muted/30"/></a>:<a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline"><FileText className="h-4 w-4"/>Ouvrir le document</a>}</div>)}</CardContent></Card>;
};


const NouvelleAcquisition = () => {
  const [formData,setFormData]=useState<any>({});
  const [steps,setSteps]=useState<Step[]>([]);
  const [current,setCurrent]=useState(0);
  const [brouillonId,setBrouillonId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [draftLoading,setDraftLoading]=useState(true);
  const [loadingSteps,setLoadingSteps]=useState(false);
  const [syncState,setSyncState]=useState<SyncState>("draft");
  const { id: recordId } = useParams();
  const [existingClientId,setExistingClientId]=useState<string|null>(null);
  const [existingAcquisitionId,setExistingAcquisitionId]=useState<string|null>(null);
  const [existingRecord,setExistingRecord]=useState<any|null>(null);
  const [editExisting,setEditExisting]=useState(false);
  const queuedMutationCountRef = useRef(0);
  const {toast}=useToast();
  const navigate=useNavigate();
  const { user, userRoles=[] } = useAuth();
  const { can } = usePermissions();
  const canEditExistingRole = (userRoles || []).some((role:string)=>["pdg","relation_client","support"].includes(role));
  const canEditExisting = Boolean(existingRecord?.client) && canEditExistingRole && (existingRecord.client.type_client === "beneficiaire_particulier" ? (userRoles || []).includes("pdg") : true);
  const [searchParams]=useSearchParams();
  const {data:promotionActive}=usePromotionActive(formData.offre_id, undefined, !recordId);

  const updateFormData = useCallback((data: any) => setFormData((prev: any) => ({ ...prev, ...data })), []);

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
        type_personne:source.type_personne||"personne_physique",
        denomination_sociale:source.denomination_sociale||"",nature_organisation_code:source.nature_organisation_code||"",forme_juridique_code:source.forme_juridique_code||"",
        numero_enregistrement:source.numero_enregistrement||"",responsable_legal_nom:source.responsable_legal_nom||"",responsable_legal_prenoms:source.responsable_legal_prenoms||"",nombre_membres:source.nombre_membres||null,
        nom_famille:source.nom_famille||source.nom||"", prenoms:source.prenoms||"",
        telephone:source.telephone||"", whatsapp:source.whatsapp||"", email:source.email||"",
        district_id:source.district_id||"", region_id:source.region_id||"",
        departement_id:source.departement_id||"", sous_prefecture_id:source.sous_prefecture_id||"",
        village_id:source.village_id||"", domicile:source.lieu_residence||source.domicile_residence||source.domicile||source.campement_quartier||source.region_residence||source.localite||"",
        domicile_residence:source.lieu_residence||source.domicile_residence||source.domicile||source.campement_quartier||source.region_residence||source.localite||"",
        offre_id:offerId,
        commercial_id:source.assigned_to||undefined,
      };
      // Keep the source formula when it still exists in the current offer configuration.
      // The first acquisition step validates it against the latest active formulas.
      updateFormData({
        ...Object.fromEntries(Object.entries(sourceValues).filter(([, value]) => value !== "" && value !== null && value !== undefined)),
        formule_code: source.formule_code || "",
        formule_nom: source.formule_nom || "",
        formule_confirmed: false,
      });
    })();
    return ()=>{active=false;};
  },[searchParams]);

  useEffect(()=>{
    if(!recordId) return;
    let active=true;
    setDraftLoading(true);
    void (async()=>{
      try{
        let acquisition:any=null;
        const acquisitionResult=await (supabase as any).from("acquisitions").select("*").eq("id",recordId).maybeSingle();
        if(acquisitionResult.error) throw acquisitionResult.error;
        acquisition=acquisitionResult.data;
        let client:any = null;
        if (acquisition?.client_id) {
          const clientResult=await (supabase as any).from("clients").select("*").eq("id",acquisition.client_id).maybeSingle();
          if(clientResult.error) throw clientResult.error;
          client=clientResult.data;
        } else {
          const byId=await (supabase as any).from("clients").select("*").eq("id",recordId).maybeSingle();
          if(byId.error) throw byId.error;
          client=byId.data;
          if(!client) {
            const byBusinessId=await (supabase as any).from("clients").select("*").eq("id_unique",recordId).maybeSingle();
            if(byBusinessId.error) throw byBusinessId.error;
            client=byBusinessId.data;
          }
        }
        const clientId=client?.id||acquisition?.client_id||recordId;
        if(!client) throw new Error("Dossier client introuvable.");
        if(!acquisition){
          const result=await (supabase as any).from("acquisitions").select("*").eq("client_id",client.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
          if(result.error) throw result.error;
          acquisition=result.data;
        }
        const acquisitionSnapshot = acquisition?.offre_snapshot && Object.keys(acquisition.offre_snapshot).length
          ? acquisition.offre_snapshot : null;
        const clientSnapshot = client?.offre_snapshot && Object.keys(client.offre_snapshot).length
          ? client.offre_snapshot : null;
        const savedSnapshot = acquisitionSnapshot || clientSnapshot || {};
        const offerId = acquisition?.offre_id || client.offre_id || savedSnapshot.offer?.id || "";
        // Existing dossiers must load the saved offer snapshot, never today's live catalogue.
        const offer:any = savedSnapshot.offer ? {
          ...savedSnapshot.offer, id: savedSnapshot.offer.id || offerId,
          formules_configuration: Array.isArray(savedSnapshot.offer.formules_configuration) ? savedSnapshot.offer.formules_configuration : [],
        } : {
          id: offerId, code: client.famille_offre || client.parcours_code || "",
          nom: client.formule_nom || client.famille_offre || "Offre enregistrée",
          famille_offre: client.famille_offre, parcours_code: client.parcours_code, formules_configuration: [],
        };
        const savedFormula = savedSnapshot.formula || {};
        const [docsResult,repResult]=await Promise.all([
          (supabase as any).from("documents_acquisition").select("*").eq("client_id",client.id).order("created_at",{ascending:false}),
          (supabase as any).from("client_cotitulaires_mandataires").select("*").eq("client_id",client.id).order("created_at",{ascending:false}).limit(1).maybeSingle()
        ]);
        if(docsResult.error) throw docsResult.error;
        if(repResult.error) throw repResult.error;
        const values:any={...client,commercial_id:client.commercial_id||acquisition?.created_by||"",offre_id:offerId,offre:offer,
          offre_snapshot:savedSnapshot,
          formule_code:acquisition?.formule_code||savedFormula.code||client.formule_code||"",
          formule_nom:acquisition?.formule_nom||savedFormula.nom||client.formule_nom||"",
          formule_confirmed:true,superficie_prevue:String(acquisition?.superficie_ha??savedSnapshot.contract?.superficie_ha??client.total_hectares??client.superficie_ha??""),
          photo_profil_preview:client.photo_profil_url||"",photo_piece_recto_preview:client.fichier_piece_recto_url||"",
          photo_piece_verso_preview:client.fichier_piece_verso_url||"",contrat_lu:true,documents_authentiques:true,autorisation_donnees:true};
        if(repResult.data) Object.assign(values,{has_representant:true,representant_type:repResult.data.type_relation||"cotitulaire",
          representant_lien:repResult.data.lien_client||"",representant_civilite:repResult.data.civilite||"",
          representant_nom:repResult.data.nom||"",representant_prenoms:repResult.data.prenoms||"",
          representant_date_naissance:repResult.data.date_naissance||"",representant_lieu_naissance:repResult.data.lieu_naissance||"",
          representant_type_piece:repResult.data.type_piece||"",representant_numero_piece:repResult.data.numero_piece||"",
          representant_telephone:repResult.data.telephone||""});
        for(const doc of docsResult.data||[]){
          const code=String(doc.code_document||doc.type_document||"");
          if(code==="client_photo_profil") values.photo_profil_preview=doc.fichier_url||values.photo_profil_preview;
          else if(code==="client_piece_recto") values.photo_piece_recto_preview=doc.fichier_url||values.photo_piece_recto_preview;
          else if(code==="client_piece_verso") values.photo_piece_verso_preview=doc.fichier_url||values.photo_piece_verso_preview;
          else if(doc.categorie==="contrat"||code.includes("contrat")){values["contrat_"+code+"_preview"]=doc.fichier_url||"";values["contrat_"+code+"_statut"]=doc.statut||"a_preparer";}
          else values["doc_"+code+"_preview"]=doc.fichier_url||"";
        }
        if(!active)return;
        setExistingClientId(client.id);setExistingAcquisitionId(acquisition?.id||null);
        setExistingRecord({client,acquisition,offer,snapshot:savedSnapshot,representative:repResult.data||null});setEditExisting(false);setCurrent(0);setFormData(values);
      }catch(error:any){if(active)toast({variant:"destructive",title:"Dossier impossible à ouvrir",description:getSafeErrorMessage(error)});}
      finally{if(active)setDraftLoading(false);}
    })();
    return()=>{active=false;};
  },[recordId]);

  // Restaurer le brouillon avant d'autoriser la saisie : un chargement réseau tardif
  // ne doit jamais interférer avec les premières modifications de l'utilisateur.
  useEffect(()=>{
    let mounted=true;
    if(recordId){setBrouillonId(null);setDraftLoading(true);return()=>{mounted=false;};}
    const isLeadOrProspectConversion = Boolean(searchParams.get("lead_id") || searchParams.get("prospect_id"));
    if (isLeadOrProspectConversion) {
      // A conversion always starts at the first official step. Never restore an unrelated
      // draft's step index into a lead/prospect conversion.
      setBrouillonId(null);
      setCurrent(0);
      setDraftLoading(false);
      return () => { mounted = false; };
    }
    // The explicit "Nouveau client" action must start from a clean form.
    // Keep the saved draft untouched until the user starts entering the new record,
    // but never preload it into a newly requested client form.
    if (searchParams.get("nouveau") === "1") {
      setFormData({});
      setBrouillonId(null);
      setCurrent(0);
      setSyncState("draft");
      setDraftLoading(false);
      return () => { mounted = false; };
    }
    setDraftLoading(true);
    (async()=>{
      try {
        const currentUser = user;
        if(!currentUser) return;
        const key = `agricapital:client-draft:${currentUser.id}`;
        const raw = window.localStorage.getItem(key);
        if(!raw || !mounted) return;
        const draft = JSON.parse(raw);
        setBrouillonId(key);
        const restoredDraft = restoreDraftFiles(draft.donnees || {});
        setFormData((current:any)=>({...restoredDraft,...current}));
        setCurrent((current:number)=>current===0?Math.max(0,Number(draft.etape_actuelle||0)):current);
      } catch (error) {
        console.warn("[Client] Brouillon local illisible; aucun brouillon serveur n'est créé.",error);
      } finally {
        if(mounted) setDraftLoading(false);
      }
    })();
    return()=>{mounted=false;};
  },[user, searchParams, recordId]);

  useEffect(()=>{
    if(recordId){
      const savedSteps = Array.isArray(formData.offre_snapshot?.workflow?.steps) ? formData.offre_snapshot.workflow.steps : [];
      const configuredSteps = savedSteps
        .filter((item:any)=>!["parcelle","enquete","documents"].includes(String(item.code).toLowerCase()))
        .map((item:any)=>({code:item.code,titre:item.titre,description:item.description,ordre:item.ordre,obligatoire:item.obligatoire}));
      setSteps(configuredSteps);
      setCurrent(v=>Math.min(v,Math.max(0,configuredSteps.length-1)));
      setLoadingSteps(false);
      return;
    }
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
      const configuredSteps=(data||[]).filter((item:any)=>!["parcelle","enquete","documents"].includes(String(item.code).toLowerCase()));
      setSteps(configuredSteps);
      setCurrent(v=>Math.min(v,Math.max(0,configuredSteps.length-1)));
      setLoadingSteps(false);
    })();
    return()=>{mounted=false;};
  },[formData.offre_id,recordId,formData.offre_snapshot?.workflow]);

  const activeSteps=useMemo(()=>formData.offre_id?steps:[{code:"offre",titre:"Offre et superficie",ordre:1,obligatoire:true}], [formData.offre_id,steps]);
  const step=activeSteps[current];

  const validateStep=async()=>{
    if(!step)return false;
    if(step.code==="offre" && !recordId){
      if(!formData.commercial_id||!formData.offre_id||Number(formData.superficie_prevue)<=0){
        toast({variant:"destructive",title:"Étape incomplète",description:"Sélectionnez le commercial responsable, une offre et renseignez la superficie."}); return false;
      }
      const configuredFormulas = Array.isArray(formData.offre?.formules_configuration) ? formData.offre.formules_configuration : [];
      if(configuredFormulas.length === 0){
        toast({variant:"destructive",title:"Offre mal configurée",description:"Cette offre n’a aucune formule enregistrée dans Paramètres > Offres. Aucun tarif générique ne sera utilisé."}); return false;
      }
      const selectedFormula = configuredFormulas.find((formula: any) => formula.code === formData.formule_code);
      if(!selectedFormula){
        toast({variant:"destructive",title:"Formule obligatoire",description:"Choisissez explicitement une formule configurée avant de passer à l’étape suivante."}); return false;
      }
      const sharedTariff = selectedFormula.utilise_tarif_commun === true;
      const effectiveValue = (key: string) => selectedFormula[key] ?? (sharedTariff ? formData.offre?.[key] : null);
      const requiredValues = [
        ["paiement initial", effectiveValue("montant_pi_par_ha")],
        ["coût total", effectiveValue("montant_total_par_ha") ?? effectiveValue("montant_cash_par_ha")],
        ["mensualité", effectiveValue("mensualite_par_ha")],
        ["durée", effectiveValue("duree_paiement_mois")],
      ] as const;
      const missingValues = requiredValues.filter(([, value]) => value === null || value === undefined || Number(value) <= 0);
      if (missingValues.length) {
        toast({variant:"destructive",title:"Formule incomplète",description:"Corrigez Paramètres > Offres : " + missingValues.map(([label]) => label).join(", ") + ". L’étape suivante reste bloquée tant que les paramètres sont incomplets."});
        return false;
      }
    }
    if(step.code==="offre"&&!recordId&&!formData.formule_code){
      toast({variant:"destructive",title:"Formule obligatoire",description:"Choisissez d’abord la formule exacte de l’offre avant de passer à l’étape Client."}); return false;
    }
    if(step.code==="client"){
      const typePersonne=formData.type_personne||"personne_physique";
      const commonMissing=["telephone","domicile"].filter(f=>!formData[f]);
      const physicalMissing=typePersonne==="personne_physique" ? ["civilite","nom_famille","prenoms","date_naissance","lieu_naissance","nationalite","type_piece","numero_piece"].filter(f=>!formData[f]) : [];
      const organisationMissing=typePersonne==="personne_morale" ? ["denomination_sociale","nature_organisation_code","responsable_legal_nom","responsable_legal_prenoms"].filter(f=>!formData[f]) : [];
      const familyMissing=typePersonne==="famille_informelle" ? ["denomination_sociale","responsable_legal_nom","responsable_legal_prenoms"].filter(f=>!formData[f]) : [];
      const identityMissing=typePersonne==="personne_physique" && ((!formData.photo_piece_recto_file&&!formData.photo_piece_recto_preview)||(!formData.photo_piece_verso_file&&!formData.photo_piece_verso_preview)||(!formData.photo_profil_file&&!formData.photo_profil_preview));
      if(commonMissing.length||physicalMissing.length||organisationMissing.length||familyMissing.length||identityMissing||(typePersonne==="famille_informelle"&&Number(formData.nombre_membres||0)<2)){
        const missing=[...commonMissing,...physicalMissing,...organisationMissing,...familyMissing];
        const reason=missing.length ? "Champs à compléter : "+missing.join(", ") : identityMissing ? "La photo du client et les deux faces de sa pièce d’identité sont obligatoires." : "Un groupe familial doit compter au moins deux membres.";
        toast({variant:"destructive",title:"Fiche client incomplète",description:reason}); return false;
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
      const docs = recordId
        ? (Array.isArray(formData.offre_snapshot?.workflow?.documents) ? formData.offre_snapshot.workflow.documents : [])
        : ((await (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id",formData.offre_id).eq("actif",true).order("ordre")).data || []);
      for(const doc of docs){
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
      const contracts = recordId
        ? (Array.isArray(formData.offre_snapshot?.workflow?.contracts) ? formData.offre_snapshot.workflow.contracts : [])
        : ((await (supabase as any).from("offre_formulaire_contrats").select("*").eq("offre_id",formData.offre_id).eq("actif",true)).data || []);
      for(const contract of contracts) if(contract.obligatoire){
        const key="contrat_"+contract.type_contrat;
        const signedFile=recoverFile(formData[key+"_file"],formData[key+"_preview"],key);
        const hasSavedOrNewSignedFile=Boolean(formData[key+"_preview"]) || Boolean(signedFile);
        if(!hasSavedOrNewSignedFile){toast({variant:"destructive",title:"Contrat signé manquant",description:"Téléversez le contrat signé requis : "+(contract.source_document||contract.type_contrat)+"."});return false;}
      }
    }
    if(step.code==="confirmation"&&!formData.contrat_lu){
      toast({variant:"destructive",title:"Validation finale requise",description:"Le Client doit avoir pris connaissance des documents contractuels."});return false;
    }
    return true;
  };

  const draftSaveInFlight = useRef(false);
  const draftSaveAgain = useRef(false);
  const submitInFlightRef = useRef(false);
  const pendingSubmitRetryRef = useRef(false);
  const saveDraft=async(index:number):Promise<string|null>=>{
    const currentUser = user;
    if(!currentUser)return null;
    const payload={...formData,parcours_code:formData.offre_code||null};
    // Les brouillons sont exclusivement locaux. On conserve les aperçus des fichiers
    // pour pouvoir les reconstruire au rechargement, sans écrire en base.
    for (const [code, { field }] of Object.entries(IDENTITY_DOCUMENT_FIELDS)) {
      delete payload["doc_" + code + "_file"];
      delete payload[field + "_file"];
      if (!payload[field + "_preview"] && formData["doc_" + code + "_preview"]) payload[field + "_preview"] = formData["doc_" + code + "_preview"];
    }
    const key = `agricapital:client-draft:${currentUser.id}`;
    window.localStorage.setItem(key, JSON.stringify({id:key,created_by:currentUser.id,etape_actuelle:index,donnees:payload,updated_at:new Date().toISOString()}));
    setBrouillonId(key);
    setSyncState("draft");
    return key;
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

  const next=async()=>{if(recordId){setCurrent(v=>Math.min(activeSteps.length-1,v+1));return;}if(!(await validateStep()))return;setSaving(true);try{const i=Math.min(activeSteps.length-1,current+1);await saveDraft(i);setCurrent(i);}finally{setSaving(false);}};

  const submit=async(retryAttempt = 0)=>{
    if (submitInFlightRef.current) return;
    if(!(await validateStep()))return;
    if(!formData.contrat_lu||!formData.documents_authentiques||!formData.autorisation_donnees){
      toast({variant:"destructive",title:"Validation incomplète",description:"Les validations finales sont obligatoires."});return;
    }
    const queuedBeforeSubmit = queuedMutationCountRef.current;
    submitInFlightRef.current = true;
    setSaving(true);
    try{
      const currentUser = user;
      if(!currentUser)throw new Error("Session utilisateur introuvable");
      const savedDraftId = await saveDraft(current);
      const stableClientId = stableUuid(currentUser.id, "client:" + String(formData.telephone || formData.nom_famille || "draft"));
      const {data:baseOffer,error:offerError}=await (supabase as any).from("offres").select("*").eq("id",formData.offre_id).single();
      if(offerError)throw offerError;
      if(!baseOffer)throw new Error("Offre sélectionnée introuvable");
      const formulas = Array.isArray(baseOffer.formules_configuration) ? baseOffer.formules_configuration : [];
      const selectedFormula = formulas.find((formula: any) => formula.code === formData.formule_code) || null;
      if (formulas.length === 0 || !selectedFormula) {
        throw new Error("Choisissez une formule explicitement configurée pour cette offre avant d’enregistrer le dossier. Aucun tarif générique ne sera appliqué.");
      }
      const sharedTariff = selectedFormula.utilise_tarif_commun === true;
      const offer: any = {
        ...baseOffer,
        formule_code: selectedFormula.code,
        formule_nom: selectedFormula.nom,
        gestion_type: selectedFormula.gestion_type ?? (sharedTariff ? baseOffer.gestion_type : null),
      };
      for (const key of ["montant_pi_par_ha", "montant_cash_par_ha", "mensualite_par_ha", "montant_total_par_ha", "duree_paiement_mois", "tranches_paiement"]) {
        if (selectedFormula[key] !== undefined && selectedFormula[key] !== null) offer[key] = selectedFormula[key];
        else if (sharedTariff) offer[key] = baseOffer[key] ?? null;
        else offer[key] = null;
      }
      const requiredFormulaValues = [
        ["paiement initial", offer.montant_pi_par_ha],
        ["coût total", offer.montant_total_par_ha ?? offer.montant_cash_par_ha],
        ["mensualité", offer.mensualite_par_ha],
        ["durée", offer.duree_paiement_mois],
      ] as const;
      const missingFormulaValues = requiredFormulaValues.filter(([, value]) => value === null || value === undefined || Number(value) <= 0);
      if (missingFormulaValues.length) {
        throw new Error("La formule " + selectedFormula.nom + " est incomplète dans Paramètres > Offres : " + missingFormulaValues.map(([label]) => label).join(", ") + ". Aucun tarif générique ne sera utilisé.");
      }
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
        type_personne:formData.type_personne||"personne_physique",
        denomination_sociale:formData.denomination_sociale||null,nature_organisation_code:formData.nature_organisation_code||null,forme_juridique_code:formData.forme_juridique_code||null,
        numero_enregistrement:formData.numero_enregistrement||null,responsable_legal_nom:formData.responsable_legal_nom||null,responsable_legal_prenoms:formData.responsable_legal_prenoms||null,responsable_legal_telephone:formData.telephone||null,
        nombre_membres:formData.nombre_membres?Number(formData.nombre_membres):null,
        nom:(formData.type_personne==="personne_morale"||formData.type_personne==="famille_informelle" ? (formData.denomination_sociale||formData.nom_famille||"") : (formData.nom_famille||"")),
        nom_famille:formData.nom_famille||formData.responsable_legal_nom||null,prenoms:formData.prenoms||formData.responsable_legal_prenoms||null,
        nom_complet:(formData.type_personne==="personne_morale"||formData.type_personne==="famille_informelle" ? (formData.denomination_sociale||nomComplet) : nomComplet),
        civilite:formData.civilite||null,date_naissance:formData.date_naissance||null,lieu_naissance:formData.lieu_naissance||null,nationalite:formData.nationalite||null,
        statut_marital:formData.statut_marital||null,type_piece:formData.type_piece||null,numero_piece:formData.numero_piece||null,date_delivrance_piece:formData.date_delivrance_piece||null,
        telephone:formData.telephone||"",telephone_indicatif:formData.telephone_indicatif||null,telephone_local:formData.telephone_local||null,
        telephone_secondaire:formData.telephone_secondaire||null,telephone_secondaire_indicatif:formData.telephone_secondaire_indicatif||null,telephone_secondaire_local:formData.telephone_secondaire_local||null,
        telephone_principal_whatsapp:!!formData.telephone_principal_whatsapp,telephone_secondaire_whatsapp:!!formData.telephone_secondaire_whatsapp,
        whatsapp:formData.telephone_principal_whatsapp?formData.telephone:formData.telephone_secondaire_whatsapp?(formData.telephone_secondaire||null):null,
        whatsapp_indicatif:null,whatsapp_local:null,email:formData.email||null,
        domicile:formData.domicile||null,domicile_residence:formData.domicile||null,
        district_id:formData.district_id||null,region_id:formData.region_id||null,departement_id:formData.departement_id||null,sous_prefecture_id:formData.sous_prefecture_id||null,village_id:formData.village_id||null,
        localite:formData.domicile||null,montant_total_contrat:total,
        mode_paiement:modePaiement,paiement_initial_montant:paiementInitial,mensualite_montant:mensualite,
        montant_promo_applique:reduction,promotion_id:prix.promotion_id||null,
        famille_offre:offer.famille_offre||null,
        formule_code:selectedFormula.code,
        formule_nom:selectedFormula.nom,
        parcours_code:offer.parcours_code||offer.code,
        statut:"actif",statut_global:"actif",contrat_acquisition_statut:offer.contrat_acquisition_requis?"a_signer":"non_requis",contrat_accompagnement_statut:offer.contrat_accompagnement_requis?"a_signer":"non_requis",
        created_by:currentUser.id,updated_by:currentUser.id,compte_actif:false,phase_actuelle:"pre_activation",total_hectares:ha
      });
      if(clientError||!client)throw clientError||new Error("Client non créé");

      // Le lien lead/prospect est finalisé APRÈS les médias et documents.
      // Ainsi un délai sur le lead ne coupe plus l'envoi des photos et ne laisse pas
      // un client à moitié enregistré.
      const identityUploadedPaths: Record<string, { path: string; bucket: string }> = {};
      if ((formData.type_personne || "personne_physique") === "personne_physique") {
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

      // Les trois pièces d'identité sont gérées ici depuis leurs champs uniques
      // de l'étape Client. Elles ne doivent pas être répétées dans la configuration
      // des documents dynamiques ni téléversées une seconde fois.
      if ((formData.type_personne || "personne_physique") === "personne_physique") for (const [code, config] of Object.entries(IDENTITY_DOCUMENT_FIELDS)) {
        const uploaded = identityUploadedPaths[code];
        if (!uploaded?.path) throw new Error("Pièce d’identité manquante ou non téléversée : " + code);
        const { error: identityDocError } = await offlineUpsert("documents_acquisition", {
          id: stableUuid(stableClientId, "document:" + code),
          client_id: client.id, type_document: code, code_document: code, categorie: "identite",
          obligatoire: true, source_contractuelle: null, fichier_url: uploaded.path, statut: "en_attente",
          uploaded_by: currentUser.id,
          metadata: { offre_id: offer.id, parcours_code: offer.parcours_code || offer.code, storage_bucket: uploaded.bucket },
        });
        if (identityDocError) throw identityDocError;
      }

      const {data:docs,error:docsError}=await (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id",offer.id).eq("actif",true).order("ordre");
      if (docsError) throw docsError;
      if (!docs) throw new Error("Impossible de vérifier les pièces requises pour cette offre.");
      for(const doc of docs.filter((item: any) => !IDENTITY_DOCUMENT_FIELDS[item.code])){
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
          [contract.type_contrat==="contrat_acquisition_client"?"contrat_acquisition_statut":"contrat_accompagnement_statut"]:file ? "signe" : (formData[key+"_statut"]||"a_preparer")
        });
        if(contractStatusError)throw contractStatusError;
      }

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

      window.localStorage.removeItem(`agricapital:client-draft:${currentUser.id}`);
      setBrouillonId(null);
      pendingSubmitRetryRef.current = false;
      const savedOffline = !navigator.onLine || queuedMutationCountRef.current > queuedBeforeSubmit;
      toast({title:savedOffline ? "Dossier conservé — synchronisation en attente" : "Client enregistré",description:savedOffline ? "Le dossier, les pièces et les liens sont conservés localement. La synchronisation reprendra automatiquement sans actualisation dès que le serveur sera disponible." : "Le dossier Client et son parcours ont été enregistrés dans la base."});
      setSyncState(savedOffline ? "queued" : "synced");
      navigate("/clients");
    }catch(error:any){
      const message = String(error?.message || getSafeErrorMessage(error) || "");
      const statusCode = Number(error?.status || error?.statusCode || error?.cause?.status || 0);
      const retryable = !navigator.onLine || statusCode >= 500 || /timeout|temporarily unavailable|network|failed to fetch|connection|gateway|warp server|thread killed|502|503|504|server error|upload|téléversement impossible|storage/i.test(message);
      if (retryable && retryAttempt < 4) {
        pendingSubmitRetryRef.current = false;
        setSyncState("queued");
        if (retryAttempt === 0) toast({title:"Dossier conservé",description:"Le serveur répond difficilement. Votre dossier reste sauvegardé et une nouvelle tentative automatique va être effectuée sans actualiser la page."});
        window.setTimeout(() => { void submit(retryAttempt + 1); }, Math.min(15000, 1800 * Math.pow(2, retryAttempt)));
      } else {
        pendingSubmitRetryRef.current = retryable;
        setSyncState(retryable ? "queued" : "error");
        toast({variant:"destructive",title:retryable ? "Dossier conservé — reprise en attente" : "Erreur d’enregistrement",description:retryable ? "Vos informations restent dans le brouillon. Une nouvelle tentative sera lancée automatiquement sans actualiser la page." : getSafeErrorMessage(error)});
      }
    }finally{
      submitInFlightRef.current = false;
      setSaving(false);
    }
  };

  const saveExistingRecord=async()=>{
    if(!existingRecord||!existingClientId||!user?.id||!canEditExisting)return;
    setSaving(true);
    try{
      const savedSnapshot = existingRecord.snapshot || existingRecord.acquisition?.offre_snapshot || existingRecord.client.offre_snapshot || {};
      const offer:any = existingRecord.offer || savedSnapshot.offer || {
        id: existingRecord.client.offre_id, nom: existingRecord.client.formule_nom || "Offre enregistrée",
      };
      const typePersonne=formData.type_personne||existingRecord.client.type_personne||"personne_physique";
      const organisationOrFamily=typePersonne==="personne_morale"||typePersonne==="famille_informelle";
      const displayName=organisationOrFamily?(formData.denomination_sociale||existingRecord.client.denomination_sociale||formData.nom_complet||""):(formData.nom_famille||formData.nom||"");
      const payload:any={type_personne:typePersonne,denomination_sociale:formData.denomination_sociale||null,
        nature_organisation_code:formData.nature_organisation_code||null,forme_juridique_code:formData.forme_juridique_code||null,
        numero_enregistrement:formData.numero_enregistrement||null,responsable_legal_nom:formData.responsable_legal_nom||null,
        responsable_legal_prenoms:formData.responsable_legal_prenoms||null,responsable_legal_telephone:formData.telephone||null,
        nombre_membres:formData.nombre_membres?Number(formData.nombre_membres):null,
        nom:displayName,nom_famille:formData.nom_famille||formData.responsable_legal_nom||null,
        prenoms:formData.prenoms||formData.responsable_legal_prenoms||"",nom_complet:organisationOrFamily?displayName:[formData.nom_famille||formData.nom,formData.prenoms].filter(Boolean).join(" ").trim(),
        civilite:formData.civilite||null,date_naissance:formData.date_naissance||null,lieu_naissance:formData.lieu_naissance||null,
        nationalite:formData.nationalite||null,type_piece:formData.type_piece||null,numero_piece:formData.numero_piece||null,
        date_delivrance_piece:formData.date_delivrance_piece||null,telephone:formData.telephone||"",
        telephone_indicatif:formData.telephone_indicatif||null,telephone_local:formData.telephone_local||null,
        telephone_secondaire:formData.telephone_secondaire||null,telephone_secondaire_indicatif:formData.telephone_secondaire_indicatif||null,
        telephone_secondaire_local:formData.telephone_secondaire_local||null,telephone_principal_whatsapp:!!formData.telephone_principal_whatsapp,
        telephone_secondaire_whatsapp:!!formData.telephone_secondaire_whatsapp,
        whatsapp:formData.telephone_principal_whatsapp?formData.telephone:formData.telephone_secondaire_whatsapp?(formData.telephone_secondaire||null):null,
        email:formData.email||null,domicile:formData.domicile||formData.domicile_residence||null,
        domicile_residence:formData.domicile||formData.domicile_residence||null,district_id:formData.district_id||null,region_id:formData.region_id||null,
        departement_id:formData.departement_id||null,sous_prefecture_id:formData.sous_prefecture_id||null,village_id:formData.village_id||null,
         contrat_acquisition_statut:formData.contrat_contrat_acquisition_client_statut||existingRecord.client.contrat_acquisition_statut||"a_preparer",
         contrat_accompagnement_statut:formData.contrat_contrat_accompagnement_agricole_statut||existingRecord.client.contrat_accompagnement_statut||"a_preparer",
         updated_by:user.id,updated_at:new Date().toISOString()};
      // Ne pas inclure commercial_id dans UPDATE si l’affectation n’a pas changé :
      // le trigger SQL revalide toute colonne incluse et peut bloquer une fiche historique
      // dont le commercial a depuis été désactivé. Une nouvelle affectation reste validée par la DB.
      const selectedCommercialId = formData.commercial_id || null;
      const previousCommercialId = existingRecord.client.commercial_id || null;
      if (selectedCommercialId && selectedCommercialId !== previousCommercialId) {
        payload.commercial_id = selectedCommercialId;
      }
      for(const [field,column,bucket] of [["photo_profil","photo_profil_url","photos-profils"],["photo_piece_recto","fichier_piece_recto_url","pieces-identite"],["photo_piece_verso","fichier_piece_verso_url","pieces-identite"]] as const){
        const file=recoverFile(formData[field+"_file"],formData[field+"_preview"],field);
        if(file){const uploaded=await uploadFile(bucket,file,user.id+"/clients/"+existingClientId,"identity-"+field);if(!uploaded)throw new Error("Téléversement impossible : "+field);payload[column]=uploaded.path;}
      }
      if(formData.has_representant){
        const representativePayload:any={
          client_id:existingClientId,type_relation:formData.representant_type||"cotitulaire",lien_client:formData.representant_lien||null,
          civilite:formData.representant_civilite||null,nom:String(formData.representant_nom||"").trim(),
          prenoms:formData.representant_prenoms||null,date_naissance:formData.representant_date_naissance||null,
          lieu_naissance:formData.representant_lieu_naissance||null,type_piece:formData.representant_type_piece||null,
          numero_piece:formData.representant_numero_piece||null,telephone:formData.representant_telephone||null,
          whatsapp:formData.representant_telephone_principal_whatsapp?formData.representant_telephone||null:null,
          actif:true,updated_by:user.id,updated_at:new Date().toISOString()
        };
        if(!representativePayload.nom) throw new Error("Le nom du cotitulaire ou mandataire est obligatoire.");
        if(existingRecord.representative?.id){
          const {error:representativeError}=await offlineUpdate("client_cotitulaires_mandataires",existingRecord.representative.id,representativePayload);
          if(representativeError) throw representativeError;
        }else{
          const {error:representativeError}=await offlineUpsert("client_cotitulaires_mandataires",{...representativePayload,id:stableUuid(existingClientId,"representative") ,created_by:user.id,created_at:new Date().toISOString()});
          if(representativeError) throw representativeError;
        }
      }else if(existingRecord.representative?.id){
        const {error:representativeError}=await offlineUpdate("client_cotitulaires_mandataires",existingRecord.representative.id,{actif:false,updated_by:user.id,updated_at:new Date().toISOString()});
        if(representativeError) throw representativeError;
      }
      for(const key of Object.keys(formData).filter((item)=>item.endsWith("_file"))){
        const base=key.slice(0,-5);
        if(["photo_profil","photo_piece_recto","photo_piece_verso"].includes(base)) continue;
        const file=recoverFile(formData[key],formData[base+"_preview"],base);
        if(!file) continue;
        const isContract=base.startsWith("contrat_");
        const code=isContract?base.slice("contrat_".length):base.startsWith("doc_")?base.slice("doc_".length):base;
        const bucket="documents";
        const uploaded=await uploadFile(bucket,file,user.id+"/clients/"+existingClientId+"/documents",base);
        if(!uploaded) throw new Error("Téléversement impossible : "+base);
        const existingDocument=await (supabase as any).from("documents_acquisition").select("id").eq("client_id",existingClientId).eq("code_document",code).order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(existingDocument.error) throw existingDocument.error;
        const documentId=existingDocument.data?.id||stableUuid(existingClientId,"document:"+code);
        const {error:documentSaveError}=await offlineUpsert("documents_acquisition",{
          id:documentId,client_id:existingClientId,type_document:code,code_document:code,
          categorie:isContract?"contrat":"document",obligatoire:false,source_contractuelle:isContract?code:null,
          fichier_url:uploaded.path,statut:"en_attente",uploaded_by:user.id,
          metadata:{source_formulaire:"acquisition_multi_etapes",storage_bucket:bucket,offre_id:offer.id}
        });
        if(documentSaveError) throw documentSaveError;
        updateFormData({[base+"_file"]:null,[base+"_preview"]:uploaded.path});
      }
      const {error:clientError}=await offlineUpdate("clients",existingClientId,payload);
      if(clientError)throw clientError;
      // Les conditions de l’acquisition restent immuables pendant une modification de fiche.
toast({title:"Dossier mis à jour",description:"Les informations du client et de sa souscription ont été enregistrées sans créer de doublon."});
      setEditExisting(false);
    }catch(error:any){toast({variant:"destructive",title:"Modification impossible",description:getSafeErrorMessage(error)});}
    finally{setSaving(false);}
  };

  const autoResumeAttempted = useRef(false);
  useEffect(() => {
    const resumePendingSubmission = () => {
      if (!pendingSubmitRetryRef.current || !navigator.onLine || submitInFlightRef.current || saving || draftLoading || loadingSteps) return;
      if (!brouillonId || current !== activeSteps.length - 1) return;
      if (!formData.contrat_lu || !formData.documents_authentiques || !formData.autorisation_donnees) return;
      pendingSubmitRetryRef.current = false;
      void submit(0);
    };
    window.addEventListener("online", resumePendingSubmission);
    const timer = window.setInterval(resumePendingSubmission, 30000);
    return () => {
      window.removeEventListener("online", resumePendingSubmission);
      window.clearInterval(timer);
    };
  }, [saving, draftLoading, loadingSteps, brouillonId, current, activeSteps.length, formData]);

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
    if(!step)return <Etape0Offre formData={formData} updateFormData={updateFormData} contractReadOnly={Boolean(recordId)} />;
    switch(step.code){
      case "offre":return <Etape0Offre formData={formData} updateFormData={updateFormData} contractReadOnly={Boolean(recordId)} />;
      case "client":return <EtapeClientDynamique formData={formData} updateFormData={updateFormData}/>;
      case "cotitulaire":return <EtapeRepresentantDynamique formData={formData} updateFormData={updateFormData}/>;
      case "documents":return <EtapeDocumentsContratsDynamiques formData={formData} updateFormData={updateFormData}/>;
      case "confirmation":return <EtapeConfirmationDossier formData={formData} updateFormData={updateFormData}/>;
      default:return <Etape0Offre formData={formData} updateFormData={updateFormData} contractReadOnly={Boolean(recordId)} />;
    }
  };

  const last=current===activeSteps.length-1&&activeSteps.length>0;
  return <ProtectedRoute requiredPermission={recordId ? "clients.view" as any : PERMISSIONS.CREATE_ACQUISITION}><MainLayout><div className="max-w-7xl mx-auto page-section space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl sm:text-3xl font-bold">{recordId?(existingRecord?.client?.nom_complet||"Fiche client"):"Nouveau Client"}</h1><p className="text-sm text-muted-foreground">{recordId?(editExisting?"Mode modification":"Consultation du dossier complet, étape par étape"):"Formulaire officiel de souscription"}</p>{!recordId&&<SyncStatusBadge state={syncState} className="mt-2"/>}</div>{recordId&&!editExisting&&canEditExisting&&<Button type="button" onClick={()=>setEditExisting(true)}>Modifier</Button>}</div>
    <div className="flex min-w-0 gap-2 overflow-x-auto pb-2 scrollbar-thin">{activeSteps.map((s,i)=>{const Icon=STEP_ICONS[s.code]||FileText;return <Button key={s.code} type="button" size="sm" variant={i===current?"default":"outline"} className="shrink-0 gap-1.5 px-2.5 sm:px-3" title={s.titre} aria-label={`Étape ${i+1}: ${s.titre}`} onClick={()=>{if(recordId||i<=current)setCurrent(i);}}><Icon className="h-4 w-4"/><span className="hidden sm:inline">{i+1}. {s.titre}</span><span className="sm:hidden text-xs">{i+1}</span></Button>})}</div>
    <Card className="min-w-0 overflow-hidden p-3 sm:p-6 rounded-2xl shadow-sm">{draftLoading||loadingSteps?<div className="p-8 text-center"><Loader2 className="mx-auto animate-spin"/></div>:<fieldset disabled={Boolean(recordId&&!editExisting)} className="min-w-0">{renderStep()}</fieldset>}</Card>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variant="outline" onClick={()=>recordId&&editExisting?setEditExisting(false):navigate(-1)} disabled={saving||draftLoading||loadingSteps}>{recordId&&editExisting?"Annuler les modifications":"Retour"}</Button>
      <div className="flex flex-wrap justify-end gap-2">{!recordId&&<Button variant="outline" onClick={()=>setCurrent(v=>Math.max(0,v-1))} disabled={current===0||saving||draftLoading||loadingSteps}><ChevronLeft className="mr-2 h-4 w-4"/>Précédent</Button>}
      {!last?<Button onClick={next} disabled={saving||draftLoading||loadingSteps}>{recordId?"Étape suivante":saving?"Sauvegarde…":"Suivant"}<ChevronRight className="ml-2 h-4 w-4"/></Button>:recordId?(editExisting?<Button size="lg" onClick={()=>void saveExistingRecord()} disabled={saving||draftLoading}>{saving?"Enregistrement…":"Enregistrer les modifications"}</Button>:<Button size="lg" variant="outline" onClick={()=>navigate(-1)}>Fermer le dossier</Button>):<Button size="lg" onClick={()=>void submit()} disabled={saving||draftLoading}>{saving?"Enregistrement…":"✓ Enregistrer le Client"}</Button>}</div>
    </div>
  </div></MainLayout></ProtectedRoute>;
};
export default NouvelleAcquisition;