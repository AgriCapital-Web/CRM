import { useState, useEffect } from "react";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { offlineUpdate, offlineDelete } from "@/lib/offlineWrite";
import { getCachedPlantations } from "@/lib/offlineDb";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, MoreVertical, Archive, Ban, Trash2, RotateCcw, Eye, ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSafeErrorMessage } from "@/lib/safeError";

const Plantations = () => {
  const [searchParams] = useSearchParams();
  const statutFilter = searchParams.get("statut");
  const [plantations, setPlantations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const pageSize = useResponsivePageSize();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [plantationToDelete, setPlantationToDelete] = useState<any>(null);
  const { toast } = useToast();

  const fetchPlantations = async () => {
    try {
      const { data, error } = await supabase
        .from("plantations")
        .select(`
          *,
          clients (nom, prenoms, nom_complet, id, id_unique),
          parcelles (id_unique, nom, village),
          lots_hectares (id, reference, numero_h, surface_ha, client_id, parcelle_id),
          regions (nom),
          departements (nom)
        `)
        .order("id_unique", { ascending: true });

      if (error) throw error;
      setPlantations(data || []);
    } catch (error: any) {
      if (!navigator.onLine) {
        const cached = await getCachedPlantations();
        setPlantations(cached);
        toast({ title: "Mode hors ligne", description: "Plantations locales affichées. Les modifications seront synchronisées au retour du réseau." });
      } else {
        toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlantations(); }, []);
  useRealtime({ table: "plantations", onChange: fetchPlantations });

  const statusMatches = (p: any) => !statutFilter || (p.statut_global || p.statut) === statutFilter;
  const filteredPlantations = plantations.filter((p) =>
    statusMatches(p) && (
      p.id_unique?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nom_plantation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.clients?.nom_complet || (p.clients?.nom + ' ' + p.clients?.prenoms))?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const visiblePlantations = plantations.filter(statusMatches);
  const nombreTotal = visiblePlantations.length;
  const superficieTotale = visiblePlantations.reduce((sum, p) => sum + (Number(p.superficie_ha) || 0), 0);
  const superficiePlantee = visiblePlantations.reduce((sum, p) => {
    const declared = Number(p.superficie_ha) || 0;
    const real = Number(p.surface_reellement_plantee);
    const plantedFromPlants = Number(p.nombre_plants_mis_en_terre) > 0 ? declared : 0;
    return sum + (Number.isFinite(real) && real > 0 ? real : plantedFromPlants);
  }, 0);
  const superficieEnProduction = visiblePlantations.filter(p => p.statut_global === "en_production" || p.statut === "en_production").reduce((sum, p) => sum + (Number(p.superficie_ha) || 0), 0);
  const nombreEnProduction = visiblePlantations.filter(p => p.statut_global === "en_production" || p.statut === "en_production").length;

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await offlineUpdate("plantations", id, { statut: newStatus, statut_global: newStatus });
      if (error) throw error;
      toast({ title: "Succès", description: `Statut mis à jour: ${newStatus}` });
      fetchPlantations();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const handleDelete = async () => {
    if (!plantationToDelete) return;
    try {
      const { error } = await offlineDelete("plantations", plantationToDelete.id);
      if (error) throw error;
      toast({ title: "Succès", description: "Plantation supprimée" });
      fetchPlantations();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setDeleteDialogOpen(false);
      setPlantationToDelete(null);
    }
  };

  const formatStatut = (statut: string) => statut === "active" ? "Actif" : (statut || "—").replace(/_/g, " ");

  const getStatutBadge = (statut: string) => {
    const colors: Record<string, string> = {
      en_attente_da: "bg-yellow-100 text-yellow-800",
      da_valide: "bg-blue-100 text-blue-800",
      en_cours: "bg-purple-100 text-purple-800",
      en_production: "bg-green-100 text-green-800",
      actif: "bg-green-100 text-green-800",
      suspendu: "bg-orange-100 text-orange-800",
      archive: "bg-slate-100 text-slate-800",
    };
    return colors[statut] || "bg-gray-100 text-gray-800";
  };

  const productionOnly = statutFilter === "en_production";

  const paginatedPlantations = filteredPlantations.slice((tablePage - 1) * pageSize, tablePage * pageSize);
  useEffect(() => setTablePage(1), [searchTerm, pageSize]);

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}>
      <MainLayout>
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3">
            {productionOnly && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />Tableau de bord</Link>
              </Button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
                {productionOnly ? "Plantations en production" : "Registre des Plantations"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {productionOnly ? "Plantations actuellement en phase de production." : "Suivi des plantations enregistrées."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Nombre</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{nombreTotal}</div><p className="text-xs text-muted-foreground mt-1">plantation(s)</p></CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Superficie</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{superficieTotale.toFixed(1)} ha</div><p className="text-xs text-muted-foreground mt-1">rattachée</p></CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Superficie plantée</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{superficiePlantee.toFixed(1)} ha</div><p className="text-xs text-muted-foreground mt-1">{superficieTotale > 0 ? `${((superficiePlantee / superficieTotale) * 100).toFixed(0)}%` : "0%"} du total</p></CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">En production</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{nombreEnProduction}</div><p className="text-xs text-muted-foreground mt-1">{superficieEnProduction.toFixed(1)} ha</p></CardContent></Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, ID ou client..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table className="responsive-data-table">
              <TableHeader><TableRow>
                <TableHead>ID Unique</TableHead><TableHead>Nom</TableHead><TableHead>Client / dossier</TableHead><TableHead>Parcelle</TableHead><TableHead>Lot</TableHead><TableHead>Superficie</TableHead><TableHead>Région</TableHead><TableHead>Statut</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">Chargement...</TableCell></TableRow>
                : filteredPlantations.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8">Aucune plantation trouvée</TableCell></TableRow>
                : paginatedPlantations.map((plantation) => (
                  <TableRow key={plantation.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-sm font-medium">
                      <Link to={`/plantations/${plantation.id}`} className="text-primary hover:underline">{plantation.id_unique}</Link>
                    </TableCell>
                    <TableCell className="font-medium"><Link to={`/plantations/${plantation.id}`} className="hover:underline">{plantation.nom_plantation || plantation.nom}</Link></TableCell>
                    <TableCell>
                      {plantation.clients ? (
                        <Link to={`/acquisitions/${plantation.clients.id}`} className="hover:underline">
                          {plantation.clients.nom_complet || `${plantation.clients.nom || ""} ${plantation.clients.prenoms || ""}`}
                          <span className="block text-xs text-muted-foreground">{plantation.clients.id_unique}</span>
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{plantation.parcelles?.id_unique || plantation.parcelles?.nom || "—"}</TableCell>
                    <TableCell>{plantation.lots_hectares?.reference || (plantation.lots_hectares?.numero_h ? `H${String(plantation.lots_hectares.numero_h).padStart(2,"0")}` : "—")}</TableCell>
                    <TableCell><span className="font-semibold">{Number(plantation.surface_reellement_plantee ?? plantation.superficie_activee ?? plantation.superficie_ha ?? 0).toFixed(2)}</span> ha</TableCell>
                    <TableCell><div className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" /><span className="text-sm">{plantation.regions?.nom || "-"}</span></div></TableCell>
                    <TableCell><Badge className={getStatutBadge(plantation.statut_global || plantation.statut)}>{formatStatut(plantation.statut_global || plantation.statut || "actif")}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" asChild><Link to={`/plantations/${plantation.id}`} title="Voir la fiche"><Eye className="h-4 w-4" /></Link></Button>
                        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(plantation.statut_global || plantation.statut) !== "en_production" && <DropdownMenuItem onClick={() => handleStatusChange(plantation.id, "en_production")}><RotateCcw className="mr-2 h-4 w-4 text-green-500" />En production</DropdownMenuItem>}
                            {(plantation.statut_global || plantation.statut) !== "en_cours" && <DropdownMenuItem onClick={() => handleStatusChange(plantation.id, "en_cours")}><RotateCcw className="mr-2 h-4 w-4 text-purple-500" />En cours</DropdownMenuItem>}
                            {(plantation.statut_global || plantation.statut) !== "suspendu" && <DropdownMenuItem onClick={() => handleStatusChange(plantation.id, "suspendu")}><Ban className="mr-2 h-4 w-4 text-orange-500" />Suspendre</DropdownMenuItem>}
                            {(plantation.statut_global || plantation.statut) !== "archive" && <DropdownMenuItem onClick={() => handleStatusChange(plantation.id, "archive")}><Archive className="mr-2 h-4 w-4 text-slate-500" />Archiver</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => { setPlantationToDelete(plantation); setDeleteDialogOpen(true); }}><Trash2 className="mr-2 h-4 w-4" />Supprimer</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ResponsiveTablePagination page={tablePage} pageSize={pageSize} total={filteredPlantations.length} onPageChange={setTablePage} />
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Confirmer la suppression</AlertDialogTitle><AlertDialogDescription>Êtes-vous sûr de vouloir supprimer la plantation "{plantationToDelete?.nom_plantation || plantationToDelete?.nom}" ? Cette action est irréversible.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Plantations;
