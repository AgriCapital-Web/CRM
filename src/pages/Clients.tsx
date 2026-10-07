import { useState, useEffect } from "react";
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
import { Link } from "react-router-dom";
import ClientForm from "@/components/forms/ClientForm";
import KanbanPipeline from "@/components/acquisitions/KanbanPipeline";
import { getSafeErrorMessage } from "@/lib/safeError";
import { usePermissions } from "@/hooks/usePermissions";

const Clients = () => {
  const { can } = usePermissions();
  const [clients, setClients] = useState<any[]>([]);
  const [attributions, setAttributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [teamPerformance,setTeamPerformance]=useState<any[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      // La liste principale ne dépend d'aucune relation imbriquée : une erreur
      // sur une table secondaire ne doit jamais transformer l'écran en « 0 ».
      const safeSearch = searchTerm.trim().replace(/[,%()]/g, " ");
      let clientsQuery = supabase
        .from("clients")
        .select("*")
        .order("numero_ordre_global", { ascending: true, nullsFirst: false })
        .limit(50);

      if (safeSearch) {
        clientsQuery = clientsQuery.or(
          `id_unique.ilike.%${safeSearch}%,nom_complet.ilike.%${safeSearch}%,telephone.ilike.%${safeSearch}%`
        );
      }

      const { data: baseClients, error: clientsError } = await clientsQuery;

      if (clientsError) throw clientsError;

      const ids = (baseClients || []).map((c: any) => c.id);
      const [plantationsRes, attributionsRes, offresRes, regionsRes, teamPerfRes] = await Promise.all([
        supabase.from("plantations").select("id,client_id,superficie_ha,superficie_activee,surface_reellement_plantee,role_attribution").in("client_id", ids),
        (supabase as any).from("beneficiaire_attributions").select("id,client_id,plantation_id,surface_attribuee_ha,role_attribution,statut").eq("statut", "active").in("client_id", ids),
        supabase.from("offres").select("id,nom,couleur"),
        supabase.from("regions").select("id,nom"),
        (supabase as any).from("v_performance_equipes").select("id,nom,type_equipe,clients,hectares,interventions"),
      ]);

      const plantations = plantationsRes.data || [];
      const attributionsData = attributionsRes.data || [];
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
      setClients(enrichedData);
    } catch (error: any) {
      if (!navigator.onLine) {
        const [cachedClients, cachedPlantations] = await Promise.all([
          getCachedClients(),
          getCachedPlantations(),
        ]);
        const enrichedData = cachedClients
          .sort((a: any, b: any) => Number(a.numero_ordre_global || 999999) - Number(b.numero_ordre_global || 999999))
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
  }, [searchTerm]);

  useRealtime({ table: "clients", onChange: fetchData });
  useRealtime({ table: "plantations", onChange: fetchData });

  const filteredClients = clients.filter((s) =>
    s.id_unique?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.telephone?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const handleStatusChange = async (id: string, newStatus: string) => {
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
    if (!clientToDelete) return;
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
  const clientsOfficiels = clients.filter((c: any) => c.type_client !== "beneficiaire_particulier").length;
  const beneficiaires = clients.filter((c: any) => c.type_client === "beneficiaire_particulier").length;

  const stats = {
    total: clients.length,
    actifs: clients.filter(s => s.statut === "actif" || s.statut_global === "actif").length,
    inactifs: clients.filter(s => s.statut === "inactif" || s.statut === "suspendu" || s.statut === "archive").length,
    totalHectares: clients.reduce((sum, s) => sum + Number(s.total_hectares || 0), 0),
    plantations: plantationIds.size,
    clientsOfficiels,
    beneficiaires,
  };

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Acquisitions</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Registre des personnes et dossiers agricoles
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {can("beneficiaires.create") && (
            <Link to="/beneficiaire-particulier">
                <Button variant="outline" className="w-full sm:w-auto">
                  <UserRound className="mr-2 h-4 w-4" />
                  Nouveau bénéficiaire
                </Button>
              </Link>
            )}
              {can("clients.create") && (
                <Link to="/nouvelle-acquisition">
                  <Button className="bg-primary hover:bg-primary-hover w-full sm:w-auto">
                    <FileText className="mr-2 h-4 w-4" />
                    Nouveau Client
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Personnes / dossiers
                </CardTitle>
                <FileText className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground mt-1">{stats.clientsOfficiels} Client(s) · {stats.beneficiaires} bénéficiaire(s)</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Actifs
                </CardTitle>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.actifs}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Inactifs/Suspendus
                </CardTitle>
                <Clock className="h-5 w-5 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.inactifs}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Hectares
                </CardTitle>
                <FileText className="h-5 w-5 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalHectares.toFixed(2)} ha</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary"/>Clients officiels</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.clientsOfficiels}</div><p className="text-xs text-muted-foreground">dossiers commerciaux</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UserRound className="h-4 w-4 text-primary"/>Bénéficiaires particuliers</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.beneficiaires}</div><p className="text-xs text-muted-foreground">personnes rattachées</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sprout className="h-4 w-4 text-primary"/>Plantations</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.plantations}</div><p className="text-xs text-muted-foreground">actifs agricoles distincts</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><LandPlot className="h-4 w-4 text-primary"/>Superficie rattachée</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalHectares.toFixed(2)} ha</div><p className="text-xs text-muted-foreground">toutes personnes confondues</p></CardContent></Card>
          </div>

          {teamPerformance.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Performance par équipe</CardTitle></CardHeader>
              <CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {teamPerformance.map((team:any)=>{ const tech=String(team.type_equipe||"").toLowerCase().includes("technique"); return <div key={team.id} className="rounded-xl border p-3 flex items-center justify-between gap-3"><div><p className="font-semibold">{team.nom}</p><p className="text-xs text-muted-foreground">{tech?"Équipe technique":"Équipe commerciale"}</p></div><div className="text-right"><p className="font-bold">{tech?team.interventions:team.clients}</p><p className="text-xs text-muted-foreground">{tech?"interventions":Number(team.hectares||0).toFixed(1)+" ha"}</p></div></div>; })}
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
              <div className="border rounded-lg overflow-x-auto">
                <Table className="responsive-data-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Unique</TableHead>
                      <TableHead>Nom Complet</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Type / rôle</TableHead>
                      <TableHead>Offre</TableHead>
                      <TableHead>Plantations</TableHead>
                      <TableHead>Hectares</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
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
                        <TableRow key={client.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {client.id_unique}
                          </TableCell>
                          <TableCell className="font-medium">
                            {client.nom_complet || `${client.nom} ${client.prenoms || ''}`}
                          </TableCell>
                          <TableCell>{client.telephone}</TableCell>
                          <TableCell>
                            {client.type_client === "beneficiaire_particulier" ? (
                              <Badge variant="secondary">Bénéficiaire particulier</Badge>
                            ) : (
                              <Badge variant="outline">Client officiel</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.type_client === "beneficiaire_particulier" ? (
                              <span className="text-muted-foreground">{client.formule_nom || "Actif agricole"}</span>
                            ) : client.offres ? (
                              <Badge style={{ backgroundColor: client.offres.couleur }}>
                                {client.offres.nom}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {client.nombre_plantations || 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {Number(client.total_hectares || 0).toFixed(2)} ha
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatutBadge(client.statut || client.statut_global)}>
                              {client.statut || client.statut_global || 'actif'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(client.created_at), "dd MMM yyyy", { locale: fr })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Link to={`/acquisitions/${client.id}`}>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedClient(client);
                                    setIsFormOpen(true);
                                  }}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Modifier
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {client.statut !== 'actif' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(client.id, 'actif')}>
                                      <RotateCcw className="mr-2 h-4 w-4 text-green-500" />
                                      Activer
                                    </DropdownMenuItem>
                                  )}
                                  {client.statut !== 'suspendu' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(client.id, 'suspendu')}>
                                      <Ban className="mr-2 h-4 w-4 text-orange-500" />
                                      Suspendre
                                    </DropdownMenuItem>
                                  )}
                                  {client.statut !== 'archive' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(client.id, 'archive')}>
                                      <Archive className="mr-2 h-4 w-4 text-slate-500" />
                                      Archiver
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => {
                                      setClientToDelete(client);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Supprimer
                                  </DropdownMenuItem>
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
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialog de modification */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedClient ? "Modifier" : "Nouveau"} Client
              </DialogTitle>
            </DialogHeader>
            <ClientForm
              client={selectedClient}
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