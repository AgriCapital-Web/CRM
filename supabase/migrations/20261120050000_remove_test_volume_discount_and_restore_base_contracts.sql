
-- Annule la remise de volume de test, qui ne fait pas partie de la grille tarifaire validee.
-- Les montants sont restaures depuis la configuration de formule deja figee dans chaque dossier.
DO $$
DECLARE
  v_promotion_ids uuid[];
BEGIN
  SELECT array_agg(id)
    INTO v_promotion_ids
    FROM public.promotions
   WHERE nom = 'Remise volume — 10 ha et plus'
     AND cible = 'mensualites'
     AND type_promotion = 'mensualites'
     AND pourcentage_reduction = 10
     AND coalesce(surface_min_ha, 0) = 10;

  IF coalesce(array_length(v_promotion_ids, 1), 0) = 0 THEN
    RAISE NOTICE 'Aucune remise de volume de test trouvee; aucune restauration necessaire.';
    RETURN;
  END IF;

  UPDATE public.promotions
     SET active = false,
         updated_at = now()
   WHERE id = ANY(v_promotion_ids);

  WITH targets AS (
    SELECT
      c.id,
      coalesce(nullif(c.metadata->>'surface_contractuelle_ha', '')::numeric,
               nullif(c.total_hectares, 0),
               nullif(c.superficie_ha, 0), 0) AS surface_ha,
      c.offre_snapshot #> '{formula,configuration}' AS base_formula,
      nullif(c.offre_snapshot #>> '{formula,configuration,montant_total_par_ha}', '')::numeric AS total_par_ha,
      nullif(c.offre_snapshot #>> '{formula,configuration,mensualite_par_ha}', '')::numeric AS mensualite_par_ha
    FROM public.clients c
    WHERE c.promotion_id = ANY(v_promotion_ids)
  ), amounts AS (
    SELECT *,
      round(surface_ha * total_par_ha, 0) AS total_contrat,
      round(surface_ha * mensualite_par_ha, 0) AS mensualite_totale
    FROM targets
  )
  UPDATE public.clients c
     SET montant_total_par_ha = a.total_par_ha,
         mensualite_par_ha = a.mensualite_par_ha,
         montant_total_contrat = a.total_contrat,
         mensualite_montant = a.mensualite_totale,
         taux_journalier_ha = a.mensualite_par_ha / 30,
         echeancier = coalesce(a.base_formula->'tranches_paiement', '[]'::jsonb),
         promotion_id = NULL,
         montant_promo_applique = 0,
         offre_snapshot = jsonb_set(
           jsonb_set(
             coalesce(c.offre_snapshot, '{}'::jsonb),
             '{contract}',
             (coalesce(c.offre_snapshot->'contract', '{}'::jsonb) - 'promotion_id' - 'montant_promo_applique')
             || jsonb_build_object(
               'montant_total_par_ha', a.total_par_ha,
               'mensualite_par_ha', a.mensualite_par_ha,
               'montant_total_contrat', a.total_contrat,
               'mensualite_montant', a.mensualite_totale,
               'taux_journalier_ha', a.mensualite_par_ha / 30,
               'echeancier', coalesce(a.base_formula->'tranches_paiement', '[]'::jsonb)
             ),
             true
           ),
           '{snapshot_at}', to_jsonb(now()::text), true
         ),
         updated_at = now()
    FROM amounts a
   WHERE c.id = a.id
     AND a.total_par_ha IS NOT NULL
     AND a.mensualite_par_ha IS NOT NULL
     AND a.surface_ha > 0;

  WITH targets AS (
    SELECT
      a.id,
      coalesce(nullif(c.metadata->>'surface_contractuelle_ha', '')::numeric,
               nullif(c.total_hectares, 0),
               nullif(c.superficie_ha, 0),
               nullif(a.superficie_ha, 0), 0) AS surface_ha,
      c.offre_snapshot #> '{formula,configuration}' AS base_formula,
      nullif(c.offre_snapshot #>> '{formula,configuration,montant_total_par_ha}', '')::numeric AS total_par_ha,
      nullif(c.offre_snapshot #>> '{formula,configuration,mensualite_par_ha}', '')::numeric AS mensualite_par_ha
    FROM public.acquisitions a
    JOIN public.clients c ON c.id = a.client_id
    WHERE a.promotion_id = ANY(v_promotion_ids)
  ), amounts AS (
    SELECT *,
      round(surface_ha * total_par_ha, 0) AS total_contrat,
      round(surface_ha * mensualite_par_ha, 0) AS mensualite_totale
    FROM targets
  )
  UPDATE public.acquisitions a
     SET montant_total_par_ha = x.total_par_ha,
         mensualite_par_ha = x.mensualite_par_ha,
         montant_total_contrat = x.total_contrat,
         mensualite_montant = x.mensualite_totale,
         taux_journalier_ha = x.mensualite_par_ha / 30,
         echeancier = coalesce(x.base_formula->'tranches_paiement', '[]'::jsonb),
         promotion_id = NULL,
         montant_promo_applique = 0,
         offre_snapshot = jsonb_set(
           jsonb_set(
             coalesce(a.offre_snapshot, '{}'::jsonb),
             '{contract}',
             (coalesce(a.offre_snapshot->'contract', '{}'::jsonb) - 'promotion_id' - 'montant_promo_applique')
             || jsonb_build_object(
               'montant_total_par_ha', x.total_par_ha,
               'mensualite_par_ha', x.mensualite_par_ha,
               'montant_total_contrat', x.total_contrat,
               'mensualite_montant', x.mensualite_totale,
               'taux_journalier_ha', x.mensualite_par_ha / 30,
               'echeancier', coalesce(x.base_formula->'tranches_paiement', '[]'::jsonb)
             ),
             true
           ),
           '{snapshot_at}', to_jsonb(now()::text), true
         ),
         updated_at = now()
    FROM amounts x
   WHERE a.id = x.id
     AND x.total_par_ha IS NOT NULL
     AND x.mensualite_par_ha IS NOT NULL
     AND x.surface_ha > 0;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE promotion_id = ANY(v_promotion_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.acquisitions
    WHERE promotion_id = ANY(v_promotion_ids)
  ) THEN
    RAISE EXCEPTION 'La remise de volume reste rattachee a un dossier client ou acquisition.';
  END IF;
END;
$$;
