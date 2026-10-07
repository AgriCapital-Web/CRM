import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { formatUserShortName } from "@/lib/utils";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, FileDown } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/lib/safeError";

const HistoriqueComplet = () => {
  const { id } = useParams();
  const [historique, setHistorique] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("tous");
  const { toast } = useToast();

  useEffect(() => {
    fetchHistorique();
  }, [id]);

  const fetchHistorique = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("historique_actions")
        .select(`
          *,
          user:profiles!historique_actions_user_id_fkey(nom_complet)
        `)
        .eq("client_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistorique(data || []);
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

  const filteredHistorique = historique.filter((h) => {
    const matchesSearch = h.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.user?.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "tous" || h.type_action === filterType;
    return matchesSearch && matchesType;
  });

  const exportToPDF = () => {
    toast({
      title: "Export PDF",
      description: "Fonctionnalité en cours de développement",
    });
  };

  const exportToExcel = () => {
    toast({
      title: "Export Excel",
      description: "Fonctionnalité en cours de développement",
    });
  };

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Historique Complet</h1>
            <p className="text-muted-foreground mt-1">
              Toutes les actions effectuées sur ce client
            </p>
          </div>

          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Type d'action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les types</SelectItem>
                <SelectItem value="creation">Création</SelectItem>
                <SelectItem value="modification">Modification</SelectItem>
                <SelectItem value="suppression">Suppression</SelectItem>
                <SelectItem value="paiement">Paiement</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportToPDF} variant="outline">
              <FileDown className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button onClick={exportToExcel} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Heure</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Type d'action</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredHistorique.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      Aucune action trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHistorique.map((action) => (
                    <TableRow key={action.id}>
                      <TableCell>
                        {format(new Date(action.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                      </TableCell>
                      <TableCell>{formatUserShortName(action.user?.nom_complet || "Système")}</TableCell>
                      <TableCell>
                        <span className="capitalize">{action.type_action}</span>
                      </TableCell>
                      <TableCell>{action.description}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default HistoriqueComplet;
