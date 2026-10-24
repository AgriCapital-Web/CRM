import { useState, useEffect, useRef } from "react";
import { logActivity } from "@/utils/traceability";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { offlineUpdate, offlineDelete } from "@/lib/offlineWrite";
import { getCachedClients, getCachedPlantations } from "@/lib/offlineDb";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, FileText, Eye, CheckCircle, Clock, MoreVertical, Edit, Archive, Ban, Trash2, RotateCcw, LayoutGrid, List, UserRound, Sprout, UsersRound, LandPlot } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Link, useLocation } from "react-router-dom";
import ClientForm from "@/components/forms/ClientForm";
import ContactLauncher from "@/components/common/ContactLauncher";
import KanbanPipeline from "@/components/acquisitions/KanbanPipeline";
import { getSafeErrorMessage } from "@/lib/safeError";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";

// AgriCapital est un compte interne et ne doit jamais apparaître dans les listes commerciales.
const isAgriCapitalInternal = (client: any) => /agricapital/i.test(String(client?.nom_complet || client?.nom || "").trim());

const formatHectares = (value: unknown) => {
  const hectares = Number(value || 0);
  return Math.round(hectares).toLocaleString("fr-FR");
};

const getOfferDisplayName = (client: any) => {
  const offer = client?.offres;
  const formulas = Array.isArray(offer?.formules_configuration) ? offer.formules_configuration : [];
  const code = String(client?.formule_code || "").trim();
  const formulaName = String(client?.formule_nom || "").trim();
  const exactFormula = formulas.find((formula: any) => formula.code === code);
  if (exactFormula?.nom) return exactFormula.nom;

  // Old records sometimes copied the offer name into the formula fields.
  // Never present the offer itself as if it were a configured formula.
  const genericFormula = !code || code === offer?.code || formulaName === offer?.nom;
  if (genericFormula && formulas.length) {
    const hectares = Number(client?.total_hectares || 0);
    const total = Number(client?.montant_total_contrat || 0);
    const perHa = hectares > 0 ? total / hectares : total;
    const matchingFormula = formulas.find((formula: any) => {
      const configured = Number(formula.montant_total_par_ha ?? formula.montant_cash_par_ha);
      return Number.isFinite(configured) && configured > 0 && Math.abs(configured - perHa) < 0.01;
    });
    if (matchingFormula?.nom) return matchingFormula.nom;
    return "Formule à vérifier";
  }

  const name = formulaName || code || offer?.nom || "—";
  return /^essential$/i.test(name) ? "Offre 1.3" : name;
};

