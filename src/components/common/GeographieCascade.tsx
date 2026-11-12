import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/common/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import { getAllItems, putItems, STORES } from "@/lib/offlineDb";

interface Props {
  extraField?: ReactNode;
  districtId?: string | null; regionId?: string | null; departementId?: string | null;
  sousPrefectureId?: string | null; villageId?: string | null; villageName?: string | null;
  includeInactive?: boolean;
  onChange: (values: {
    districtId?: string | null; districtName?: string | null; regionId?: string | null;
    departementId?: string | null; sousPrefectureId?: string | null; villageId?: string | null;
    villageName?: string | null; regionName?: string | null; departementName?: string | null;
    sousPrefectureName?: string | null;
  }) => void;
  required?: boolean; showDistrict?: boolean; showDepartement?: boolean; showSousPrefecture?: boolean; showVillage?: boolean; className?: string;
}
type GeoRow = { id: string; nom: string; [key: string]: any };
const normalizeGeo = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const geoIsEnabled = (row: any, keys: string[]) => {
  const key = keys.find((candidate) => typeof row?.[candidate] === "boolean");
  return key ? row[key] === true : false;
};
const filterGeoRows = (rows: any[], includeInactive: boolean, keys: string[]) =>
  includeInactive ? rows : rows.filter((row) => geoIsEnabled(row, keys));

function geoNameMatches(name: string, search: string): boolean {
  const a = normalizeGeo(name), b = normalizeGeo(search);
  if (!b || a.includes(b)) return true;
  if (b.length < 5 || Math.abs(a.length - b.length) > 2) return false;
  const x = a.replace(/ /g, ""), y = b.replace(/ /g, "");
  let prev = Array.from({length:y.length+1}, (_,i)=>i);
  for(let i=1;i<=x.length;i++){const cur=[i];for(let j=1;j<=y.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));prev=cur;}
  return prev[y.length] <= (b.length >= 9 ? 2 : 1);
}

