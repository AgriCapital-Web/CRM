import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/common/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  extraField?: ReactNode;
  districtId?: string | null; regionId?: string | null; departementId?: string | null;
  sousPrefectureId?: string | null; villageId?: string | null;
  onChange: (values: {
    districtId?: string | null; districtName?: string | null; regionId?: string | null;
    departementId?: string | null; sousPrefectureId?: string | null; villageId?: string | null;
    villageName?: string | null; regionName?: string | null; departementName?: string | null;
    sousPrefectureName?: string | null;
  }) => void;
  required?: boolean; showDistrict?: boolean; showDepartement?: boolean; showSousPrefecture?: boolean; showVillage?: boolean; className?: string;
}
type GeoRow = { id: string; nom: string; [key: string]: any };

export default function GeographieCascade({
  districtId, regionId, departementId, sousPrefectureId, villageId, onChange,
  required = false, showDistrict = true, showDepartement = true, showSousPrefecture = true, showVillage = true,
  className = "grid md:grid-cols-2 gap-4", extraField,
}: Props) {
  const [districts, setDistricts] = useState<GeoRow[]>([]);
  const [regions, setRegions] = useState<GeoRow[]>([]);
  const [departements, setDepartements] = useState<GeoRow[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<GeoRow[]>([]);
  const [villages, setVillages] = useState<GeoRow[]>([]);
  const [villageSearch, setVillageSearch] = useState("");
  const [villageMatches, setVillageMatches] = useState<GeoRow[]>([]);
  const [searchingVillages, setSearchingVillages] = useState(false);
  const [tick, setTick] = useState(0);
  const selectedDistrict = districts.find((d) => d.id === districtId);

  useEffect(() => {
    const channel = supabase.channel(`geo-cascade-${Math.random().toString(36).slice(2)}`);
    for (const table of ["districts", "regions", "departements", "sous_prefectures", "villages"]) {
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table }, () => setTick((v) => v + 1));
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [{ data, error }, { data: regionRows }] = await Promise.all([
        (supabase as any).from("v_geo_districts").select("id,nom").eq("est_actif_effectif", true).order("nom"),
        (supabase as any).from("regions").select("district_id"),
      ]);
      const withChildren = new Set((regionRows || []).map((r: any) => r.district_id));
      const sorted = (error ? [] : (data || [])).sort((a: any, b: any) =>
        Number(withChildren.has(a.id)) - Number(withChildren.has(b.id)) || String(a.nom).localeCompare(String(b.nom), "fr"));
      if (active) setDistricts(sorted);
    })();
    return () => { active = false; };
  }, [tick]);

  useEffect(() => {
    let active = true;
    if (!districtId) { setRegions([]); return () => { active = false; }; }
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_regions").select("id,nom")
        .eq("district_id", districtId).eq("est_active_effectif", true).order("nom");
      if (active) setRegions(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [districtId, tick]);

  useEffect(() => {
    let active = true;
    if (!regionId) { setDepartements([]); return () => { active = false; }; }
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_departements").select("id,nom")
        .eq("region_id", regionId).eq("est_actif_effectif", true).order("nom");
      if (active) setDepartements(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [regionId, tick]);

  useEffect(() => {
    let active = true;
    if (!departementId) { setSousPrefectures([]); return () => { active = false; }; }
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_sous_prefectures").select("id,nom")
        .eq("departement_id", departementId).eq("est_active_effectif", true).order("nom");
      if (active) setSousPrefectures(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [departementId, tick]);

  useEffect(() => {
    let active = true;
    if (!sousPrefectureId) { setVillages([]); return () => { active = false; }; }
    void (async () => {
      const { data, error } = await (supabase as any).from("v_geo_villages").select("id,nom")
        .eq("sous_prefecture_id", sousPrefectureId).eq("est_actif_effectif", true).order("nom");
      if (active) setVillages(error ? [] : (data || []));
    })();
    return () => { active = false; };
  }, [sousPrefectureId, tick]);

  // Search the real, RLS-visible geographic catalogue even before the parent hierarchy is selected.
  useEffect(() => {
    let active = true;
    const term = villageSearch.trim().replace(/[,%()]/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (term.length < 2) { setVillageMatches([]); setSearchingVillages(false); return () => { active = false; }; }
    setSearchingVillages(true);
    const timer = setTimeout(async () => {
      let query = (supabase as any).from("v_geo_villages").select("id,nom,sous_prefecture_id")
        .eq("est_actif_effectif", true).ilike("nom", `%${term}%`).order("nom").limit(100);
      if (sousPrefectureId) query = query.eq("sous_prefecture_id", sousPrefectureId);
      else if (departementId) {
        const { data: sps } = await (supabase as any).from("v_geo_sous_prefectures").select("id")
          .eq("departement_id", departementId).eq("est_active_effectif", true);
        const ids = (sps || []).map((x: any) => x.id);
        if (!ids.length) { if (active) { setVillageMatches([]); setSearchingVillages(false); } return; }
        query = query.in("sous_prefecture_id", ids);
      } else if (regionId) {
        const { data: deps } = await (supabase as any).from("v_geo_departements").select("id")
          .eq("region_id", regionId).eq("est_actif_effectif", true);
        const depIds = (deps || []).map((x: any) => x.id);
        const { data: sps } = depIds.length ? await (supabase as any).from("v_geo_sous_prefectures").select("id")
          .in("departement_id", depIds).eq("est_active_effectif", true) : { data: [] };
        const ids = (sps || []).map((x: any) => x.id);
        if (!ids.length) { if (active) { setVillageMatches([]); setSearchingVillages(false); } return; }
        query = query.in("sous_prefecture_id", ids);
      } else if (districtId) {
        const { data: regs } = await (supabase as any).from("v_geo_regions").select("id")
          .eq("district_id", districtId).eq("est_active_effectif", true);
        const regIds = (regs || []).map((x: any) => x.id);
        const { data: deps } = regIds.length ? await (supabase as any).from("v_geo_departements").select("id")
          .in("region_id", regIds).eq("est_actif_effectif", true) : { data: [] };
        const depIds = (deps || []).map((x: any) => x.id);
        const { data: sps } = depIds.length ? await (supabase as any).from("v_geo_sous_prefectures").select("id")
          .in("departement_id", depIds).eq("est_active_effectif", true) : { data: [] };
        const ids = (sps || []).map((x: any) => x.id);
        if (!ids.length) { if (active) { setVillageMatches([]); setSearchingVillages(false); } return; }
        query = query.in("sous_prefecture_id", ids);
      }
      const { data, error } = await query;
      if (active) { setVillageMatches(error ? [] : (data || [])); setSearchingVillages(false); }
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [villageSearch, districtId, regionId, departementId, sousPrefectureId, tick]);

  const villageOptions = useMemo(() => {
    const source = sousPrefectureId ? villages : villageMatches;
    return source.map((v) => ({ value: v.id, label: v.nom }));
  }, [villages, villageMatches, sousPrefectureId]);

  const selectVillage = async (id: string, name?: string) => {
    const match = [...villages, ...villageMatches].find((v) => v.id === id);
    const spId = match?.sous_prefecture_id || sousPrefectureId || null;
    let sp: any = sousPrefectures.find((x) => x.id === spId);
    if (spId && !sp) {
      const { data } = await (supabase as any).from("v_geo_sous_prefectures").select("id,nom,departement_id").eq("id", spId).maybeSingle();
      sp = data;
    }
    const depId = sp?.departement_id || departementId || null;
    let dep: any = departements.find((x) => x.id === depId);
    if (depId && !dep) {
      const { data } = await (supabase as any).from("v_geo_departements").select("id,nom,region_id").eq("id", depId).maybeSingle();
      dep = data;
    }
    const regId = dep?.region_id || regionId || null;
    let reg: any = regions.find((x) => x.id === regId);
    if (regId && !reg) {
      const { data } = await (supabase as any).from("v_geo_regions").select("id,nom,district_id").eq("id", regId).maybeSingle();
      reg = data;
    }
    const distId = reg?.district_id || districtId || null;
    let dist: any = districts.find((x) => x.id === distId);
    if (distId && !dist) {
      const { data } = await (supabase as any).from("v_geo_districts").select("id,nom").eq("id", distId).maybeSingle();
      dist = data;
    }
    onChange({
      districtId: distId, districtName: dist?.nom || null,
      regionId: regId, regionName: reg?.nom || null,
      departementId: depId, departementName: dep?.nom || null,
      sousPrefectureId: spId, sousPrefectureName: sp?.nom || null,
      villageId: id, villageName: name || match?.nom || null,
    });
    setVillageSearch(name || match?.nom || "");
    setVillageMatches([]);
  };

  const hasChildren = !showDistrict || Boolean(districtId);
  return <div className={className}>
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
          onValueChange={(value) => { const x = regions.find((r) => r.id === value); onChange({
            districtId: districtId || null, districtName: selectedDistrict?.nom || null, regionId: value,
            departementId: null, sousPrefectureId: null, villageId: null, regionName: x?.nom || null
          }); }} />
      </div>
      {showDepartement && <div className="space-y-2"><Label>Département{required ? " *" : ""}</Label>
        <SearchableSelect value={departementId || ""} disabled={!regionId} options={departements.map((x) => ({ value: x.id, label: x.nom }))}
          placeholder="Sélectionner le département" searchPlaceholder="Rechercher un département"
          onValueChange={(value) => { const x = departements.find((d) => d.id === value); onChange({
            districtId: districtId || null, regionId: regionId || null, departementId: value, sousPrefectureId: null, villageId: null,
            regionName: regions.find((r) => r.id === regionId)?.nom || null, departementName: x?.nom || null, sousPrefectureName: null, villageName: null
          }); }} />
      </div>}
      {showSousPrefecture && <div className="space-y-2"><Label>Sous-préfecture{required ? " *" : ""}</Label>
        <SearchableSelect value={sousPrefectureId || ""} disabled={!departementId} options={sousPrefectures.map((x) => ({ value: x.id, label: x.nom }))}
          placeholder="Sélectionner la sous-préfecture" searchPlaceholder="Rechercher une sous-préfecture"
          onValueChange={(value) => { const x = sousPrefectures.find((s) => s.id === value); onChange({
            districtId: districtId || null, regionId: regionId || null, departementId: departementId || null, sousPrefectureId: value, villageId: null,
            regionName: regions.find((r) => r.id === regionId)?.nom || null, departementName: departements.find((d) => d.id === departementId)?.nom || null,
            sousPrefectureName: x?.nom || null, villageName: null
          }); }} />
      </div>}
      {showVillage && <div className="space-y-2 relative"><Label>Village / localité{required ? " *" : ""}</Label>
        <input value={villageSearch || ([...villages, ...villageMatches].find((v) => v.id === villageId)?.nom || "")}
          onChange={(e) => { setVillageSearch(e.target.value); if (!e.target.value.trim()) onChange({ villageId: null, villageName: null }); }}
          onFocus={() => { if (villageId) setVillageSearch([...villages, ...villageMatches].find((v) => v.id === villageId)?.nom || villageSearch); }}
          autoComplete="off" role="combobox" aria-expanded={villageMatches.length > 0}
          placeholder={sousPrefectureId ? "Rechercher un village" : "Saisir les premières lettres du village"}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        {searchingVillages && <p className="text-xs text-muted-foreground mt-1">Recherche des localités…</p>}
        {villageSearch.trim().length >= 2 && !searchingVillages && villageMatches.length === 0 && !villageId &&
          <p className="text-xs text-muted-foreground mt-1">Aucun village correspondant dans les localités accessibles.</p>}
        {villageMatches.length > 0 && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {villageMatches.map((v) => <button type="button" key={v.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            onMouseDown={(e) => e.preventDefault()} onClick={() => void selectVillage(v.id, v.nom)}>
            <span>{v.nom}</span>{v.sous_prefecture_id && <span className="ml-2 text-xs text-muted-foreground">Sélectionner pour renseigner la hiérarchie</span>}
          </button>)}
        </div>}
      </div>}
    </>}
    {extraField}
  </div>;
}
