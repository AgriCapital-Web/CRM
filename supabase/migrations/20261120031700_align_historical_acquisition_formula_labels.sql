CREATE OR REPLACE FUNCTION public.agricapital_align_formula_labels(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE v_result jsonb; v_key text; v_value jsonb; v_code text;
BEGIN
  IF p_value IS NULL THEN RETURN NULL;
  ELSIF jsonb_typeof(p_value)='object' THEN
    v_result:='{}'::jsonb;
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_value) LOOP
      v_result:=v_result||jsonb_build_object(v_key,public.agricapital_align_formula_labels(v_value));
    END LOOP;
    v_code:=v_result->>'code';
    IF v_code IN ('PALMINVEST_AUTONOME','TERRAPALM_AUTONOME') THEN
      v_result:=jsonb_set(v_result,'{nom}',to_jsonb('Libre'::text),true);
    ELSIF v_code IN ('PALMINVEST_DELEGUE','TERRAPALM_DELEGUE') THEN
      v_result:=jsonb_set(v_result,'{nom}',to_jsonb('Sous gestion'::text),true);
    END IF;
    RETURN v_result;
  ELSIF jsonb_typeof(p_value)='array' THEN
    SELECT coalesce(jsonb_agg(public.agricapital_align_formula_labels(value)),'[]'::jsonb) INTO v_result FROM jsonb_array_elements(p_value);
    RETURN v_result;
  END IF;
  RETURN p_value;
END;
$function$;

UPDATE public.clients
SET formule_nom=CASE
      WHEN formule_code IN ('PALMINVEST_AUTONOME','TERRAPALM_AUTONOME') THEN 'Libre'
      WHEN formule_code IN ('PALMINVEST_DELEGUE','TERRAPALM_DELEGUE') THEN 'Sous gestion'
      ELSE formule_nom
    END,
    offre_snapshot=public.agricapital_align_formula_labels(offre_snapshot),
    updated_at=now()
WHERE formule_code IN ('PALMINVEST_AUTONOME','TERRAPALM_AUTONOME','PALMINVEST_DELEGUE','TERRAPALM_DELEGUE')
   OR coalesce(offre_snapshot::text,'') ~ 'PALMINVEST_AUTONOME|TERRAPALM_AUTONOME|PALMINVEST_DELEGUE|TERRAPALM_DELEGUE';

UPDATE public.acquisitions
SET offre_snapshot=public.agricapital_align_formula_labels(offre_snapshot),
    updated_at=now()
WHERE coalesce(offre_snapshot::text,'') ~ 'PALMINVEST_AUTONOME|TERRAPALM_AUTONOME|PALMINVEST_DELEGUE|TERRAPALM_DELEGUE';

DROP FUNCTION public.agricapital_align_formula_labels(jsonb);
