-- Restore the original AgriCapital internal-client record from its immutable audit snapshot.
-- This account is an internal company control record, not a commercial customer sale.
DO $restore$
DECLARE
  v_old jsonb;
  v_row public.clients%rowtype;
BEGIN
  SELECT ancienne_valeur INTO v_old
  FROM public.admin_audit_logs
  WHERE entite = 'clients'
    AND entite_id = '3da48833-cc0b-4e94-aa41-c1b9bcf862c1'
    AND action = 'delete'
    AND ancienne_valeur->>'id_unique' = 'AC-INTERNAL'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Original AgriCapital internal-client snapshot not found; aborting restore.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE is_internal IS TRUE
       OR id_unique = 'AC-INTERNAL'
       OR id = '3da48833-cc0b-4e94-aa41-c1b9bcf862c1'::uuid
  ) THEN
    v_row := jsonb_populate_record(NULL::public.clients, v_old);
    ALTER TABLE public.clients DISABLE TRIGGER USER;
    INSERT INTO public.clients SELECT (v_row).*;
    ALTER TABLE public.clients ENABLE TRIGGER USER;
  END IF;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.clients ENABLE TRIGGER USER;
  RAISE;
END
$restore$;

-- Internal control records have no customer offer formula and must not create sales.
DO $fix_formula$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.validate_client_selected_offer_formula()'::regprocedure) INTO v_def;
  IF position('coalesce(new.is_internal, false)' in lower(v_def)) = 0 THEN
    v_def := replace(v_def, E'begin\n  if new.offre_id is null then', E'begin\n  if coalesce(new.is_internal, false) then return new; end if;\n  if new.offre_id is null then');
    EXECUTE v_def;
  END IF;
END
$fix_formula$;

DO $fix_recalc$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.recalculer_parametres_financiers_client(uuid)'::regprocedure) INTO v_def;
  IF position('coalesce(c.is_internal, false)' in lower(v_def)) = 0 THEN
    v_def := replace(v_def, E'  if not found then return; end if;\n  select * into o', E'  if not found then return; end if;\n  if coalesce(c.is_internal, false) then return; end if;\n  select * into o');
    EXECUTE v_def;
  END IF;
END
$fix_recalc$;

DO $fix_acquisition$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.create_acquisition_for_new_client()'::regprocedure) INTO v_def;
  IF position('coalesce(new.is_internal, false)' in lower(v_def)) = 0 THEN
    v_def := replace(v_def, E'begin\n  v_surface :=', E'begin\n  if coalesce(new.is_internal, false) then return new; end if;\n  v_surface :=');
    EXECUTE v_def;
  END IF;
END
$fix_acquisition$;
