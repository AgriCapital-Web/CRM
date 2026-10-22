CREATE OR REPLACE FUNCTION public.get_client_effective_pi(_client_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.clients%rowtype;
  o public.offres%rowtype;
  formula jsonb;
  base_pi numeric;
  base_total numeric;
  effective_pi numeric;
  promo record;
  promo_target text;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id=_client_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_staff(auth.uid())
     AND c.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé' USING errcode='42501';
  END IF;

  SELECT * INTO o FROM public.offres WHERE id=c.offre_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF jsonb_typeof(o.formules_configuration)='array' THEN
    SELECT value INTO formula
      FROM jsonb_array_elements(o.formules_configuration)
      WHERE value->>'code'=c.formule_code
      LIMIT 1;
  END IF;

  -- Legacy clients without a matching configured formula keep the existing
  -- promotion-aware offer-level calculation.
  IF formula IS NULL THEN
    SELECT COALESCE(p.pi_effectif,0) INTO effective_pi
    FROM public.offre_prix_effectif() p
    WHERE p.offre_id=o.id
    LIMIT 1;
    RETURN COALESCE(effective_pi,0);
  END IF;

  base_pi := GREATEST(0,COALESCE(NULLIF(formula->>'montant_pi_par_ha','')::numeric,o.montant_pi_par_ha,0));
  base_total := GREATEST(base_pi,COALESCE(NULLIF(formula->>'montant_total_par_ha','')::numeric,
    NULLIF(formula->>'montant_cash_par_ha','')::numeric,o.montant_total_par_ha,base_pi));

  SELECT p.id,
    CASE WHEN lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) IN ('cout_global','coût_global','total_contrat','cg','special')
      THEN 'cout_global' ELSE 'paiement_initial' END AS cible,
    coalesce(p.pourcentage_reduction,0) AS pct,
    coalesce(p.montant_fixe_reduction,0) AS fixe
  INTO promo
  FROM public.promotions p
  WHERE p.active=true
    AND (p.date_debut IS NULL OR p.date_debut<=now())
    AND (p.date_fin IS NULL OR p.date_fin>=now())
    AND (p.applique_toutes_offres=true OR EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(coalesce(p.offre_ids,'[]'::jsonb)) x
      WHERE x=o.id::text OR x=o.code
    ))
  ORDER BY coalesce(p.pourcentage_reduction,0) DESC,
           coalesce(p.montant_fixe_reduction,0) DESC,p.created_at DESC
  LIMIT 1;

  IF promo.id IS NULL THEN
    RETURN base_pi;
  END IF;

  IF promo.cible='cout_global' THEN
    effective_pi := LEAST(base_pi,GREATEST(base_total*(1-promo.pct/100.0)-promo.fixe,0));
  ELSE
    effective_pi := GREATEST(base_pi*(1-promo.pct/100.0)-promo.fixe,0);
  END IF;
  RETURN GREATEST(0,LEAST(base_total,effective_pi));
END;
$function$;