const Clients = () => {
  const location = useLocation();
  const acquisitionsView = location.pathname === "/acquisitions";
  const { can } = usePermissions();
  const { profile, userRoles } = useAuth();
  const serviceClient = (userRoles || []).some((role:string) => ["service_client","chef_equipe_service_client"].includes(role)) || String(profile?.poste || "").toLowerCase().includes("service client") || String(profile?.relation_rh || "").toLowerCase().includes("service client");
  const canEditClient = can("clients.update");
  const canDeleteClient = can("clients.delete") && !serviceClient;
  const [clients, setClients] = useState<any[]>([]);
  const [salesPendingValidation, setSalesPendingValidation] = useState(0);
  const [landownerCount, setLandownerCount] = useState(0);
  const [attributions, setAttributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"view" | "edit" | "new">("new");
  const [teamPerformance,setTeamPerformance]=useState<any[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [tableContentWidth, setTableContentWidth] = useState(1600);
  const { toast } = useToast();

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;
    const updateWidth = () => setTableContentWidth(container.scrollWidth);
    updateWidth();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateWidth) : null;
    observer?.observe(container);
    const table = container.querySelector("table");
    if (table) observer?.observe(table);
    return () => observer?.disconnect();
  }, [clients.length, loading]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // La liste principale ne dépend d'aucune relation imbriquée : une erreur
      // sur une table secondaire ne doit jamais transformer l'écran en « 0 ».
      const safeSearch = searchTerm.trim().replace(/[,%()]/g, " ");
      // Charger toutes les pages autorisées par la RLS : aucun plafond arbitraire à 50 clients.
      const baseClients: any[] = [];
      const CLIENT_PAGE_SIZE = 1000;
      let clientOffset = 0;
      while (true) {
        let clientsQuery = supabase
          .from("clients")
          .select("*")
          .or("is_internal.is.null,is_internal.eq.false")
          .not("nom_complet", "ilike", "%agricapital%")
          .or("type_client.is.null,type_client.neq.proprietaire_foncier");
        // Les bénéficiaires particuliers doivent également apparaître dans le tableau Acquisition.
        clientsQuery = clientsQuery
          .order("id_unique", { ascending: false })
          .range(clientOffset, clientOffset + CLIENT_PAGE_SIZE - 1);

        if (safeSearch) {
          clientsQuery = clientsQuery.or(
            `id_unique.ilike.%${safeSearch}%,nom_complet.ilike.%${safeSearch}%,telephone.ilike.%${safeSearch}%`
          );
        }

        const { data: pageClients, error: clientsError } = await clientsQuery;
        if (clientsError) throw clientsError;
        baseClients.push(...(pageClients || []));
        if (!pageClients || pageClients.length < CLIENT_PAGE_SIZE) break;
        clientOffset += CLIENT_PAGE_SIZE;
      }

      const ids = baseClients.map((c: any) => c.id);
      // Découper les identifiants en lots pour éviter des requêtes URL trop longues.
      const clientIdBatches: string[][] = [];
      for (let i = 0; i < ids.length; i += 250) clientIdBatches.push(ids.slice(i, i + 250));
      const [plantationBatches, attributionBatches, offresRes, regionsRes, teamPerfRes, pendingSalesRes, landownersRes] = await Promise.all([
        Promise.all(clientIdBatches.map((batch) =>
          supabase.from("plantations").select("id,client_id,superficie_ha,superficie_activee,surface_reellement_plantee,role_attribution").in("client_id", batch)
        )),
        Promise.all(clientIdBatches.map((batch) =>
          (supabase as any).from("beneficiaire_attributions").select("id,client_id,plantation_id,surface_attribuee_ha,role_attribution,statut").eq("statut", "active").in("client_id", batch)
        )),
        supabase.from("offres").select("id,nom,couleur,code,formules_configuration"),
        supabase.from("regions").select("id,nom"),
        (supabase as any).from("v_performance_equipes").select("id,nom,type_equipe,clients,hectares,interventions"),
        can("acquisitions.validate") ? (supabase as any).from("clients").select("id,validation_statut,metadata").in("validation_statut", ["a_valider", "modification_demandee"]) : Promise.resolve({ data: [] }),
        (supabase as any).from("proprietaires_terres").select("id", { count: "exact", head: true }),
      ]);

      setSalesPendingValidation((pendingSalesRes?.data || []).filter((client: any) => ["a_valider", "modification_demandee"].includes(String(client.validation_statut || ""))).length);
      if (!landownersRes.error) setLandownerCount(Number(landownersRes.count || 0));
      const plantations = plantationBatches.flatMap((result: any) => result.data || []);
      const attributionsData = attributionBatches.flatMap((result: any) => result.data || []);
      const offresMap = new Map((offresRes.data || []).map((o: any) => [o.id, o]));
      const regionsMap = new Map((regionsRes.data || []).map((r: any) => [r.id, r]));

      const enrichedData = (baseClients || []).map((client: any) => {
        const clientPlantations = plantations.filter((p: any) => p.client_id === client.id);
        const clientAttributions = attributionsData.filter((a: any) => a.client_id === client.id);
        const totalHectares = clientAttributions.length
          ? clientAttributions.reduce((sum: number, a: any) => sum + Number(a.surface_attribuee_ha || 0), 0)
          : clientPlantations.reduce((sum: number, p: any) => sum + Number(p.surface_reellement_plantee ?? p.superficie_activee ?? p.superficie_ha ?? 0), 0);

        return {
          ...client,
          offres: offresMap.get(client.offre_id) || null,
          regions: regionsMap.get(client.region_id) || null,
          plantations: clientPlantations,
          beneficiaire_attributions: clientAttributions,
          nombre_plantations: clientAttributions.length
            ? new Set(clientAttributions.map((a: any) => a.plantation_id).filter(Boolean)).size || clientAttributions.length
            : clientPlantations.length,
          total_hectares: totalHectares,
        };
      });

      setTeamPerformance(teamPerfRes.data||[]);
      setAttributions(attributionsData);
      // Exclure uniquement l'entité interne AgriCapital et les propriétaires fonciers.
      // Les bénéficiaires particuliers sont affichés aussi dans Acquisition.
      setClients(enrichedData.filter((client: any) =>
        !client.is_internal && !isAgriCapitalInternal(client) && String(client.type_client || "").toLowerCase() !== "proprietaire_foncier"
      ));
    } catch (error: any) {
      if (!navigator.onLine) {
        const [cachedClients, cachedPlantations] = await Promise.all([
          getCachedClients(),
          getCachedPlantations(),
        ]);
        const enrichedData = cachedClients
          .filter((client: any) => !client.is_internal && !isAgriCapitalInternal(client) && String(client.type_client || "").toLowerCase() !== "proprietaire_foncier")
          .sort((a: any, b: any) => String(b.id_unique || "").localeCompare(String(a.id_unique || ""), "en"))
          .map((s: any) => {
            const plantations = cachedPlantations.filter((p: any) => p.client_id === s.id);
            return {
              ...s,
              nombre_plantations: plantations.length,
              total_hectares: plantations.reduce((sum: number, p: any) => sum + Number(p.surface_reellement_plantee ?? p.superficie_activee ?? p.superficie_ha ?? 0), 0),
            };
          });
        setClients(enrichedData);
        toast({ title: "Mode hors ligne", description: "Données locales affichées. Les modifications seront synchronisées au retour du réseau." });
      } else {
        setClients([]);
        toast({
          variant: "destructive",
          title: "Acquisitions indisponibles",
          description: getSafeErrorMessage(error),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchData(); }, searchTerm ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [searchTerm, acquisitionsView]);

  useRealtime({ table: "clients", onChange: fetchData });
  useRealtime({ table: "plantations", onChange: fetchData });

  const filteredClients = clients.filter((s) =>
    s.id_unique?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.telephone?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!canEditClient) { toast({variant:"destructive",title:"Action non autorisée",description:"Le Service Client ne peut pas modifier le dossier client."}); return; }
    try {
      const client = clients.find(s => s.id === id);
      const { error } = await offlineUpdate("clients", id, { statut: newStatus, statut_global: newStatus });
      if (error) throw error;

      if (navigator.onLine) {
        await logActivity({
          tableName: 'clients',
          recordId: id,
          action: 'STATUS_CHANGE',
          details: `Statut changé de "${client?.statut}" à "${newStatus}"`,
          ancienValeurs: { statut: client?.statut },
          nouvellesValeurs: { statut: newStatus },
        });
      }

      toast({
        title: "Succès",
        description: `Statut mis à jour: ${newStatus}`,
      });
      fetchData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const handleDelete = async () => {
    if (!canDeleteClient || !clientToDelete) return;
    try {
      const { error } = await offlineDelete("clients", clientToDelete.id);
      if (error) throw error;

      toast({
        title: "Succès",
        description: "Dossier supprimé",
      });
      fetchData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setSelectedClient(null);
    fetchData();
  };

  const getStatutBadge = (statut: string) => {
    const colors: Record<string, string> = {
      actif: "bg-green-500",
      inactif: "bg-gray-500",
      suspendu: "bg-orange-500",
      archive: "bg-slate-500",
      radie: "bg-red-500",
    };
    return colors[statut] || "bg-gray-500";
  };

  const plantationIds = new Set<string>();
  clients.forEach((client: any) => (client.plantations || []).forEach((p: any) => plantationIds.add(p.id)));
  attributions.forEach((a: any) => { if (a.plantation_id) plantationIds.add(a.plantation_id); });
  // Les bénéficiaires particuliers restent visibles dans la table, mais ne gonflent aucun indicateur commercial.
  const commercialClients = clients.filter((c: any) => !["beneficiaire_particulier", "proprietaire_foncier"].includes(String(c.type_client || "").toLowerCase()));
  const clientsOfficiels = commercialClients.length;
  const commercialClientIds = new Set(commercialClients.map((c: any) => c.id));
  const beneficiaryCount = clients.filter((c: any) => String(c.type_client || "").toLowerCase() === "beneficiaire_particulier").length;
  // Un dossier sans ligne plantation est le seul considéré comme non planté; une plantation enregistrée à 0 ha reste à vérifier techniquement.
  const clientsNotYetPlanted = commercialClients.filter((c: any) => !(c.plantations || []).length).length;
  const commercialPlantationCount = new Set(
    commercialClients.flatMap((client: any) => (client.plantations || []).map((plantation: any) => plantation.id))
  ).size;

  const clientSurface = (client: any) => Number(client.total_hectares || client.superficie_ha || 0);
  const surfaceBands = [
    { key: "1", label: "1 ha", matches: (ha: number) => ha === 1 },
    { key: "2", label: "2 ha", matches: (ha: number) => ha === 2 },
    { key: "3", label: "3 ha", matches: (ha: number) => ha === 3 },
    { key: "5-10", label: "5–10 ha", matches: (ha: number) => ha >= 5 && ha < 10 },
    { key: "10-50", label: "10–50 ha", matches: (ha: number) => ha >= 10 && ha < 50 },
    { key: "50-100", label: "50–100 ha", matches: (ha: number) => ha >= 50 && ha < 100 },
    { key: "100+", label: "100+ ha", matches: (ha: number) => ha >= 100 },
  ];
  const surfaceCounts = surfaceBands.map((band) => ({
    ...band,
    count: commercialClients.filter((client: any) => band.matches(clientSurface(client))).length,
  }));
  const classifiedSurfaceClientIds = new Set(
    surfaceBands.flatMap((band) => commercialClients.filter((client: any) => band.matches(clientSurface(client))).map((client: any) => client.id))
  );
  const otherSurfaceCount = commercialClients.filter((client: any) => clientSurface(client) > 0 && !classifiedSurfaceClientIds.has(client.id)).length;

  const stats = {
    total: commercialClients.length,
    actifs: commercialClients.filter(s => s.statut === "actif" || s.statut_global === "actif").length,
    inactifs: commercialClients.filter(s => s.statut === "inactif" || s.statut === "suspendu" || s.statut === "archive").length,
    totalHectares: commercialClients.reduce((sum, s) => sum + Number(s.total_hectares || s.superficie_ha || 0), 0),
    plantations: commercialPlantationCount,
    clientsOfficiels,
    salesPendingValidation,
  };

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Acquisitions</h1>
              
            </div>
            <div className="flex w-full min-w-0 flex-row gap-2 sm:w-auto">
              {can("beneficiaires.create") && (
            <Link to="/beneficiaire-particulier">
                <Button variant="outline" className="h-auto min-h-10 w-full min-w-0 px-2 text-xs sm:w-auto sm:px-4 sm:text-sm">
                  <UserRound className="mr-1 h-4 w-4 shrink-0 sm:mr-2" />
                  Nouveau bénéficiaire
                </Button>
              </Link>
            )}
              {can("clients.create") && (
                <Link to="/nouvelle-acquisition">
                  <Button className="h-auto min-h-10 w-full min-w-0 px-2 text-xs sm:w-auto sm:px-4 sm:text-sm bg-primary hover:bg-primary-hover">
                    <FileText className="mr-1 h-4 w-4 shrink-0 sm:mr-2" />
                    Nouveau Client
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Dossiers</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{stats.total}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Clients commerciaux</p></CardContent></Card>
            {can("acquisitions.validate") && <Card className="h-full min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-semibold leading-tight">Ventes à valider</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{stats.salesPendingValidation}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Dossiers en attente</p></CardContent></Card>}
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Actifs</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{stats.actifs}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Statut actif</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Inactifs / suspendus</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{stats.inactifs}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Statuts inactifs</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Superficie totale</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight whitespace-nowrap">{formatHectares(stats.totalHectares)} ha</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Sans double comptage</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Clients officiels</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{stats.clientsOfficiels}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Dossiers commerciaux</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Plantations</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{stats.plantations}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Actifs agricoles</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Bénéficiaires</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{beneficiaryCount}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Personnes bénéficiaires</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Propriétaires fonciers</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{landownerCount}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Registre foncier</p></CardContent></Card>
            <Card className="min-w-0"><CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Clients non plantés</CardTitle></CardHeader><CardContent className="p-3 pt-0"><div className="text-xl font-bold leading-tight">{clientsNotYetPlanted}</div><p className="mt-1 text-[10px] leading-tight text-muted-foreground">Aucune plantation enregistrée</p></CardContent></Card>
          </div>



          {teamPerformance.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Performance par équipe</CardTitle></CardHeader>
              <CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {teamPerformance.map((team:any)=>{ const tech=String(team.type_equipe||"").toLowerCase().includes("technique"); return <div key={team.id} className="rounded-xl border p-3 flex items-center justify-between gap-3"><div><p className="font-semibold">{team.nom}</p><p className="text-xs text-muted-foreground">{tech?"Équipe technique":"Équipe commerciale"}</p></div><div className="text-right"><p className="font-bold">{tech?team.interventions:team.clients}</p><p className="text-xs text-muted-foreground">{tech?"interventions":Math.round(Number(team.hectares||0)).toLocaleString("fr-FR")+" ha"}</p></div></div>; })}
              </div></CardContent>
            </Card>
          )}

          <Tabs defaultValue="table" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par ID, nom, téléphone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <TabsList>
                <TabsTrigger value="table" className="gap-1.5">
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Liste</span>
                </TabsTrigger>
                <TabsTrigger value="kanban" className="gap-1.5">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Pipeline</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="kanban">
              <KanbanPipeline clients={filteredClients} onRefresh={fetchData} />
            </TabsContent>

            <TabsContent value="table">
              <div className="space-y-1">
                <div ref={topScrollRef} className="h-4 overflow-x-auto overflow-y-hidden rounded-md border bg-muted/30" aria-label="Défilement horizontal du tableau" onScroll={(event) => { if (tableScrollRef.current) tableScrollRef.current.scrollLeft = event.currentTarget.scrollLeft; }}>
                  <div style={{ width: tableContentWidth, height: 1 }} />
                </div>
                <div ref={tableScrollRef} className="border rounded-lg overflow-x-auto" onScroll={(event) => { if (topScrollRef.current) topScrollRef.current.scrollLeft = event.currentTarget.scrollLeft; }}>
                <Table className="responsive-data-table min-w-[1500px] text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap px-2 py-2">ID client</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Nom complet</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Téléphone</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Type / rôle</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Offre</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Plantations</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Hectares</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Statut</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Date</TableHead>
                      <TableHead className="whitespace-nowrap px-2 py-2">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          Chargement...
                        </TableCell>
                      </TableRow>
                    ) : filteredClients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          Aucun dossier trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredClients.map((client) => (
                        <TableRow key={client.id} role="button" tabIndex={0} aria-label={`Ouvrir la fiche client ${client.nom_complet || client.id_unique || ""}`} onClick={() => { setSelectedClient(client); setFormMode("view"); setIsFormOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedClient(client); setFormMode("view"); setIsFormOpen(true); } }} className="cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>td]:px-2 [&>td]:py-1">
                          <TableCell className="font-mono text-[11px] font-medium whitespace-nowrap">
                            {client.id_unique}
                          </TableCell>
                          <TableCell className="font-medium text-xs whitespace-nowrap">
                            {client.nom_complet || [client.nom, client.prenoms].filter(Boolean).join(" ")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs" onClick={(event) => event.stopPropagation()}><ContactLauncher phone={client.telephone} whatsapp={client.whatsapp} email={client.email} name={client.nom_complet || client.id_unique || "Client"} kind="client" status={client.statut || client.status || ""}/></TableCell>
                          <TableCell>
                            {client.type_client === "beneficiaire_particulier" ? (
                              <Badge variant="secondary" className="whitespace-nowrap">B. particulier</Badge>
                            ) : (
                              <Badge variant="outline" className="whitespace-nowrap">Client officiel</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.type_client === "beneficiaire_particulier" ? (
                              <span className="text-muted-foreground whitespace-nowrap">{client.formule_nom || "Actif agricole"}</span>
                            ) : client.offres ? (
                              <Badge className="whitespace-nowrap" style={{ backgroundColor: client.offres.couleur }}>{getOfferDisplayName(client)}</Badge>
                            ) : client.formule_nom ? (
                              <Badge variant="outline" className="whitespace-nowrap">{getOfferDisplayName(client)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="outline">
                              {client.nombre_plantations || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatHectares(client.total_hectares)} ha</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className={getStatutBadge(client.statut || client.statut_global) + " whitespace-nowrap"}>
                              {client.statut || client.statut_global || 'actif'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(client.created_at), "dd MMM yyyy", { locale: fr })}
                          </TableCell>
                          <TableCell className="whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" title="Fiche client" aria-label="Fiche client" onClick={() => { setSelectedClient(client); setFormMode("view"); setIsFormOpen(true); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canEditClient && <DropdownMenuItem onClick={() => { setSelectedClient(client); setFormMode("edit"); setIsFormOpen(true); }}><Edit className="mr-2 h-4 w-4" />Modifier</DropdownMenuItem>}
                                  {canEditClient && <DropdownMenuSeparator />}
                                  {canEditClient && client.statut !== 'actif' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(client.id, 'actif')}>
                                      <RotateCcw className="mr-2 h-4 w-4 text-green-500" />
                                      Activer
                                    </DropdownMenuItem>
                                  )}
                                  {canEditClient && client.statut !== 'suspendu' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(client.id, 'suspendu')}>
                                      <Ban className="mr-2 h-4 w-4 text-orange-500" />
                                      Suspendre
                                    </DropdownMenuItem>
                                  )}
                                  {canEditClient && client.statut !== 'archive' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(client.id, 'archive')}>
                                      <Archive className="mr-2 h-4 w-4 text-slate-500" />
                                      Archiver
                                    </DropdownMenuItem>
                                  )}
                                  {canDeleteClient && <DropdownMenuSeparator />}
                                  {canDeleteClient && <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => {
                                      setClientToDelete(client);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Supprimer
                                  </DropdownMenuItem>}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialog de modification */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {formMode === "edit" ? "Modification client" : "Nouveau Client"}
              </DialogTitle>
            </DialogHeader>
            <ClientForm
              client={selectedClient}
              readOnly={formMode === "view"}
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setIsFormOpen(false);
                setSelectedClient(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmation de suppression */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le client "{clientToDelete?.nom_complet || clientToDelete?.nom}"? 
                Cette action est irréversible et supprimera également toutes les plantations associées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Clients;