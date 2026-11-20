CREATE OR REPLACE FUNCTION public.validate_client_acquisition_foncier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lot public.lots_hectares%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_allocation jsonb;
  v_allocation_lot public.lots_hectares%rowtype;
  v_amount numeric;
  v_total numeric := 0;
  v_first_lot_id uuid;
  v_first_convention_id uuid;
  v_expected_lot_number integer;
  v_allocation_count integer := 0;
  v_family text;
  v_target_lot_id uuid;
  v_preassigned boolean := false;
  v_allocated_surface numeric;
  v_allocated_surface_actual numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.client_id IS NOT DISTINCT FROM NEW.client_id
       AND OLD.lot_id IS NOT DISTINCT FROM NEW.lot_id
       AND OLD.parcelle_id IS NOT DISTINCT FROM NEW.parcelle_id
       AND OLD.necessite_foncier_client IS NOT DISTINCT FROM NEW.necessite_foncier_client
       AND OLD.superficie_ha IS NOT DISTINCT FROM NEW.superficie_ha
       AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
       AND OLD.statut IS NOT DISTINCT FROM NEW.statut
       AND OLD.validation_statut IS NOT DISTINCT FROM NEW.validation_statut THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.necessite_foncier_client THEN
    IF NEW.lot_id IS NOT NULL THEN
      RAISE EXCEPTION 'Une offre sur terrain propre ne peut pas réserver un lot partenaire.';
    END IF;
    RETURN NEW;
  END IF;

  v_family := regexp_replace(
    upper(coalesce(NEW.famille_offre,'') || ' ' || coalesce(NEW.offre_code,'')),
    '[-_[:space:]]','','g'
  );

  -- La direction autorise la validation métier même si la convention active est encore à rattacher.
  -- Le lot, la parcelle, le propriétaire et la quote-part restent contrôlés.
  IF coalesce((NEW.metadata->>'foncier_convention_en_attente')::boolean,false) THEN
    v_target_lot_id := nullif(NEW.metadata->>'lot_cible_id','')::uuid;
    IF v_target_lot_id IS NULL OR NEW.lot_id IS DISTINCT FROM v_target_lot_id THEN
      RAISE EXCEPTION 'Le lot cible initial de l’acquisition foncière est absent ou incohérent.';
    END IF;
    SELECT * INTO v_lot FROM public.lots_hectares WHERE id=v_target_lot_id FOR UPDATE;
    IF v_lot.id IS NULL OR v_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id THEN
      RAISE EXCEPTION 'Le lot foncier initial ne correspond pas à la parcelle de référence.';
    END IF;
    IF coalesce(v_lot.part_type,'agricapital') <> 'agricapital' THEN
      RAISE EXCEPTION 'Le lot cible doit appartenir à la quote-part AgriCapital.';
    END IF;
    IF v_lot.client_id IS NULL THEN
      IF v_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
         OR coalesce(v_lot.surface_disponible_ha,0) + 0.000001 < 1 THEN
        RAISE EXCEPTION 'Le lot cible initial n’est plus libre pour cette acquisition.';
      END IF;
    ELSE
      IF v_lot.client_id IS DISTINCT FROM NEW.client_id
         OR v_lot.acquisition_id IS DISTINCT FROM NEW.id
         OR lower(coalesce(v_lot.statut,'')) <> 'attribue' THEN
        RAISE EXCEPTION 'Le lot initial déjà affecté ne correspond pas à cette acquisition.';
      END IF;
    END IF;
    SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_lot.parcelle_id;
    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire du lot initial doit être enregistré.';
    END IF;

    IF v_family LIKE '%PALMINVEST%' THEN
      SELECT COALESCE(SUM(al.surface_ha),0)
        INTO v_allocated_surface_actual
        FROM public.acquisition_lots al
       WHERE al.acquisition_id=NEW.id AND al.client_id=NEW.client_id;
      v_allocated_surface := COALESCE(
        NULLIF(NEW.metadata->>'surface_fonciere_allouee_ha','')::numeric,
        v_allocated_surface_actual
      );
      IF abs(v_allocated_surface_actual-v_allocated_surface)>0.000001 THEN
        RAISE EXCEPTION 'La surface foncière déclarée ne correspond pas au cumul des lots affectés.';
      END IF;
      IF v_allocated_surface>coalesce(NEW.superficie_ha,0)+0.000001 THEN
        RAISE EXCEPTION 'La surface foncière affectée dépasse la superficie contractuelle.';
      END IF;
      IF v_allocated_surface+0.000001<coalesce(NEW.superficie_ha,0)
         AND NOT coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false) THEN
        RAISE EXCEPTION 'La surface foncière restante doit être explicitement déclarée comme à affecter plus tard.';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.acquisition_lots al
          JOIN public.lots_hectares lh ON lh.id=al.lot_id
         WHERE al.acquisition_id=NEW.id
           AND al.client_id=NEW.client_id
           AND (
             abs(coalesce(al.surface_ha,0)-1)>0.000001
             OR abs(coalesce(lh.surface_ha,0)-1)>0.000001
             OR lh.client_id IS DISTINCT FROM NEW.client_id
             OR lh.acquisition_id IS DISTINCT FROM NEW.id
             OR coalesce(lh.part_type,'agricapital')<>'agricapital'
           )
      ) THEN
        RAISE EXCEPTION 'Chaque lot PalmInvest affecté doit être un lot AgriCapital entier de 1 ha rattaché à cette acquisition.';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.acquisition_lots al
          JOIN public.lots_hectares lh ON lh.id=al.lot_id
         WHERE al.acquisition_id=NEW.id
           AND al.client_id=NEW.client_id
           AND lh.id<>v_target_lot_id
           AND NOT EXISTS (
             SELECT 1 FROM public.conventions_foncieres cf
              WHERE cf.id=lh.convention_id
                AND cf.parcelle_id=lh.parcelle_id
                AND cf.proprietaire_id=(SELECT p.proprietaire_id FROM public.parcelles p WHERE p.id=lh.parcelle_id)
                AND cf.statut='active'
           )
      ) THEN
        RAISE EXCEPTION 'Chaque nouvelle parcelle doit être couverte par une convention foncière active.';
      END IF;
    ELSE
      IF coalesce(v_lot.surface_disponible_ha,0)+0.000001<coalesce(NEW.superficie_ha,0)
         AND NOT coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false) THEN
        RAISE EXCEPTION 'La superficie contractuelle dépasse le foncier affecté sans report explicite.';
      END IF;
    END IF;

    IF NEW.validation_statut='valide' THEN
      NEW.statut:='active';
      RETURN NEW;
    END IF;
    IF NEW.statut<>'souscrite' OR NEW.validation_statut<>'a_valider' THEN
      RAISE EXCEPTION 'Une acquisition sans convention initiale active doit rester souscrite tant qu’elle n’est pas validée.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'Une offre partenaire doit être liée à un lot disponible.';
  END IF;

  IF jsonb_typeof(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))='array'
     AND jsonb_array_length(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))>0 THEN
    FOR v_allocation IN
      SELECT value FROM jsonb_array_elements(NEW.metadata->'lot_allocations')
    LOOP
      SELECT * INTO v_allocation_lot
        FROM public.lots_hectares
       WHERE id=(v_allocation->>'lot_id')::uuid
       FOR UPDATE;

      IF v_allocation_lot.id IS NULL THEN
        RAISE EXCEPTION 'Un des lots de la série est introuvable.';
      END IF;

      IF v_allocation_count=0 THEN
        v_first_lot_id:=v_allocation_lot.id;
        v_first_convention_id:=v_allocation_lot.convention_id;
      ELSIF v_allocation_lot.convention_id IS DISTINCT FROM v_first_convention_id
         OR v_allocation_lot.numero_h<>v_expected_lot_number THEN
        RAISE EXCEPTION 'Les lots sélectionnés doivent être contigus et appartenir à la même convention foncière.';
      END IF;

      IF v_allocation_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id
         OR coalesce(v_allocation_lot.part_type,'agricapital')<>'agricapital'
         OR v_allocation_lot.client_id IS NOT NULL
         OR v_allocation_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_allocation_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue') THEN
        RAISE EXCEPTION 'Un des lots de la série n’est plus disponible pour cette acquisition.';
      END IF;

      v_amount:=coalesce((v_allocation->>'surface_ha')::numeric,0);
      IF v_family LIKE '%PALMINVEST%' THEN
        IF abs(v_amount-1)>0.000001 THEN
          RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
        END IF;
      ELSIF v_amount<0.5 OR abs(v_amount*2-round(v_amount*2))>0.000001 THEN
        RAISE EXCEPTION 'Chaque quote-part doit être un multiple de 0,50 ha.';
      END IF;

      IF v_amount>coalesce(v_allocation_lot.surface_disponible_ha,0)+0.000001 THEN
        RAISE EXCEPTION 'La quote-part demandée dépasse la superficie encore disponible du lot %.',v_allocation_lot.reference;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.conventions_foncieres cf
         WHERE cf.id=v_allocation_lot.convention_id
           AND cf.parcelle_id=v_allocation_lot.parcelle_id
           AND cf.statut='active'
      ) THEN
        RAISE EXCEPTION 'Chaque lot doit dépendre d’une convention foncière active.';
      END IF;

      v_total:=v_total+v_amount;
      v_expected_lot_number:=v_allocation_lot.numero_h+1;
      v_allocation_count:=v_allocation_count+1;
    END LOOP;

    IF v_first_lot_id IS DISTINCT FROM NEW.lot_id
       OR abs(v_total-coalesce(NEW.superficie_ha,0))>0.000001 THEN
      RAISE EXCEPTION 'La somme des quotes-parts des lots doit correspondre exactement à la superficie de l’acquisition.';
    END IF;

    SELECT * INTO v_parcelle FROM public.parcelles WHERE id=NEW.parcelle_id;
    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_lot
    FROM public.lots_hectares
   WHERE id=NEW.lot_id;

  IF v_lot.id IS NULL OR v_lot.parcelle_id IS NULL THEN
    RAISE EXCEPTION 'Lot partenaire introuvable ou sans parcelle.';
  END IF;

  v_preassigned :=
    v_lot.client_id = NEW.client_id
    AND v_lot.acquisition_id = NEW.id
    AND lower(coalesce(v_lot.statut,''))='attribue'
    AND NEW.metadata->>'lot_cible_id'=v_lot.id::text;

  IF NOT v_preassigned THEN
    IF v_lot.client_id IS NOT NULL
       OR v_lot.acquisition_id IS NOT NULL
       OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
       OR coalesce(v_lot.surface_disponible_ha,0)<=0 THEN
      RAISE EXCEPTION 'Le lot n’est plus disponible ou est réservé à une autre acquisition.';
    END IF;
    IF coalesce(v_lot.surface_disponible_ha,0)+0.000001 < coalesce(NEW.superficie_ha,0) THEN
      RAISE EXCEPTION 'La superficie disponible du lot est insuffisante.';
    END IF;
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_lot.parcelle_id;
  IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
    RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
     WHERE cf.id=v_lot.convention_id
       AND cf.parcelle_id=v_lot.parcelle_id
       AND cf.statut='active'
  ) THEN
    RAISE EXCEPTION 'Le lot doit dépendre d’une convention foncière active.';
  END IF;

  IF NEW.parcelle_id IS DISTINCT FROM v_lot.parcelle_id THEN
    RAISE EXCEPTION 'La parcelle de l’acquisition ne correspond pas au lot réservé.';
  END IF;

  IF v_family LIKE '%PALMINVEST%'
     AND (abs(coalesce(v_lot.surface_ha,0)-1)>0.000001
          OR abs(coalesce(NEW.superficie_ha,0)-1)>0.000001) THEN
    RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
  END IF;

  RETURN NEW;
END
$function$;
