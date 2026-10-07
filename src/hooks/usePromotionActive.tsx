import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { meilleurePromotion, PromotionBase, OffreBase } from "@/lib/pricing";

/**
 * Retourne la meilleure promotion active applicable à l'offre demandée.
 * Sans offreId, retourne la meilleure promotion active globale.
 */
export const usePromotionActive = (offreId?: string | null) => {
  return useQuery({
    queryKey: ["promotion-active", offreId || "global"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const promotions = (data || []) as PromotionBase[];
      const nowDate = new Date(now);
      const active = promotions.filter((p) => p.active && (!p.date_debut || new Date(p.date_debut) <= nowDate) && (!p.date_fin || new Date(p.date_fin) >= nowDate));
      if (!offreId) return active[0] || null;

      const offre = { id: offreId } as OffreBase;
      return meilleurePromotion(offre, active, nowDate);
    },
    staleTime: 30_000,
  });
};
