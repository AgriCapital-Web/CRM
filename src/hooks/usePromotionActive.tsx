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

      const { data: offreData, error: offreError } = await supabase
        .from("offres")
        .select("id,code,nom,montant_total_par_ha,montant_pi_par_ha,mensualite_par_ha,montant_cash_par_ha,duree_paiement_mois,tranches_paiement,actif")
        .eq("id", offreId)
        .maybeSingle();
      if (offreError) throw offreError;
      if (!offreData) return null;
      return meilleurePromotion(offreData as OffreBase, active, nowDate);
    },
    staleTime: 30_000,
  });
};
