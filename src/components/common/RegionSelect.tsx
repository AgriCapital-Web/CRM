import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SearchableSelect from "@/components/common/SearchableSelect";

export function useRegions() {
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("v_geo_regions")
          .select("id,nom")
          .eq("est_active_effectif", true)
          .order("nom", { ascending: true });
        if (error) throw error;
        if (active) setRegions((data || []).map((r: any) => String(r.nom)).filter(Boolean));
      } catch {
        if (active) setRegions([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { regions, loading };
}

interface RegionSelectProps {
  value?: string;
  onChange: (value: string, isDiaspora: boolean) => void;
  withDiaspora?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export default function RegionSelect({
  value,
  onChange,
  placeholder = "Sélectionnez une région...",
  disabled,
}: RegionSelectProps) {
  const { regions, loading } = useRegions();

  return (
    <SearchableSelect
      value={value || ""}
      disabled={disabled || loading}
      onValueChange={(v) => onChange(v, false)}
      options={regions.map((r) => ({ value: r, label: r }))}
      placeholder={placeholder}
      searchPlaceholder="Rechercher une région..."
    />
  );
}
