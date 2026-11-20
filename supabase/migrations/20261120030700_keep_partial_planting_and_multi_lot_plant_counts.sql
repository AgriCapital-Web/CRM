CREATE OR REPLACE FUNCTION public.sync_planting_to_acquisition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_foncier_pending boolean := false;
  v_commercial_approved boolean := false;
  v_pdg_approved boolean := false;
  v_contract_surface numeric := 0;
  v_planted_surface numeric := 0;
BEGIN
  IF lower(coalesce(NEW.type_intervention,'')) <> 'mise_en_terre'
     OR lower(coalesce(NEW.statut,'')) NOT IN ('realisee','valide','validee','terminee','completed') THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT
      coalesce((a.metadata->>'foncier_convention_en_attente')::boolean,false),
      coalesce((a.metadata->>'validation_commerciale_sans_foncier')::boolean,false),
      coalesce((a.metadata->>'validation_pdg_sans_convention_active')::boolean,false),
      coalesce(a.superficie_ha,0)
    INTO v_foncier_pending,v_commercial_approved,v_pdg_approved,v_contract_surface
    FROM public.acquisitions a
    WHERE a.id=NEW.acquisition_id AND a.client_id=NEW.client_id;

    SELECT coalesce(sum(coalesce(p.surface_reellement_plantee,p.superficie_ha,0)),0)
      INTO v_planted_surface
      FROM public.plantations p
     WHERE p.acquisition_id=NEW.acquisition_id AND p.client_id=NEW.client_id;

    UPDATE public.acquisitions
       SET statut_technique=CASE
             WHEN v_planted_surface+0.000001>=v_contract_surface THEN 'mise_en_terre_realisee'
             ELSE 'mise_en_terre_partielle'
           END,
           statut=CASE
             WHEN v_foncier_pending AND NOT (v_commercial_approved OR v_pdg_approved) THEN 'souscrite'
             ELSE 'active'
           END,
           validation_statut=CASE
             WHEN v_foncier_pending AND NOT (v_commercial_approved OR v_pdg_approved) THEN 'a_valider'
             ELSE 'valide'
           END,
           updated_at=now()
     WHERE id=NEW.acquisition_id AND client_id=NEW.client_id;

    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE acquisition_id=NEW.acquisition_id
       AND client_id=NEW.client_id;
  ELSIF NEW.plantation_id IS NOT NULL THEN
    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(NEW.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE id=NEW.plantation_id AND client_id=NEW.client_id;
  ELSE
    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(NEW.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE client_id=NEW.client_id
       AND (NEW.parcelle_id IS NULL OR parcelle_id=NEW.parcelle_id)
       AND acquisition_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;
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
      AND (NEW.parcelle_id IS NULL OR parcelle_id=NEW.parcelle_id)
      AND (NEW.lot_id IS NULL OR lot_id=NEW.lot_id)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_plantation_id IS NULL OR NEW.statut <> 'realisee' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM public.plantations WHERE id = v_plantation_id;
  IF p.id IS NULL THEN RETURN NEW; END IF;

  IF NEW.type_intervention = 'mise_en_terre' THEN
    SELECT coalesce(sum(coalesce(it.nombre_plants_realises,0)),0)::integer
      INTO target_count
      FROM public.interventions_techniques it
     WHERE it.type_intervention='mise_en_terre'
       AND it.statut='realisee'
       AND (
         (NEW.acquisition_id IS NOT NULL AND it.acquisition_id=NEW.acquisition_id)
         OR (NEW.acquisition_id IS NULL AND it.plantation_id=v_plantation_id)
       )
       AND (p.parcelle_id IS NULL OR it.parcelle_id=p.parcelle_id)
       AND (p.lot_id IS NULL OR it.lot_id=p.lot_id);
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
