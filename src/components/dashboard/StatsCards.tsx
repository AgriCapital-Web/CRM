import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Sprout, TrendingUp, CreditCard, AlertCircle } from "lucide-react";

interface StatsCardsProps {
  stats: {
    totalPlanteurs: number;
    totalPlantations: number;
    totalSuperficie: number;
    totalPaiements: number;
    paiementsEnAttente: number;
    plantationsEnProduction: number;
    evolutionPlanteurs: number;
    tauxProduction: number;
  };
  formatMontant: (m: number) => string;
}

export const StatsCards = ({ stats, formatMontant }: StatsCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="hover-scale cursor-pointer transition-all hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Planteurs Inscrits
          </CardTitle>
          <Users className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.totalPlanteurs}</div>
          {stats.evolutionPlanteurs > 0 && (
            <div className="flex items-center gap-1 mt-2 text-green-600">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">+{stats.evolutionPlanteurs}% ce mois</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="hover-scale cursor-pointer transition-all hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Plantations
          </CardTitle>
          <Sprout className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.totalPlantations}</div>
          <p className="text-sm text-muted-foreground mt-2">
            {stats.totalSuperficie.toFixed(1)} hectares au total
          </p>
        </CardContent>
      </Card>

      <Card className="hover-scale cursor-pointer transition-all hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            En Production
          </CardTitle>
          <TrendingUp className="h-5 w-5 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{stats.plantationsEnProduction}</div>
          <p className="text-sm text-muted-foreground mt-2">
            {stats.tauxProduction}% du total
          </p>
        </CardContent>
      </Card>

      <Card className="hover-scale cursor-pointer transition-all hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Paiements
          </CardTitle>
          <CreditCard className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatMontant(stats.totalPaiements)}</div>
          {stats.paiementsEnAttente > 0 && (
            <p className="text-sm text-orange-600 mt-2 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {stats.paiementsEnAttente} en attente
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
