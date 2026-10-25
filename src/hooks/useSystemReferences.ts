import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSystemReferences(categories: string[]) {
  const queryClient = useQueryClient();
  const key = [...categories].sort().join("|");
  const query = useQuery({
    queryKey: ["system-references", key],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("referentiels_systeme")
        .select("id,categorie,code,libelle,ordre,metadata")
        .in("categorie", key.split("|").filter(Boolean))
        .eq("actif", true)
        .order("categorie")
        .order("ordre")
        .order("libelle");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    const channel = supabase.channel("system-references-live-" + key.replace(/[^a-zA-Z0-9_-]/g, "_"))
      .on("postgres_changes", { event: "*", schema: "public", table: "referentiels_systeme" }, (payload: any) => {
        const changedCategory = payload?.new?.categorie || payload?.old?.categorie;
        if (!changedCategory || key.split("|").includes(changedCategory)) {
          void queryClient.invalidateQueries({ queryKey: ["system-references", key] });
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [key, queryClient]);

  const rows = query.data || [];
  const byCategory = useCallback((category: string) => rows.filter((x: any) => x.categorie === category), [rows]);
  return { rows, byCategory, loading: query.isPending };
}
