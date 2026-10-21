import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";

type Row = { id: string; nom: string; district_id?: string | null; region_id?: string | null; departement_id?: string | null; sous_prefecture_id?: string | null };
type Values = { districtId?: string | null; regionId?: string | null; departementId?: string | null; sousPrefectureId?: string | null };
type Props = { role?: string | null; value: Values; onChange: (value: Values) => void; required?: boolean; className?: string };

const ROLE_LEVELS: Record<string, string[]> = {
  responsable_district: ["district"],
  responsable_commercial: ["district", "region"],
  chef_equipe_commercial: ["district", "region", "departement"],
  commercial: ["district", "region", "departement", "sous_prefecture"],
  technicien: ["departement"],
  mobilisateur_foncier: ["departement"],
  chef_equipe_technique: ["region"],
  superviseur_mobilisation_fonciere: ["region"],
  responsable_technique_agronomique: ["region"],
};
const normalizeRole = (role?: string | null) => role === "responsable_zone" ? "responsable_district" : String(role || "");

export default function RoleGeographyFields({ role, value, onChange, required = false, className = "grid grid-cols-1 gap-3 sm:grid-cols-2" }: Props) {
  const [districts, setDistricts] = useState<Row[]>([]);
  const [regions, setRegions] = useState<Row[]>([]);
  const [departements, setDepartements] = useState<Row[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const levels = ROLE_LEVELS[normalizeRole(role)] || [];

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [d, r, de, sp] = await Promise.all([
          (supabase as any).from("v_geo_districts").select("id,nom").eq("est_actif_effectif", true).order("nom"),
          (supabase as any).from("v_geo_regions").select("id,nom,district_id").eq("est_active_effectif", true).order("nom"),
          (supabase as any).from("v_geo_departements").select("id,nom,region_id").eq("est_actif_effectif", true).order("nom"),
          (supabase as any).from("v_geo_sous_prefectures").select("id,nom,departement_id").eq("est_active_effectif", true).order("nom"),
        ]);
        if (d.error || r.error || de.error || sp.error) throw d.error || r.error || de.error || sp.error;
        if (!active) return;
        setDistricts(d.data || []); setRegions(r.data || []); setDepartements(de.data || []); setSousPrefectures(sp.data || []);
      } catch (error) {
        console.error("Chargement des zones actives impossible", error);
        if (active) { setDistricts([]); setRegions([]); setDepartements([]); setSousPrefectures([]); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const regionsForDistrict = useMemo(() => value.districtId ? regions.filter((x) => x.district_id === value.districtId) : regions, [regions, value.districtId]);
  const departmentsForRegion = useMemo(() => value.regionId ? departements.filter((x) => x.region_id === value.regionId) : departements, [departements, value.regionId]);
  const subprefecturesForDepartment = useMemo(() => value.departementId ? sousPrefectures.filter((x) => x.departement_id === value.departementId) : sousPrefectures, [sousPrefectures, value.departementId]);

  const changeDistrict = (districtId: string) => onChange({ districtId: districtId || null, regionId: null, departementId: null, sousPrefectureId: null });
  const changeRegion = (regionId: string) => {
    const row = regions.find((x) => x.id === regionId);
    onChange({ districtId: row?.district_id || value.districtId || null, regionId: regionId || null, departementId: null, sousPrefectureId: null });
  };
  const changeDepartment = (departementId: string) => {
    const row = departements.find((x) => x.id === departementId);
    const region = regions.find((x) => x.id === row?.region_id);
    onChange({ districtId: region?.district_id || null, regionId: row?.region_id || null, departementId: departementId || null, sousPrefectureId: null });
  };
  const changeSousPrefecture = (sousPrefectureId: string) => {
    const row = sousPrefectures.find((x) => x.id === sousPrefectureId);
    const department = departements.find((x) => x.id === row?.departement_id);
    const region = regions.find((x) => x.id === department?.region_id);
    onChange({ districtId: region?.district_id || null, regionId: department?.region_id || null, departementId: row?.departement_id || null, sousPrefectureId: sousPrefectureId || null });
  };

  if (!levels.length) return null;
  const field = (level: string, label: string, rows: Row[], selected: string | null | undefined, onSelect: (id: string) => void, disabled = false) => (
    <div key={level} className="min-w-0 space-y-1.5">
      <Label>{label}{required ? " *" : ""}</Label>
      <select value={selected || ""} disabled={loading || disabled} onChange={(e) => onSelect(e.target.value)} required={required}
        className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
        <option value="">{loading ? "Chargement…" : `Sélectionner ${label.toLocaleLowerCase("fr-FR")}`}</option>
        {rows.map((row) => <option key={row.id} value={row.id}>{row.nom}</option>)}
      </select>
    </div>
  );

  return <div className={className}>
    {levels.includes("district") && field("district", "District", districts, value.districtId, changeDistrict)}
    {levels.includes("region") && field("region", "Région", regionsForDistrict, value.regionId, changeRegion, levels.includes("district") && !value.districtId)}
    {levels.includes("departement") && field("departement", "Département", departmentsForRegion, value.departementId, changeDepartment, levels.includes("region") && !value.regionId)}
    {levels.includes("sous_prefecture") && field("sous_prefecture", "Sous-préfecture", subprefecturesForDepartment, value.sousPrefectureId, changeSousPrefecture, levels.includes("departement") && !value.departementId)}
  </div>;
}
