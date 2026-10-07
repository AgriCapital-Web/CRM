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
    try {
      // Les coordonnées peuvent être portées directement par la plantation
      // ou par la parcelle liée. On ne doit jamais perdre une localisation
      // parce qu'une plantation n'a pas encore été créée.
      const [{ data: plantations, error: plantationError }, { data: clients, error: clientError }] = await Promise.all([
        (supabase as any)
          .from("plantations")
          .select(`
            id,
            id_unique,
            nom_plantation,
            latitude,
            longitude,
            localisation_gps_lat,
            localisation_gps_lng,
            superficie_ha,
            village_nom,
            localite,
            parcelle_id,
            client:clients!plantations_client_id_fkey (id,id_unique,nom_complet,parcelle_id),
            sous_prefectures (nom)
          `),
        (supabase as any)
          .from("clients")
          .select("id,id_unique,nom_complet,parcelle_id")
      ]);

      if (plantationError) throw plantationError;
      if (clientError) throw clientError;

      const parcelIds = [...new Set(
        (clients || []).map((c: any) => c.parcelle_id).filter(Boolean)
          .concat((plantations || []).map((p: any) => p.parcelle_id).filter(Boolean))
      )];

      let parcels: any[] = [];
      if (parcelIds.length) {
        const { data, error } = await (supabase as any)
          .from("parcelles")
          .select("id,id_unique,nom,localisation_gps_lat,localisation_gps_lng,surface_totale_ha,surface_agricapital_ha,village")
          .in("id", parcelIds);
        if (error) throw error;
        parcels = data || [];
      }

      const clientByParcel = new Map<string, any>((clients || []).filter((c: any) => c.parcelle_id).map((c: any) => [c.parcelle_id, c]));
      const parcelById = new Map(parcels.map((p: any) => [p.id, p]));
      const markersById = new Map<string, PlantationMarker>();

      for (const p of plantations || []) {
        const parcel = parcelById.get(p.parcelle_id);
        const client: any = p.client as any || (p.parcelle_id ? clientByParcel.get(p.parcelle_id) : null);
        const lat = Number(p.latitude ?? p.localisation_gps_lat ?? parcel?.localisation_gps_lat);
        const lng = Number(p.longitude ?? p.localisation_gps_lng ?? parcel?.localisation_gps_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        markersById.set(p.id, {
          id: p.id,
          lat,
          lng,
          label: p.nom_plantation || p.id_unique || parcel?.id_unique || "Plantation",
          info: `${client?.nom_complet || "N/A"} • ${p.superficie_ha || parcel?.surface_agricapital_ha || parcel?.surface_totale_ha || 0} ha • ${p.sous_prefectures?.nom || p.village_nom || p.localite || parcel?.village || "N/A"}`
        });
      }

      // Une parcelle géolocalisée sans plantation doit également apparaître :
      // c'est notamment nécessaire pour les clients déjà enregistrés dont
      // la localisation est connue avant la création/activation de plantation.
      for (const parcel of parcels) {
        const lat = Number(parcel.localisation_gps_lat);
        const lng = Number(parcel.localisation_gps_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const client = clientByParcel.get(parcel.id);
        const markerId = `parcel-${parcel.id}`;
        if ([...markersById.values()].some((m) => Math.abs(m.lat - lat) < 1e-9 && Math.abs(m.lng - lng) < 1e-9)) continue;

        markersById.set(markerId, {
          id: markerId,
          lat,
          lng,
          label: client?.nom_complet ? `${client.nom_complet} — ${parcel.id_unique || "Parcelle"}` : (parcel.id_unique || parcel.nom || "Parcelle"),
          info: `${client?.nom_complet || "Parcelle"} • ${parcel.surface_agricapital_ha || parcel.surface_totale_ha || 0} ha • ${parcel.village || "Localisation GPS"}`
        });
      }

      setMarkers([...markersById.values()]);
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
