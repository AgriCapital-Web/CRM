-- Allow authorized staff to load the financial sheet for clients they manage.
-- Clients themselves remain restricted to their own dossier.
DO $migration$
DECLARE
  v_def text;
  v_old text := $old$if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _client_id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;$old$;
  v_new text := $new$if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or (not public.is_staff(auth.uid()) and not private.can_access_client(auth.uid(), _client_id))) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;$new$;
BEGIN
  v_def := pg_get_functiondef('public.portal_current_payment_state(uuid)'::regprocedure);
  IF strpos(v_def, v_new) > 0 THEN
    RETURN;
  END IF;
  IF strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected access guard not found in portal_current_payment_state; aborting without changes.';
  END IF;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END;
$migration$;
