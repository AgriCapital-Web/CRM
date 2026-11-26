CREATE OR REPLACE FUNCTION public.validate_beneficiaire_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_limit numeric;
  v_mode text;
  v_agricapital numeric;
BEGIN
  SELECT surface_totale_ha, mode_surface, surface_agricapital_ha
    INTO v_total, v_mode, v_agricapital
    FROM public.parcelles
   WHERE id = new.parcelle_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Parcelle introuvable pour cette attribution';
  END IF;

  v_limit := CASE
    WHEN lower(coalesce(v_mode,'')) IN ('propriete_client','propriete','client')
      THEN v_total
    ELSE coalesce(v_agricapital, v_total / 2)
  END;

  SELECT coalesce(sum(surface_attribuee_ha),0)
    INTO v_total
    FROM public.beneficiaire_attributions
   WHERE parcelle_id = new.parcelle_id
     AND id IS DISTINCT FROM new.id
     AND statut = 'active';

  IF v_total + new.surface_attribuee_ha > v_limit + 0.000001 THEN
    RAISE EXCEPTION 'La somme des superficies attribuées dépasse la part disponible pour les bénéficiaires';
  END IF;
  RETURN new;
END
$function$;
