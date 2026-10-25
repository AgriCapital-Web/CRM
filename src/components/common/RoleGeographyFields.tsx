import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";

type Row = { id: string; nom: string; district_id?: string | null; region_id?: string | null; departement_id?: string | null; sous_prefecture_id?: string | null };
type Values = { districtId?: string | null; regionId?: string | null; departementId?: string | null; sousPrefectureId?: string | null };
type Props = { role?: string | null; value: Values; onChange: (value: Values) => void; required?: boolean; className?: string };

// Ces niveaux suivent le périmètre opérationnel des rôles disponibles dans le formulaire
// de demande de compte. Les champs parents restent visibles pour pouvoir choisir une
// région, un département ou une sous-préfecture dans la hiérarchie officielle.
const normalizeRole = (role?: string | null) => role === "responsable_zone" ? "responsable_district" : String(role || "");
const levelsForCoverage = (coverage?: string | null): string[] => {
  switch (String(coverage || "").toLowerCase()) {
    case "district": return ["district"];
    case "region": return ["district", "region"];
    case "departement": return ["district", "region", "departement"];
    case "sous_prefecture": return ["district", "region", "departement", "sous_prefecture"];
    default: return [];
  }
};
const normalizeName = (value?: string | null) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR");

export default function RoleGeographyFields({ role, value, onChange, required = false, className = "grid grid-cols-1 gap-3 sm:grid-cols-2" }: Props) {
  const [districts, setDistricts] = useState<Row[]>([]);
  const [regions, setRegions] = useState<Row[]>([]);
  const [departements, setDepartements] = useState<Row[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<string | null>(null);
  const levels = levelsForCoverage(coverage);

  useEffect(() => {
    let active = true;
    const code = normalizeRole(role);
    setCoverage(null);
    if (!code) return () => { active = false; };
    void (async () => {
      const { data, error } = await (supabase as any).from("v_public_signup_roles")
        .select("code,niveau_couverture,actif")
        .eq("code", code)
        .eq("actif", true)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error("Impossible de charger le périmètre du rôle", error);
        setCoverage(null);
        return;
      }
      setCoverage(data?.niveau_couverture || null);
    })();
    return () => { active = false; };
  }, [role]);

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
        setDistricts(d.data || []);
        setRegions(r.data || []);
        setDepartements(de.data || []);
        setSousPrefectures(sp.data || []);
      } catch (error) {
        console.error("Chargement des zones actives impossible", error);
        if (active) {
          setDistricts([]);
          setRegions([]);
          setDepartements([]);
          setSousPrefectures([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const selectedDistrict = useMemo(
    () => districts.find((district) => district.id === value.districtId),
    [districts, value.districtId],
  );
  const isDiaspora = normalizeName(selectedDistrict?.nom) === "diaspora";
  const visibleLevels = isDiaspora ? levels.filter((level) => level === "district") : levels;

  // Diaspora est un district sans subdivisions administratives locales.
  // Nettoyer aussi les anciennes valeurs afin qu'elles ne soient pas envoyées cachées.
  useEffect(() => {
    if (isDiaspora && (value.regionId || value.departementId || value.sousPrefectureId)) {
      onChange({ districtId: value.districtId || null, regionId: null, departementId: null, sousPrefectureId: null });
    }
  }, [isDiaspora, value.districtId, value.regionId, value.departementId, value.sousPrefectureId, onChange]);

  const regionsForDistrict = useMemo(
    () => value.districtId ? regions.filter((x) => x.district_id === value.districtId) : regions,
    [regions, value.districtId],
  );
  const departmentsForRegion = useMemo(
    () => value.regionId ? departements.filter((x) => x.region_id === value.regionId) : departements,
    [departements, value.regionId],
  );
  const subprefecturesForDepartment = useMemo(
    () => value.departementId ? sousPrefectures.filter((x) => x.departement_id === value.departementId) : sousPrefectures,
    [sousPrefectures, value.departementId],
  );

  const changeDistrict = (districtId: string) =>
    onChange({ districtId: districtId || null, regionId: null, departementId: null, sousPrefectureId: null });
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

  if (!visibleLevels.length) return null;
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
    {visibleLevels.includes("district") && field("district", "District", districts, value.districtId, changeDistrict)}
    {!isDiaspora && visibleLevels.includes("region") && field("region", "Région", regionsForDistrict, value.regionId, changeRegion, visibleLevels.includes("district") && !value.districtId)}
    {!isDiaspora && visibleLevels.includes("departement") && field("departement", "Département", departmentsForRegion, value.departementId, changeDepartment, visibleLevels.includes("region") && !value.regionId)}
    {!isDiaspora && visibleLevels.includes("sous_prefecture") && field("sous_prefecture", "Sous-préfecture", subprefecturesForDepartment, value.sousPrefectureId, changeSousPrefecture, visibleLevels.includes("departement") && !value.departementId)}
    {isDiaspora && <p className="sm:col-span-2 text-xs text-muted-foreground">Le district Diaspora n’a pas de région, de département ni de sous-préfecture. Le choix du district suffit.</p>}
  </div>;
}
