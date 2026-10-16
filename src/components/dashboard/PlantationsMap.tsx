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
    let active = true;
    const fetchPlantations = async () => {
      const num = (...values: any[]) => {
        for (const v of values) {
          if (v === null || v === undefined || v === "") continue;
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
        return NaN;
      };
      try {
        const [plantRes, clientRes, parcelRes, campementRes, villageRes] = await Promise.all([
          (supabase as any).from("plantations")
            .select("id,id_unique,nom_plantation,latitude,longitude,localisation_gps_lat,localisation_gps_lng,superficie_ha,surface_reellement_plantee,village_nom,village,localite,parcelle_id,client_id")
            .range(0, 99999),
          (supabase as any).from("clients")
            .select("id,nom_complet,parcelle_id,campement_id,village_id,localite,total_hectares,latitude,longitude")
            .range(0, 99999),
          (supabase as any).from("parcelles")
            .select("id,id_unique,nom,localisation_gps_lat,localisation_gps_lng,surface_totale_ha,surface_agricapital_ha,village")
            .range(0, 99999),
          (supabase as any).from("campements").select("id,nom").range(0, 99999),
          (supabase as any).from("villages").select("id,nom").range(0, 99999),
        ]);
        if (plantRes.error) console.error("Carte dashboard — plantations:", plantRes.error);
        if (clientRes.error) console.error("Carte dashboard — clients:", clientRes.error);
        if (parcelRes.error) console.error("Carte dashboard — parcelles:", parcelRes.error);

        const plantations = plantRes.data || [];
        const clients = clientRes.data || [];
        const parcels = parcelRes.data || [];
        const campementById = new Map<string, any>((campementRes.data || []).map((row: any) => [row.id, row]));
        const villageById = new Map<string, any>((villageRes.data || []).map((row: any) => [row.id, row]));
        const clientById = new Map<string, any>(clients.map((c: any) => [c.id, c]));
        const clientsByParcel = new Map<string, any[]>();
        clients.forEach((c: any) => {
          if (!c.parcelle_id) return;
          clientsByParcel.set(c.parcelle_id, [...(clientsByParcel.get(c.parcelle_id) || []), c]);
        });
        const parcelById = new Map<string, any>(parcels.map((p: any) => [p.id, p]));
        const out: PlantationMarker[] = [];
        const parcelsWithPlantation = new Set<string>();

        for (const p of plantations) {
          const parcel = parcelById.get(p.parcelle_id);
          const lat = num(p.latitude, p.localisation_gps_lat, parcel?.localisation_gps_lat);
          const lng = num(p.longitude, p.localisation_gps_lng, parcel?.localisation_gps_lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
          if (p.parcelle_id) parcelsWithPlantation.add(p.parcelle_id);
          const client = clientById.get(p.client_id);
          const campement = campementById.get(client?.campement_id);
          const village = villageById.get(client?.village_id);
          const locality = campement?.nom || p.localite || client?.localite || village?.nom || p.village_nom || p.village || parcel?.village || "Localité non renseignée";
          const area = p.superficie_ha ?? p.surface_reellement_plantee ?? client?.total_hectares ?? parcel?.surface_totale_ha ?? parcel?.surface_agricapital_ha ?? 0;
          out.push({
            id: `plantation-${p.id}`, lat, lng,
            label: client?.nom_complet || p.nom_plantation || p.id_unique || parcel?.id_unique || "Client non renseigné",
            info: `Superficie : ${area} ha • Localité : ${locality}`,
          });
        }

        for (const parcel of parcels) {
          if (parcelsWithPlantation.has(parcel.id)) continue;
          const lat = num(parcel.localisation_gps_lat);
          const lng = num(parcel.localisation_gps_lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
          const names = (clientsByParcel.get(parcel.id) || []).map((c) => c.nom_complet).filter(Boolean).join(", ");
          out.push({
            id: `parcel-${parcel.id}`, lat, lng,
            label: names ? `${names} — ${parcel.id_unique || "Parcelle"}` : (parcel.id_unique || parcel.nom || "Parcelle"),
            info: `${parcel.surface_agricapital_ha || parcel.surface_totale_ha || 0} ha${parcel.village ? ` • ${parcel.village}` : ""}`,
          });
        }

        const mappedClientIds = new Set<string>();
        for (const p of plantations) if (p.client_id) mappedClientIds.add(p.client_id);
        for (const parcel of parcels) {
          for (const c of clientsByParcel.get(parcel.id) || []) mappedClientIds.add(c.id);
        }
        for (const client of clients) {
          if (mappedClientIds.has(client.id)) continue;
          const lat = num(client.latitude);
          const lng = num(client.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
          const campement = campementById.get(client.campement_id);
          const village = villageById.get(client.village_id);
          const locality = campement?.nom || client.localite || village?.nom || "Localité non renseignée";
          out.push({
            id: `client-${client.id}`, lat, lng,
            label: client.nom_complet || "Client",
            info: `Site client • Localité : ${locality}`,
          });
        }
        if (active) setMarkers(out);
      } catch (error) {
        console.error("Erreur lors du chargement des localisations de la carte:", error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchPlantations();
    return () => { active = false; };
  }, []);

  const mapFallback = "h-[220px] sm:h-[400px]";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Carte interactive des clients et plantations
          {markers.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {markers.length} localisation(s)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-4">
        {loading ? (
          <div className={`${mapFallback} flex items-center justify-center rounded-lg bg-muted/50`}>
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Chargement de la carte...</span>
          </div>
        ) : markers.length === 0 ? (
          <div className={`${mapFallback} flex flex-col items-center justify-center rounded-lg bg-muted/30`}>
            <MapPin className="mb-2 h-10 w-10 text-muted-foreground/50" />
            <p className="text-center text-sm text-muted-foreground">Aucune localisation GPS disponible</p>
          </div>
        ) : (
          <Suspense fallback={
            <div className={`${mapFallback} flex items-center justify-center rounded-lg bg-muted/50`}>
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          }>
            <div className={`h-[220px] sm:h-[400px] w-full overflow-hidden rounded-lg`}>
              <InteractiveMap mode="view" markers={markers} height="100%" className="h-full w-full rounded-lg" />
            </div>
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
};
