-- Règle canonique de plantation partagée :
-- 1 activation par lot, une plantation agrégée de la part propriétaire par parcelle,
-- superficie égale à la somme des parts propriétaire actives, sans offre ni finance.
CREATE OR REPLACE FUNCTION public.sync_owner_plantation_for_shared_parcel(
  p_parcelle_id uuid,
  p_proprietaire_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parcelle public.parcelles%rowtype;
  v_owner_plantation public.plantations%rowtype;
  v_surface numeric := 0;
  v_density integer;
  v_plant_count integer;
  v_owner_plantation_id uuid;
BEGIN
  IF p_parcelle_id IS NULL OR p_proprietaire_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_parcelle
    FROM public.parcelles
   WHERE id = p_parcelle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcelle introuvable pour la synchronisation de la part propriétaire';
  END IF;
  IF v_parcelle.proprietaire_id IS DISTINCT FROM p_proprietaire_id THEN
    RAISE EXCEPTION 'Le propriétaire fourni ne correspond pas au propriétaire de la parcelle';
  END IF;

  SELECT coalesce(sum(surface_proprietaire_ha), 0)
    INTO v_surface
    FROM public.plantation_activations
   WHERE parcelle_id = p_parcelle_id
     AND proprietaire_id = p_proprietaire_id
     AND statut = 'active';

  IF v_surface <= 0 THEN
    UPDATE public.plantations
       SET superficie_ha = 0,
           superficie_activee = 0,
           surface_reellement_plantee = 0,
           nombre_plants = 0,
           nombre_plants_prevus = 0,
           statut = 'annule',
           statut_global = 'annule',
           updated_by = p_actor,
           updated_at = now()
     WHERE parcelle_id = p_parcelle_id
       AND role_attribution = 'proprietaire'
       AND client_id IS NULL
       AND statut = 'active';
    RETURN NULL;
  END IF;

  v_density := nullif(v_parcelle.plantation_densite_plants, 0);
  v_plant_count := CASE
    WHEN v_density IS NOT NULL THEN round(v_surface * v_density)::integer
    ELSE NULL
  END;

  SELECT * INTO v_owner_plantation
    FROM public.plantations
   WHERE parcelle_id = p_parcelle_id
     AND role_attribution = 'proprietaire'
     AND client_id IS NULL
     AND coalesce(statut, '') <> 'annule'
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.plantations(
      client_id, parcelle_id, activation_id, lot_id, acquisition_id,
      role_attribution, nom, nom_plantation,
      superficie_ha, superficie_activee, surface_reellement_plantee,
      nombre_plants, nombre_plants_prevus, densite_plants,
      region_id, departement_id, sous_prefecture_id, village, village_nom, localite,
      localisation_gps_lat, localisation_gps_lng, latitude, longitude,
      date_plantation, date_activation, statut, statut_global, type_culture,
      notes, created_by, updated_by
    )
    VALUES (
      NULL, p_parcelle_id, NULL, NULL, NULL,
      'proprietaire', 'Plantation propriétaire', 'Plantation de la part du propriétaire',
      v_surface, v_surface, v_surface,
      v_plant_count, v_plant_count, v_density,
      v_parcelle.region_id, v_parcelle.departement_id, v_parcelle.sous_prefecture_id,
      v_parcelle.village, v_parcelle.village, v_parcelle.village,
      v_parcelle.localisation_gps_lat, v_parcelle.localisation_gps_lng,
      v_parcelle.localisation_gps_lat, v_parcelle.localisation_gps_lng,
      coalesce(v_parcelle.plantation_date_activation, current_date),
      coalesce(v_parcelle.plantation_date_activation, current_date),
      'active', 'active', coalesce(v_parcelle.plantation_type_culture, 'Palmier à huile'),
      'Part propriétaire synchronisée à partir des activations foncières actives. Hors offre commerciale et hors échéancier client.',
      p_actor, p_actor
    )
    RETURNING id INTO v_owner_plantation_id;
  ELSE
    UPDATE public.plantations
       SET nom = 'Plantation propriétaire',
           nom_plantation = 'Plantation de la part du propriétaire',
           activation_id = NULL,
           lot_id = NULL,
           acquisition_id = NULL,
           superficie_ha = v_surface,
           superficie_activee = v_surface,
           surface_reellement_plantee = v_surface,
           nombre_plants = v_plant_count,
           nombre_plants_prevus = v_plant_count,
           densite_plants = v_density,
           statut = 'active',
           statut_global = 'active',
           type_culture = coalesce(v_parcelle.plantation_type_culture, type_culture, 'Palmier à huile'),
           updated_by = p_actor,
           updated_at = now()
     WHERE id = v_owner_plantation.id
     RETURNING id INTO v_owner_plantation_id;
  END IF;

  -- Une seule ligne propriétaire active par parcelle; les autres anciennes lignes
  -- sont conservées en historique, mais désactivées pour éviter tout double comptage.
  UPDATE public.plantations
     SET superficie_ha = 0,
         superficie_activee = 0,
         surface_reellement_plantee = 0,
         nombre_plants = 0,
         nombre_plants_prevus = 0,
         statut = 'annule',
         statut_global = 'annule',
         notes = concat_ws(E'\n', nullif(notes, ''), 'Ancienne ligne propriétaire fusionnée dans la ligne canonique de la parcelle.'),
         updated_by = p_actor,
         updated_at = now()
   WHERE parcelle_id = p_parcelle_id
     AND role_attribution = 'proprietaire'
     AND client_id IS NULL
     AND id <> v_owner_plantation_id
     AND statut = 'active';

  RETURN v_owner_plantation_id;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_owner_plantation_per_parcelle
  ON public.plantations (parcelle_id)
  WHERE role_attribution = 'proprietaire'
    AND client_id IS NULL
    AND statut = 'active'
    AND parcelle_id IS NOT NULL;

REVOKE ALL ON FUNCTION public.sync_owner_plantation_for_shared_parcel(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_owner_plantation_for_shared_parcel(uuid, uuid, uuid) TO service_role;

-- Remplacer l'ajout incrémental (non idempotent) par une synchronisation depuis
-- la somme des activations actives de la parcelle.
DO $migration$
DECLARE
  v_def text;
  v_start integer;
  v_end integer;
  v_marker text;
  v_replacement text;
BEGIN
  v_def := pg_get_functiondef('public.activate_client_lot_from_lot(uuid,uuid,date)'::regprocedure);

  v_marker := $marker$  select * into v_client from public.clients where id=p_client_id;
  if v_client.id is null then raise exception 'Client introuvable'; end if;$marker$;
  IF strpos(v_def, v_marker) = 0 THEN
    RAISE EXCEPTION 'Impossible de localiser la validation du client dans activate_client_lot_from_lot';
  END IF;
  v_replacement := $replacement$  select * into v_client from public.clients where id=p_client_id;
  if v_client.id is null then raise exception 'Client introuvable'; end if;
  if upper(coalesce(v_client.formule_code,'')) not like 'PALMINVEST%' then
    raise exception 'L’activation d’une part propriétaire est réservée aux souscriptions PalmInvest.';
  end if;$replacement$;
  v_def := replace(v_def, v_marker, v_replacement);

  v_marker := $ownerblock$  -- Internal owner share: create once per parcel and aggregate every activated lot.$ownerblock$;
  v_start := strpos(v_def, v_marker);
  v_end := strpos(v_def, '  return jsonb_build_object(', v_start);
  IF v_start = 0 OR v_end = 0 THEN
    RAISE EXCEPTION 'Impossible de localiser le bloc de plantation propriétaire dans activate_client_lot_from_lot';
  END IF;
  v_replacement := $ownerreplacement$  if v_owner.id is not null then
    v_owner_plantation_id := public.sync_owner_plantation_for_shared_parcel(v_parcelle.id, v_owner.id, v_user);
  end if;

$ownerreplacement$;
  v_def := substring(v_def from 1 for v_start - 1) || v_replacement || substring(v_def from v_end);
  EXECUTE v_def;
END;
$migration$;

-- Le paiement initial ne déclenche une activation de lot partagé que pour PalmInvest.
DO $migration$
DECLARE
  v_def text;
  v_marker text;
  v_insert text;
BEGIN
  v_def := pg_get_functiondef('public.trg_activate_client_lot_after_initial_payment()'::regprocedure);
  v_def := replace(v_def, '  v_acquisition_lot uuid;', E'  v_acquisition_lot uuid;\n  v_formula text;');
  IF strpos(v_def, '  v_formula text;') = 0 THEN
    RAISE EXCEPTION 'Impossible d’ajouter la variable formule au déclencheur de paiement initial';
  END IF;

  v_marker := $marker$  if new.acquisition_id is not null then$marker$;
  v_insert := $insert$  if new.acquisition_id is not null then
    select upper(coalesce(nullif(a.formule_code, ''), c.formule_code, ''))
      into v_formula
      from public.acquisitions a
      join public.clients c on c.id = a.client_id
     where a.id = new.acquisition_id and a.client_id = new.client_id;
  else
    select upper(coalesce(formule_code, '')) into v_formula
      from public.clients where id = new.client_id;
  end if;
  if coalesce(v_formula, '') not like 'PALMINVEST%' then
    return new;
  end if;

  if new.acquisition_id is not null then$insert$;
  IF strpos(v_def, v_marker) = 0 THEN
    RAISE EXCEPTION 'Impossible de localiser le point d’activation du paiement initial';
  END IF;
  v_def := replace(v_def, v_marker, v_insert);
  EXECUTE v_def;
END;
$migration$;

-- Le déclencheur de plantation utilise le même agrégat propriétaire que le paiement initial.
DO $migration$
DECLARE
  v_def text;
  v_marker text;
  v_replacement text;
BEGIN
  v_def := pg_get_functiondef('public.sync_palminvest_lot_activation()'::regprocedure);

  v_marker := $marker$  IF NOT FOUND OR v_parcelle.convention_id IS NULL OR NOT coalesce(v_parcelle.plantation_partagee_activee, false) THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit être rattachée à une parcelle AgriCapital sous convention active';
  END IF;$marker$;
  v_replacement := $replacement$  IF NOT FOUND OR v_parcelle.convention_id IS NULL OR NOT coalesce(v_parcelle.plantation_partagee_activee, false) THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit être rattachée à une parcelle AgriCapital sous convention active';
  END IF;
  IF v_parcelle.proprietaire_id IS NULL THEN
    RAISE EXCEPTION 'La parcelle de plantation partagée doit être liée à un propriétaire foncier validé.';
  END IF;$replacement$;
  IF strpos(v_def, v_marker) = 0 THEN
    RAISE EXCEPTION 'Impossible de localiser la validation foncière dans sync_palminvest_lot_activation';
  END IF;
  v_def := replace(v_def, v_marker, v_replacement);

  v_marker := $endmarker$  RETURN NEW;
END;
$function$$endmarker$;
  v_replacement := $endreplacement$  PERFORM public.sync_owner_plantation_for_shared_parcel(NEW.parcelle_id, v_parcelle.proprietaire_id, coalesce(NEW.updated_by, NEW.created_by));

  RETURN NEW;
END;
$function$$endreplacement$;
  IF strpos(v_def, v_marker) = 0 THEN
    RAISE EXCEPTION 'Impossible de localiser la fin de sync_palminvest_lot_activation';
  END IF;
  v_def := replace(v_def, v_marker, v_replacement);
  EXECUTE v_def;
END;
$migration$;

-- Recalculer les superficies client à partir des attributions actives et des
-- plantations non déjà représentées par une attribution. Cela conserve les bénéfices gratuits.
CREATE OR REPLACE FUNCTION public.update_client_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sid uuid;
  v_ids uuid[];
  v_count integer;
  v_total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.client_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_ids := ARRAY[NEW.client_id];
    IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      v_ids := array_append(v_ids, OLD.client_id);
    END IF;
  ELSE
    v_ids := ARRAY[NEW.client_id];
  END IF;

  FOREACH v_sid IN ARRAY v_ids LOOP
    IF v_sid IS NULL THEN
      CONTINUE;
    END IF;

    SELECT count(*)::integer, coalesce(sum(stats.surface_ha), 0)
      INTO v_count, v_total
      FROM (
        SELECT p.id, coalesce(p.superficie_ha, 0)::numeric AS surface_ha
          FROM public.plantations p
         WHERE p.client_id = v_sid
           AND NOT EXISTS (
             SELECT 1
               FROM public.beneficiaire_attributions ba
              WHERE ba.client_id = v_sid
                AND ba.plantation_id = p.id
                AND ba.statut = 'active'
           )
        UNION ALL
        SELECT coalesce(ba.plantation_id, ba.id) AS id,
               max(coalesce(ba.surface_attribuee_ha, 0))::numeric AS surface_ha
          FROM public.beneficiaire_attributions ba
         WHERE ba.client_id = v_sid
           AND ba.statut = 'active'
         GROUP BY coalesce(ba.plantation_id, ba.id)
      ) stats;

    UPDATE public.clients
       SET nombre_plantations = v_count,
           total_hectares = v_total
     WHERE id = v_sid;
  END LOOP;

  RETURN coalesce(NEW, OLD);
END;
$function$;
