import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { ActivityLog } from "@/components/common/ActivityLog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sprout, DollarSign, FileText, Settings, Camera, LandPlot, UserRound, ExternalLink, MessageSquare, Upload, Plus, Download } from "lucide-react";
import TicketForm from "@/components/forms/TicketForm";
import ClientForm from "@/components/forms/ClientForm";
import { getSafeErrorMessage } from "@/lib/safeError";
import { uploadFile } from "@/utils/storage";
import { resolveStorageUrl } from "@/utils/storage";
import { useRealtime } from "@/hooks/useRealtime";
import ClientMessagingPanel from "@/components/clients/ClientMessagingPanel";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import { Etape0Offre } from "@/components/forms/acquisition/Etape0Offre";

const formatMontant = (m: number) => new Intl.NumberFormat("fr-FR").format(Math.round(m || 0));

const ClientDetail = () => {
  const { can } = usePermissions();
  const { user, userRoles } = useAuth();
  const canViewClientMoney = can("clients.view_money");
  const canValidateClient = can("clients.validate");
  const canUploadDocuments = can("documents.upload");
  const canViewClientPayments = can("paiements.view");
  const canCreatePlantationAcquisition = can(PERMISSIONS.CREATE_ACQUISITION) || can("plantations.create");
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [client, setClient] = useState<any>(null);
  const canCorrectReturnedClient = Boolean(user?.id && client?.validation_statut === "modification_demandee" && (client?.created_by === user.id || client?.commercial_id === user.id || (userRoles || []).some((role: string) => ["chef_equipe_commercial", "responsable_commercial"].includes(role))));
  const [validationComment,setValidationComment]=useState("");
  const [annexType,setAnnexType]=useState("convention_fonciere");
  const [annexFile,setAnnexFile]=useState<File|null>(null);
  const [pendingAnnexes,setPendingAnnexes]=useState<Array<{type:string;file:File}>>([]);
  const [isClientFormOpen,setIsClientFormOpen]=useState(false);
  const [savingValidation,setSavingValidation]=useState(false);
  const isPalmInvestClient = /PALMINVEST/i.test(String(client?.famille_offre || client?.offre_code || client?.offres?.code || client?.offre_nom || ""));
  const annexLabels: Record<string,string> = { convention_fonciere: "Convention foncière", fiche_identification_parcelle: "Fiche d’identification de la parcelle", pv_consentement_familial: "PV de consentement familial" };
  const [saleCorrectionSurface,setSaleCorrectionSurface]=useState("");
  const [saleCorrectionNotes,setSaleCorrectionNotes]=useState("");
  const [savingSaleCorrection,setSavingSaleCorrection]=useState(false);
  const [clientMedia, setClientMedia] = useState<{ photo: string | null; recto: string | null; verso: string | null }>({ photo: null, recto: null, verso: null });
  const [plantations, setPlantations] = useState<any[]>([]);
  const [clientAcquisitions, setClientAcquisitions] = useState<any[]>([]);
  const [pendingPlantationAcquisitions, setPendingPlantationAcquisitions] = useState<any[]>([]);
  const [paiements, setPaiements] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [parcelle, setParcelle] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentFile,setDocumentFile]=useState<File|null>(null);
  const [isDocumentDialogOpen,setIsDocumentDialogOpen]=useState(false);
  const [isValidationDialogOpen,setIsValidationDialogOpen]=useState(false);
  const [isSaleCorrectionDialogOpen,setIsSaleCorrectionDialogOpen]=useState(false);
  const [documentLabel,setDocumentLabel]=useState("");
  const [attributions, setAttributions] = useState<any[]>([]);
  const [monnaieClient, setMonnaieClient] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [isNewPlantationOpen, setIsNewPlantationOpen] = useState(false);
  const [availableParcelles, setAvailableParcelles] = useState<any[]>([]);
  const [clientOwnParcelles, setClientOwnParcelles] = useState<any[]>([]);
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [loadingPlantationOptions, setLoadingPlantationOptions] = useState(false);
  const [savingNewPlantation, setSavingNewPlantation] = useState(false);
  const [newPlantationParcelId, setNewPlantationParcelId] = useState("");
  const [newPlantationLotId, setNewPlantationLotId] = useState("");
  const [newPlantationNotes, setNewPlantationNotes] = useState("");
  const [newContractFile, setNewContractFile] = useState<File | null>(null);
  const [pendingContractAcquisitionId, setPendingContractAcquisitionId] = useState<string | null>(null);
  const [newAcquisitionFormData, setNewAcquisitionFormData] = useState<any>({ mode_paiement: "echeancier" });
  const [isRachatOpen,setIsRachatOpen]=useState(false);
  const [rachatJours,setRachatJours]=useState("1");
  const [tableSearch,setTableSearch]=useState("");
  const [plantationPage,setPlantationPage]=useState(1);
  const [paymentPage,setPaymentPage]=useState(1);
  const [interventionPage,setInterventionPage]=useState(1);
  const [attributionPage,setAttributionPage]=useState(1);
  const pageSize=useResponsivePageSize();

  const filteredPlantations=plantations.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const filteredPaiements=paiements.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const filteredInterventions=interventions.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const filteredAttributions=attributions.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const paginatedPlantations=filteredPlantations.slice((plantationPage-1)*pageSize,plantationPage*pageSize);
  const paginatedPaiements=filteredPaiements.slice((paymentPage-1)*pageSize,paymentPage*pageSize);
  const paginatedInterventions=filteredInterventions.slice((interventionPage-1)*pageSize,interventionPage*pageSize);
  const paginatedAttributions=filteredAttributions.slice((attributionPage-1)*pageSize,attributionPage*pageSize);
  const selectedOfferFamily = String(newAcquisitionFormData.offre?.famille_offre || newAcquisitionFormData.offre?.code || newAcquisitionFormData.famille_offre || newAcquisitionFormData.offre_code || "").toUpperCase().replace(/[-_\s]/g, "");
  const isPalmInvestOffer = selectedOfferFamily === "PALMINVEST";
  const requestedPalmInvestLots = Math.round(Number(newAcquisitionFormData.superficie_prevue || 0));
  const lotsForSelectedParcel = availableLots.filter((lot: any) =>
    lot.parcelle_id === newPlantationParcelId &&
    (isPalmInvestOffer
      ? Math.abs(Number(lot.surface_ha || 0) - 1) < 0.0001
      : (!Number(newAcquisitionFormData.superficie_prevue) || Math.abs(Number(lot.surface_ha || 0) - Number(newAcquisitionFormData.superficie_prevue)) < 0.0001))
  ).sort((a: any, b: any) => Number(a.numero_h || 0) - Number(b.numero_h || 0));
  const selectedNewLot = availableLots.find((lot: any) => lot.id === newPlantationLotId) || null;
  const selectedLotSeries = selectedNewLot && isPalmInvestOffer
    ? lotsForSelectedParcel.filter((lot: any) => Number(lot.numero_h) >= Number(selectedNewLot.numero_h)).slice(0, Math.max(1, requestedPalmInvestLots))
    : selectedNewLot ? [selectedNewLot] : [];
  const selectedLotSeriesReady = !isPalmInvestOffer || (
    requestedPalmInvestLots >= 1 &&
    selectedLotSeries.length === requestedPalmInvestLots &&
    selectedLotSeries[0]?.id === selectedNewLot?.id &&
    selectedLotSeries.every((lot: any, index: number) => index === 0 || Number(lot.numero_h) === Number(selectedLotSeries[index - 1].numero_h) + 1)
  );
  const selectedLotGroupReference = selectedNewLot
    ? isPalmInvestOffer && selectedLotSeries.length > 1
      ? `${availableParcelles.find((parcel: any) => parcel.id === newPlantationParcelId)?.id_unique || "PARCELLE"}-L${String(selectedLotSeries[0]?.numero_h || "").padStart(2, "0")}-${String(selectedLotSeries[selectedLotSeries.length - 1]?.numero_h || "").padStart(2, "0")}`
      : selectedNewLot.reference || `${availableParcelles.find((parcel: any) => parcel.id === newPlantationParcelId)?.id_unique || "PARCELLE"}-L${String(selectedNewLot.numero_h || "").padStart(2, "0")}`
    : "";
  const selectedOfferNeedsClientLand = newAcquisitionFormData.offre
    ? !!newAcquisitionFormData.offre.necessite_foncier_client
    : false;
  const returnedAcquisition = clientAcquisitions.find((item:any) => item.created_by === user?.id && item.validation_statut === "modification_demandee") || null;
  const updateNewAcquisitionFormData = (patch: any) => {
    if (patch.offre_id && patch.offre_id !== newAcquisitionFormData.offre_id) {
      setNewPlantationLotId("");
      setNewPlantationParcelId(
        patch.offre?.necessite_foncier_client && clientOwnParcelles.some((parcel: any) => parcel.id === client?.parcelle_id)
          ? (client?.parcelle_id || "")
          : ""
      );
    }
    setNewAcquisitionFormData((current: any) => ({ ...current, ...patch }));
  };
  useEffect(()=>{setPlantationPage(1);setPaymentPage(1);setInterventionPage(1);setAttributionPage(1);},[tableSearch,pageSize]);
  useEffect(()=>{if(returnedAcquisition){setSaleCorrectionSurface(String(returnedAcquisition.superficie_ha ?? ""));setSaleCorrectionNotes(returnedAcquisition.notes || "");}},[returnedAcquisition?.id,returnedAcquisition?.superficie_ha,returnedAcquisition?.notes]);

  const uploadClientDocument=async()=>{
    if(!id||!documentFile)return;
    try{
      const {data:authData}=await supabase.auth.getUser();if(!authData.user)throw new Error("Session utilisateur introuvable");
      const uploaded=await uploadFile("documents",documentFile,`${authData.user.id}/clients/${id}/pieces`);
      if(!uploaded)throw new Error("Téléversement impossible");
      const {error}=await (supabase as any).from("documents_acquisition").insert({
        client_id:id,type_document:"annexe_libre",code_document:"annexe_libre",categorie:"annexe",
        obligatoire:false,source_contractuelle:"annexe_libre",fichier_url:uploaded.path,statut:"en_attente",uploaded_by:authData.user.id,
        metadata:{libelle:documentLabel.trim()||documentFile.name,source:"fiche_client",storage_bucket:"documents"}
      });
      if(error)throw error;
      toast({title:"Document ajouté"});setDocumentFile(null);setDocumentLabel("");setIsDocumentDialogOpen(false);await fetchData();
    }catch(e:any){toast({variant:"destructive",title:"Téléversement impossible",description:getSafeErrorMessage(e)});}
  };

  const reviewClient = async (action: "valider" | "demander_modification") => {
    if (!id || !canValidateClient || savingValidation) return;
    if (action === "demander_modification" && !validationComment.trim()) {
      toast({ variant: "destructive", title: "Commentaire requis", description: "Décrivez les corrections à effectuer." });
      return;
    }
    setSavingValidation(true);
    try {
      // Les annexes facultatives ne sont proposées qu’à la validation d’un client PalmInvest.
      if (action === "valider" && isPalmInvestClient && pendingAnnexes.length) {
        for (const annex of pendingAnnexes) {
          const uploaded = await uploadFile("documents", annex.file, `${user!.id}/clients/${id}/annexes`);
          if (!uploaded?.path) throw new Error(`Téléversement impossible : ${annexLabels[annex.type]}`);
          const { error: annexError } = await (supabase as any).from("documents_acquisition").insert({
            client_id: id, type_document: annex.type, code_document: annex.type, categorie: "annexe", obligatoire: false,
            source_contractuelle: "validation_palmInvest", fichier_url: uploaded.path, statut: "en_attente", uploaded_by: user!.id,
            metadata: { libelle: annexLabels[annex.type], source: "validation_compte_client", storage_bucket: "documents", offre_famille: "PalmInvest" }
          });
          if (annexError) throw annexError;
        }
      }
      const { error } = await (supabase as any).rpc("review_client_validation", {
        p_client_id: id, p_action: action, p_comment: validationComment.trim() || null
      });
      if (error) throw error;
      toast({ title: action === "valider" ? "Client validé" : "Demande de modification envoyée",
        description: action === "valider" ? "La décision est enregistrée dans Supabase." : "Une notification a été créée pour le créateur du dossier." });
      setValidationComment("");
      setPendingAnnexes([]); setAnnexFile(null);
      setIsValidationDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action impossible", description: getSafeErrorMessage(error) });
    } finally { setSavingValidation(false); }
  };

  const resubmitSaleCorrection = async () => {
    if (!returnedAcquisition || savingSaleCorrection) return;
    const surface = Number(saleCorrectionSurface);
    if (!Number.isFinite(surface) || surface <= 0) {
      toast({ variant: "destructive", title: "Superficie invalide", description: "La superficie doit être supérieure à zéro." });
      return;
    }
    setSavingSaleCorrection(true);
    try {
      const { error } = await (supabase as any).rpc("resubmit_returned_acquisition", {
        p_acquisition_id: returnedAcquisition.id,
        p_superficie_ha: surface,
        p_notes: saleCorrectionNotes.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Vente corrigée et renvoyée", description: "La vente a été renvoyée à la file de validation. Les montants proportionnels ont été recalculés à partir du contrat existant." });
      setIsSaleCorrectionDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Correction impossible", description: getSafeErrorMessage(error) });
    } finally {
      setSavingSaleCorrection(false);
    }
  };

  const handleRachatMonnaie=async()=>{
    if(!canViewClientMoney||!id)return;
    const jours=Math.max(1,Number(rachatJours||0));
    try{
      const {data,error}=await (supabase as any).rpc("rachater_monnaie_client",{p_client_id:id,p_jours:jours});
      if(error)throw error;
      toast({title:"Rachat enregistré",description:"La monnaie client a été utilisée pour la période sélectionnée."});
      setIsRachatOpen(false);setRachatJours("1");setMonnaieClient(Number(data||0));await fetchData();
    }catch(e:any){toast({variant:"destructive",title:"Rachat impossible",description:e?.message||"Opération non autorisée"});}
  };

  const fetchData = async () => {
    try {
      // Fetch client
      const { data: clientData, error: clientError } = await (supabase as any)
        .from("clients")
        .select("*")
        .eq("id", id)
        .single();

      if (clientError) throw clientError;
      const [{ data: campementInfo }, { data: villageInfo }] = await Promise.all([
        clientData.campement_id
          ? (supabase as any).from("campements").select("id,nom").eq("id", clientData.campement_id).maybeSingle()
          : Promise.resolve({ data: null }),
        clientData.village_id
          ? (supabase as any).from("villages").select("id,nom").eq("id", clientData.village_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      clientData.campement = campementInfo;
      clientData.village = villageInfo;
      setClient(clientData);

      // New files use dedicated private buckets. Legacy client files may still
      // live in the old documents bucket or be stored as expired signed URLs.
      const resolveClientMedia = async (value: string | null | undefined, bucket: string) => {
        if (!value) return null;
        return await resolveStorageUrl(bucket, value) || await resolveStorageUrl("documents", value);
      };
      const [photo, recto, verso] = await Promise.all([
        resolveClientMedia(clientData.photo_profil_url, "photos-profils"),
        resolveClientMedia(clientData.fichier_piece_recto_url, "pieces-identite"),
        resolveClientMedia(clientData.fichier_piece_verso_url, "pieces-identite"),
      ]);
      setClientMedia({ photo, recto, verso });

      if (canViewClientMoney) {
        const { data: monnaieData } = await (supabase as any).from("v_monnaie_clients").select("monnaie_client").eq("client_id", id).maybeSingle();
        setMonnaieClient(Number(monnaieData?.monnaie_client || 0));
      } else {
        setMonnaieClient(0);
      }

      if (clientData.parcelle_id) {
        const { data: parcelleData } = await (supabase as any)
          .from("parcelles")
          .select("*, proprietaires_terres(*)")
          .eq("id", clientData.parcelle_id)
          .maybeSingle();
        setParcelle(parcelleData || null);
      }

      const [{data:benefDocs},{data:acqDocs}] = await Promise.all([
        (supabase as any).from("beneficiaire_documents").select("*").eq("client_id",id).order("created_at",{ascending:false}),
        (supabase as any).from("documents_acquisition").select("*").eq("client_id",id).order("created_at",{ascending:false})
      ]);
      const normalized=[...(benefDocs||[]).map((x:any)=>({...x,libelle:x.libelle||x.document_type,categorie:x.categorie||"Bénéficiaire"})),...(acqDocs||[]).map((x:any)=>({...x,libelle:x.libelle||x.type_document,categorie:x.categorie||"Acquisition"}))];
      const docsWithUrls=await Promise.all(normalized.map(async(doc:any)=>{const metadata=doc.metadata&&typeof doc.metadata==="object"?doc.metadata:{};const bucket=metadata.storage_bucket||doc.storage_bucket||(doc.categorie==="souscription"?"documents-fonciers":"documents");return {...doc,displayUrl:doc.fichier_url?await resolveStorageUrl(bucket,doc.storage_path||doc.fichier_url):null};}));
      setDocuments(docsWithUrls);

      const { data: attributionsData } = await (supabase as any)
        .from("beneficiaire_attributions")
        .select("*, parcelles(id_unique,nom,village), plantations(id_unique,nom_plantation,superficie_ha,statut_global)")
        .eq("client_id", id)
        .eq("statut", "active")
        .order("created_at", { ascending: false });
      setAttributions(attributionsData || []);

      // Une plantation appartient toujours à un client/dossier.
      // La parcelle peut, elle, rattacher plusieurs personnes/dossiers.
      const { data: plantationsData, error: plantationsError } = await (supabase as any)
        .from("plantations")
        .select(`
          *,
          regions (nom),
          departements (nom)
        `)
        .eq("client_id", id);

      if (plantationsError) throw plantationsError;

      const allPlantations = plantationsData || [];
      setPlantations(allPlantations);

      const { data: acquisitionsData, error: acquisitionsError } = await (supabase as any)
        .from("acquisitions")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (acquisitionsError) throw acquisitionsError;
      setClientAcquisitions(acquisitionsData || []);

      const { data: acquisitionLotRows } = await (supabase as any)
        .from("acquisition_lots")
        .select("id,lot_id,acquisition_id,date_attribution,surface_ha,notes")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      const acquiredLotIds = (acquisitionLotRows || []).map((row: any) => row.lot_id).filter(Boolean);
      const lotMetaResult = acquiredLotIds.length
        ? await (supabase as any).from("lots_hectares").select("id,reference,numero_h,parcelle_id").in("id", acquiredLotIds)
        : { data: [] };
      const lotMeta = lotMetaResult.data || [];
      const parcelIds = [...new Set(lotMeta.map((lot: any) => lot.parcelle_id).filter(Boolean))];
      const parcelMetaResult = parcelIds.length
        ? await (supabase as any).from("parcelles").select("id,id_unique,nom,village").in("id", parcelIds)
        : { data: [] };
      const parcelMeta = parcelMetaResult.data || [];
      const pendingRows = (acquisitionLotRows || [])
        .filter((row: any) => !allPlantations.some((plantation: any) => plantation.lot_id === row.lot_id))
        .map((row: any) => {
          const lot = lotMeta.find((item: any) => item.id === row.lot_id);
          const parcel = parcelMeta.find((item: any) => item.id === lot?.parcelle_id);
          return { ...row, lot, parcel };
        });
      const pendingGroups = new Map<string, any>();
      pendingRows.forEach((row: any) => {
        const key = row.acquisition_id || row.id;
        const current = pendingGroups.get(key);
        if (!current) {
          pendingGroups.set(key, { ...row, surface_ha: Number(row.surface_ha || 0), lots: row.lot ? [row.lot] : [], lotReferenceGroup: row.lot?.reference || "", parcel: row.parcel });
        } else {
          current.surface_ha += Number(row.surface_ha || 0);
          if (row.lot) current.lots.push(row.lot);
        }
      });
      const pending = Array.from(pendingGroups.values()).map((group: any) => {
        const sortedLots = [...(group.lots || [])].sort((a: any, b: any) => Number(a.numero_h || 0) - Number(b.numero_h || 0));
        if (sortedLots.length > 1 && group.parcel?.id_unique) {
          group.lotReferenceGroup = `${group.parcel.id_unique}-L${String(sortedLots[0].numero_h).padStart(2,"0")}-${String(sortedLots[sortedLots.length-1].numero_h).padStart(2,"0")}`;
        }
        return group;
      });
      setPendingPlantationAcquisitions(pending);

      // Paiements liés au client ou à l'une de ses acquisitions, même avant la création physique d'une plantation.
      const plantationIds = allPlantations.map((p: any) => p.id);
      const { data: paiementsData, error: paiementsError } = await (supabase as any)
        .from("paiements")
        .select("*")
        .eq("client_id", id)
        .neq("statut", "planifie")
        .order("created_at", { ascending: false });
      if (paiementsError) throw paiementsError;
      setPaiements(paiementsData || []);

      const { data: interventionsData, error: interventionsError } = await (supabase as any)
        .from("interventions_techniques")
        .select(`
          *,
          agent_technique:profiles!interventions_techniques_agent_technique_id_fkey(nom_complet)
        `)
        .eq("client_id", id)
        .order("date_intervention", { ascending: false });
      if (interventionsError) throw interventionsError;
      setInterventions(interventionsData || []);

      if (plantationIds.length > 0) {
        const { data: photosData } = await (supabase as any)
          .from("photos_plantation")
          .select("*")
          .in("plantation_id", plantationIds)
          .order("date_prise", { ascending: false });
        setPhotos(photosData || []);
      } else {
        setPhotos([]);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id, canViewClientMoney, canViewClientPayments]);

  useEffect(() => {
    if (!isNewPlantationOpen || !id) return;
    let active = true;
    setLoadingPlantationOptions(true);
    void (async () => {
      try {
        const [parcellesResult, lotsResult, conventionsResult] = await Promise.all([
          (supabase as any).from("parcelles")
            .select("id,id_unique,nom,village,proprietaire_id,mode_surface,region_id,departement_id,surface_totale_ha,surface_disponible_ha,statut")
            .order("id_unique", { ascending: true }),
          (supabase as any).from("lots_hectares")
            .select("id,reference,numero_h,surface_ha,parcelle_id,convention_id,statut,client_id,acquisition_id,part_type")
            .eq("part_type", "agricapital")
            .is("client_id", null)
            .is("acquisition_id", null)
            .in("statut", ["disponible", "libre"])
            .order("numero_h", { ascending: false }),
          (supabase as any).from("conventions_foncieres")
            .select("id,parcelle_id,proprietaire_id,statut")
            .eq("statut", "active"),
        ]);
        if (!active) return;
        if (parcellesResult.error) throw parcellesResult.error;
        if (lotsResult.error) throw lotsResult.error;
        if (conventionsResult.error) throw conventionsResult.error;
        const allParcelles = parcellesResult.data || [];
        const activeConventionIds = new Set((conventionsResult.data || []).map((convention: any) => convention.id));
        const lots = (lotsResult.data || []).filter((lot: any) => activeConventionIds.has(lot.convention_id));
        const partnerParcelles = allParcelles.filter((parcel: any) =>
          !!parcel.proprietaire_id && lots.some((lot: any) => lot.parcelle_id === parcel.id)
        );
        const ownParcelles = allParcelles.filter((parcel: any) =>
          (client?.proprietaire_id && parcel.proprietaire_id === client.proprietaire_id) ||
          (!client?.proprietaire_id && client?.parcelle_id && parcel.id === client.parcelle_id &&
            ["foncier", "propriete_client"].includes(String(parcel.mode_surface || "").toLowerCase()))
        );
        setAvailableLots(lots);
        setAvailableParcelles(partnerParcelles);
        setClientOwnParcelles(ownParcelles);
      } catch (error: any) {
        if (active) toast({ variant: "destructive", title: "Référentiel foncier indisponible", description: getSafeErrorMessage(error) });
      } finally {
        if (active) setLoadingPlantationOptions(false);
      }
    })();
    return () => { active = false; };
  }, [isNewPlantationOpen, id, client?.proprietaire_id, client?.parcelle_id, toast]);

  const uploadAdditionalContract = async (acquisitionId: string) => {
    if (!id) throw new Error("Fiche client introuvable.");
    if (!newContractFile) throw new Error("Sélectionnez le fichier du contrat avant de réessayer.");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new Error("Session utilisateur introuvable.");
    const uploaded = await uploadFile("documents", newContractFile, `${authData.user.id}/clients/${id}/contrats`, `contrat-acquisition-${acquisitionId}`);
    if (!uploaded?.path) throw new Error("Téléversement du contrat impossible.");
    const { error } = await (supabase as any).from("documents_acquisition").insert({
      client_id: id,
      acquisition_id: acquisitionId,
      type_document: "contrat_acquisition_client",
      code_document: "contrat_acquisition_client",
      categorie: "contrat",
      obligatoire: true,
      source_contractuelle: "contrat_acquisition_client",
      fichier_url: uploaded.path,
      statut: "en_attente",
      uploaded_by: authData.user.id,
      metadata: {
        libelle: `Contrat de souscription additionnelle — ${newAcquisitionFormData.offre?.nom || newAcquisitionFormData.offre_nom || "Offre"}`,
        storage_bucket: "documents",
        source: "fiche_client",
        acquisition_id: acquisitionId,
        offre_id: newAcquisitionFormData.offre_id,
        formule_code: newAcquisitionFormData.formule_code,
      },
    });
    if (error) throw error;
  };

  const saveAdditionalPlantation = async () => {
    if (!id || savingNewPlantation) return;
    if (!navigator.onLine) {
      toast({ variant: "destructive", title: "Connexion requise", description: "La disponibilité foncière et le tarif doivent être vérifiés en ligne avant de créer cette acquisition." });
      return;
    }
    const area = Number(newAcquisitionFormData.superficie_prevue);
    if (!newAcquisitionFormData.offre_id || !newAcquisitionFormData.formule_code || area <= 0) {
      toast({ variant: "destructive", title: "Acquisition incomplète", description: "Choisissez une offre, une formule et une superficie valide." });
      return;
    }
    if (!selectedOfferNeedsClientLand && (!newPlantationLotId || !selectedLotSeriesReady)) {
      toast({ variant: "destructive", title: "Lot partenaire requis", description: "Choisissez un lot disponible correspondant à la superficie." });
      return;
    }
    setSavingNewPlantation(true);
    try {
      if (pendingContractAcquisitionId) {
        await uploadAdditionalContract(pendingContractAcquisitionId);
        setPendingContractAcquisitionId(null);
        setNewContractFile(null);
        setIsNewPlantationOpen(false);
        toast({ title: "Contrat ajouté", description: "Le contrat a été rattaché à la souscription déjà enregistrée." });
        await fetchData();
        return;
      }
      const { data, error } = await (supabase as any).rpc("create_client_acquisition", {
        p_client_id: id,
        p_offre_id: newAcquisitionFormData.offre_id,
        p_formule_code: newAcquisitionFormData.formule_code,
        p_superficie_ha: area,
        p_mode_paiement: newAcquisitionFormData.mode_paiement || "echeancier",
        p_parcelle_id: newPlantationParcelId || null,
        p_lot_id: selectedOfferNeedsClientLand ? null : (newPlantationLotId || null),
        p_notes: newPlantationNotes.trim() || null,
      });
      if (error) throw error;
      const acquisitionId = String(data?.acquisition_id || data?.id || "");
      if (newContractFile) {
        if (!acquisitionId) throw new Error("L’acquisition a été créée, mais son identifiant n’a pas été retourné; le contrat n’a pas pu être rattaché.");
        try {
          await uploadAdditionalContract(acquisitionId);
        } catch (uploadError: any) {
          setPendingContractAcquisitionId(acquisitionId);
          toast({ variant: "destructive", title: "Acquisition enregistrée — contrat à joindre", description: getSafeErrorMessage(uploadError, "Réessayez l’envoi du contrat sans recréer l’acquisition.") });
          await fetchData();
          return;
        }
      }
      const total = Number(data?.montant_total_contrat || 0).toLocaleString("fr-FR");
      const pi = Number(data?.montant_pi_total || 0).toLocaleString("fr-FR");
      toast({
        title: "Acquisition enregistrée",
        description: `${newAcquisitionFormData.formule_nom || newAcquisitionFormData.offre?.nom || "Offre"} · ${area} ha · Contrat ${total} FCFA · Paiement initial ${pi} FCFA. La plantation sera créée après l’intervention technique.`,
      });
      setIsNewPlantationOpen(false);
      setNewPlantationParcelId("");
      setNewPlantationLotId("");
      setNewPlantationNotes("");
      setNewContractFile(null);
      setPendingContractAcquisitionId(null);
      setNewAcquisitionFormData({ mode_paiement: "echeancier" });
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Acquisition impossible", description: getSafeErrorMessage(error) });
    } finally {
      setSavingNewPlantation(false);
    }
  };

  // Keep this detail view synchronized in place when this Client or its linked
  // records change elsewhere in the CRM.
  useRealtime({ table: "clients", filter: id ? `id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "acquisitions", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "paiements", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "plantations", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "documents_acquisition", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "beneficiaire_attributions", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "beneficiaire_documents", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "client_cotitulaires_mandataires", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });

  const formatMontant = (montant: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
    }).format(montant);
  };

  const formatStatusLabel = (raw: unknown) => {
    const value = String(raw || "").trim().toLowerCase();
    const labels: Record<string, string> = {
      actif: "Actif", active: "Actif", a_jour: "À jour", en_retard: "En retard",
      suspendu: "Suspendu", suspendue: "Suspendu", inactif: "Inactif",
      archive: "Archivé", radie: "Radié", en_attente: "En attente",
      en_attente_da: "En attente de validation", da_valide: "Dossier validé",
      en_cours: "En cours", en_production: "En production", pre_activation: "Pré-activation",
    };
    return labels[value] || (value ? value.replaceAll("_", " ") : "—");
  };

  const getStatutBadge = (statut: string) => {
    const colors: any = {
      en_attente_da: "bg-yellow-500",
      da_valide: "bg-blue-500",
      en_cours: "bg-purple-500",
      en_production: "bg-green-500",
      en_attente: "bg-yellow-500",
      valide: "bg-green-500",
      rejete: "bg-red-500",
    };
    return colors[statut] || "bg-gray-500";
  };

  if (loading) {
    return (
      <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}>
        <MainLayout>
          <div className="flex items-center justify-center h-96">
            <p>Chargement...</p>
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!client) {
    return (
      <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}>
        <MainLayout>
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <p>Client non trouvé</p>
            <Button onClick={() => navigate("/acquisitions")}>
              Retour aux acquisitions
            </Button>
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}>
      <MainLayout>
        <div className="client-detail-compact space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => navigate("/acquisitions")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
              {clientMedia.photo ? (
                <img src={clientMedia.photo} alt={client.nom_complet || "Photo du Client"} className="h-14 w-14 shrink-0 rounded-full border object-cover sm:h-16 sm:w-16" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold sm:h-16 sm:w-16">
                  {String(client.nom_complet || "C").trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold sm:text-3xl">{client.nom_complet}</h1>
                <p className="truncate text-sm text-muted-foreground">{client.id_unique}</p>
                {(clientMedia.recto || clientMedia.verso) && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    {clientMedia.recto && <a href={clientMedia.recto} target="_blank" rel="noreferrer" className="text-primary underline">Pièce d’identité — recto</a>}
                    {clientMedia.verso && <a href={clientMedia.verso} target="_blank" rel="noreferrer" className="text-primary underline">Pièce d’identité — verso</a>}
                  </div>
                )}
              </div>
            </div>
            <Dialog open={isClientFormOpen} onOpenChange={setIsClientFormOpen}><DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Fiche officielle du client</DialogTitle><DialogDescription>Consultez ou modifiez les données, la photo et les pièces d’identité dans le formulaire officiel.</DialogDescription></DialogHeader>{client && <ClientForm client={client} readOnly lockCommercialAssignment onCancel={()=>setIsClientFormOpen(false)} onSuccess={()=>{setIsClientFormOpen(false);void fetchData();}} />}</DialogContent></Dialog>
      <Dialog open={isDocumentDialogOpen} onOpenChange={setIsDocumentDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Ajouter un document au dossier</DialogTitle><DialogDescription>Le fichier est téléversé dans le stockage privé puis rattaché au dossier du client.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Libellé du document</Label><Input placeholder="Contrat, annexe…" value={documentLabel} onChange={e=>setDocumentLabel(e.target.value)} /></div><div className="space-y-1"><Label>Fichier</Label><Input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>setDocumentFile(e.target.files?.[0]||null)} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={()=>{setIsDocumentDialogOpen(false);setDocumentFile(null);setDocumentLabel("");}}>Annuler</Button><Button type="button" onClick={()=>void uploadClientDocument()} disabled={!documentFile}>Enregistrer le document</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isValidationDialogOpen} onOpenChange={setIsValidationDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Contrôle du dossier client</DialogTitle><DialogDescription>La décision et le commentaire sont enregistrés dans Supabase.</DialogDescription></DialogHeader>{isPalmInvestClient && <div className="space-y-3 rounded-lg border p-3"><div><h3 className="font-semibold">Annexes PalmInvest (facultatif)</h3><p className="text-xs text-muted-foreground">Ajoutez une ou plusieurs pièces pendant la validation du compte.</p></div><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Select value={annexType} onValueChange={setAnnexType}><SelectTrigger><SelectValue placeholder="Type d’annexe"/></SelectTrigger><SelectContent><SelectItem value="convention_fonciere">Convention foncière</SelectItem><SelectItem value="fiche_identification_parcelle">Fiche d’identification de la parcelle</SelectItem><SelectItem value="pv_consentement_familial">PV de consentement familial</SelectItem></SelectContent></Select><Input type="file" accept=".pdf,image/*" onChange={e=>setAnnexFile(e.target.files?.[0]||null)}/><Button type="button" variant="outline" disabled={!annexFile||savingValidation} onClick={()=>{if(annexFile){setPendingAnnexes(current=>[...current,{type:annexType,file:annexFile}]);setAnnexFile(null);}}}><Plus className="mr-1 h-4 w-4"/>Ajouter</Button></div>{pendingAnnexes.length>0 && <ul className="space-y-1 text-sm">{pendingAnnexes.map((a,i)=><li key={i} className="flex items-center justify-between gap-2"><span>{annexLabels[a.type]} — {a.file.name}</span><Button type="button" variant="ghost" size="sm" onClick={()=>setPendingAnnexes(current=>current.filter((_,j)=>j!==i))}>Retirer</Button></li>)}</ul>}</div>}<div className="space-y-2"><Label>Commentaire de contrôle</Label><Textarea rows={3} value={validationComment} onChange={e=>setValidationComment(e.target.value)} placeholder="À renseigner pour demander une correction" /></div><DialogFooter><Button type="button" variant="outline" onClick={()=>setIsValidationDialogOpen(false)}>Annuler</Button>{client?.validation_statut === "modification_demandee" && <Button type="button" variant="outline" onClick={()=>{setIsValidationDialogOpen(false);setIsClientFormOpen(true);}}>Modifier le dossier</Button>}<Button type="button" variant="outline" onClick={()=>void reviewClient("demander_modification")} disabled={savingValidation}>Demander une modification</Button><Button type="button" onClick={()=>void reviewClient("valider")} disabled={savingValidation}>Valider le dossier</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isSaleCorrectionDialogOpen} onOpenChange={setIsSaleCorrectionDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Correction de la vente</DialogTitle><DialogDescription>Les montants seront recalculés proportionnellement au contrat existant, sans créer d’échéancier futur.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Superficie corrigée (ha)</Label><Input type="number" min="0.01" step="0.01" value={saleCorrectionSurface} onChange={e=>setSaleCorrectionSurface(e.target.value)} /></div><div className="space-y-1"><Label>Note de correction (facultatif)</Label><Textarea rows={3} value={saleCorrectionNotes} onChange={e=>setSaleCorrectionNotes(e.target.value)} placeholder="Précision transmise au validateur" /></div></div><DialogFooter><Button type="button" variant="outline" onClick={()=>setIsSaleCorrectionDialogOpen(false)}>Annuler</Button><Button type="button" onClick={()=>void resubmitSaleCorrection()} disabled={savingSaleCorrection}>{savingSaleCorrection?"Envoi…":"Enregistrer et renvoyer"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isRachatOpen} onOpenChange={setIsRachatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Racheter la monnaie client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Monnaie disponible : <b>{formatMontant(monnaieClient)} F CFA</b></p>
            <div><Label>Nombre de jours</Label><Input type="number" min="1" value={rachatJours} onChange={e=>setRachatJours(e.target.value)}/></div>
            <Button className="w-full" onClick={handleRachatMonnaie}>Confirmer</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isTicketOpen} onOpenChange={setIsTicketOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Settings className="mr-2 h-4 w-4" />
                  Gestion Technique
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Créer un ticket technique</DialogTitle>
                </DialogHeader>
                <TicketForm
                  clientId={client.id}
                  clientLocation={[client.campement?.nom, client.village?.nom, client.localite, client.domicile_residence].filter(Boolean).join(" · ")}
                  plantationId={plantations[0]?.id}
                  onSuccess={() => {
                    setIsTicketOpen(false);
                    fetchData();
                  }}
                  onCancel={() => setIsTicketOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="client-summary-grid grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Téléphone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">{client.telephone}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Plantations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">{plantations.length}</p>
              </CardContent>
            </Card>
            {canViewClientMoney && <Card>
              <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Monnaie client</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-lg font-semibold">{formatMontant(monnaieClient)} F CFA</p>
                <Button size="sm" variant="outline" onClick={()=>setIsRachatOpen(true)} disabled={!monnaieClient}>Racheter</Button>
              </CardContent>
            </Card>}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Superficie Totale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {Math.round(Number(client.total_hectares || 0)).toLocaleString("fr-FR")} ha
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Statut
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={getStatutBadge(client.statut || client.statut_global)}>
                  {formatStatusLabel(client.statut || client.statut_global)}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Dialog open={isNewPlantationOpen} onOpenChange={(open) => {
            setIsNewPlantationOpen(open);
            if (open) {
              setNewAcquisitionFormData({ commercial_id: client?.commercial_id || "", mode_paiement: "echeancier" });
              setNewPlantationLotId("");
              setNewPlantationNotes("");
              if (!pendingContractAcquisitionId) setNewContractFile(null);
              setNewPlantationParcelId("");
            }
          }}>
            <DialogContent className="max-h-[94dvh] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ajouter une nouvelle plantation</DialogTitle>
                <DialogDescription>
                  Cette opération enregistre une nouvelle acquisition pour le client existant. Elle conserve ses contrats précédents et la plantation sera activée après l’intervention technique requise.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-semibold">{client.nom_complet}</p>
                  <p className="text-muted-foreground">Une nouvelle offre et une nouvelle formule seront enregistrées comme une acquisition distincte, sans modifier les acquisitions précédentes.</p>
                  <p className="text-xs text-muted-foreground">Les promotions réservées aux nouveaux clients ne s’appliquent pas aux clients déjà enregistrés.</p>
                </div>

                <Etape0Offre
                  allowPromotions={false}
                  formData={newAcquisitionFormData}
                  updateFormData={updateNewAcquisitionFormData}
                  showCommercial={false}
                  surfaceReadOnly={!!newPlantationLotId}
                />

                <div className="space-y-2 rounded-lg border p-3">
                  <Label>Contrat de cette nouvelle offre (PDF, JPG ou PNG)</Label>
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => setNewContractFile(e.target.files?.[0] || null)} />
                  {newContractFile && <p className="text-xs text-muted-foreground">Fichier sélectionné : {newContractFile.name}</p>}
                  {pendingContractAcquisitionId && <p className="text-xs text-amber-700">L’acquisition est déjà enregistrée. Le prochain clic réessaiera uniquement l’envoi du contrat, sans créer de doublon.</p>}
                </div>

                <div className="space-y-2">
                  <Label>Échéancier contractuel</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button type="button" variant={newAcquisitionFormData.mode_paiement === "echeancier" ? "default" : "outline"} onClick={() => updateNewAcquisitionFormData({ mode_paiement: "echeancier" })}>
                      Paiement initial + échéancier
                    </Button>
                  </div>
                </div>

                {newAcquisitionFormData.offre_id && selectedOfferNeedsClientLand && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Terrain du client</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Cette offre nécessite le terrain du client. Aucun lot partenaire ne sera réservé. La localisation précise et la validation foncière pourront être complétées pendant l’intervention technique.
                      </p>
                      {clientOwnParcelles.length > 0 ? (
                        <div className="space-y-2">
                          <Label>Parcelle du client (facultatif si elle doit être confirmée sur le terrain)</Label>
                          <Select value={newPlantationParcelId || "a-confirmer"} onValueChange={(value) => setNewPlantationParcelId(value === "a-confirmer" ? "" : value)}>
                            <SelectTrigger><SelectValue placeholder="Sélectionner une parcelle du client" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="a-confirmer">À confirmer lors de l’intervention technique</SelectItem>
                              {clientOwnParcelles.map((parcel: any) => (
                                <SelectItem key={parcel.id} value={parcel.id}>
                                  {parcel.nom || parcel.village || "Parcelle"}{parcel.village ? " · " + parcel.village : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                          Aucune parcelle propre n’est reliée à cette fiche. La superficie est enregistrée maintenant ; le technicien confirmera la parcelle et la localisation lors de l’intervention.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {newAcquisitionFormData.offre_id && !selectedOfferNeedsClientLand && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Parcelle partenaire et lot disponible</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {isPalmInvestOffer
                          ? "PalmInvest : 1 lot = 1 ha. Choisissez le lot de départ; le CRM réservera automatiquement autant de lots contigus que d’hectares souscrits."
                          : "Cette offre utilise une parcelle partenaire. Choisissez une parcelle puis un lot dont la superficie correspond exactement à celle de la souscription."}
                        {" "}Les lots ne sont réservés qu’après confirmation par la base.
                      </p>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Parcelle partenaire *</Label>
                          <Select value={newPlantationParcelId} onValueChange={(value) => { setNewPlantationParcelId(value); setNewPlantationLotId(""); }} disabled={loadingPlantationOptions || availableParcelles.length === 0}>
                            <SelectTrigger><SelectValue placeholder={loadingPlantationOptions ? "Chargement…" : "Choisir une parcelle"} /></SelectTrigger>
                            <SelectContent>
                              {availableParcelles.map((parcel: any) => (
                                <SelectItem key={parcel.id} value={parcel.id}>
                                  {parcel.nom || parcel.village || "Parcelle"}{parcel.village ? " · " + parcel.village : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{isPalmInvestOffer ? "Lot de départ (1 ha) *" : "Lot disponible correspondant à la superficie *"}</Label>
                          <Select value={newPlantationLotId} onValueChange={(value) => {
                            const lot = availableLots.find((item: any) => item.id === value);
                            setNewPlantationLotId(value);
                            if (lot && !isPalmInvestOffer) setNewAcquisitionFormData((current: any) => ({ ...current, superficie_prevue: String(lot.surface_ha || "") }));
                          }} disabled={!newPlantationParcelId || loadingPlantationOptions || lotsForSelectedParcel.length === 0}>
                            <SelectTrigger><SelectValue placeholder={!newPlantationParcelId ? "Choisir d’abord une parcelle" : "Choisir un lot"} /></SelectTrigger>
                            <SelectContent>
                              {lotsForSelectedParcel.map((lot: any) => (
                                <SelectItem key={lot.id} value={lot.id}>
                                  {lot.reference || (lot.numero_h != null ? "H" + String(lot.numero_h).padStart(2, "0") : "Lot")} · {Number(lot.surface_ha || 0).toLocaleString("fr-FR")} ha
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {selectedNewLot && (
                        <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
                          <div><p className="text-xs text-muted-foreground">{isPalmInvestOffer ? "Lots qui seront réservés" : "Superficie réservée"}</p><p className="font-semibold">{isPalmInvestOffer ? selectedLotGroupReference : `${Number(selectedNewLot.surface_ha || 0).toLocaleString("fr-FR")} ha`}</p><p className="text-xs text-muted-foreground">{isPalmInvestOffer ? `${selectedLotSeries.length} / ${requestedPalmInvestLots} lot(s) contigus` : ""}</p></div>
                          <div><p className="text-xs text-muted-foreground">Localisation</p><p className="font-semibold">{availableParcelles.find((parcel: any) => parcel.id === newPlantationParcelId)?.village || "À confirmer"}</p></div>
                          <div><p className="text-xs text-muted-foreground">Propriétaire partenaire</p><p className="font-semibold">Enregistré sur la parcelle</p></div>
                          {isPalmInvestOffer && !selectedLotSeriesReady && <p className="text-sm text-destructive sm:col-span-3">Cette série ne contient pas tous les lots contigus requis. Choisissez un autre lot de départ ou une autre parcelle.</p>}
                        </div>
                      )}
                      {!loadingPlantationOptions && availableParcelles.length === 0 && (
                        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                          Aucune parcelle partenaire avec lot disponible n’est actuellement enregistrée. Vérifiez les propriétaires, parcelles et lots dans la gestion foncière.
                        </p>
                      )}
                      {!!newAcquisitionFormData.superficie_prevue && !newPlantationLotId && (
                        <p className="text-xs text-muted-foreground">Lots affichés : {Number(newAcquisitionFormData.superficie_prevue).toLocaleString("fr-FR")} ha exactement.</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  <Label>Note complémentaire (facultatif)</Label>
                  <Input value={newPlantationNotes} onChange={(event) => setNewPlantationNotes(event.target.value)} placeholder="Précision sur cette acquisition…" />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsNewPlantationOpen(false)} disabled={savingNewPlantation}>Annuler</Button>
                <Button onClick={() => void saveAdditionalPlantation()} disabled={
                  savingNewPlantation || loadingPlantationOptions ||
                  !newAcquisitionFormData.offre_id || !newAcquisitionFormData.formule_code ||
                  Number(newAcquisitionFormData.superficie_prevue) <= 0 ||
                  (!selectedOfferNeedsClientLand && !newPlantationLotId)
                }>
                  {savingNewPlantation ? "Enregistrement…" : "Confirmer la acquisition"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <section className="rounded-xl border p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Fiche complète du client</h2>
              <Button type="button" variant="outline" onClick={() => setIsClientFormOpen(true)}>Ouvrir la fiche officielle</Button>
            </div>
            {canValidateClient && client && client.validation_statut !== "valide" && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Validation du dossier</h3><Badge>{client.validation_statut === "modification_demandee" ? "Correction demandée" : "À valider"}</Badge></div><Button type="button" variant="outline" onClick={()=>setIsValidationDialogOpen(true)}>Ouvrir le contrôle</Button></div>{client.validation_commentaire && <p className="mt-2 text-sm">{client.validation_commentaire}</p>}</div>}
            {canCorrectReturnedClient && !canValidateClient && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Corrections demandées</h3><Badge variant="destructive">À corriger</Badge></div>{client.validation_commentaire && <p className="break-words text-sm">{client.validation_commentaire}</p>}<Button onClick={()=>setIsClientFormOpen(true)}>Modifier le dossier</Button></div>}
            {returnedAcquisition && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Correction de la vente demandée</h3><Badge variant="destructive">À corriger</Badge></div>
              {returnedAcquisition.validation_commentaire && <p className="text-sm">{returnedAcquisition.validation_commentaire}</p>}
              <p className="text-sm text-muted-foreground">Ouvrez le formulaire dédié pour corriger la superficie et les notes de vente.</p>
              <Button type="button" onClick={()=>setIsSaleCorrectionDialogOpen(true)}>Corriger la vente</Button>
            </div>}

          </section>

          <Tabs defaultValue="plantations" className="space-y-3">
            <TabsList className="h-auto min-h-9 flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="plantations">
                <Sprout className="h-4 w-4 mr-2" />
                Plantations
              </TabsTrigger>
              {canViewClientPayments && <TabsTrigger value="paiements">
                <DollarSign className="h-4 w-4 mr-2" />
                Paiements
              </TabsTrigger>}
              <TabsTrigger value="interventions">
                <FileText className="h-4 w-4 mr-2" />
                Interventions
              </TabsTrigger>
              <TabsTrigger value="photos">
                <Camera className="h-4 w-4 mr-2" />
                Photos
              </TabsTrigger>
              <TabsTrigger value="messagerie">
                <MessageSquare className="h-4 w-4 mr-2" />
                Messagerie
              </TabsTrigger>
              {client.type_client === "beneficiaire_particulier" && (
                <TabsTrigger value="dossier">
                  <LandPlot className="h-4 w-4 mr-2" />
                  Dossier
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="plantations">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>Plantations</CardTitle>
                      {canCreatePlantationAcquisition && (
                        <Button size="sm" onClick={() => setIsNewPlantationOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Ajouter une nouvelle plantation
                        </Button>
                      )}
                    </div>
                    <TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher une plantation…" />
                  </div>
                </CardHeader>
                <CardContent>
                  {clientAcquisitions.length > 0 && (
                    <div className="mb-4 space-y-3 rounded-xl border p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">Acquisitions et engagements financiers</p>
                        <Badge variant="outline">{clientAcquisitions.length} acquisition(s)</Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {clientAcquisitions.map((acquisition: any) => (
                          <div key={acquisition.id} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">{acquisition.formule_nom || acquisition.offre_nom}</p>
                                <p className="text-xs text-muted-foreground">{acquisition.famille_offre || acquisition.offre_code} · {acquisition.formule_code}</p>
                              </div>
                              <Badge variant={acquisition.statut_technique === "mise_en_terre_realisee" ? "default" : "secondary"}>
                                {acquisition.statut_technique === "mise_en_terre_realisee" ? "Mise en terre réalisée" : "En attente d’intervention"}
                              </Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                              <div><p className="text-xs text-muted-foreground">Superficie</p><p className="font-semibold">{Number(acquisition.superficie_ha || 0).toLocaleString("fr-FR")} ha</p></div>
                              <div><p className="text-xs text-muted-foreground">Coût contractuel</p><p className="font-semibold">{formatMontant(Number(acquisition.montant_total_contrat || 0))} F</p></div>
                              <div><p className="text-xs text-muted-foreground">Paiement initial</p><p className="font-semibold">{formatMontant(Number(acquisition.montant_pi_total || 0))} F</p></div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                              <span>{`Échéancier · ${Number(acquisition.duree_paiement_mois || 0)} mois`}</span>{(acquisition.metadata?.lot_reference_group || acquisition.lot_reference_group) && <span>{`Lot(s) · ${acquisition.metadata?.lot_reference_group || acquisition.lot_reference_group}`}</span>}
                              <span>{acquisition.necessite_foncier_client ? "Terrain du client" : "Parcelle partenaire"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pendingPlantationAcquisitions.length > 0 && (
                    <div className="mb-4 space-y-2 rounded-lg border border-dashed p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">Acquisitions en attente de mise en terre</p>
                        <Badge variant="outline">{pendingPlantationAcquisitions.length}</Badge>
                      </div>
                      {pendingPlantationAcquisitions.map((acquisition: any) => (
                        <div key={acquisition.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{acquisition.lotReferenceGroup || acquisition.lot?.reference || (acquisition.lot?.numero_h != null ? "Lot H" + String(acquisition.lot.numero_h).padStart(2, "0") : "Lot attribué")}</p>
                            <p className="text-xs text-muted-foreground">{acquisition.parcel?.nom || acquisition.parcel?.village || "Parcelle"}{acquisition.parcel?.village ? " · " + acquisition.parcel.village : ""}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{Number(acquisition.surface_ha || 0).toLocaleString("fr-FR")} ha</span>
                            <Badge variant="secondary">À implanter</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Lot(s)</TableHead>
                        <TableHead>Région</TableHead>
                        <TableHead>Superficie</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPlantations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8">
                            Aucune plantation
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPlantations.map((plantation) => (
                          <TableRow key={plantation.id}>
                            <TableCell>{plantation.nom_plantation}</TableCell>
                            <TableCell>{plantation.lot_reference_group || "—"}</TableCell>
                            <TableCell>{plantation.regions?.nom}</TableCell>
                            <TableCell>{plantation.superficie_ha} ha</TableCell>
                            <TableCell>
                              <Badge className={getStatutBadge(plantation.statut || plantation.statut_global)}>
                                {formatStatusLabel(plantation.statut || plantation.statut_global)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <ResponsiveTablePagination page={plantationPage} pageSize={pageSize} total={filteredPlantations.length} onPageChange={setPlantationPage} />
                </CardContent>
              </Card>
            </TabsContent>

            {canViewClientPayments && <TabsContent value="paiements">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Historique des Paiements</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un paiement…" /></div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPaiements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            Aucun paiement
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPaiements.map((paiement) => (
                          <TableRow key={paiement.id}>
                            <TableCell>
                              {new Date(paiement.created_at).toLocaleDateString("fr-FR")}
                            </TableCell>
                            <TableCell>{paiement.type_paiement}</TableCell>
                            <TableCell className="font-semibold">
                              {formatMontant(Number(paiement.montant_paye ?? paiement.montant ?? 0))}
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatutBadge(paiement.statut)}>
                                {paiement.statut === "active" ? "Actif" : (paiement.statut || "—").replaceAll("_", " ")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <ResponsiveTablePagination page={paymentPage} pageSize={pageSize} total={filteredPaiements.length} onPageChange={setPaymentPage} />
                </CardContent>
              </Card>
            </TabsContent>}

            <TabsContent value="interventions">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Interventions Techniques</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher une intervention…" /></div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Agent technique</TableHead>
                        <TableHead>Observations</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInterventions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            Aucune intervention
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedInterventions.map((intervention) => (
                          <TableRow key={intervention.id}>
                            <TableCell>
                              {new Date(intervention.date_intervention).toLocaleDateString("fr-FR")}
                            </TableCell>
                            <TableCell>{intervention.type_intervention}</TableCell>
                            <TableCell>{intervention.agent_technique?.nom_complet}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {intervention.observations}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <ResponsiveTablePagination page={interventionPage} pageSize={pageSize} total={filteredInterventions.length} onPageChange={setInterventionPage} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dossier">
              <div className="grid gap-4">
                <Card>
                  <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Attributions agricoles</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher une attribution…" /></div></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parcelle</TableHead>
                          <TableHead>Rôle</TableHead>
                          <TableHead>Quote-part</TableHead>
                          <TableHead>Plantation liée</TableHead>
                          <TableHead>Acte</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAttributions.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-8">Aucune attribution enregistrée</TableCell></TableRow>
                        ) : paginatedAttributions.map((a: any) => (
                          <TableRow key={a.id}>
                            <TableCell>{a.parcelles?.nom || a.parcelles?.village || "Parcelle"}{a.parcelles?.village ? <span className="block text-xs text-muted-foreground">{a.parcelles.village}</span> : null}</TableCell>
                            <TableCell className="whitespace-nowrap"><Badge variant="outline" className="inline-flex max-w-none whitespace-nowrap text-[11px] leading-none">{a.role_attribution === "proprietaire_beneficiaire" ? "Propriétaire + bénéficiaire" : "Bénéficiaire"}</Badge></TableCell>
                            <TableCell className="font-semibold">{Number(a.surface_attribuee_ha || 0).toLocaleString("fr-FR",{maximumFractionDigits:2})} ha</TableCell>
                            <TableCell className="max-w-[180px] truncate" title={a.plantations?.nom_plantation || ""}>{a.plantations?.nom_plantation || "Plantation"}</TableCell>
                            <TableCell className="whitespace-nowrap" title={a.reference_acte || "Acte de remise"}>{documents.find((doc:any)=>String(doc.document_type||"").toLowerCase()==="acte_remise"||String(doc.libelle||"").toLowerCase().includes("acte de remise"))?.displayUrl ? <a className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline" href={documents.find((doc:any)=>String(doc.document_type||"").toLowerCase()==="acte_remise"||String(doc.libelle||"").toLowerCase().includes("acte de remise"))?.displayUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5"/>Prévisualiser</a> : (a.reference_acte || "—")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  <ResponsiveTablePagination page={attributionPage} pageSize={pageSize} total={filteredAttributions.length} onPageChange={setAttributionPage} />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" /> Propriétaire foncier</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="font-semibold">{parcelle?.proprietaires_terres?.nom_complet || "À compléter"}</p>
                      <p className="text-sm text-muted-foreground">Statut foncier : {parcelle?.proprietaires_terres?.statut_foncier || "—"}</p>
                      <p className="text-sm text-muted-foreground">Téléphone : {parcelle?.proprietaires_terres?.telephone || "À compléter"}</p>
                      
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><LandPlot className="h-5 w-5" /> Parcelle</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="font-mono text-sm">{parcelle?.nom || parcelle?.village || "Parcelle"}</p>
                      <p><span className="font-medium">{Math.round(Number(parcelle?.surface_totale_ha || 0)).toLocaleString("fr-FR")} ha</span> · {parcelle?.village || "—"}</p>
                      <p className="text-sm text-muted-foreground">Mode : {parcelle?.mode_surface === "actif_agricole" ? "Actif agricole" : "Foncier"}</p>
                      
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3"><span>Documents du dossier</span>{canUploadDocuments&&<Button type="button" variant="outline" size="sm" onClick={()=>setIsDocumentDialogOpen(true)}><Upload className="mr-2 h-4 w-4"/>Ajouter</Button>}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {documents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Aucun document enregistré.</p>
                        ) : documents.map((doc: any) => (
                          <div key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border rounded-lg p-2 sm:flex-nowrap">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium" title={doc.libelle}>{doc.libelle}</p>
                              <p className="text-xs text-muted-foreground">{doc.categorie} · {doc.statut}</p>
                            </div>
                            {doc.displayUrl ? (
                              <div className="flex shrink-0 gap-1">
                                <Button variant="outline" size="sm" asChild>
                                  <a href={doc.displayUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Aperçu
                                  </a>
                                </Button>
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={doc.displayUrl} download>
                                    <Download className="mr-1 h-3.5 w-3.5" /> Télécharger
                                  </a>
                                </Button>
                              </div>
                            ) : (
                              <Badge variant="outline">À ajouter</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="messagerie">
              <ClientMessagingPanel clientId={id!} plantationId={plantations[0]?.id || null} />
            </TabsContent>

            <TabsContent value="photos">
              <Card>
                <CardHeader>
                  <CardTitle>Photos de Plantation</CardTitle>
                </CardHeader>
                <CardContent>
                  {photos.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      Aucune photo disponible
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {photos.map((photo) => (
                        <div key={photo.id} className="min-w-0 space-y-1">
                          <img
                            src={photo.url}
                            alt={photo.description || "Photo plantation"}
                            className="h-24 w-full rounded-lg object-cover sm:h-28"
                          />
                          <p className="text-xs text-muted-foreground">
                            {new Date(photo.date_prise).toLocaleDateString("fr-FR")}
                          </p>
                          <p className="text-xs">{photo.type_photo}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Fermeture explicite des onglets : aucune expression JSX parasite. */}
          {/* Traçabilité et historique */}
          {id && <ActivityLog entityType="client" entityId={id} showAddNote={true} />}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default ClientDetail;
