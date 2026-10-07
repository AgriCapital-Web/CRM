import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OffreBase, PromotionBase, PrixEffectif, calculPrixEffectif } from "@/lib/pricing";

/**
 * Prix effectifs (promotions actives appliquées) de toutes les offres actives.
 * Équivalent client de la fonction SQL `offre_prix_effectif()`.
 */
export const useOffresPrixEffectif = () => {
  const query = useQuery({
    queryKey: ["offres-prix-effectif"],
    queryFn: async () => {
      const [o, p] = await Promise.all([
        (supabase as any)
          .from("offres")
          .select("id, code, nom, montant_total_par_ha, montant_pi_par_ha, montant_cash_par_ha, contribution_mensuelle_par_ha, duree_paiement_mois, tranches_paiement, actif")
          .eq("actif", true)
          .order("ordre", { ascending: true }),
        (supabase as any)
          .from("promotions")
          .select("id, nom, cible, type_promotion, pourcentage_reduction, montant_fixe_reduction, active, date_debut, date_fin, applique_toutes_offres, offre_ids")
          .eq("active", true),
      ]);
      const offres = (o.data || []) as OffreBase[];
      const promotions = (p.data || []) as PromotionBase[];
      return offres.map((offre) => calculPrixEffectif(offre, promotions, { modePaiement: "echeancier" }));
    },
  });

  const parOffre = (id?: string | null): PrixEffectif | undefined =>
    (query.data || []).find((r) => r.offre_id === id);

  const parCode = (code?: string | null): PrixEffectif | undefined =>
    (query.data || []).find((r) => r.code === code);

  return { prix: query.data || [], isLoading: query.isLoading, parOffre, parCode };
};
