import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/common/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  districtId?: string | null; regionId?: string | null; departementId?: string | null;
  sousPrefectureId?: string | null; villageId?: string | null;
  onChange: (values: {
    districtId?: string | null; districtName?: string | null; regionId?: string | null;
    departementId?: string | null; sousPrefectureId?: string | null; villageId?: string | null;
    villageName?: string | null; regionName?: string | null; departementName?: string | null;
    sousPrefectureName?: string | null;
  }) => void;
  required?: boolean; showDistrict?: boolean; showVillage?: boolean; className?: string;
}

export default function GeographieCascade({
  districtId, regionId, departementId, sousPrefectureId, villageId, onChange,
  required = false, showDistrict = true, showVillage = true,
  className = "grid md:grid-cols-2 gap-4",
}: Props) {
  const [districts, setDistricts] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [departements, setDepartements] = useState<any[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);
  const selectedDistrict = districts.find((d) => d.id === districtId);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ch = supabase.channel(`geo-cascade-${Math.random().toString(36).slice(2)}`);
    for (const t of ["districts", "regions", "departements", "sous_prefectures", "villages"]) {
      ch.on("postgres_changes" as any, { event: "*", schema: "public", table: t }, () => setTick((x) => x + 1));
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [{ data, error }, { data: regs }] = await Promise.all([
        (supabase as any).from("v_geo_districts").select("id,nom").eq("est_actif_effectif", true).order("nom"),
        (supabase as any).from("regions").select("district_id"),
      ]);
      const withChildren = new Set((regs || []).map((r: any) => r.district_id));
      // Districts sans enfants (ex. Diaspora) en tête de liste
      const list = (error ? [] : (data || [])).sort((a: any, b: any) =>
        Number(withChildren.has(a.id)) - Number(withChildren.has(b.id)) || String(a.nom).localeCompare(String(b.nom), "fr"));
      if (active) setDistricts(list);
    })();
    return () => { active = false; };
  }, [tick]);

  useEffect(() => {
    if (!districtId) { setRegions([]); return; }
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_regions")
        .select("id,nom").eq("district_id", districtId).eq("est_active_effectif", true).order("nom");
      if (active) setRegions(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [districtId, tick]);

  useEffect(() => {
    if (!regionId) { setDepartements([]); return; }
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_departements")
        .select("id,nom").eq("region_id", regionId).eq("est_actif_effectif", true).order("nom");
      if (active) setDepartements(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [regionId, tick]);

  useEffect(() => {
    if (!departementId) { setSousPrefectures([]); return; }
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_sous_prefectures")
        .select("id,nom").eq("departement_id", departementId).eq("est_active_effectif", true).order("nom");
      if (active) setSousPrefectures(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [departementId, tick]);

  useEffect(() => {
    if (!sousPrefectureId) { setVillages([]); return; }
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_villages")
        .select("id,nom").eq("sous_prefecture_id", sousPrefectureId).eq("est_actif_effectif", true).order("nom");
      if (active) setVillages(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [sousPrefectureId, tick]);

  const hasChildren = !showDistrict || Boolean(districtId);
  return (
    <div className={className}>
      {showDistrict && <div className="space-y-2"><Label>District{required ? " *" : ""}</Label>
        <SearchableSelect value={districtId || ""} onValueChange={(value) => onChange({
          districtId: value, districtName: districts.find((d) => d.id === value)?.nom || null,
          regionId: null, departementId: null, sousPrefectureId: null, villageId: null,
        })} options={districts.map((x) => ({ value: x.id, label: x.nom }))}
          placeholder="Sélectionner le district" searchPlaceholder="Rechercher un district" />
      </div>}
      {hasChildren && <>
        <div className="space-y-2"><Label>Région{required ? " *" : ""}</Label>
          <SearchableSelect value={regionId || ""} disabled={!districtId} options={regions.map((x) => ({ value: x.id, label: x.nom }))}
            placeholder="Sélectionner la région" searchPlaceholder="Rechercher une région"
            onValueChange={(value) => { const x=regions.find((r)=>r.id===value); onChange({
              districtId: districtId || null, districtName: selectedDistrict?.nom || null, regionId:value,
              departementId:null,sousPrefectureId:null,villageId:null,regionName:x?.nom||null
            }); }} />
        </div>
        <div className="space-y-2"><Label>Département{required ? " *" : ""}</Label>
          <SearchableSelect value={departementId || ""} disabled={!regionId} options={departements.map((x) => ({ value:x.id,label:x.nom }))}
            placeholder="Sélectionner le département" searchPlaceholder="Rechercher un département"
            onValueChange={(value)=>{const x=departements.find((d)=>d.id===value);onChange({
              districtId:districtId||null,regionId:regionId||null,departementId:value,sousPrefectureId:null,villageId:null,
              regionName:regions.find((r)=>r.id===regionId)?.nom||null,departementName:x?.nom||null,sousPrefectureName:null,villageName:null
            });}} />
        </div>
        <div className="space-y-2"><Label>Sous-préfecture{required ? " *" : ""}</Label>
          <SearchableSelect value={sousPrefectureId || ""} disabled={!departementId} options={sousPrefectures.map((x)=>({value:x.id,label:x.nom}))}
            placeholder="Sélectionner la sous-préfecture" searchPlaceholder="Rechercher une sous-préfecture"
            onValueChange={(value)=>{const x=sousPrefectures.find((s)=>s.id===value);onChange({
              districtId:districtId||null,regionId:regionId||null,departementId:departementId||null,sousPrefectureId:value,villageId:null,
              regionName:regions.find((r)=>r.id===regionId)?.nom||null,departementName:departements.find((d)=>d.id===departementId)?.nom||null,
              sousPrefectureName:x?.nom||null,villageName:null
            });}} />
        </div>
        {showVillage && <div className="space-y-2"><Label>Village / localité{required ? " *" : ""}</Label>
          <SearchableSelect value={villageId || ""} disabled={!sousPrefectureId} options={villages.map((x)=>({value:x.id,label:x.nom}))}
            placeholder="Sélectionner le village / la localité" searchPlaceholder="Rechercher un village"
            onValueChange={(value)=>{const x=villages.find((v)=>v.id===value);onChange({
              districtId:districtId||null,regionId:regionId||null,departementId:departementId||null,sousPrefectureId:sousPrefectureId||null,villageId:value,
              regionName:regions.find((r)=>r.id===regionId)?.nom||null,departementName:departements.find((d)=>d.id===departementId)?.nom||null,
              sousPrefectureName:sousPrefectures.find((s)=>s.id===sousPrefectureId)?.nom||null,villageName:x?.nom||null
            });}} />
        </div>}
      </>}
    </div>
  );
}