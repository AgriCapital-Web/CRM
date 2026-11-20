import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GeographieCascade from "@/components/common/GeographieCascade";

interface Props {
  formData: any;
  updateFormData: (data: any) => void;
}

export const EtapeParcelleDynamique = ({ formData, updateFormData }: Props) => (
  <Card>
    <CardHeader><CardTitle>Identification de la parcelle</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <GeographieCascade
        districtId={formData.parcelle_district_id}
        regionId={formData.parcelle_region_id}
        departementId={formData.parcelle_departement_id}
        sousPrefectureId={formData.parcelle_sous_prefecture_id}
        villageId={formData.parcelle_village_id}
        onChange={(geo) => updateFormData({
          parcelle_district_id: geo.districtId || "",
          parcelle_region_id: geo.regionId || "",
          parcelle_departement_id: geo.departementId || "",
          parcelle_sous_prefecture_id: geo.sousPrefectureId || "",
          parcelle_village_id: geo.villageId || "",
        })}
      />
      <div className="space-y-1">
        <Label>Lieu-dit / précision de localisation</Label>
        <Input value={formData.parcelle_localisation || ""} onChange={(event) => updateFormData({ parcelle_localisation: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Référence de la parcelle</Label>
          <Input value={formData.parcelle_reference || ""} onChange={(event) => updateFormData({ parcelle_reference: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Coordonnées GPS</Label>
          <Input value={formData.parcelle_coordonnees_gps || ""} onChange={(event) => updateFormData({ parcelle_coordonnees_gps: event.target.value })} placeholder="Latitude, longitude" />
        </div>
      </div>
    </CardContent>
  </Card>
);
