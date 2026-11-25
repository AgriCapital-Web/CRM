DO $migrate$
DECLARE
  v_definition text;
  v_rule text := $rule$  IF v_family LIKE '%PALMINVEST%' AND (
    abs(coalesce(v_lot.surface_ha,0)-1)>0.000001 OR abs(v_surface-1)>0.000001
  ) THEN
    RAISE EXCEPTION 'Un lot PalmInvest doit être attribué en totalité, soit 1 ha.';
  END IF;

$rule$;
BEGIN
  SELECT pg_get_functiondef('public.allocate_acquisition_lot(uuid,uuid,numeric,text)'::regprocedure)
    INTO v_definition;
  IF position(v_rule in v_definition)=0 THEN
    RAISE EXCEPTION 'La règle historique PalmInvest de 1 ha n’a pas été trouvée.';
  END IF;
  EXECUTE replace(v_definition,v_rule,'');
END;
$migrate$;
