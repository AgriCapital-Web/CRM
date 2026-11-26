
DO $do$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.validate_client_acquisition_foncier()'::regprocedure)
    INTO v_definition;

  v_old := $old$ IF TG_OP='UPDATE' THEN
  IF OLD.client_id IS DISTINCT FROM NEW.client_id OR OLD.lot_id IS DISTINCT FROM NEW.lot_id OR OLD.parcelle_id IS DISTINCT FROM NEW.parcelle_id OR OLD.necessite_foncier_client IS DISTINCT FROM NEW.necessite_foncier_client THEN
   RAISE EXCEPTION 'L’affectation foncière d’une acquisition enregistrée ne peut pas être modifiée directement.';
  END IF;
  RETURN NEW;
 END IF;$old$;

  v_new := $new$ IF TG_OP='UPDATE' THEN
  IF OLD.client_id IS NOT DISTINCT FROM NEW.client_id
     AND OLD.lot_id IS NOT DISTINCT FROM NEW.lot_id
     AND OLD.parcelle_id IS NOT DISTINCT FROM NEW.parcelle_id
     AND OLD.necessite_foncier_client IS NOT DISTINCT FROM NEW.necessite_foncier_client
     AND OLD.superficie_ha IS NOT DISTINCT FROM NEW.superficie_ha
     AND OLD.metadata->'lot_allocations' IS NOT DISTINCT FROM NEW.metadata->'lot_allocations' THEN
    RETURN NEW;
  END IF;
 END IF;$new$;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Bloc de validation UPDATE attendu introuvable; aucune modification appliquée.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END
$do$;