export default function GeographieCascade({
  districtId, regionId, departementId, sousPrefectureId, villageId, villageName, onChange,
  required = false, showDistrict = true, showDepartement = true, showSousPrefecture = true, showVillage = true,
  includeInactive = false, className = "grid md:grid-cols-2 gap-4", extraField,
}: Props) {
  const [districts, setDistricts] = useState<GeoRow[]>([]);
  const [regions, setRegions] = useState<GeoRow[]>([]);
  const [departements, setDepartements] = useState<GeoRow[]>([]);
  const [sousPrefectures, setSousPrefectures] = useState<GeoRow[]>([]);
  const [villages, setVillages] = useState<GeoRow[]>([]);
  const [villageSearch, setVillageSearch] = useState("");
  const [villageDropdownOpen, setVillageDropdownOpen] = useState(false);
  const [villageMatches, setVillageMatches] = useState<GeoRow[]>([]);
  const [searchingVillages, setSearchingVillages] = useState(false);
  const [tick, setTick] = useState(0);
  const selectedDistrict = districts.find((d) => d.id === districtId);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  useEffect(() => {
    let active = true;
    Promise.all([getAllItems(STORES.DISTRICTS), getAllItems(STORES.REGIONS), getAllItems(STORES.DEPARTEMENTS), getAllItems(STORES.SOUS_PREFECTURES), getAllItems(STORES.VILLAGES)])
      .then(([d,r,de,sp,v]) => {
        if (!active) return;
        setDistricts(filterGeoRows(d, includeInactive, ["est_actif_effectif", "est_actif"]));
        setRegions(filterGeoRows(r, includeInactive, ["est_active_effectif", "est_active"]));
        setDepartements(filterGeoRows(de, includeInactive, ["est_actif_effectif", "est_actif"]));
        setSousPrefectures(filterGeoRows(sp, includeInactive, ["est_active_effectif", "est_active"]));
        const visibleVillages = filterGeoRows(v, includeInactive, ["est_actif_effectif", "est_actif"]);
        setVillages(visibleVillages);
        setVillageMatches(visibleVillages);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [includeInactive]);

  useEffect(() => {
    if (villageName !== undefined && villageName !== null) setVillageSearch(villageName);
  }, [villageName]);

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
      let districtQuery = (supabase as any).from("v_geo_districts").select("id,nom,est_actif_effectif").order("nom");
      if (!includeInactive) districtQuery = districtQuery.eq("est_actif_effectif", true);
      const [{ data, error }, { data: regionRows }] = await Promise.all([
        districtQuery,
        (supabase as any).from("regions").select("district_id"),
      ]);
      const withChildren = new Set((regionRows || []).map((r: any) => r.district_id));
      const sorted = filterGeoRows(data || [], includeInactive, ["est_actif_effectif"]).sort((a: any, b: any) =>
        Number(withChildren.has(a.id)) - Number(withChildren.has(b.id)) || String(a.nom).localeCompare(String(b.nom), "fr"));
      const cached = filterGeoRows(await getAllItems(STORES.DISTRICTS).catch(() => []), includeInactive, ["est_actif_effectif", "est_actif"]);
      if (active) setDistricts(error ? cached : sorted);
      if (!error) void putItems(STORES.DISTRICTS, sorted).catch(() => {});
    })();
    return () => { active = false; };
  }, [tick, includeInactive]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let query = (supabase as any).from("v_geo_regions").select("id,nom,district_id,est_active_effectif").order("nom");
      if (districtId) query = query.eq("district_id", districtId);
      if (!includeInactive) query = query.eq("est_active_effectif", true);
      const { data, error } = await query;
      const cachedRows = filterGeoRows(await getAllItems(STORES.REGIONS).catch(() => []), includeInactive, ["est_active_effectif", "est_active"]);
      const cached = districtId ? cachedRows.filter((x:any) => x.district_id === districtId) : cachedRows;
      const visible = filterGeoRows(data || [], includeInactive, ["est_active_effectif"]);
      if (active) setRegions(error ? cached : visible);
      if (!error) void putItems(STORES.REGIONS, visible).catch(()=>{});
    })();
    return () => { active = false; };
  }, [districtId, tick, includeInactive]);

  useEffect(() => {
    let active = true;
    if (!regionId) { setDepartements([]); return () => { active = false; }; }
    void (async () => {
      let query = (supabase as any).from("v_geo_departements").select("id,nom,region_id,est_actif_effectif")
        .eq("region_id", regionId).order("nom");
      if (!includeInactive) query = query.eq("est_actif_effectif", true);
      const { data, error } = await query;
      const cached = filterGeoRows(await getAllItems(STORES.DEPARTEMENTS).catch(() => []), includeInactive, ["est_actif_effectif", "est_actif"]).filter((x:any) => x.region_id === regionId);
      const visible = filterGeoRows(data || [], includeInactive, ["est_actif_effectif"]);
      if (active) setDepartements(error ? cached : visible);
      if (!error) void putItems(STORES.DEPARTEMENTS, visible).catch(()=>{});
    })();
    return () => { active = false; };
  }, [regionId, tick, includeInactive]);

  useEffect(() => {
    let active = true;
    if (!departementId) { setSousPrefectures([]); return () => { active = false; }; }
    void (async () => {
      let query = (supabase as any).from("v_geo_sous_prefectures").select("id,nom,departement_id,est_active_effectif")
        .eq("departement_id", departementId).order("nom");
      if (!includeInactive) query = query.eq("est_active_effectif", true);
      const { data, error } = await query;
      const cached = filterGeoRows(await getAllItems(STORES.SOUS_PREFECTURES).catch(() => []), includeInactive, ["est_active_effectif", "est_active"]).filter((x:any) => x.departement_id === departementId);
      const visible = filterGeoRows(data || [], includeInactive, ["est_active_effectif"]);
      if (active) setSousPrefectures(error ? cached : visible);
      if (!error) void putItems(STORES.SOUS_PREFECTURES, visible).catch(()=>{});
    })();
    return () => { active = false; };
  }, [departementId, tick, includeInactive]);

  useEffect(() => {
    let active = true;
    if (!sousPrefectureId) { setVillages([]); return () => { active = false; }; }
    void (async () => {
      let query = (supabase as any).from("v_geo_villages").select("id,nom,sous_prefecture_id,est_actif_effectif")
        .eq("sous_prefecture_id", sousPrefectureId).order("nom");
      if (!includeInactive) query = query.eq("est_actif_effectif", true);
      const { data, error } = await query;
      const cached = filterGeoRows(await getAllItems(STORES.VILLAGES).catch(() => []), includeInactive, ["est_actif_effectif", "est_actif"]).filter((x:any) => x.sous_prefecture_id === sousPrefectureId);
      const visible = filterGeoRows(data || [], includeInactive, ["est_actif_effectif"]);
      if (active) setVillages(error ? cached : visible);
      if (!error) void putItems(STORES.VILLAGES, visible).catch(()=>{});
    })();
    return () => { active = false; };
  }, [sousPrefectureId, tick, includeInactive]);

  useEffect(() => {
    let active = true;
    const term = villageSearch.trim();
    if (term.length < 2 && !(villageDropdownOpen && districtId)) {
      setVillageMatches([]);
      setSearchingVillages(false);
      return () => { active = false; };
    }
    setSearchingVillages(true);
    const timer = setTimeout(async () => {
      try {
        let candidates:any[] = filterGeoRows(await getAllItems(STORES.VILLAGES).catch(()=>[]), includeInactive, ["est_actif_effectif", "est_actif"]);
        if (!offline) {
          const PAGE=1000; let offset=0; const fresh:any[]=[];
          for(let page=0;page<50;page++){
            let query = (supabase as any).from("v_geo_villages").select("id,nom,sous_prefecture_id,est_actif_effectif").order("nom");
            if (!includeInactive) query = query.eq("est_actif_effectif", true);
            const {data,error}=await query.range(offset,offset+PAGE-1);
            if(error||!data?.length)break;
            fresh.push(...data); if(data.length<PAGE)break; offset+=PAGE;
          }
          if (fresh.length) {
            const [spRows,depRows,regRows]=await Promise.all([
              (supabase as any).from("sous_prefectures").select("id,departement_id"),
              (supabase as any).from("departements").select("id,region_id"),
              (supabase as any).from("regions").select("id,district_id")
            ]);
            const spById=new Map((spRows.data||[]).map((x:any)=>[String(x.id),x]));
            const depById=new Map((depRows.data||[]).map((x:any)=>[String(x.id),x]));
            const regById=new Map((regRows.data||[]).map((x:any)=>[String(x.id),x]));
            candidates.push(...fresh.map((v:any)=>{
              const sp:any=spById.get(String(v.sous_prefecture_id));
              const dep:any=sp?.departement_id?depById.get(String(sp.departement_id)):undefined;
              const reg:any=dep?.region_id?regById.get(String(dep.region_id)):undefined;
              return {...v,departement_id:sp?.departement_id||null,region_id:dep?.region_id||null,district_id:reg?.district_id||null};
            }));
          }
          const unique=new Map<string,any>(); for(const row of candidates)if(row?.id)unique.set(String(row.id),row);
          candidates=filterGeoRows([...unique.values()], includeInactive, ["est_actif_effectif", "est_actif"]);
          if(candidates.length)void putItems(STORES.VILLAGES,candidates).catch(()=>{});
        }
        let matches=candidates.filter(v=>v?.id&&v?.nom&&geoNameMatches(v.nom,term));
        if(sousPrefectureId)matches=matches.filter(v=>v.sous_prefecture_id===sousPrefectureId);
        else if(departementId){
          const sps=await getAllItems(STORES.SOUS_PREFECTURES).catch(()=>[]);
          const ids=new Set(sps.filter((x:any)=>x.departement_id===departementId).map((x:any)=>x.id));
          matches=matches.filter(v=>v.departement_id===departementId || ids.has(v.sous_prefecture_id));
        } else if(regionId){
          const deps=await getAllItems(STORES.DEPARTEMENTS).catch(()=>[]), sps=await getAllItems(STORES.SOUS_PREFECTURES).catch(()=>[]);
          const depIds=new Set(deps.filter((x:any)=>x.region_id===regionId).map((x:any)=>x.id));
          const spIds=new Set(sps.filter((x:any)=>depIds.has(x.departement_id)).map((x:any)=>x.id));
          matches=matches.filter(v=>v.region_id===regionId || v.district_id===districtId || spIds.has(v.sous_prefecture_id));
        } else if(districtId){
          const regs=await getAllItems(STORES.REGIONS).catch(()=>[]), deps=await getAllItems(STORES.DEPARTEMENTS).catch(()=>[]), sps=await getAllItems(STORES.SOUS_PREFECTURES).catch(()=>[]);
          const regIds=new Set(regs.filter((x:any)=>x.district_id===districtId).map((x:any)=>x.id));
          const depIds=new Set(deps.filter((x:any)=>regIds.has(x.region_id)).map((x:any)=>x.id));
          const spIds=new Set(sps.filter((x:any)=>depIds.has(x.departement_id)).map((x:any)=>x.id));
          matches=matches.filter(v=>spIds.has(v.sous_prefecture_id));
        }
        const q=normalizeGeo(term); matches.sort((x,y)=>((normalizeGeo(x.nom)===q?0:normalizeGeo(x.nom).startsWith(q)?1:2)-(normalizeGeo(y.nom)===q?0:normalizeGeo(y.nom).startsWith(q)?1:2))||String(x.nom).localeCompare(String(y.nom),"fr"));
        if(active){setVillageMatches(matches.slice(0,30));setSearchingVillages(false);}
      }catch{if(active){setVillageMatches([]);setSearchingVillages(false);}}
    },180);
    return()=>{active=false;clearTimeout(timer);};
  }, [villageSearch,villageDropdownOpen,districtId,regionId,departementId,sousPrefectureId,tick,offline,includeInactive]);

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
    setVillageDropdownOpen(false);
    setVillageMatches([]);
  };

  useEffect(() => {
    const query = normalizeGeo(villageSearch);
    if (query.length < 3 || !villageMatches.length) return;
    const exactMatches = villageMatches.filter((v) => normalizeGeo(v.nom) === query);
    if (exactMatches.length === 1 && exactMatches[0].id !== villageId) {
      void selectVillage(exactMatches[0].id, exactMatches[0].nom);
    }
  }, [villageSearch, villageMatches, villageId]);

  const hasChildren = !/diaspora/i.test(selectedDistrict?.nom || "");
  return <div className={className}>
    {showDistrict && <div className="space-y-2"><Label>District</Label>
      <SearchableSelect value={districtId || ""} onValueChange={(value) => onChange({
        districtId: value, districtName: districts.find((d) => d.id === value)?.nom || null,
        regionId: null, departementId: null, sousPrefectureId: null, villageId: null,
      })} options={districts.map((x) => ({ value: x.id, label: x.nom }))}
        placeholder="Sélectionner le district" searchPlaceholder="Rechercher un district" />
    </div>}
    {hasChildren && <>
      <div className="space-y-2"><Label>Région</Label>
        <SearchableSelect value={regionId || ""} options={regions.map((x) => ({ value: x.id, label: x.nom }))}
          placeholder="Sélectionner la région" searchPlaceholder="Rechercher une région"
          onValueChange={(value) => { const x = regions.find((r) => r.id === value); onChange({
            districtId: x?.district_id || districtId || null, districtName: districts.find((d) => d.id === (x?.district_id || districtId))?.nom || selectedDistrict?.nom || null, regionId: value,
            departementId: null, sousPrefectureId: null, villageId: null, regionName: x?.nom || null
          }); }} />
      </div>
      {showDepartement && <div className="space-y-2"><Label>Département</Label>
        <SearchableSelect value={departementId || ""} disabled={!regionId} options={departements.map((x) => ({ value: x.id, label: x.nom }))}
          placeholder="Sélectionner le département" searchPlaceholder="Rechercher un département"
          onValueChange={(value) => { const x = departements.find((d) => d.id === value); onChange({
            districtId: districtId || null, regionId: regionId || null, departementId: value, sousPrefectureId: null, villageId: null,
            regionName: regions.find((r) => r.id === regionId)?.nom || null, departementName: x?.nom || null, sousPrefectureName: null, villageName: null
          }); }} />
      </div>}
      {showSousPrefecture && <div className="space-y-2"><Label>Sous-préfecture</Label>
        <SearchableSelect value={sousPrefectureId || ""} disabled={!departementId} options={sousPrefectures.map((x) => ({ value: x.id, label: x.nom }))}
          placeholder="Sélectionner la sous-préfecture" searchPlaceholder="Rechercher une sous-préfecture"
          onValueChange={(value) => { const x = sousPrefectures.find((s) => s.id === value); onChange({
            districtId: districtId || null, regionId: regionId || null, departementId: departementId || null, sousPrefectureId: value, villageId: null,
            regionName: regions.find((r) => r.id === regionId)?.nom || null, departementName: departements.find((d) => d.id === departementId)?.nom || null,
            sousPrefectureName: x?.nom || null, villageName: null
          }); }} />
      </div>}
      {showVillage && <div className="space-y-2 relative"><Label>Village / localité{required ? " *" : ""}</Label>
        <input value={villageSearch || villageName || ([...villages, ...villageMatches].find((v) => v.id === villageId)?.nom || "")}
          onChange={(e) => { const value=e.target.value; setVillageSearch(value); setVillageDropdownOpen(true); onChange({ villageId:null, villageName:value }); }}
          onClick={() => { setVillageDropdownOpen(true); if (villageId) setVillageSearch(""); }}
          onBlur={() => { window.setTimeout(() => setVillageDropdownOpen(false), 160); }}
          autoComplete="off" role="combobox" aria-expanded={villageDropdownOpen && villageMatches.length > 0}
          aria-autocomplete="list"
          placeholder={sousPrefectureId ? "Cliquer puis rechercher un village" : "Cliquer pour rechercher ou saisir une localité"}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        {searchingVillages && <p className="text-xs text-muted-foreground mt-1">Recherche des localités…</p>}
        {villageSearch.trim().length >= 2 && !searchingVillages && villageMatches.length === 0 && !villageId &&
          <p className="text-xs text-muted-foreground mt-1">Aucun village correspondant dans les localités accessibles.</p>}
        {villageDropdownOpen && villageMatches.length > 0 && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
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
