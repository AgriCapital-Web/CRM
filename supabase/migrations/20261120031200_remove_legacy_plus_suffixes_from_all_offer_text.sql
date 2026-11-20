CREATE OR REPLACE FUNCTION public.agricapital_strip_plus_text(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE v_result jsonb; v_key text; v_value jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL;
  ELSIF jsonb_typeof(p_value)='object' THEN
    v_result:='{}'::jsonb;
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_value) LOOP
      v_result:=v_result||jsonb_build_object(v_key,public.agricapital_strip_plus_text(v_value));
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(p_value)='array' THEN
    SELECT coalesce(jsonb_agg(public.agricapital_strip_plus_text(value)),'[]'::jsonb) INTO v_result FROM jsonb_array_elements(p_value);
    RETURN v_result;
  ELSIF jsonb_typeof(p_value)='string' THEN
    RETURN to_jsonb(regexp_replace(p_value #>> '{}','[[:space:]]*[(][+][)]','','g'));
  END IF;
  RETURN p_value;
END;
$function$;

UPDATE public.offres
SET nom=regexp_replace(nom,'[[:space:]]*[(][+][)]','','g'),
    description=regexp_replace(description,'[[:space:]]*[(][+][)]','','g'),
    formules_configuration=public.agricapital_strip_plus_text(formules_configuration),
    updated_at=now()
WHERE coalesce(nom,'') ~ '[(][+][)]'
   OR coalesce(description,'') ~ '[(][+][)]'
   OR coalesce(formules_configuration::text,'') ~ '[(][+][)]';

UPDATE public.clients
SET formule_nom=regexp_replace(formule_nom,'[[:space:]]*[(][+][)]','','g'),
    offre_snapshot=public.agricapital_strip_plus_text(offre_snapshot),
    updated_at=now()
WHERE coalesce(formule_nom,'') ~ '[(][+][)]'
   OR coalesce(offre_snapshot::text,'') ~ '[(][+][)]';

UPDATE public.notification_templates
SET nom=regexp_replace(nom,'[[:space:]]*[(][+][)]','','g'),
    sujet=regexp_replace(sujet,'[[:space:]]*[(][+][)]','','g'),
    contenu=regexp_replace(contenu,'[[:space:]]*[(][+][)]','','g'),
    parcours=regexp_replace(parcours,'[[:space:]]*[(][+][)]','','g'),
    updated_at=now()
WHERE concat_ws(' ',nom,sujet,contenu,parcours) ~ '[(][+][)]';

DROP FUNCTION public.agricapital_strip_plus_text(jsonb);
