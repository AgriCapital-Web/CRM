import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import GeographieCascade from "@/components/common/GeographieCascade";
import { supabase } from "@/integrations/supabase/client";
import { getCachedItems, STORES } from "@/lib/offlineDb";

interface Props { formData: any; updateFormData: (data: any) => void; }

export const EtapeParcelleDynamique = ({ formData, updateFormData }: Props) => {
  const [conventions, setConventions] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const code = String(formData.offre_code || "").toLowerCase();
  // Source de vérité : configuration de l'offre en DB.
  // false => terre du Client ; true => foncier mis à disposition / externe.
  const external = !formData.offre?.necessite_foncier_client;
  const plus = code.endsWith("-plus");

  useEffect(() => {
    updateFormData({ type_client_foncier: external ? "EXT" : "OWN" });
  }, [external]);

  useEffect(() => {
    if (!external) return;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("conventions_foncieres")
          .select("id,reference,code_sp,code_dom,code_parc,statut,surface_totale_ha,proprietaire:proprietaires_terres(id,nom_complet)")
          .eq("statut","active")
          .order("date_signature",{ascending:false});
        if (!error && data?.length) {
          setConventions(data);
          return;
        }
        const cached = await getCachedItems(STORES.CONVENTIONS_FONCIERES);
        setConventions(cached.filter((x: any) => x?.statut === "active"));
      } catch {
        const cached = await getCachedItems(STORES.CONVENTIONS_FONCIERES);
        setConventions(cached.filter((x: any) => x?.statut === "active"));
      }
    })();
  }, [external]);

  useEffect(() => {
    if (!formData.convention_id) { setLots([]); return; }
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("lots_hectares")
          .select("id,reference,numero_h,surface_ha,statut,certifie_geometre,convention_id")
          .eq("convention_id",formData.convention_id)
          .eq("statut","disponible")
          .order("numero_h");
        if (!error && data?.length) {
          setLots(data);
          return;
        }
        const cached = await getCachedItems(STORES.LOTS_HECTARES);
        setLots(cached.filter((x: any) => x?.convention_id === formData.convention_id && x?.statut === "disponible").sort((a: any,b: any)=>Number(a?.numero_h||0)-Number(b?.numero_h||0)));
      } catch {
        const cached = await getCachedItems(STORES.LOTS_HECTARES);
        setLots(cached.filter((x: any) => x?.convention_id === formData.convention_id && x?.statut === "disponible").sort((a: any,b: any)=>Number(a?.numero_h||0)-Number(b?.numero_h||0)));
      }
    })();
  }, [formData.convention_id]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{external ? "Parcelle affectée au Client" : "Parcelle du Client"}</CardTitle>
          <CardDescription>
            {external
              ? "Le foncier est mis à disposition dans le cadre de la formule sélectionnée."
              : "La parcelle reste sous la responsabilité du Client, conformément au contrat applicable."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Superficie (ha) *</Label><Input type="number" min="1" step="0.1" value={formData.superficie_prevue || ""} onChange={(e) => updateFormData({superficie_prevue:e.target.value, surface_propre_ha:e.target.value})} /></div>
            <div><Label>Référence de parcelle</Label><Input value={formData.reference_cadastrale || ""} onChange={(e) => updateFormData({reference_cadastrale:e.target.value})} placeholder="Référence si connue" /></div>
            <div className="md:col-span-2"><Label>Localisation administrative</Label><GeographieCascade districtId={formData.district_id} regionId={formData.region_id} departementId={formData.departement_id} sousPrefectureId={formData.sous_prefecture_id} villageId={formData.village_id} required onChange={(g)=>updateFormData({district_id:g.districtId||null,region_id:g.regionId||null,departement_id:g.departementId||null,sous_prefecture_id:g.sousPrefectureId||null,village_id:g.villageId||null,parcelle_region:g.regionName||"",parcelle_departement:g.departementName||"",parcelle_sous_prefecture:g.sousPrefectureName||"",village_propre:g.villageName||""})}/></div>
            <div><Label>Latitude GPS</Label><Input type="number" step="any" value={formData.parcelle_latitude || ""} onChange={(e) => updateFormData({parcelle_latitude:e.target.value})} /></div>
            <div><Label>Longitude GPS</Label><Input type="number" step="any" value={formData.parcelle_longitude || ""} onChange={(e) => updateFormData({parcelle_longitude:e.target.value})} /></div>
          </div>

          {external && <div className="space-y-4 rounded-xl border p-4">
            <div><Label>Convention foncière active *</Label><Select value={formData.convention_id || ""} onValueChange={(v) => updateFormData({convention_id:v,lot_id:null})}><SelectTrigger><SelectValue placeholder="Sélectionner une convention" /></SelectTrigger><SelectContent>{conventions.map(c => <SelectItem key={c.id} value={c.id}>{c.reference} — {c.proprietaire?.nom_complet || "Propriétaire non renseigné"}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Lot disponible *</Label><Select value={formData.lot_id || ""} onValueChange={(v) => updateFormData({lot_id:v})} disabled={!formData.convention_id}><SelectTrigger><SelectValue placeholder="Sélectionner un lot" /></SelectTrigger><SelectContent>{lots.map(l => <SelectItem key={l.id} value={l.id}>H{String(l.numero_h).padStart(2,"0")} — {l.surface_ha} ha {l.certifie_geometre ? "· certifié" : ""}</SelectItem>)}</SelectContent></Select></div>
            {formData.lot_id && <Badge variant="outline">Lot sélectionné : {lots.find(l => l.id === formData.lot_id)?.reference || formData.lot_id}</Badge>}
          </div>}

          {!external && <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Statut foncier</Label><Select value={formData.statut_foncier || ""} onValueChange={(v) => updateFormData({statut_foncier:v})}><SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger><SelectContent><SelectItem value="coutumier">Coutumier</SelectItem><SelectItem value="certificat">Certificat foncier</SelectItem><SelectItem value="titre">Titre foncier</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>
            <div><Label>Propriétaire foncier</Label><Input value={formData.proprietaire_foncier_nom || ""} onChange={(e) => updateFormData({proprietaire_foncier_nom:e.target.value})} /></div>
          </div>}

          {plus && <p className="text-xs text-muted-foreground">La formule « + » conserve ici les informations foncières nécessaires au dossier ; les modalités de gestion sont déterminées par le contrat applicable.</p>}
        </CardContent>
      </Card>
    </div>
  );
};
