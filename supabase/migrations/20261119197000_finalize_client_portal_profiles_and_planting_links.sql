DO $migration$
DECLARE
  v_client_id uuid;
  v_user_id uuid;
  v_plantation_id uuid;
BEGIN
  PERFORM set_config('app.internal_account_link','true',true);

  FOR v_client_id, v_user_id IN
    SELECT id, user_id
    FROM public.clients
    WHERE id IN (
      'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid,
      '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid
    )
  LOOP
    IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_user_id) THEN
      RAISE EXCEPTION 'Le compte portail du client % n''est pas provisionné.', v_client_id;
    END IF;

    UPDATE public.profiles
    SET type_compte='client',
        relation_rh='Client',
        poste='client',
        actif=true,
        updated_at=now()
    WHERE user_id=v_user_id;

    UPDATE public.client_account_provision_outbox
    SET statut='traite',
        processed_at=coalesce(processed_at,now()),
        claimed_at=coalesce(claimed_at,now()),
        tentatives=greatest(tentatives,1),
        derniere_erreur=NULL
    WHERE client_id=v_client_id
      AND statut IN ('en_attente','en_cours');
  END LOOP;

  PERFORM set_config('app.internal_account_link','false',true);

  FOR v_client_id IN
    SELECT id FROM public.clients
    WHERE id IN (
      'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid,
      '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid
    )
  LOOP
    SELECT id INTO v_plantation_id
    FROM public.plantations
    WHERE client_id=v_client_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_plantation_id IS NULL THEN
      RAISE EXCEPTION 'Plantation absente pour le client %.',v_client_id;
    END IF;

    UPDATE public.interventions_techniques i
    SET plantation_id=v_plantation_id
    FROM public.acquisitions a
    WHERE a.client_id=v_client_id
      AND i.acquisition_id=a.id
      AND i.type_intervention='mise_en_terre'
      AND i.statut='realisee'
      AND i.plantation_id IS NULL;

    -- Keep planned counts, but do not invent actual counts or survival rates.
    UPDATE public.plantations
    SET nombre_plants_mis_en_terre=NULL,
        taux_reussite=NULL,
        updated_at=now()
    WHERE id=v_plantation_id;
  END LOOP;
END;
$migration$;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.clients c
    LEFT JOIN public.profiles p ON p.user_id=c.user_id
    WHERE c.id IN (
      'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid,
      '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid
    )
    AND (
      c.compte_actif IS NOT TRUE
      OR c.user_id IS NULL
      OR p.type_compte IS DISTINCT FROM 'client'
      OR p.relation_rh IS DISTINCT FROM 'Client'
      OR p.actif IS NOT TRUE
    )
  ) THEN
    RAISE EXCEPTION 'Le profil portail client n''est pas correctement classé ou actif.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acquisitions a
    JOIN public.clients c ON c.id=a.client_id
    WHERE c.id IN (
      'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid,
      '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.plantations pl
      JOIN public.interventions_techniques i
        ON i.plantation_id=pl.id AND i.acquisition_id=a.id
      WHERE pl.acquisition_id=a.id
        AND i.type_intervention='mise_en_terre'
        AND i.statut='realisee'
    )
  ) THEN
    RAISE EXCEPTION 'Le lien intervention / plantation / acquisition est incomplet.';
  END IF;
END;
$assert$;