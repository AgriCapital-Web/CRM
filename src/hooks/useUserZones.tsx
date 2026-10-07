import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ZoneAssignment { zone_type: string; zone_id: string; }

const toStringIds = (values: unknown[]): string[] => Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));

export function useUserZones() {
  const { user, userRoles } = useAuth();
  const [assignments, setAssignments] = useState<ZoneAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = userRoles.some(r => ["super_admin", "pdg", "dg", "responsable_operations"].includes(r));

  useEffect(() => {
    if (!user?.id) { setAssignments([]); setLoading(false); return; }
    if (isAdmin) { setAssignments([]); setLoading(false); return; }
    void fetchAssignments();
  }, [user?.id, isAdmin]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("zone_assignments")
        .select("zone_type, zone_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      setAssignments(data || []);
    } catch (e) {
      console.error("Failed to fetch zone assignments:", e);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const ids = (type: string) => assignments.filter(a => a.zone_type === type).map(a => a.zone_id);

  const fetchFilteredDistricts = async () => {
    if (isAdmin) {
      const { data } = await (supabase as any).from("v_geo_districts").select("*").eq("est_actif_effectif", true).order("nom");
      return data || [];
    }

    const districtIds = ids("district");
    if (districtIds.length) {
      const { data } = await (supabase as any).from("v_geo_districts").select("*").in("id", districtIds).eq("est_actif_effectif", true).order("nom");
      return data || [];
    }

    const regionIds = ids("region");
    const deptIds = ids("departement");
    const spIds = ids("sous_prefecture");

    let regionScope = regionIds;
    if (!regionScope.length && deptIds.length) {
      const { data } = await (supabase as any).from("v_geo_departements").select("region_id").in("id", deptIds).eq("est_actif_effectif", true);
      regionScope = toStringIds((data || []).map((x:any) => x.region_id));
    }
    if (!regionScope.length && spIds.length) {
      const { data: sps } = await (supabase as any).from("v_geo_sous_prefectures").select("departement_id").in("id", spIds).eq("est_active_effectif", true);
      const dIds = toStringIds((sps || []).map((x:any) => x.departement_id));
      if (dIds.length) {
        const { data } = await (supabase as any).from("v_geo_departements").select("region_id").in("id", dIds).eq("est_actif_effectif", true);
        regionScope = toStringIds((data || []).map((x:any) => x.region_id));
      }
    }
    if (!regionScope.length) return [];

    const { data } = await (supabase as any).from("v_geo_regions").select("district_id").in("id", regionScope).eq("est_active_effectif", true);
    const districtScope = toStringIds((data || []).map((x:any) => x.district_id));
    if (!districtScope.length) return [];

    const { data: districts } = await (supabase as any).from("v_geo_districts").select("*").in("id", districtScope).eq("est_actif_effectif", true).order("nom");
    return districts || [];
  };

  const fetchFilteredRegions = async (districtId: string) => {
    const base = (supabase as any).from("v_geo_regions").select("*").eq("district_id", districtId).eq("est_active_effectif", true).order("nom");
    if (isAdmin) {
      const { data } = await base;
      return data || [];
    }

    const assignedRegions = ids("region");
    if (assignedRegions.length) {
      const { data } = await base.in("id", assignedRegions);
      return data || [];
    }

    const deptIds = ids("departement");
    const spIds = ids("sous_prefecture");
    let regionScope:string[] = [];

    if (deptIds.length) {
      const { data } = await (supabase as any).from("v_geo_departements").select("region_id").in("id", deptIds).eq("est_actif_effectif", true);
      regionScope = toStringIds((data || []).map((x:any) => x.region_id));
    } else if (spIds.length) {
      const { data: sps } = await (supabase as any).from("v_geo_sous_prefectures").select("departement_id").in("id", spIds).eq("est_active_effectif", true);
      const dIds = toStringIds((sps || []).map((x:any) => x.departement_id));
      if (dIds.length) {
        const { data } = await (supabase as any).from("v_geo_departements").select("region_id").in("id", dIds).eq("est_actif_effectif", true);
        regionScope = toStringIds((data || []).map((x:any) => x.region_id));
      }
    }

    if (regionScope.length) {
      const { data } = await base.in("id", regionScope);
      return data || [];
    }

    return [];
  };

  const fetchFilteredDepartements = async (regionId: string) => {
    const base = (supabase as any).from("v_geo_departements").select("*").eq("region_id", regionId).eq("est_actif_effectif", true).order("nom");
    if (isAdmin) {
      const { data } = await base;
      return data || [];
    }

    const assignedDeptIds = ids("departement");
    if (assignedDeptIds.length) {
      const { data } = await base.in("id", assignedDeptIds);
      return data || [];
    }

    const spIds = ids("sous_prefecture");
    if (spIds.length) {
      const { data: sps } = await (supabase as any).from("v_geo_sous_prefectures").select("departement_id").in("id", spIds).eq("est_active_effectif", true);
      const deptScope = toStringIds((sps || []).map((x:any) => x.departement_id));
      if (deptScope.length) {
        const { data } = await base.in("id", deptScope);
        return data || [];
      }
      return [];
    }

    return [];
  };

  const fetchFilteredSousPrefectures = async (departementId: string) => {
    const base = (supabase as any).from("v_geo_sous_prefectures").select("*").eq("departement_id", departementId).eq("est_active_effectif", true).order("nom");
    if (isAdmin) {
      const { data } = await base;
      return data || [];
    }

    const assignedSpIds = ids("sous_prefecture");
    if (!assignedSpIds.length) return [];
    const { data } = await base.in("id", assignedSpIds);
    return data || [];
  };

  return {
    assignments,
    loading,
    isAdmin,
    fetchFilteredDistricts,
    fetchFilteredRegions,
    fetchFilteredDepartements,
    fetchFilteredSousPrefectures,
  };
}
