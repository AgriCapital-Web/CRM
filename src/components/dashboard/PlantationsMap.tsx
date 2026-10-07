import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Loader2 } from "lucide-react";

const InteractiveMap = lazy(() => import("@/components/maps/InteractiveMap"));

interface PlantationMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  info: string;
}

export const PlantationsMap = () => {
  const [markers, setMarkers] = useState<PlantationMarker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlantations();
  }, []);

  const fetchPlantations = async () => {
    const num = (...values: any[]) => {
      for (const v of values) {
        if (v === null || v === undefined || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0) return n;
      }
      return NaN;
    };
    try {
      // Toute plantation ou parcelle localisée doit apparaître, sans limite.
      const [plantRes, clientRes, parcelRes] = await Promise.all([
        (supabase as any)
          .from("plantations")
          .select("id,id_unique,nom_plantation,latitude,longitude,localisation_gps_lat,localisation_gps_lng,superficie_ha,village_nom,localite,parcelle_id,client_id")
          .range(0, 99999),
        (supabase as any).from("clients").select("id,nom_complet,parcelle_id").range(0, 99999),
        (supabase as any)
          .from("parcelles")
          .select("id,id_unique,nom,localisation_gps_lat,localisation_gps_lng,surface_totale_ha,surface_agricapital_ha,village")
          .range(0, 99999),
      ]);
      if (plantRes.error) console.error(plantRes.error);
      if (clientRes.error) console.error(clientRes.error);
      if (parcelRes.error) console.error(parcelRes.error);
      const plantations = plantRes.data || [];
      const clients = clientRes.data || [];
      const parcels = parcelRes.data || [];

      const clientById = new Map<string, any>(clients.map((c: any) => [c.id, c]));
      const clientsByParcel = new Map<string, any[]>();
      clients.forEach((c: any) => {
        if (!c.parcelle_id) return;
        clientsByParcel.set(c.parcelle_id, [...(clientsByParcel.get(c.parcelle_id) || []), c]);
      });
      const parcelById = new Map(parcels.map((p: any) => [p.id, p]));
      const out: PlantationMarker[] = [];
      const parcelsWithPlantation = new Set<string>();

      for (const p of plantations) {
        const parcel: any = parcelById.get(p.parcelle_id);
        const lat = num(p.latitude, p.localisation_gps_lat, parcel?.localisation_gps_lat);
        const lng = num(p.longitude, p.localisation_gps_lng, parcel?.localisation_gps_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (p.parcelle_id) parcelsWithPlantation.add(p.parcelle_id);
        const client = clientById.get(p.client_id);
        out.push({
          id: p.id,
          lat,
          lng,
          label: p.nom_plantation || p.id_unique || parcel?.id_unique || "Plantation",
          info: `${client?.nom_complet || "—"} • ${p.superficie_ha || parcel?.surface_agricapital_ha || parcel?.surface_totale_ha || 0} ha • ${p.village_nom || p.localite || parcel?.village || ""}`,
        });
      }

      for (const parcel of parcels) {
        if (parcelsWithPlantation.has(parcel.id)) continue;
        const lat = num(parcel.localisation_gps_lat);
        const lng = num(parcel.localisation_gps_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const names = (clientsByParcel.get(parcel.id) || []).map((c) => c.nom_complet).filter(Boolean).join(", ");
        out.push({
          id: `parcel-${parcel.id}`,
          lat,
          lng,
          label: names ? `${names} — ${parcel.id_unique || "Parcelle"}` : (parcel.id_unique || parcel.nom || "Parcelle"),
          info: `${names || "Parcelle"} • ${parcel.surface_agricapital_ha || parcel.surface_totale_ha || 0} ha • ${parcel.village || ""}`,
        });
      }

      setMarkers(out);
    } catch (error) {
      console.error("Erreur lors du chargement des plantations/parcelles:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Carte Interactive des Plantations
          {markers.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {markers.length} plantation(s) localisée(s)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-4">
        {loading ? (
          <div className="h-[300px] sm:h-[400px] flex items-center justify-center bg-muted/50 rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Chargement de la carte...</span>
          </div>
        ) : markers.length === 0 ? (
          <div className="h-[300px] sm:h-[400px] flex flex-col items-center justify-center bg-muted/30 rounded-lg">
            <MapPin className="h-12 w-12 text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground text-center">
              Aucune plantation ou parcelle avec coordonnées GPS
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Les plantations et parcelles apparaîtront ici dès que leurs coordonnées GPS sont réellement enregistrées
            </p>
          </div>
        ) : (
          <Suspense fallback={
            <div className="h-[300px] sm:h-[400px] flex items-center justify-center bg-muted/50 rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }>
            <InteractiveMap
              mode="view"
              markers={markers}
              height="400px"
              className="rounded-lg overflow-hidden"
            />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
};
