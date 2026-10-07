import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SystemReferentielItem {
  id: string;
  categorie: string;
  code: string;
  libelle: string;
  ordre: number;
  metadata: Record<string, unknown>;
}

export function useSystemReferentiel(categorie: string) {
  const [items, setItems] = useState<SystemReferentielItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("v_referentiels_systeme")
        .select("id,categorie,code,libelle,ordre,metadata")
        .eq("categorie", categorie)
        .order("ordre")
        .order("libelle");
      if (!active) return;
      if (error) {
        setError(error);
        setItems([]);
      } else {
        setError(null);
        setItems(data || []);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [categorie]);

  return { items, loading, error };
}
