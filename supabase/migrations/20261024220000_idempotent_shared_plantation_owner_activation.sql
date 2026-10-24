-- Règle unique et idempotente d'activation PalmInvest en plantation partagée.
-- Une activation par lot AgriCapital; la part propriétaire est portée par
-- plantation_activations.surface_proprietaire_ha et n'est jamais une offre commerciale.
CREATE OR REPLACE FUNCTION public.sync_palminvest_lot_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_formula text;
  v_parcelle public.parcelles%rowtype;
  v_client public.clients%rowtype;
  v_units integer;
  v_lot record;
  v_activation uuid;
  v_existing public.plantation_activations%rowtype;
  v_done integer := 0;
  v_available integer := 0;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = NEW.client_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT upper(coalesce(a.formule_code, ''))
      INTO v_formula
      FROM public.acquisitions a
     WHERE a.id = NEW.acquisition_id;
  ELSE
    v_formula := upper(coalesce(v_client.formule_code, ''));
  END IF;

  IF coalesce(v_formula, '') NOT LIKE 'PALMINVEST%' OR NEW.parcelle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id = NEW.parcelle_id;
  IF NOT FOUND OR v_parcelle.convention_id IS NULL OR NOT coalesce(v_parcelle.plantation_partagee_activee, false) THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit être rattachée à une parcelle AgriCapital sous convention active';
  END IF;

  -- Le modèle commercial PalmInvest comptabilise 2 ha par lot :
  -- 1 ha pour le client et 1 ha pour le propriétaire. L'activation foncière
  -- reste indépendante de l'offre et ne crée aucun contrat/paiement propriétaire.
  IF mod(coalesce(NEW.superficie_ha, 0)::numeric, 2) <> 0 THEN
    RAISE EXCEPTION 'Une activation PalmInvest doit représenter un multiple de 2 ha : 1 ha client + 1 ha propriétaire.';
  END IF;

  v_units := floor(coalesce(NEW.superficie_ha, 0) / 2);
  IF v_units <= 0 THEN
    RAISE EXCEPTION 'Superficie PalmInvest invalide pour une activation partagée';
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT count(*)::integer
      INTO v_available
      FROM public.acquisition_lots al
      JOIN public.lots_hectares lh ON lh.id = al.lot_id
     WHERE al.acquisition_id = NEW.acquisition_id
       AND al.client_id = NEW.client_id
       AND lh.parcelle_id = NEW.parcelle_id
       AND coalesce(lh.part_type, 'agricapital') = 'agricapital'
       AND abs(coalesce(al.surface_ha, lh.surface_ha, 0) - 1) < 0.0001;

    IF v_available <> v_units THEN
      RAISE EXCEPTION 'L’acquisition PalmInvest doit avoir exactement % lot(s) AgriCapital de 1 ha associé(s); % trouvé(s).', v_units, v_available;
    END IF;
  ELSE
    SELECT count(*)::integer INTO v_available
      FROM (
        SELECT lh.id
          FROM public.lots_hectares lh
         WHERE lh.parcelle_id = NEW.parcelle_id
           AND coalesce(lh.part_type, 'agricapital') = 'agricapital'
           AND lh.client_id = NEW.client_id
           AND lh.surface_ha = 1
         ORDER BY lh.numero_h
         LIMIT v_units
      ) available_lots;

    IF v_available <> v_units THEN
      RAISE EXCEPTION 'Aucun rattachement d’acquisition trouvé et nombre de lots AgriCapital attribués insuffisant : % requis, % trouvé(s).', v_units, v_available;
    END IF;
  END IF;

  FOR v_lot IN
    SELECT lh.*
      FROM public.lots_hectares lh
     WHERE lh.parcelle_id = NEW.parcelle_id
       AND coalesce(lh.part_type, 'agricapital') = 'agricapital'
       AND (
         (
           NEW.acquisition_id IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.acquisition_lots al
              WHERE al.lot_id = lh.id
                AND al.acquisition_id = NEW.acquisition_id
                AND al.client_id = NEW.client_id
                AND abs(coalesce(al.surface_ha, lh.surface_ha, 0) - 1) < 0.0001
           )
         )
         OR
         (
           NEW.acquisition_id IS NULL
           AND lh.client_id = NEW.client_id
           AND lh.surface_ha = 1
           AND NOT EXISTS (SELECT 1 FROM public.acquisition_lots al WHERE al.lot_id = lh.id)
         )
       )
     ORDER BY lh.numero_h
     LIMIT v_units
     FOR UPDATE OF lh
  LOOP
    v_activation := NULL;
    SELECT * INTO v_existing
      FROM public.plantation_activations
     WHERE lot_id = v_lot.id
     FOR UPDATE;

    IF FOUND THEN
      IF v_existing.client_id IS DISTINCT FROM NEW.client_id
         OR v_existing.parcelle_id IS DISTINCT FROM NEW.parcelle_id
         OR v_existing.proprietaire_id IS DISTINCT FROM v_parcelle.proprietaire_id THEN
        RAISE EXCEPTION 'Le lot % possède déjà une activation incompatible; aucune seconde attribution propriétaire ne sera créée.', v_lot.reference;
      END IF;
      v_activation := v_existing.id;
    ELSE
      INSERT INTO public.plantation_activations(
        lot_id, parcelle_id, proprietaire_id, client_id,
        surface_client_ha, surface_proprietaire_ha,
        statut, date_activation, notes, created_by
      )
      VALUES (
        v_lot.id, NEW.parcelle_id, v_parcelle.proprietaire_id, NEW.client_id,
        1, 1, 'active', coalesce(NEW.date_activation::date, current_date),
        'Activation unique de plantation partagée : 1 ha client et 1 ha correspondant au propriétaire. La part propriétaire est foncière, sans offre commerciale ni échéancier.',
        NEW.created_by
      )
      ON CONFLICT (lot_id) DO NOTHING
      RETURNING id INTO v_activation;

      IF v_activation IS NULL THEN
        SELECT * INTO v_existing
          FROM public.plantation_activations
         WHERE lot_id = v_lot.id
         FOR UPDATE;
        IF v_existing.id IS NULL
           OR v_existing.client_id IS DISTINCT FROM NEW.client_id
           OR v_existing.parcelle_id IS DISTINCT FROM NEW.parcelle_id
           OR v_existing.proprietaire_id IS DISTINCT FROM v_parcelle.proprietaire_id THEN
          RAISE EXCEPTION 'Conflit d’activation sur le lot %; attribution non dupliquée et validation interrompue.', v_lot.reference;
        END IF;
        v_activation := v_existing.id;
      END IF;
    END IF;

    UPDATE public.lots_hectares
       SET client_id = NEW.client_id,
           acquisition_id = coalesce(NEW.acquisition_id, acquisition_id),
           statut = 'attribue',
           date_attribution = coalesce(date_attribution, current_date),
           notes = concat_ws(' ', notes, 'Activation PalmInvest liée à une convention de plantation partagée.')
     WHERE id = v_lot.id;

    v_done := v_done + 1;
    IF v_done = 1 AND NEW.activation_id IS NULL THEN
      NEW.activation_id := v_activation;
    END IF;
  END LOOP;

  IF v_done <> v_units THEN
    RAISE EXCEPTION 'Activation PalmInvest incomplète : % lot(s) requis, % traité(s).', v_units, v_done;
  END IF;

  RETURN NEW;
END;
$function$;
