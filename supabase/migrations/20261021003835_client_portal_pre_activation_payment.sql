-- Client dossier approval is distinct from account activation. The initial payment is
-- created only after approval, and the portal may access a restricted payment-only session.
DO $migration$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_client_effective_pi(uuid)'::regprocedure) INTO v_def;
  IF position('auth.role() = ''service_role''' IN v_def) = 0 THEN
    IF position('AND (public.is_staff(auth.uid()) OR c.user_id=auth.uid())' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Unexpected get_client_effective_pi definition; aborting safe patch';
    END IF;
    v_def := replace(v_def,
      'AND (public.is_staff(auth.uid()) OR c.user_id=auth.uid())',
      'AND (auth.role() = ''service_role'' OR public.is_staff(auth.uid()) OR c.user_id=auth.uid())');
    EXECUTE v_def;
  END IF;

  SELECT pg_get_functiondef('public.client_should_be_active(uuid)'::regprocedure) INTO v_def;
  IF position('auth.role() is distinct from ''service_role''' IN v_def) = 0 THEN
    IF position('if auth.uid() is null or not private.can_access_client(auth.uid(),_id) then' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Unexpected client_should_be_active definition; aborting safe patch';
    END IF;
    v_def := replace(v_def,
      'if auth.uid() is null or not private.can_access_client(auth.uid(),_id) then',
      'if auth.role() is distinct from ''service_role'' and (auth.uid() is null or not private.can_access_client(auth.uid(),_id)) then');
    EXECUTE v_def;
  END IF;

  SELECT pg_get_functiondef('public.portal_current_payment_state(uuid)'::regprocedure) INTO v_def;
  IF position('greatest(coalesce(c.total_hectares,0),active_ha' IN v_def) = 0 THEN
    IF position('pi_official := greatest(coalesce(public.get_client_effective_pi(_client_id),0),0);' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Unexpected portal_current_payment_state definition; aborting safe patch';
    END IF;
    v_def := replace(v_def,
      'pi_official := greatest(coalesce(public.get_client_effective_pi(_client_id),0),0);',
      'pi_official := greatest(coalesce(public.get_client_effective_pi(_client_id),0),0) * greatest(coalesce(c.total_hectares,0), active_ha, coalesce((select sum(greatest(coalesce(p.superficie_ha,0),0)) from public.plantations p where p.client_id=_client_id and p.acquisition_id is null),0));');
    EXECUTE v_def;
  END IF;

  SELECT pg_get_functiondef('public.review_client_validation(uuid,text,text)'::regprocedure) INTO v_def;
  IF position('perform public.create_paiement_initial(p_client_id);' IN v_def) = 0 THEN
    v_def := replace(v_def,
      'validation_at=now(),documents_valides_at=coalesce(documents_valides_at,now()),',
      'validation_at=now(),');
    IF position('where id=p_client_id;' || chr(10) || '  else' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Unexpected review_client_validation structure; aborting safe patch';
    END IF;
    v_def := replace(v_def,
      'where id=p_client_id;' || chr(10) || '  else',
      'where id=p_client_id;' || chr(10) || '    perform public.create_paiement_initial(p_client_id);' || chr(10) || '  else');
    EXECUTE v_def;
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.create_paiement_initial(_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing uuid;
  v_existing_plantation uuid;
  v_existing_acquisition uuid;
  v_existing_status text;
  v_rate numeric := 0;
  v_hectares numeric := 0;
  v_amount numeric := 0;
  v_payment_id uuid;
  v_client public.clients%rowtype;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Accès refusé : création du Paiement initial réservée au personnel autorisé'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF v_client.validation_statut IS DISTINCT FROM 'valide' THEN
    RAISE EXCEPTION 'Le dossier client doit être validé avant la création du Paiement initial.';
  END IF;
  IF v_client.offre_id IS NULL THEN
    RAISE EXCEPTION 'Une offre doit être définie avant de créer le Paiement initial.';
  END IF;

  SELECT coalesce(o.pi_effectif,0) INTO v_rate
  FROM public.offre_prix_effectif() o
  WHERE o.offre_id = v_client.offre_id;
  v_rate := greatest(coalesce(v_rate,0),0);

  SELECT greatest(
    coalesce(v_client.total_hectares,0),
    coalesce((SELECT sum(greatest(coalesce(p.superficie_ha,0),0))
              FROM public.plantations p
              WHERE p.client_id = _client_id AND p.acquisition_id IS NULL),0)
  ) INTO v_hectares;

  IF coalesce(v_hectares,0) <= 0 THEN
    RAISE EXCEPTION 'La superficie contractuelle doit être renseignée avant le Paiement initial.';
  END IF;

  v_amount := round(v_rate * v_hectares,2);

  SELECT id, plantation_id, acquisition_id, statut
  INTO v_existing, v_existing_plantation, v_existing_acquisition, v_existing_status
  FROM public.paiements
  WHERE client_id = _client_id
    AND type_paiement = 'PI'
    AND coalesce(est_paiement_initial,false) = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    IF v_existing_plantation IS NULL AND v_existing_acquisition IS NULL
       AND v_existing_status = 'en_attente' THEN
      UPDATE public.paiements
      SET montant = v_amount,
          montant_theorique = v_amount,
          montant_paye = CASE WHEN v_amount = 0 THEN 0 ELSE montant_paye END,
          statut = CASE WHEN v_amount = 0 THEN 'valide' ELSE 'en_attente' END,
          mode_paiement = CASE WHEN v_amount = 0 THEN 'Promotion' ELSE mode_paiement END,
          date_paiement = CASE WHEN v_amount = 0 THEN coalesce(date_paiement,now()) ELSE date_paiement END,
          date_validation = CASE WHEN v_amount = 0 THEN coalesce(date_validation,now()) ELSE date_validation END,
          metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
            'source','client_validation','pre_activation',true,'hectares',v_hectares,'pi_par_ha',v_rate,'pi_offert',v_amount=0
          ),
          updated_at = now()
      WHERE id = v_existing;
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.paiements(
    client_id, type_paiement, montant, montant_theorique, montant_paye, statut,
    est_paiement_initial, plantation_id, acquisition_id, mode_paiement,
    date_paiement, date_validation, metadata
  )
  VALUES (
    _client_id, 'PI', v_amount, v_amount,
    CASE WHEN v_amount = 0 THEN 0 ELSE NULL END,
    CASE WHEN v_amount = 0 THEN 'valide' ELSE 'en_attente' END,
    true, NULL, NULL,
    CASE WHEN v_amount = 0 THEN 'Promotion' ELSE NULL END,
    CASE WHEN v_amount = 0 THEN now() ELSE NULL END,
    CASE WHEN v_amount = 0 THEN now() ELSE NULL END,
    jsonb_build_object('source','client_validation','pre_activation',true,'hectares',v_hectares,'pi_par_ha',v_rate,'pi_offert',v_amount=0)
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_paiement_initial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_paiement_initial(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_docs_and_create_paiement_initial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_client_id uuid;
  v_total integer;
  v_valides integer;
  v_validation text;
BEGIN
  v_client_id := coalesce(NEW.client_id, OLD.client_id);
  IF v_client_id IS NULL THEN RETURN coalesce(NEW,OLD); END IF;

  SELECT validation_statut INTO v_validation
  FROM public.clients WHERE id = v_client_id;

  SELECT count(*), count(*) FILTER (WHERE statut = 'valide')
  INTO v_total, v_valides
  FROM public.documents_acquisition WHERE client_id = v_client_id;

  IF v_validation = 'valide' AND v_total >= 1 AND v_total = v_valides THEN
    UPDATE public.clients
    SET documents_valides_at = coalesce(documents_valides_at, now())
    WHERE id = v_client_id AND documents_valides_at IS NULL;
    PERFORM public.create_paiement_initial(v_client_id);
  END IF;
  RETURN coalesce(NEW,OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION private.activate_client_account_after_client_level_pi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.statut IN ('valide','paye','paid','success','successful','completed')
     AND coalesce(NEW.est_paiement_initial,false)
     AND NEW.plantation_id IS NULL
     AND NEW.acquisition_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.statut IS DISTINCT FROM NEW.statut) THEN
    PERFORM public.refresh_client_account_activation(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.activate_client_account_after_client_level_pi() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_activate_client_account_after_client_level_pi ON public.paiements;
CREATE TRIGGER trg_activate_client_account_after_client_level_pi
AFTER INSERT OR UPDATE OF statut ON public.paiements
FOR EACH ROW EXECUTE FUNCTION private.activate_client_account_after_client_level_pi();

UPDATE public.paiements p
SET montant = round(coalesce(o.pi_effectif,0) * greatest(
      coalesce(c.total_hectares,0),
      coalesce((SELECT sum(greatest(coalesce(pl.superficie_ha,0),0))
                FROM public.plantations pl
                WHERE pl.client_id=c.id AND pl.acquisition_id IS NULL),0)
    ),2),
    montant_theorique = round(coalesce(o.pi_effectif,0) * greatest(
      coalesce(c.total_hectares,0),
      coalesce((SELECT sum(greatest(coalesce(pl.superficie_ha,0),0))
                FROM public.plantations pl
                WHERE pl.client_id=c.id AND pl.acquisition_id IS NULL),0)
    ),2),
    updated_at = now()
FROM public.clients c
LEFT JOIN public.offre_prix_effectif() o ON o.offre_id=c.offre_id
WHERE p.client_id=c.id
  AND c.validation_statut='valide'
  AND p.type_paiement='PI'
  AND coalesce(p.est_paiement_initial,false)=true
  AND p.plantation_id IS NULL
  AND p.acquisition_id IS NULL
  AND p.statut='en_attente';
