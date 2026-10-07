import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Sprout, CreditCard, TrendingUp, MapPin, Target, Wrench, DollarSign } from "lucide-react";

interface ZoneStats {
  totalClients: number;
  totalPlantations: number;
  totalHectares: number;
  totalPaiements: number;
  paiementsEnAttente: number;
  plantationsEnProduction: number;
  equipes: number;
  zoneName: string;
}

export const RoleDashboard = () => {
  const { userRoles, user } = useAuth();
  const [stats, setStats] = useState<ZoneStats>({
    totalClients: 0, totalPlantations: 0, totalHectares: 0,
    totalPaiements: 0, paiementsEnAttente: 0, plantationsEnProduction: 0,
    equipes: 0, zoneName: "",
  });
  const [loading, setLoading] = useState(true);

  const isAdmin = userRoles.some(r => ["pdg", "dg", "responsable_operations"].includes(r));
  const isResponsableCommercial = userRoles.includes("responsable_commercial");
  const isChefEquipe = userRoles.some(r => ["chef_equipe_commercial", "chef_equipe_technique", "chef_equipe_service_client"].includes(r));
  const isCommercial = userRoles.includes("commercial");
  const isTechnique = userRoles.includes("chef_equipe_technique");

  useEffect(() => {
    if (!user) return;
    fetchZoneStats();
  }, [user, userRoles]);

  const fetchZoneStats = async () => {
    try {
      if (isAdmin) {
        const [{ count: sc }, { data: pl }, { data: pa }, { count: eq }] = await Promise.all([
          (supabase as any).from("clients").select("*", { count: "exact", head: true }),
          (supabase as any).from("plantations").select("superficie_ha, statut_global"),
          (supabase as any).from("paiements").select("montant, statut"),
          (supabase as any).from("equipes").select("*", { count: "exact", head: true }),
        ]);

        setStats({
          totalClients: sc || 0,
          totalPlantations: pl?.length || 0,
          totalHectares: pl?.reduce((s: number, p: any) => s + (p.superficie_ha || 0), 0) || 0,
          totalPaiements: pa?.filter((p: any) => p.statut === "valide").reduce((s: number, p: any) => s + (p.montant || 0), 0) || 0,
          paiementsEnAttente: pa?.filter((p: any) => p.statut === "en_attente").length || 0,
          plantationsEnProduction: pl?.filter((p: any) => p.statut_global === "en_production").length || 0,
          equipes: eq || 0,
          zoneName: "Vue globale — Toutes les zones",
        });
      } else if (isResponsableCommercial || isChefEquipe || isCommercial || isTechnique) {
        const { data: zones } = await (supabase as any)
          .from("zone_assignments").select("zone_id, zone_type").eq("user_id", user!.id);

        if (!zones || zones.length === 0) {
          setStats({ totalClients: 0, totalPlantations: 0, totalHectares: 0,
            totalPaiements: 0, paiementsEnAttente: 0, plantationsEnProduction: 0,
            equipes: 0, zoneName: "Aucune zone assignée" });
          setLoading(false);
          return;
        }

        const zoneIds = zones.map((z: any) => z.zone_id);
        const zoneType = zones[0]?.zone_type;

        let zoneName = "";
        const tableMap: Record<string, string> = { district: "districts", region: "regions", departement: "departements", sous_prefecture: "sous_prefectures" };
        const table = tableMap[zoneType];
        if (table) {
          const { data: zoneData } = await (supabase as any).from(table).select("nom").in("id", zoneIds);
          zoneName = zoneData?.map((z: any) => z.nom).join(", ") || "";
        }

        const colMap: Record<string, string> = { district: "district_id", region: "region_id", departement: "departement_id", sous_prefecture: "sous_prefecture_id" };
        const col = colMap[zoneType] || "district_id";

        const [{ data: clients }, { data: plantations }] = await Promise.all([
          (supabase as any).from("clients").select("id").in(col, zoneIds),
          (supabase as any).from("plantations").select("id,superficie_ha, statut_global").in(col, zoneIds),
        ]);
        const plantationIds=(plantations||[]).map((p:any)=>p.id);
        const { data: paiements } = plantationIds.length
          ? await (supabase as any).from("paiements").select("montant, statut").in("plantation_id", plantationIds)
          : { data: [] };

        setStats({
          totalClients: clients?.length || 0,
          totalPlantations: plantations?.length || 0,
          totalHectares: plantations?.reduce((s: number, p: any) => s + (p.superficie_ha || 0), 0) || 0,
          totalPaiements: paiements?.filter((p: any) => p.statut === "valide").reduce((s: number, p: any) => s + (p.montant || 0), 0) || 0,
          paiementsEnAttente: paiements?.filter((p: any) => p.statut === "en_attente").length || 0,
          plantationsEnProduction: plantations?.filter((p: any) => p.statut_global === "en_production").length || 0,
          equipes: 0,
          zoneName,
        });
      }
    } catch (error) {
      console.error("Error fetching zone stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatMontant = (m: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(m);

  if (loading) return null;

  const roleLabel = isAdmin ? "Administrateur" : isResponsableCommercial ? "Responsable Commercial" : isChefEquipe ? "Chef d'Équipe" : isTechnique ? "Technique" : "Commercial";
  const zoneLevel = isAdmin ? "Global" : isResponsableCommercial ? "Régions" : isChefEquipe ? "Départements" : "Sous-préfectures";

  const showCommercialKPIs = isCommercial || isResponsableCommercial;
  const showTechKPIs = isTechnique || isResponsableCommercial;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Target className="h-4 w-4 text-primary" />
          Périmètre — {roleLabel}
          <Badge variant="outline" className="ml-auto text-xs">{zoneLevel}</Badge>
        </CardTitle>
        {stats.zoneName && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {stats.zoneName}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-3">
          {showCommercialKPIs && (
            <>
              <div className="text-center p-2 bg-background rounded-lg">
                <Users className="h-4 w-4 mx-auto text-primary mb-1" />
                <div className="text-lg font-bold">{stats.totalClients}</div>
                <div className="text-xs text-muted-foreground">Clients de ma zone</div>
              </div>
              <div className="text-center p-2 bg-background rounded-lg">
                <DollarSign className="h-4 w-4 mx-auto text-amber-600 mb-1" />
                <div className="text-sm font-bold">{formatMontant(stats.totalPaiements)}</div>
                <div className="text-xs text-muted-foreground">Encaissés — zone</div>
              </div>
            </>
          )}
          {showTechKPIs && (
            <>
              <div className="text-center p-2 bg-background rounded-lg">
                <Sprout className="h-4 w-4 mx-auto text-green-600 mb-1" />
                <div className="text-lg font-bold">{stats.totalPlantations}</div>
                <div className="text-xs text-muted-foreground">Plantations — zone</div>
              </div>
              <div className="text-center p-2 bg-background rounded-lg">
                <TrendingUp className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                <div className="text-lg font-bold">{stats.totalHectares.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Hectares — zone</div>
              </div>
            </>
          )}
          {!showCommercialKPIs && !showTechKPIs && (
            <>
              <div className="text-center p-2 bg-background rounded-lg">
                <Users className="h-4 w-4 mx-auto text-primary mb-1" />
                <div className="text-lg font-bold">{stats.totalClients}</div>
                <div className="text-xs text-muted-foreground">Clients</div>
              </div>
              <div className="text-center p-2 bg-background rounded-lg">
                <Sprout className="h-4 w-4 mx-auto text-green-600 mb-1" />
                <div className="text-lg font-bold">{stats.totalPlantations}</div>
                <div className="text-xs text-muted-foreground">Plantations</div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
