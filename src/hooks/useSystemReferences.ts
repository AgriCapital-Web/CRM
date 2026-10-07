import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSystemReferences(categories: string[]) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const key = categories.join("|");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("referentiels_systeme")
        .select("id,categorie,code,libelle,ordre,metadata")
        .in("categorie", categories)
        .eq("actif", true)
        .order("categorie")
        .order("ordre")
        .order("libelle");
      if (active) setRows(error ? [] : (data || []));
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [key]);

  const byCategory = useCallback((category: string) => rows.filter((x) => x.categorie === category), [rows]);
  return { rows, byCategory, loading };
}
