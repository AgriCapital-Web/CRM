-- Backfill the two confirmed PalmTerroir planting operations through the
-- ordinary technical-intervention workflow. Actual planted plant counts were
-- not supplied, so keep them NULL rather than equating planned and actual.
CREATE OR REPLACE FUNCTION public.trg_sync_technical_plantation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  v_plantation_id uuid;
  target_count integer;
BEGIN
  v_plantation_id := NEW.plantation_id;
  IF v_plantation_id IS NULL
     AND NEW.acquisition_id IS NOT NULL
     AND NEW.type_intervention = 'mise_en_terre'
     AND NEW.statut = 'realisee' THEN
    SELECT id INTO v_plantation_id
    FROM public.plantations
    WHERE acquisition_id = NEW.acquisition_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_plantation_id IS NULL OR NEW.statut <> 'realisee' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM public.plantations WHERE id = v_plantation_id;
  IF p.id IS NULL THEN RETURN NEW; END IF;

  IF NEW.type_intervention = 'mise_en_terre' THEN
    target_count := NEW.nombre_plants_realises;
    UPDATE public.plantations
    SET date_plantation = coalesce(date_plantation, NEW.date_intervention),
        date_activation = CASE WHEN p.statut = 'actif'
          THEN coalesce(date_activation, NEW.date_intervention) ELSE NULL END,
        statut_global = CASE WHEN p.statut = 'actif'
          THEN 'actif' ELSE coalesce(p.statut, 'en_attente_pi') END,
        densite_cible = coalesce(NEW.densite_plants, densite_cible, 143),
        densite_plants = coalesce(NEW.densite_plants, densite_cible, 143),
        nombre_plants_prevus = coalesce(NEW.nombre_plants_prevus, nombre_plants_prevus,
          round(superficie_ha * coalesce(NEW.densite_plants, densite_cible, 143))),
        nombre_plants_mis_en_terre = CASE WHEN target_count IS NOT NULL
          THEN target_count ELSE nombre_plants_mis_en_terre END,
        nombre_plants = CASE WHEN target_count IS NOT NULL
          THEN target_count ELSE nombre_plants END,
        surface_reellement_plantee = coalesce(surface_reellement_plantee, superficie_ha),
        taux_reussite = CASE WHEN target_count IS NOT NULL
          THEN coalesce(taux_reussite, 100) ELSE taux_reussite END,
        updated_at = now()
    WHERE id = v_plantation_id;
  ELSIF NEW.type_intervention = 'remplacement' THEN
    UPDATE public.plantations
    SET nombre_plants_remplaces = coalesce(nombre_plants_remplaces, 0)
      + coalesce(NEW.nombre_plants_remplaces, 0),
      updated_at = now()
    WHERE id = v_plantation_id;
  END IF;

  RETURN NEW;
END;
$function$;

DO $migration$
DECLARE
  v_item record;
  v_density integer;
  v_expected integer;
  v_intervention_id uuid;
  v_parcelle_id uuid;
  v_plantation_id uuid;
BEGIN
  SELECT coalesce(nullif(trim(valeur), '')::integer, 143)
  INTO v_density
  FROM public.configurations_systeme
  WHERE cle = 'plantation_densite_defaut'
  LIMIT 1;
  v_density := coalesce(v_density, 143);

  FOR v_item IN
    SELECT c.id AS client_id, c.nom_complet, a.id AS acquisition_id,
           a.superficie_ha, a.parcelle_id,
           CASE c.id
             WHEN 'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid THEN DATE '2026-09-30'
             WHEN '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid THEN DATE '2026-11-09'
           END AS planting_date
    FROM public.clients c
    JOIN public.acquisitions a ON a.client_id = c.id
    WHERE c.id IN (
      'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid,
      '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid
    )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.plantations
      WHERE acquisition_id = v_item.acquisition_id
    ) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.interventions_techniques
      WHERE acquisition_id = v_item.acquisition_id
        AND type_intervention = 'mise_en_terre'
        AND statut = 'realisee'
    ) THEN
      v_expected := round(v_item.superficie_ha * v_density)::integer;
      INSERT INTO public.interventions_techniques (
        client_id, acquisition_id, parcelle_id, type_intervention,
        date_intervention, statut, densite_plants,
        nombre_plants_prevus, nombre_plants_realises, observations
      ) VALUES (
        v_item.client_id, v_item.acquisition_id, v_item.parcelle_id,
        'mise_en_terre', v_item.planting_date, 'realisee', v_density,
        v_expected, NULL,
        'Mise en terre déjà réalisée à la date confirmée par la direction. Quantité réellement plantée non communiquée ; le nombre prévu est calculé selon la densité de référence.'
      )
      RETURNING id INTO v_intervention_id;
    END IF;

    SELECT parcelle_id INTO v_parcelle_id
    FROM public.acquisitions
    WHERE id = v_item.acquisition_id;

    SELECT id INTO v_plantation_id
    FROM public.plantations
    WHERE acquisition_id = v_item.acquisition_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_parcelle_id IS NULL OR v_plantation_id IS NULL THEN
      RAISE EXCEPTION 'La synchronisation technique de % n''a pas créé sa parcelle et sa plantation.',
        v_item.nom_complet;
    END IF;

    UPDATE public.parcelles
    SET statut = 'saturee',
        mode_surface = 'propriete_client',
        plantation_date_activation = v_item.planting_date,
        plantation_surface_cible_ha = v_item.superficie_ha,
        updated_at = now()
    WHERE id = v_parcelle_id;

    UPDATE public.plantations
    SET statut = 'actif',
        statut_global = 'actif',
        date_plantation = v_item.planting_date,
        date_activation = v_item.planting_date,
        superficie_activee = v_item.superficie_ha,
        surface_reellement_plantee = v_item.superficie_ha,
        updated_at = now()
    WHERE id = v_plantation_id;

    UPDATE public.acquisitions
    SET statut = 'active',
        statut_technique = 'mise_en_terre_realisee',
        validation_statut = 'valide',
        updated_at = now()
    WHERE id = v_item.acquisition_id;
  END LOOP;
END;
$migration$;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.acquisitions a
    JOIN public.clients c ON c.id = a.client_id
    WHERE c.id IN (
      'ecbe72e6-171e-4b78-923a-31b34e6f53bc'::uuid,
      '31748f03-e2a2-4e17-8609-87b51a9d4b02'::uuid
    )
    AND (
      a.statut <> 'active'
      OR a.validation_statut <> 'valide'
      OR a.statut_technique <> 'mise_en_terre_realisee'
      OR a.parcelle_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.plantations p
        WHERE p.acquisition_id = a.id
          AND p.statut = 'actif'
          AND p.date_plantation IS NOT NULL
      )
    )
  ) THEN
    RAISE EXCEPTION 'La validation des parcelles et plantations Yao/Patrice est incomplète.';
  END IF;
END;
$assert$;