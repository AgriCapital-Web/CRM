import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { ActivityLog } from "@/components/common/ActivityLog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Sprout, DollarSign, FileText, Settings, Camera, LandPlot, UserRound, ExternalLink, MessageSquare, Upload } from "lucide-react";
import TicketForm from "@/components/forms/TicketForm";
import { getSafeErrorMessage } from "@/lib/safeError";
import { uploadFile } from "@/utils/storage";
import { resolveStorageUrl } from "@/utils/storage";
import { useRealtime } from "@/hooks/useRealtime";
import ClientMessagingPanel from "@/components/clients/ClientMessagingPanel";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";

const formatMontant = (m: number) => new Intl.NumberFormat("fr-FR").format(Math.round(m || 0));

const ClientDetail = () => {
  const { can } = usePermissions();
  const canViewClientMoney = can("clients.view_money");
  const canViewClientPayments = can("paiements.view");
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [client, setClient] = useState<any>(null);
  const [clientMedia, setClientMedia] = useState<{ photo: string | null; recto: string | null; verso: string | null }>({ photo: null, recto: null, verso: null });
  const [plantations, setPlantations] = useState<any[]>([]);
  const [paiements, setPaiements] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [parcelle, setParcelle] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentFile,setDocumentFile]=useState<File|null>(null);
  const [documentLabel,setDocumentLabel]=useState("");
  const [attributions, setAttributions] = useState<any[]>([]);
  const [monnaieClient, setMonnaieClient] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
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
  useEffect(()=>{setPlantationPage(1);setPaymentPage(1);setInterventionPage(1);setAttributionPage(1);},[tableSearch,pageSize]);

  const uploadClientDocument=async()=>{
    if(!id||!documentFile)return;
    try{
      const uploaded=await uploadFile("documents",documentFile,`clients/${id}/pieces/${Date.now()}-${documentFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`);
      if(!uploaded)throw new Error("Téléversement impossible");
      const {error}=await (supabase as any).from("documents_acquisition").insert({
        client_id:id,type_document:"annexe_libre",code_document:"annexe_libre",categorie:"annexe",
        obligatoire:false,source_contractuelle:false,fichier_url:uploaded.url,statut:"en_attente",uploaded_by:null,
        metadata:{libelle:documentLabel.trim()||documentFile.name,source:"fiche_client"}
      });
      if(error)throw error;
      toast({title:"Document ajouté"});setDocumentFile(null);setDocumentLabel("");await fetchData();
    }catch(e:any){toast({variant:"destructive",title:"Téléversement impossible",description:getSafeErrorMessage(e)});}
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
        (supabase as any).from("beneficiaire_documents").select("*").eq("client_id",id).order("created_at",{ascending:true}),
        (supabase as any).from("documents_acquisition").select("*").eq("client_id",id).order("created_at",{ascending:true})
      ]);
      const normalized=[...(benefDocs||[]).map((x:any)=>({...x,libelle:x.libelle||x.document_type,categorie:x.categorie||"Bénéficiaire"})),...(acqDocs||[]).map((x:any)=>({...x,libelle:x.libelle||x.type_document,categorie:x.categorie||"Acquisition"}))];
      const docsWithUrls=await Promise.all(normalized.map(async(doc:any)=>({...doc,displayUrl:doc.fichier_url?await resolveStorageUrl(doc.storage_bucket||"documents",doc.storage_path||doc.fichier_url):null})));
      setDocuments(docsWithUrls);

      const { data: attributionsData } = await (supabase as any)
        .from("beneficiaire_attributions")
        .select("*, parcelles(id_unique,nom,village), plantations(id_unique,nom_plantation,superficie_ha,statut_global)")
        .eq("client_id", id)
        .eq("statut", "active")
        .order("created_at", { ascending: true });
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

      // Fetch paiements
      const plantationIds = allPlantations.map((p: any) => p.id);
      if (plantationIds.length > 0) {
        const { data: paiementsData } = await (supabase as any)
          .from("paiements")
          .select("*")
          .in("plantation_id", plantationIds)
          .neq("statut", "planifie")
          .order("created_at", { ascending: false });

        setPaiements(paiementsData || []);

        // Fetch interventions
        const { data: interventionsData } = await (supabase as any)
          .from("interventions_techniques")
          .select(`
            *,
            agent_technique:profiles!interventions_techniques_agent_technique_id_fkey(nom_complet)
          `)
          .in("plantation_id", plantationIds)
          .order("date_intervention", { ascending: false });

        setInterventions(interventionsData || []);

        // Fetch photos
        const { data: photosData } = await (supabase as any)
          .from("photos_plantation")
          .select("*")
          .in("plantation_id", plantationIds)
          .order("date_prise", { ascending: false });

        setPhotos(photosData || []);
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

  // Keep this detail view synchronized in place when this Client or its linked
  // records change elsewhere in the CRM.
  useRealtime({ table: "clients", filter: id ? `id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "plantations", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "documents_acquisition", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "beneficiaire_attributions", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "beneficiaire_documents", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "client_enquetes", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });
  useRealtime({ table: "client_cotitulaires_mandataires", filter: id ? `client_id=eq.${id}` : undefined, onChange: fetchData });

  const formatMontant = (montant: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
    }).format(montant);
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
        <div className="space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                  {client.total_hectares?.toFixed(2) || 0} ha
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
                <Badge className={getStatutBadge(client.statut_global)}>
                  {client.statut_global === "active" ? "Actif" : (client.statut_global || "—").replaceAll("_", " ")}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="plantations" className="space-y-4">
            <TabsList>
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Plantations</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher une plantation…" /></div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID Unique</TableHead>
                        <TableHead>Nom</TableHead>
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
                            <TableCell className="font-mono">{plantation.id_unique}</TableCell>
                            <TableCell>{plantation.nom_plantation}</TableCell>
                            <TableCell>{plantation.regions?.nom}</TableCell>
                            <TableCell>{plantation.superficie_ha} ha</TableCell>
                            <TableCell>
                              <Badge className={getStatutBadge(plantation.statut_global)}>
                                {plantation.statut_global === "active" ? "Actif" : (plantation.statut_global || plantation.statut || "—").replaceAll("_", " ")}
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
                          <TableHead>Référence acte</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAttributions.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-8">Aucune attribution enregistrée</TableCell></TableRow>
                        ) : paginatedAttributions.map((a: any) => (
                          <TableRow key={a.id}>
                            <TableCell>{a.parcelles?.id_unique || a.parcelles?.nom || "—"}{a.parcelles?.village ? <span className="block text-xs text-muted-foreground">{a.parcelles.village}</span> : null}</TableCell>
                            <TableCell><Badge variant="outline">{a.role_attribution === "proprietaire_beneficiaire" ? "Propriétaire + bénéficiaire" : "Bénéficiaire particulier"}</Badge></TableCell>
                            <TableCell className="font-semibold">{Number(a.surface_attribuee_ha || 0).toFixed(2)} ha</TableCell>
                            <TableCell>{a.plantations?.nom_plantation || a.plantations?.id_unique || "—"}</TableCell>
                            <TableCell>{a.reference_acte || "—"}</TableCell>
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
                      <p className="font-mono text-sm">{parcelle?.code_parc || parcelle?.id_unique || "—"}</p>
                      <p><span className="font-medium">{Number(parcelle?.surface_totale_ha || 0).toFixed(2)} ha</span> · {parcelle?.village || "—"}</p>
                      <p className="text-sm text-muted-foreground">Mode : {parcelle?.mode_surface === "actif_agricole" ? "Actif agricole" : "Foncier"}</p>
                      
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3"><span>Documents du dossier</span><div className="inline-flex"><input id="client-dossier-document-upload" type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>{e.stopPropagation();setDocumentFile(e.currentTarget.files?.[0]||null);e.currentTarget.value="";}}/><Button type="button" variant="outline" size="sm" onClick={(e)=>{e.preventDefault();e.stopPropagation();document.getElementById("client-dossier-document-upload")?.click();}}><Upload className="mr-2 h-4 w-4"/>Ajouter</Button></div></CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"><Input placeholder="Libellé du document (contrat, annexe…)" value={documentLabel} onChange={e=>setDocumentLabel(e.target.value)}/>{documentFile&&<Button onClick={()=>void uploadClientDocument()}><Upload className="mr-2 h-4 w-4"/>Enregistrer</Button>}</div><div className="space-y-2">
                        {documents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Aucun document enregistré.</p>
                        ) : documents.map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                            <div>
                              <p className="font-medium">{doc.libelle}</p>
                              <p className="text-xs text-muted-foreground">{doc.categorie} · {doc.statut}</p>
                            </div>
                            {doc.displayUrl ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={doc.displayUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4 mr-2" /> Ouvrir
                                </a>
                              </Button>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {photos.map((photo) => (
                        <div key={photo.id} className="space-y-2">
                          <img
                            src={photo.url}
                            alt={photo.description || "Photo plantation"}
                            className="w-full h-40 object-cover rounded-lg"
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
