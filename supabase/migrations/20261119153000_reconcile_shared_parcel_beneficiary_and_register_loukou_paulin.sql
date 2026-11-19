
-- AgriCapital: PalmInvest sur parcelle partagée + propriétaire bénéficiaire particulier.
-- La convention foncière reste à compléter par la direction : aucune convention n'est inventée.
-- L'acquisition reste souscrite / à valider tant que la convention active n'est pas rattachée.

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

  -- Souscription enregistrée avec un lot identifié, mais convention à rattacher.
  -- Elle reste non validée et ne peut pas devenir active tant que le drapeau est vrai.
  IF coalesce((NEW.metadata->>'foncier_convention_en_attente')::boolean,false) THEN
    IF NEW.statut <> 'souscrite' OR NEW.validation_statut <> 'a_valider' THEN
      RAISE EXCEPTION 'Une acquisition sans convention active doit rester souscrite et à valider.';
    END IF;

    v_target_lot_id := nullif(NEW.metadata->>'lot_cible_id','')::uuid;
    IF v_target_lot_id IS NULL OR NEW.lot_id IS DISTINCT FROM v_target_lot_id THEN
      RAISE EXCEPTION 'Le lot cible de l’acquisition foncière en attente est absent ou incohérent.';
    END IF;

    SELECT * INTO v_lot
      FROM public.lots_hectares
     WHERE id = v_target_lot_id
     FOR UPDATE;

    IF v_lot.id IS NULL OR v_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id THEN
      RAISE EXCEPTION 'Le lot cible ne correspond pas à la parcelle de l’acquisition.';
    END IF;
    IF coalesce(v_lot.part_type,'agricapital') <> 'agricapital' THEN
      RAISE EXCEPTION 'Le lot cible doit appartenir à la quote-part AgriCapital.';
    END IF;

    IF v_lot.client_id IS NULL THEN
      IF v_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
         OR coalesce(v_lot.surface_disponible_ha,0) + 0.000001 < NEW.superficie_ha THEN
        RAISE EXCEPTION 'Le lot cible n’est plus libre pour cette acquisition en attente.';
      END IF;
    ELSE
      IF v_lot.client_id IS DISTINCT FROM NEW.client_id
         OR v_lot.acquisition_id IS DISTINCT FROM NEW.id
         OR lower(coalesce(v_lot.statut,'')) <> 'attribue' THEN
        RAISE EXCEPTION 'Le lot déjà affecté ne correspond pas à cette acquisition en attente.';
      END IF;
    END IF;

    SELECT * INTO v_parcelle
      FROM public.parcelles
     WHERE id = v_lot.parcelle_id;

    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
    END IF;

    IF v_family LIKE '%PALMINVEST%'
       AND (abs(coalesce(v_lot.surface_ha,0)-1)>0.000001
            OR abs(coalesce(NEW.superficie_ha,0)-1)>0.000001) THEN
      RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
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

DROP TRIGGER IF EXISTS trg_validate_client_acquisition_foncier ON public.acquisitions;
CREATE TRIGGER trg_validate_client_acquisition_foncier
BEFORE INSERT OR UPDATE OF
  necessite_foncier_client, lot_id, parcelle_id, client_id, superficie_ha,
  metadata, statut, validation_statut
ON public.acquisitions
FOR EACH ROW
EXECUTE FUNCTION public.validate_client_acquisition_foncier();

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
  v_owner_client public.clients%rowtype;
  v_owner_client_id uuid;
  v_surface numeric := 0;
  v_density integer;
  v_plant_count integer;
  v_plantation_date date;
  v_owner_plantation_id uuid;
  v_plantation_name text;
BEGIN
  IF p_parcelle_id IS NULL OR p_proprietaire_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_parcelle
    FROM public.parcelles
   WHERE id=p_parcelle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcelle introuvable pour la synchronisation de la part propriétaire';
  END IF;
  IF v_parcelle.proprietaire_id IS DISTINCT FROM p_proprietaire_id THEN
    RAISE EXCEPTION 'Le propriétaire fourni ne correspond pas au propriétaire de la parcelle';
  END IF;

  SELECT * INTO v_owner_client
    FROM public.clients c
   WHERE c.proprietaire_id=p_proprietaire_id
     AND c.parcelle_id=p_parcelle_id
     AND c.type_client='beneficiaire_particulier'
     AND coalesce((c.metadata->>'beneficiaire_foncier_owner')::boolean,false)
   ORDER BY c.created_at
   LIMIT 1;

  IF FOUND THEN
    v_owner_client_id:=v_owner_client.id;
    v_plantation_name:='Plantation bénéficiaire particulier — '||
      coalesce(nullif(v_owner_client.nom_complet,''),'propriétaire foncier');
  END IF;

  SELECT coalesce(sum(surface_proprietaire_ha),0)
    INTO v_surface
    FROM public.plantation_activations
   WHERE parcelle_id=p_parcelle_id
     AND proprietaire_id=p_proprietaire_id
     AND statut='active';

  v_density:=coalesce(nullif(v_parcelle.plantation_densite_plants,0),143);
  v_plantation_date:=coalesce(v_parcelle.plantation_date_activation,current_date);
  v_plant_count:=CASE WHEN v_density IS NOT NULL THEN round(v_surface*v_density)::integer ELSE NULL END;

  IF v_surface<=0 THEN
    UPDATE public.plantations
       SET superficie_ha=0,
           superficie_activee=0,
           surface_reellement_plantee=0,
           nombre_plants=0,
           nombre_plants_prevus=0,
           nombre_plants_mis_en_terre=0,
           statut='annule',
           statut_global='annule',
           updated_by=p_actor,
           updated_at=now()
     WHERE parcelle_id=p_parcelle_id
       AND (
         (role_attribution='proprietaire' AND client_id IS NULL)
         OR (v_owner_client_id IS NOT NULL AND client_id=v_owner_client_id AND role_attribution='beneficiaire_particulier')
       )
       AND statut='active';
    RETURN NULL;
  END IF;

  IF v_owner_client_id IS NOT NULL THEN
    SELECT * INTO v_owner_plantation
      FROM public.plantations
     WHERE parcelle_id=p_parcelle_id
       AND (
         (client_id=v_owner_client_id AND role_attribution='beneficiaire_particulier')
         OR (client_id IS NULL AND role_attribution='proprietaire')
       )
       AND coalesce(statut,'')<>'annule'
     ORDER BY CASE WHEN client_id=v_owner_client_id THEN 0 ELSE 1 END,created_at
     LIMIT 1
     FOR UPDATE;

    PERFORM set_config('app.internal_plantation_write','sync_owner_plantation_for_shared_parcel',true);

    IF NOT FOUND THEN
      INSERT INTO public.plantations(
        client_id,parcelle_id,activation_id,lot_id,acquisition_id,
        role_attribution,nom,nom_plantation,
        superficie_ha,superficie_activee,surface_reellement_plantee,
        nombre_plants,nombre_plants_prevus,nombre_plants_mis_en_terre,densite_plants,densite_cible,
        region_id,departement_id,sous_prefecture_id,district_id,village,village_nom,localite,
        localisation_gps_lat,localisation_gps_lng,latitude,longitude,
        date_plantation,date_activation,statut,statut_global,type_culture,
        notes,created_by,updated_by
      )
      VALUES(
        v_owner_client_id,p_parcelle_id,NULL,NULL,NULL,
        'beneficiaire_particulier',v_plantation_name,v_plantation_name,
        v_surface,v_surface,v_surface,
        v_plant_count,v_plant_count,v_plant_count,v_density,v_density,
        v_parcelle.region_id,v_parcelle.departement_id,v_parcelle.sous_prefecture_id,v_parcelle.district_id,
        v_parcelle.village,v_parcelle.village,v_parcelle.village,
        v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
        v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
        v_plantation_date,v_plantation_date,'active','active',
        coalesce(v_parcelle.plantation_type_culture,'Palmier à huile'),
        'Bénéfice particulier du propriétaire foncier. Hors offre commerciale, sans échéancier ni dette. Surface synchronisée à partir des activations PalmInvest.',
        p_actor,p_actor
      )
      RETURNING id INTO v_owner_plantation_id;
    ELSE
      UPDATE public.plantations
         SET client_id=v_owner_client_id,
             role_attribution='beneficiaire_particulier',
             nom=v_plantation_name,
             nom_plantation=v_plantation_name,
             activation_id=NULL,
             lot_id=NULL,
             acquisition_id=NULL,
             superficie_ha=v_surface,
             superficie_activee=v_surface,
             surface_reellement_plantee=v_surface,
             nombre_plants=v_plant_count,
             nombre_plants_prevus=v_plant_count,
             nombre_plants_mis_en_terre=v_plant_count,
             densite_plants=v_density,
             densite_cible=v_density,
             date_plantation=coalesce(date_plantation,v_plantation_date),
             date_activation=coalesce(date_activation,v_plantation_date),
             statut='active',
             statut_global='active',
             type_culture=coalesce(v_parcelle.plantation_type_culture,type_culture,'Palmier à huile'),
             notes='Bénéfice particulier du propriétaire foncier. Hors offre commerciale, sans échéancier ni dette. Surface synchronisée à partir des activations PalmInvest.',
             updated_by=p_actor,
             updated_at=now()
       WHERE id=v_owner_plantation.id
       RETURNING id INTO v_owner_plantation_id;
    END IF;

    UPDATE public.plantations
       SET superficie_ha=0,
           superficie_activee=0,
           surface_reellement_plantee=0,
           nombre_plants=0,
           nombre_plants_prevus=0,
           nombre_plants_mis_en_terre=0,
           statut='annule',
           statut_global='annule',
           notes=concat_ws(E'\n',nullif(notes,''),'Ancienne ligne propriétaire fusionnée dans la plantation bénéficiaire particulier du propriétaire.'),
           updated_by=p_actor,
           updated_at=now()
     WHERE parcelle_id=p_parcelle_id
       AND (
         (role_attribution='proprietaire' AND client_id IS NULL)
         OR (role_attribution='beneficiaire_particulier' AND client_id=v_owner_client_id)
       )
       AND id<>v_owner_plantation_id
       AND statut='active';

    RETURN v_owner_plantation_id;
  END IF;

  -- Comportement historique pour les parcelles dont le propriétaire n'a pas de fiche bénéficiaire particulier.
  SELECT * INTO v_owner_plantation
    FROM public.plantations
   WHERE parcelle_id=p_parcelle_id
     AND role_attribution='proprietaire'
     AND client_id IS NULL
     AND coalesce(statut,'')<>'annule'
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM set_config('app.internal_plantation_write','sync_owner_plantation_for_shared_parcel',true);
    INSERT INTO public.plantations(
      client_id,parcelle_id,activation_id,lot_id,acquisition_id,
      role_attribution,nom,nom_plantation,
      superficie_ha,superficie_activee,surface_reellement_plantee,
      nombre_plants,nombre_plants_prevus,densite_plants,
      region_id,departement_id,sous_prefecture_id,village,village_nom,localite,
      localisation_gps_lat,localisation_gps_lng,latitude,longitude,
      date_plantation,date_activation,statut,statut_global,type_culture,
      notes,created_by,updated_by
    )
    VALUES(
      NULL,p_parcelle_id,NULL,NULL,NULL,
      'proprietaire','Plantation propriétaire','Plantation de la part du propriétaire',
      v_surface,v_surface,v_surface,
      v_plant_count,v_plant_count,v_density,
      v_parcelle.region_id,v_parcelle.departement_id,v_parcelle.sous_prefecture_id,
      v_parcelle.village,v_parcelle.village,v_parcelle.village,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_plantation_date,v_plantation_date,'active','active',
      coalesce(v_parcelle.plantation_type_culture,'Palmier à huile'),
      'Part propriétaire synchronisée à partir des activations foncières actives. Hors offre commerciale et hors échéancier client.',
      p_actor,p_actor
    )
    RETURNING id INTO v_owner_plantation_id;
  ELSE
    UPDATE public.plantations
       SET nom='Plantation propriétaire',
           nom_plantation='Plantation de la part du propriétaire',
           activation_id=NULL,
           lot_id=NULL,
           acquisition_id=NULL,
           superficie_ha=v_surface,
           superficie_activee=v_surface,
           surface_reellement_plantee=v_surface,
           nombre_plants=v_plant_count,
           nombre_plants_prevus=v_plant_count,
           densite_plants=v_density,
           statut='active',
           statut_global='active',
           type_culture=coalesce(v_parcelle.plantation_type_culture,type_culture,'Palmier à huile'),
           updated_by=p_actor,
           updated_at=now()
     WHERE id=v_owner_plantation.id
     RETURNING id INTO v_owner_plantation_id;
  END IF;

  UPDATE public.plantations
     SET superficie_ha=0,
         superficie_activee=0,
         surface_reellement_plantee=0,
         nombre_plants=0,
         nombre_plants_prevus=0,
         statut='annule',
         statut_global='annule',
         notes=concat_ws(E'\n',nullif(notes,''),'Ancienne ligne propriétaire fusionnée dans la ligne canonique de la parcelle.'),
         updated_by=p_actor,
         updated_at=now()
   WHERE parcelle_id=p_parcelle_id
     AND role_attribution='proprietaire'
     AND client_id IS NULL
     AND id<>v_owner_plantation_id
     AND statut='active';

  RETURN v_owner_plantation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generer_commission_technique_mise_en_terre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_amount numeric;
  v_beneficiary_plantation_id uuid;
  v_owner_plantation_id uuid;
  v_owner_client_id uuid;
  v_parcelle_owner_id uuid;
BEGIN
  IF NEW.statut <> 'realisee' OR NEW.type_intervention <> 'mise_en_terre' THEN
    RETURN NEW;
  END IF;

  v_profile_id:=NEW.agent_technique_id;
  IF v_profile_id IS NULL OR NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.acquisitions a
     WHERE a.id=NEW.acquisition_id
       AND a.client_id=NEW.client_id
       AND coalesce((a.metadata->>'commission_technique_exoneree')::boolean,false)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT gr.montant INTO v_amount
    FROM public.grille_remuneration gr
   WHERE gr.code_regle='TECHNIQUE_MISE_EN_TERRE'
     AND gr.actif
   ORDER BY gr.updated_at DESC
   LIMIT 1;

  IF coalesce(v_amount,0)<=0 THEN
    RETURN NEW;
  END IF;

  IF NEW.plantation_id IS NOT NULL THEN
    v_beneficiary_plantation_id:=NEW.plantation_id;
  ELSIF NEW.acquisition_id IS NOT NULL THEN
    SELECT p.id INTO v_beneficiary_plantation_id
      FROM public.plantations p
     WHERE p.acquisition_id=NEW.acquisition_id
       AND p.client_id=NEW.client_id
       AND p.role_attribution<>'proprietaire'
     ORDER BY p.created_at DESC
     LIMIT 1;
  ELSE
    SELECT p.id INTO v_beneficiary_plantation_id
      FROM public.plantations p
     WHERE p.client_id=NEW.client_id
       AND p.parcelle_id=NEW.parcelle_id
       AND p.acquisition_id IS NULL
       AND p.role_attribution<>'proprietaire'
     ORDER BY p.date_plantation DESC NULLS LAST,p.created_at DESC
     LIMIT 1;
  END IF;

  IF v_beneficiary_plantation_id IS NOT NULL THEN
    INSERT INTO public.commissions(
      profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,
      montant_commission,periode,date_calcul,statut,intervention_id
    )
    VALUES(
      v_profile_id,v_beneficiary_plantation_id,NEW.client_id,'technique',
      v_amount,0,v_amount,coalesce(NEW.date_intervention,current_date),now(),'validee',NEW.id
    )
    ON CONFLICT (intervention_id,plantation_id,type_commission)
      WHERE intervention_id IS NOT NULL AND plantation_id IS NOT NULL AND type_commission='technique'
    DO NOTHING;
  END IF;

  IF NEW.parcelle_id IS NOT NULL THEN
    SELECT pr.proprietaire_id INTO v_parcelle_owner_id
      FROM public.parcelles pr
     WHERE pr.id=NEW.parcelle_id;

    SELECT p.id,p.client_id
      INTO v_owner_plantation_id,v_owner_client_id
      FROM public.plantations p
      LEFT JOIN public.clients c ON c.id=p.client_id
     WHERE p.parcelle_id=NEW.parcelle_id
       AND coalesce(p.statut,'') NOT IN ('annule','archive','supprime')
       AND (
         (p.role_attribution='proprietaire' AND p.client_id IS NULL)
         OR (
           p.role_attribution='beneficiaire_particulier'
           AND c.type_client='beneficiaire_particulier'
           AND c.proprietaire_id=v_parcelle_owner_id
           AND coalesce((c.metadata->>'beneficiaire_foncier_owner')::boolean,false)
         )
       )
     ORDER BY CASE WHEN p.role_attribution='beneficiaire_particulier' THEN 0 ELSE 1 END,p.created_at
     LIMIT 1;

    IF v_owner_plantation_id IS NOT NULL THEN
      INSERT INTO public.commissions(
        profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,
        montant_commission,periode,date_calcul,statut,intervention_id
      )
      VALUES(
        v_profile_id,v_owner_plantation_id,v_owner_client_id,'technique',
        v_amount,0,v_amount,coalesce(NEW.date_intervention,current_date),now(),'validee',NEW.id
      )
      ON CONFLICT (intervention_id,plantation_id,type_commission)
        WHERE intervention_id IS NOT NULL AND plantation_id IS NOT NULL AND type_commission='technique'
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generer_commission_technique_a_la_creation_plantation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_intervention record;
  v_amount numeric;
  v_is_owner_beneficiary boolean := false;
BEGIN
  IF NEW.role_attribution='proprietaire' AND NEW.client_id IS NULL THEN
    v_is_owner_beneficiary:=true;
  ELSIF NEW.role_attribution='beneficiaire_particulier' AND NEW.client_id IS NOT NULL THEN
    SELECT coalesce((c.metadata->>'beneficiaire_foncier_owner')::boolean,false)
      INTO v_is_owner_beneficiary
      FROM public.clients c
     WHERE c.id=NEW.client_id
       AND c.type_client='beneficiaire_particulier';
  END IF;

  IF v_is_owner_beneficiary THEN
    SELECT gr.montant INTO v_amount
      FROM public.grille_remuneration gr
     WHERE gr.code_regle='TECHNIQUE_MISE_EN_TERRE'
       AND gr.actif
     ORDER BY gr.updated_at DESC
     LIMIT 1;

    IF coalesce(v_amount,0)<=0 THEN
      RETURN NEW;
    END IF;

    FOR v_intervention IN
      SELECT i.id,i.agent_technique_id,i.date_intervention
        FROM public.interventions_techniques i
       WHERE i.parcelle_id=NEW.parcelle_id
         AND i.type_intervention='mise_en_terre'
         AND i.statut='realisee'
         AND i.agent_technique_id IS NOT NULL
         AND (i.acquisition_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM public.acquisitions a
            WHERE a.id=i.acquisition_id
              AND coalesce((a.metadata->>'commission_technique_exoneree')::boolean,false)
         ))
    LOOP
      INSERT INTO public.commissions(
        profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,
        montant_commission,periode,date_calcul,statut,intervention_id
      )
      VALUES(
        v_intervention.agent_technique_id,NEW.id,NEW.client_id,'technique',
        v_amount,0,v_amount,coalesce(v_intervention.date_intervention,current_date),now(),'validee',v_intervention.id
      )
      ON CONFLICT (intervention_id,plantation_id,type_commission)
        WHERE intervention_id IS NOT NULL AND plantation_id IS NOT NULL AND type_commission='technique'
      DO NOTHING;
    END LOOP;

    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.acquisitions a
     WHERE a.id=NEW.acquisition_id
       AND coalesce((a.metadata->>'commission_technique_exoneree')::boolean,false)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT i.id,i.agent_technique_id,i.date_intervention
    INTO v_intervention
    FROM public.interventions_techniques i
   WHERE i.client_id=NEW.client_id
     AND i.type_intervention='mise_en_terre'
     AND i.statut='realisee'
     AND (
       (NEW.acquisition_id IS NOT NULL AND i.acquisition_id=NEW.acquisition_id)
       OR (NEW.acquisition_id IS NULL AND i.parcelle_id=NEW.parcelle_id)
     )
   ORDER BY i.date_intervention DESC NULLS LAST,i.created_at DESC
   LIMIT 1;

  IF v_intervention.id IS NULL OR v_intervention.agent_technique_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT gr.montant INTO v_amount
    FROM public.grille_remuneration gr
   WHERE gr.code_regle='TECHNIQUE_MISE_EN_TERRE'
     AND gr.actif
   ORDER BY gr.updated_at DESC
   LIMIT 1;

  IF coalesce(v_amount,0)<=0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.commissions(
    profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,
    montant_commission,periode,date_calcul,statut,intervention_id
  )
  VALUES(
    v_intervention.agent_technique_id,NEW.id,NEW.client_id,'technique',
    v_amount,0,v_amount,coalesce(v_intervention.date_intervention,NEW.date_plantation,current_date),
    now(),'validee',v_intervention.id
  )
  ON CONFLICT (intervention_id,plantation_id,type_commission)
    WHERE intervention_id IS NOT NULL AND plantation_id IS NOT NULL AND type_commission='technique'
  DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ne plus inventer la réalisation ni la date des étapes antérieures à partir de la seule mise en terre.
CREATE OR REPLACE FUNCTION public.sync_technical_preceding_steps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_planting_to_acquisition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_foncier_pending boolean := false;
BEGIN
  IF lower(coalesce(NEW.type_intervention,'')) <> 'mise_en_terre'
     OR lower(coalesce(NEW.statut,'')) NOT IN ('realisee','valide','validee','terminee','completed') THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT coalesce((a.metadata->>'foncier_convention_en_attente')::boolean,false)
      INTO v_foncier_pending
      FROM public.acquisitions a
     WHERE a.id=NEW.acquisition_id
       AND a.client_id=NEW.client_id;

    UPDATE public.acquisitions
       SET statut_technique='mise_en_terre_realisee',
           statut=CASE WHEN v_foncier_pending THEN 'souscrite' ELSE 'active' END,
           validation_statut=CASE WHEN v_foncier_pending THEN 'a_valider' ELSE 'valide' END,
           updated_at=now()
     WHERE id=NEW.acquisition_id
       AND client_id=NEW.client_id;

    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(NEW.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE acquisition_id=NEW.acquisition_id;
  ELSIF NEW.plantation_id IS NOT NULL THEN
    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(NEW.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE id=NEW.plantation_id
       AND client_id=NEW.client_id;
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

CREATE OR REPLACE FUNCTION public.create_plantation_after_mise_en_terre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client public.clients%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_sub public.acquisitions%rowtype;
  v_existing uuid;
  v_surface numeric;
  v_density integer;
  v_date date;
  v_name text;
  v_role text:='beneficiaire';
  v_active boolean;
  v_actor uuid;
  v_lot_id uuid;
  v_parcelle_id uuid;
  v_foncier_pending boolean := false;
BEGIN
  IF NEW.type_intervention<>'mise_en_terre' OR NEW.statut<>'realisee' THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'La mise en terre doit être rattachée à un Client';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id=NEW.client_id;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client du parcours technique introuvable';
  END IF;

  v_lot_id:=NEW.lot_id;
  v_parcelle_id:=NEW.parcelle_id;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT * INTO v_sub
      FROM public.acquisitions
     WHERE id=NEW.acquisition_id
       AND client_id=NEW.client_id
     FOR UPDATE;

    IF v_sub.id IS NULL THEN
      RAISE EXCEPTION 'Souscription du client introuvable';
    END IF;

    IF v_sub.statut_technique='mise_en_terre_realisee' THEN
      IF EXISTS(SELECT 1 FROM public.plantations WHERE acquisition_id=v_sub.id) THEN
        RETURN NEW;
      END IF;
    END IF;

    v_lot_id:=coalesce(v_lot_id,v_sub.lot_id);
    v_parcelle_id:=coalesce(v_parcelle_id,v_sub.parcelle_id);

    IF v_sub.parcelle_id IS NOT NULL AND v_parcelle_id IS DISTINCT FROM v_sub.parcelle_id THEN
      RAISE EXCEPTION 'La parcelle de l’intervention ne correspond pas à l’acquisition';
    END IF;

    v_surface:=v_sub.superficie_ha;
    v_role:='beneficiaire';
    v_active:=v_sub.montant_pi_total<=0 OR EXISTS(
      SELECT 1 FROM public.paiements p
       WHERE p.acquisition_id=v_sub.id
         AND coalesce(p.est_paiement_initial,false)
         AND lower(coalesce(p.statut,'')) IN ('valide','paye','paid','success','successful','completed')
    );
    v_foncier_pending:=coalesce((v_sub.metadata->>'foncier_convention_en_attente')::boolean,false);
  END IF;

  IF v_lot_id IS NOT NULL THEN
    SELECT * INTO v_lot FROM public.lots_hectares WHERE id=v_lot_id FOR UPDATE;
    IF v_lot.id IS NULL THEN
      RAISE EXCEPTION 'Lot introuvable pour la mise en terre';
    END IF;
    IF v_lot.client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Le lot n’est pas attribué à ce client';
    END IF;
    IF v_parcelle_id IS NOT NULL AND v_parcelle_id IS DISTINCT FROM v_lot.parcelle_id THEN
      RAISE EXCEPTION 'Le lot ne correspond pas à la parcelle de l’intervention';
    END IF;
    v_parcelle_id:=coalesce(v_parcelle_id,v_lot.parcelle_id);
    IF NEW.acquisition_id IS NULL THEN
      v_surface:=greatest(0,coalesce(v_lot.surface_ha,0));
    END IF;
  END IF;

  IF v_parcelle_id IS NULL THEN
    RAISE EXCEPTION 'La parcelle doit être précisée dans l’intervention technique';
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_parcelle_id FOR UPDATE;
  IF v_parcelle.id IS NULL THEN
    RAISE EXCEPTION 'Parcelle introuvable pour la mise en terre';
  END IF;

  IF NEW.acquisition_id IS NULL THEN
    IF v_lot_id IS NULL THEN
      v_surface:=greatest(0,coalesce(v_client.total_hectares,0));
    END IF;

    IF v_client.type_client='beneficiaire_particulier' AND v_lot_id IS NULL THEN
      SELECT coalesce(max(ba.surface_attribuee_ha),v_surface),
             coalesce(max(ba.role_attribution),'beneficiaire')
        INTO v_surface,v_role
        FROM public.beneficiaire_attributions ba
       WHERE ba.client_id=v_client.id
         AND ba.parcelle_id=v_parcelle.id
         AND ba.statut='active';
    END IF;

    v_active:=coalesce(v_client.compte_actif,false)
      OR v_client.paiement_initial_paye_at IS NOT NULL
      OR v_client.pi_paye_at IS NOT NULL;
  END IF;

  IF coalesce(v_surface,0)<=0 THEN
    RAISE EXCEPTION 'La superficie du dossier ou de l’acquisition doit être positive avant la mise en terre';
  END IF;

  v_density:=coalesce(v_parcelle.plantation_densite_plants,143);
  v_date:=NEW.date_intervention::date;
  v_name:='Plantation '||coalesce(nullif(v_client.nom_complet,''),v_client.id_unique);
  v_actor:=coalesce(auth.uid(),v_client.created_by);

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT p.id INTO v_existing
      FROM public.plantations p
     WHERE p.acquisition_id=NEW.acquisition_id
     ORDER BY p.created_at DESC
     LIMIT 1;
  ELSE
    SELECT p.id INTO v_existing
      FROM public.plantations p
     WHERE p.client_id=v_client.id
       AND p.parcelle_id=v_parcelle.id
       AND ((v_lot_id IS NOT NULL AND p.lot_id=v_lot_id)
         OR (v_lot_id IS NULL AND p.lot_id IS NULL))
     ORDER BY p.created_at DESC
     LIMIT 1;
  END IF;

  IF v_existing IS NULL THEN
    INSERT INTO public.plantations(
      client_id,parcelle_id,role_attribution,nom,nom_plantation,superficie_ha,superficie_activee,
      nombre_plants,densite_plants,district_id,region_id,departement_id,sous_prefecture_id,
      village,village_nom,localite,localisation_gps_lat,localisation_gps_lng,latitude,longitude,
      date_plantation,date_activation,statut,statut_global,type_culture,notes,created_by,updated_by,
      lot_id,acquisition_id
    )
    VALUES(
      v_client.id,v_parcelle.id,v_role,v_name,v_name,v_surface,
      CASE WHEN v_active THEN v_surface ELSE 0 END,
      round(v_surface*v_density)::integer,v_density,
      v_parcelle.district_id,v_parcelle.region_id,v_parcelle.departement_id,v_parcelle.sous_prefecture_id,
      v_parcelle.village,v_parcelle.village,v_parcelle.village,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_date,CASE WHEN v_active THEN v_date ELSE NULL END,
      CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
      CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
      coalesce(v_parcelle.plantation_type_culture,'Palmier à huile'),
      CASE WHEN NEW.acquisition_id IS NOT NULL
        THEN 'Créée après validation technique de l’acquisition '||NEW.acquisition_id::text
        ELSE 'Créée automatiquement après validation technique de la mise en terre.'
      END,
      v_actor,v_actor,v_lot_id,NEW.acquisition_id
    )
    RETURNING id INTO v_existing;
  ELSE
    UPDATE public.plantations
       SET date_plantation=coalesce(date_plantation,v_date),
           date_activation=CASE WHEN v_active THEN coalesce(date_activation,v_date) ELSE NULL END,
           superficie_ha=CASE WHEN NEW.acquisition_id IS NOT NULL THEN v_surface ELSE superficie_ha END,
           superficie_activee=CASE WHEN v_active THEN v_surface ELSE 0 END,
           nombre_plants=round(v_surface*v_density)::integer,
           densite_plants=v_density,
           lot_id=coalesce(lot_id,v_lot_id),
           acquisition_id=coalesce(acquisition_id,NEW.acquisition_id),
           statut=CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
           statut_global=CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
           updated_at=now()
     WHERE id=v_existing;
  END IF;

  UPDATE public.clients
     SET parcelle_id=coalesce(parcelle_id,v_parcelle.id),
         nombre_plantations=(
           SELECT count(*) FROM public.plantations
            WHERE client_id=v_client.id
              AND statut NOT IN ('archive','supprime')
         ),
         phase_actuelle='plantation',
         updated_at=now()
   WHERE id=v_client.id;

  IF NEW.acquisition_id IS NOT NULL THEN
    UPDATE public.acquisitions
       SET parcelle_id=coalesce(parcelle_id,v_parcelle.id),
           statut_technique='mise_en_terre_realisee',
           statut=CASE
             WHEN coalesce((metadata->>'foncier_convention_en_attente')::boolean,false) THEN 'souscrite'
             WHEN v_active THEN 'active'
             ELSE 'en_attente_paiement'
           END,
           validation_statut=CASE
             WHEN coalesce((metadata->>'foncier_convention_en_attente')::boolean,false) THEN 'a_valider'
             ELSE 'valide'
           END,
           updated_at=now()
     WHERE id=NEW.acquisition_id;
  ELSIF v_client.type_client='beneficiaire_particulier' THEN
    INSERT INTO public.beneficiaire_attributions(
      client_id,parcelle_id,plantation_id,surface_attribuee_ha,role_attribution,statut,notes
    )
    SELECT v_client.id,v_parcelle.id,v_existing,v_surface,v_role,'active',
           'Rattachement automatique de la plantation individuelle à la parcelle.'
     WHERE NOT EXISTS(
       SELECT 1 FROM public.beneficiaire_attributions ba
        WHERE ba.client_id=v_client.id
          AND ba.parcelle_id=v_parcelle.id
          AND ba.plantation_id=v_existing
          AND ba.statut='active'
     );
  END IF;

  RETURN NEW;
END;
$function$;

DO $migration$
DECLARE
  v_prospect public.prospects%rowtype;
  v_lead public.leads%rowtype;
  v_owner_record public.clients%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_offer public.offres%rowtype;
  v_larissa public.profiles%rowtype;
  v_jean_marie public.profiles%rowtype;
  v_formula jsonb;
  v_client_id uuid;
  v_owner_beneficiary_id uuid;
  v_acquisition_id uuid;
  v_payment_id uuid;
  v_intervention_id uuid;
  v_plantation_id uuid;
  v_owner_plantation_id uuid;
  v_pending_foncier boolean;
  v_tech_amount numeric;
  v_echeancier jsonb;
  v_existing_count integer;
BEGIN
  SELECT * INTO v_prospect
    FROM public.prospects
   WHERE id='13464613-ff8d-414a-977e-cb5382d8930e'
   FOR UPDATE;

  IF NOT FOUND OR v_prospect.telephone<>'+2250749730865' THEN
    RAISE EXCEPTION 'Prospect LOUKOU Paulin absent ou téléphone incohérent.';
  END IF;
  IF v_prospect.nom<>'LOUKOU' OR v_prospect.prenoms<>'PAULIN' THEN
    RAISE EXCEPTION 'L’identité du prospect doit être LOUKOU Paulin avant la migration.';
  END IF;
  IF v_prospect.client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Le prospect LOUKOU Paulin est déjà relié à un client; réconciliation requise.';
  END IF;

  SELECT * INTO v_lead
    FROM public.leads
   WHERE id=v_prospect.lead_id
   FOR UPDATE;

  IF NOT FOUND OR v_lead.telephone<>v_prospect.telephone THEN
    RAISE EXCEPTION 'Lead source de LOUKOU Paulin absent ou incohérent.';
  END IF;
  IF v_lead.client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Le lead de LOUKOU Paulin est déjà relié à un client.';
  END IF;

  SELECT * INTO v_owner_record
    FROM public.clients
   WHERE proprietaire_id='42a884da-f5b8-43d3-954c-95ff09b7d3a9'
     AND type_client='proprietaire_foncier'
   ORDER BY created_at
   LIMIT 1;

  IF NOT FOUND OR v_owner_record.nom<>'ZONGO' OR v_owner_record.prenoms<>'BOUKARY' THEN
    RAISE EXCEPTION 'La fiche foncière de Zongo Boukary est absente ou incorrecte.';
  END IF;

  SELECT * INTO v_parcelle
    FROM public.parcelles
   WHERE id='ac75c9cd-5d8c-437b-b8b6-664d4299a40e'
   FOR UPDATE;

  IF NOT FOUND
     OR v_parcelle.proprietaire_id<>'42a884da-f5b8-43d3-954c-95ff09b7d3a9'
     OR v_parcelle.id_unique<>'PAR-000008'
     OR v_parcelle.village<>'GONATÉ'
     OR v_parcelle.surface_totale_ha<>6
     OR v_parcelle.surface_agricapital_ha<>3
     OR v_parcelle.surface_proprietaire_ha<>3
     OR NOT coalesce(v_parcelle.plantation_partagee_activee,false) THEN
    RAISE EXCEPTION 'La parcelle Zongo Boukary ne correspond pas à la répartition foncière attendue.';
  END IF;

  SELECT * INTO v_lot
    FROM public.lots_hectares
   WHERE id='deabcd85-9010-4523-9090-14ed0c2381e4'
   FOR UPDATE;

  IF NOT FOUND
     OR v_lot.parcelle_id<>v_parcelle.id
     OR v_lot.reference<>'PAR-000008-L01'
     OR v_lot.part_type<>'agricapital'
     OR v_lot.surface_ha<>1
     OR v_lot.client_id IS NOT NULL
     OR v_lot.acquisition_id IS NOT NULL
     OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue') THEN
    RAISE EXCEPTION 'Le lot PAR-000008-L01 n’est pas libre ou ne correspond pas au dossier.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lots_hectares
     WHERE parcelle_id=v_parcelle.id
       AND reference IN ('PAR-000008-L02','PAR-000008-L03')
       AND (client_id IS NOT NULL OR lower(coalesce(statut,''))<>'disponible')
  ) THEN
    RAISE EXCEPTION 'Les lots L02 et L03 doivent rester disponibles.';
  END IF;

  SELECT * INTO v_offer
    FROM public.offres
   WHERE id='f3e61a92-abfd-4b01-9b83-0a4ae4c52502'
     AND code='palm-invest'
     AND actif=true;

  IF NOT FOUND
     OR v_offer.famille_offre<>'PALMINVEST'
     OR coalesce(v_offer.necessite_foncier_client,true)
     OR v_offer.montant_pi_par_ha<>90700
     OR v_offer.mensualite_par_ha<>56600
     OR v_offer.montant_total_par_ha<>2467900
     OR v_offer.duree_paiement_mois<>42 THEN
    RAISE EXCEPTION 'La configuration active PalmInvest ne correspond plus aux paramètres confirmés.';
  END IF;

  SELECT item.value INTO v_formula
    FROM jsonb_array_elements(coalesce(v_offer.formules_configuration,'[]'::jsonb)) item(value)
   WHERE item.value->>'code'='PALMINVEST_AUTONOME'
   LIMIT 1;

  IF v_formula IS NULL OR v_formula->>'nom'<>'Autonome' THEN
    RAISE EXCEPTION 'La formule PalmInvest Autonome est absente du catalogue.';
  END IF;

  v_echeancier:=coalesce(v_formula->'tranches_paiement',v_offer.tranches_paiement);
  IF jsonb_typeof(v_echeancier)<>'array' OR v_echeancier='[]'::jsonb THEN
    RAISE EXCEPTION 'L’échéancier de la formule PalmInvest Autonome est absent.';
  END IF;

  SELECT * INTO v_larissa
    FROM public.profiles
   WHERE id='d62ea61f-c230-4a0b-8720-4cf5dff3eb39'
     AND actif=true;

  IF NOT FOUND OR v_larissa.user_id IS NULL THEN
    RAISE EXCEPTION 'Le profil commercial de Larissa est absent ou inactif.';
  END IF;

  SELECT * INTO v_jean_marie
    FROM public.profiles
   WHERE id='50b7a48e-59a5-46d8-9980-9aad88c6c3a5'
     AND actif=true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Le profil technique de Jean-Marie est absent ou inactif.';
  END IF;

  SELECT montant INTO v_tech_amount
    FROM public.grille_remuneration
   WHERE code_regle='TECHNIQUE_MISE_EN_TERRE'
     AND actif
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_tech_amount IS DISTINCT FROM 5000::numeric THEN
    RAISE EXCEPTION 'Le tarif actif de la commission technique n’est pas de 5 000 FCFA.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
     WHERE regexp_replace(coalesce(telephone,''),'[^0-9]','','g')='2250749730865'
  ) THEN
    RAISE EXCEPTION 'Un client existe déjà avec le téléphone de LOUKOU Paulin.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
     WHERE proprietaire_id='42a884da-f5b8-43d3-954c-95ff09b7d3a9'
       AND type_client='beneficiaire_particulier'
       AND parcelle_id=v_parcelle.id
       AND coalesce((metadata->>'beneficiaire_foncier_owner')::boolean,false)
  ) THEN
    RAISE EXCEPTION 'Le profil bénéficiaire particulier du propriétaire existe déjà sur cette parcelle.';
  END IF;

  -- Le propriétaire foncier reste dans proprietaires_terres.
  -- Son unique profil CRM est requalifié en bénéficiaire particulier (1 ha), sans offre ni dette.
  -- La superficie foncière totale de 6 ha reste conservée dans la parcelle et les métadonnées.
  v_owner_beneficiary_id:=v_owner_record.id;

  UPDATE public.clients
     SET type_client='beneficiaire_particulier',
         type_client_foncier='EXT',
         parcours_code='beneficiaire_particulier',
         proprietaire_id='42a884da-f5b8-43d3-954c-95ff09b7d3a9',
         parcelle_id=v_parcelle.id,
         total_hectares=1,
         superficie_ha=1,
         nombre_plantations=0,
         offre_id=NULL,
         offre_code=NULL,
         offre_nom=NULL,
         famille_offre=NULL,
         formule_code=NULL,
         formule_nom=NULL,
         gestion_type=NULL,
         mode_paiement='echeancier',
         montant_total_contrat=0,
         montant_total_par_ha=0,
         paiement_initial_montant=0,
         montant_pi_total=0,
         montant_pi_par_ha=0,
         mensualite_montant=0,
         mensualite_par_ha=0,
         duree_paiement_mois=NULL,
         montant_promo_applique=0,
         taux_journalier_ha=0,
         jours_contrat_total=0,
         commercial_id=NULL,
         compte_actif=true,
         statut='actif',
         statut_global='actif',
         validation_statut='valide',
         phase_actuelle='plantation',
         contrat_acquisition_statut='non_requis',
         contrat_accompagnement_statut='non_requis',
         localite=v_parcelle.village,
         offre_snapshot='{}'::jsonb,
         paiement_personnalise='{}'::jsonb,
         metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
           'beneficiaire_foncier_owner',true,
           'source_migration','20261119153000_reconcile_shared_parcel_beneficiary_and_register_loukou_paulin',
           'parcelle_id',v_parcelle.id,
           'surface_fonciere_totale_ha',6,
           'surface_part_agricapital_ha',3,
           'surface_part_proprietaire_ha',3,
           'surface_beneficiaire_ha',1,
           'hors_offre_commerciale',true,
           'sans_echeancier_financier',true
         ),
         updated_at=now()
   WHERE id=v_owner_record.id;

  -- Création du client PalmInvest sans offre à l'INSERT afin de ne pas déclencher
  -- une acquisition incomplète. L'offre et la formule sont liées juste après.
  PERFORM set_config('app.internal_account_link','true',true);

  INSERT INTO public.clients(
    nom,prenoms,nom_complet,civilite,telephone,whatsapp,email,type_personne,
    type_client,type_client_foncier,parcours_code,
    proprietaire_id,parcelle_id,lot_id,
    total_hectares,superficie_ha,nombre_plantations,
    offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,gestion_type,
    mode_paiement,montant_total_contrat,montant_total_par_ha,
    paiement_initial_montant,montant_pi_total,montant_pi_par_ha,
    mensualite_montant,mensualite_par_ha,duree_paiement_mois,
    montant_promo_applique,taux_journalier_ha,jours_contrat_total,
    compte_actif,statut,statut_global,validation_statut,phase_actuelle,
    contrat_debut_at,paiement_initial_paye_at,pi_paye_at,
    contrat_acquisition_statut,contrat_accompagnement_statut,
    region_id,district_id,departement_id,sous_prefecture_id,village_id,localite,
    commercial_id,created_by,paiement_personnalise,metadata
  )
  VALUES(
    v_prospect.nom,v_prospect.prenoms,v_prospect.nom_complet,v_prospect.civilite,
    v_prospect.telephone,v_prospect.whatsapp,v_prospect.email,
    coalesce(v_prospect.type_personne,'personne_physique'),
    'client','EXT','PALMINVEST',
    '42a884da-f5b8-43d3-954c-95ff09b7d3a9',v_parcelle.id,v_lot.id,
    1,1,0,
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    'echeancier',2467900,2467900,
    90700,90700,90700,
    56600,56600,42,
    0,round(56600::numeric/30,6),1260,
    true,'actif','actif','valide','pre_activation',
    '2026-10-31','2026-11-01','2026-11-01',
    'a_preparer','a_preparer',
    v_prospect.region_id,v_prospect.district_id,v_prospect.departement_id,
    v_prospect.sous_prefecture_id,v_prospect.village_id,v_prospect.localite,
    v_larissa.user_id,v_prospect.created_by,'{}'::jsonb,
    jsonb_build_object(
      'source_migration','20261119153000_reconcile_shared_parcel_beneficiary_and_register_loukou_paulin',
      'parcelle_id',v_parcelle.id,
      'lot_id',v_lot.id,
      'proprietaire_id','42a884da-f5b8-43d3-954c-95ff09b7d3a9',
      'mise_en_terre_date','2026-11-03'
    )
  )
  RETURNING id INTO v_client_id;

  UPDATE public.clients
     SET offre_id=v_offer.id,
         formule_code='PALMINVEST_AUTONOME'
   WHERE id=v_client_id;

  -- Le lien prospect/lead est conservé : une seule identité commerciale pour Paulin.
  UPDATE public.prospects
     SET client_id=v_client_id,
         proprietaire_id='42a884da-f5b8-43d3-954c-95ff09b7d3a9',
         superficie_souhaitee_ha=1,
         statut='converti',
         converted_client_at=now(),
         updated_at=now()
   WHERE id=v_prospect.id;

  UPDATE public.leads
     SET client_id=v_client_id,
         proprietaire_id='42a884da-f5b8-43d3-954c-95ff09b7d3a9',
         superficie_souhaitee_ha=1,
         statut='converti',
         etape_pipeline='converti',
         converti_at=now(),
         updated_at=now()
   WHERE id=v_lead.id;

  v_pending_foncier := NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
     WHERE cf.id=v_lot.convention_id
       AND cf.parcelle_id=v_parcelle.id
       AND cf.proprietaire_id='42a884da-f5b8-43d3-954c-95ff09b7d3a9'
       AND cf.statut='active'
  );

  INSERT INTO public.acquisitions(
    client_id,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,gestion_type,
    necessite_foncier_client,superficie_ha,parcelle_id,lot_id,mode_paiement,
    montant_pi_par_ha,montant_pi_total,montant_total_par_ha,montant_total_contrat,
    mensualite_par_ha,mensualite_montant,duree_paiement_mois,echeancier,
    promotion_id,montant_promo_applique,statut,statut_technique,notes,metadata,
    created_by,validation_statut,validation_commentaire
  )
  VALUES(
    v_client_id,v_offer.id,v_offer.code,v_offer.nom,v_offer.famille_offre,
    'PALMINVEST_AUTONOME',v_formula->>'nom',coalesce(v_formula->>'gestion_type',v_offer.gestion_type),
    false,1,v_parcelle.id,v_lot.id,'echeancier',
    90700,90700,2467900,2467900,
    56600,56600,42,v_echeancier,
    NULL,0,'souscrite','en_attente_intervention',
    CASE WHEN v_pending_foncier
      THEN 'PalmInvest Autonome — lot PAR-000008-L01 affecté. Convention foncière active à rattacher par la direction avant validation foncière finale.'
      ELSE 'PalmInvest Autonome — lot PAR-000008-L01 affecté sur convention foncière active.'
    END,
    jsonb_build_object(
      'source','migration_20261119153000',
      'foncier_convention_en_attente',v_pending_foncier,
      'lot_cible_id',v_lot.id,
      'parcelle_id',v_parcelle.id,
      'owner_beneficiary_client_id',v_owner_beneficiary_id
    ),
    v_prospect.created_by,'a_valider',
    CASE WHEN v_pending_foncier
      THEN 'Convention foncière de Zongo Boukary à rattacher par la direction.'
      ELSE NULL
    END
  )
  RETURNING id INTO v_acquisition_id;

  -- Attribution du lot AgriCapital L01 à Paulin; L02 et L03 restent disponibles.
  UPDATE public.lots_hectares
     SET client_id=v_client_id,
         acquisition_id=v_acquisition_id,
         date_attribution='2026-11-01',
         surface_attribuee_ha=1,
         surface_disponible_ha=0,
         notes=concat_ws(E'\n',nullif(notes,''),'Lot affecté à LOUKOU Paulin — PalmInvest Autonome, 1 ha.')
   WHERE id=v_lot.id;

  UPDATE public.acquisition_lots
     SET acquisition_id=v_acquisition_id,
         date_attribution='2026-11-01',
         surface_ha=1,
         notes='Attribution PalmInvest LOUKOU Paulin — lot PAR-000008-L01.'
   WHERE client_id=v_client_id
     AND lot_id=v_lot.id;

  IF NOT FOUND THEN
    INSERT INTO public.acquisition_lots(
      client_id,lot_id,date_attribution,surface_ha,notes,acquisition_id
    )
    VALUES(
      v_client_id,v_lot.id,'2026-11-01',1,
      'Attribution PalmInvest LOUKOU Paulin — lot PAR-000008-L01.',
      v_acquisition_id
    );
  END IF;

  UPDATE public.parcelles
     SET surface_attribuee_ha=1,
         surface_disponible_ha=2,
         plantation_date_activation='2026-11-03',
         statut='active',
         updated_at=now()
   WHERE id=v_parcelle.id;

  -- Paiement initial réel : mode et référence laissés vides car non communiqués.
  INSERT INTO public.paiements(
    client_id,acquisition_id,plantation_id,montant,montant_paye,montant_theorique,
    type_paiement,mode_paiement,statut,reference,date_paiement,date_validation,
    est_paiement_initial,parcours,notes,created_by,annee
  )
  VALUES(
    v_client_id,v_acquisition_id,NULL,90700,90700,90700,
    'PI',NULL,'valide',NULL,'2026-11-01'::date::timestamptz,NULL,
    true,'PALMINVEST',
    'Paiement initial de 90 700 FCFA reçu le 01/11/2026. Mode de paiement et référence non communiqués.',
    v_prospect.created_by,2026
  )
  RETURNING id INTO v_payment_id;

  -- Le trigger de paiement active le lot et crée les deux parts d'activation.
  -- La fonction de synchronisation crée la plantation de Boukary comme bénéficiaire particulier.
  SELECT p.id INTO v_owner_plantation_id
    FROM public.plantations p
   WHERE p.parcelle_id=v_parcelle.id
     AND p.client_id=v_owner_beneficiary_id
     AND p.role_attribution='beneficiaire_particulier'
     AND coalesce(p.statut,'')<>'annule'
   ORDER BY p.created_at
   LIMIT 1;

  IF v_owner_plantation_id IS NULL THEN
    RAISE EXCEPTION 'La plantation bénéficiaire particulier de Zongo Boukary n’a pas été créée par l’activation partagée.';
  END IF;

  INSERT INTO public.interventions_techniques(
    client_id,plantation_id,agent_technique_id,type_intervention,date_intervention,
    observations,statut,parcelle_id,nombre_plants_prevus,nombre_plants_realises,
    densite_plants,convention_id,lot_id,contenu_client,acquisition_id
  )
  VALUES(
    v_client_id,NULL,NULL,'mise_en_terre','2026-11-03',
    'Mise en terre déclarée réalisée le 03/11/2026 sur 1 ha, parcelle PAR-000008, lot PAR-000008-L01. Les dates réelles des étapes préparatoires ne sont pas renseignées.',
    'realisee',v_parcelle.id,143,143,143,NULL,v_lot.id,
    'Mise en terre réalisée le 03/11/2026 sur 1 ha.',
    v_acquisition_id
  )
  RETURNING id INTO v_intervention_id;

  SELECT p.id INTO v_plantation_id
    FROM public.plantations p
   WHERE p.acquisition_id=v_acquisition_id
     AND p.client_id=v_client_id
   ORDER BY p.created_at DESC
   LIMIT 1;

  IF v_plantation_id IS NULL THEN
    RAISE EXCEPTION 'La plantation de LOUKOU Paulin n’a pas été créée par le workflow technique.';
  END IF;

  UPDATE public.interventions_techniques
     SET plantation_id=v_plantation_id
   WHERE id=v_intervention_id;

  UPDATE public.paiements
     SET plantation_id=v_plantation_id
   WHERE id=v_payment_id;

  -- Rattachement de la part bénéficiaire du propriétaire, sans offre ni flux financier.
  INSERT INTO public.beneficiaire_attributions(
    client_id,parcelle_id,plantation_id,surface_attribuee_ha,
    role_attribution,statut,notes
  )
  SELECT
    v_owner_beneficiary_id,v_parcelle.id,v_owner_plantation_id,1,
    'proprietaire_beneficiaire','active',
    'Quote-part propriétaire-bénéficiaire de 1 ha sur la parcelle partagée de Zongo Boukary. Hors offre commerciale et hors échéancier financier.'
  WHERE NOT EXISTS(
    SELECT 1 FROM public.beneficiaire_attributions ba
     WHERE ba.client_id=v_owner_beneficiary_id
       AND ba.parcelle_id=v_parcelle.id
       AND ba.plantation_id=v_owner_plantation_id
       AND ba.statut='active'
  );

  UPDATE public.clients
     SET nombre_plantations=1,
         phase_actuelle='plantation',
         parcelle_id=v_parcelle.id,
         total_hectares=1,
         superficie_ha=1,
         updated_at=now()
   WHERE id=v_owner_beneficiary_id;

  UPDATE public.clients
     SET nombre_plantations=1,
         phase_actuelle='plantation',
         parcelle_id=v_parcelle.id,
         lot_id=v_lot.id,
         updated_at=now()
   WHERE id=v_client_id;

  -- Les deux commissions techniques de 5 000 FCFA ont été réglées le 14/11/2026.
  INSERT INTO public.commissions(
    profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,
    montant_commission,periode,date_calcul,statut,date_validation,intervention_id,
    taux_applique,annee_contrat
  )
  VALUES(
    v_jean_marie.id,v_plantation_id,v_client_id,'technique',5000,0,
    5000,'2026-11-03',now(),'payee','2026-11-14'::date::timestamptz,
    v_intervention_id,0,2026
  )
  ON CONFLICT (intervention_id,plantation_id,type_commission)
    WHERE intervention_id IS NOT NULL AND plantation_id IS NOT NULL AND type_commission='technique'
  DO UPDATE SET
    profile_id=excluded.profile_id,
    client_id=excluded.client_id,
    montant_base=excluded.montant_base,
    montant_commission=excluded.montant_commission,
    statut='payee',
    date_validation=excluded.date_validation,
    periode=excluded.periode;

  INSERT INTO public.commissions(
    profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,
    montant_commission,periode,date_calcul,statut,date_validation,intervention_id,
    taux_applique,annee_contrat
  )
  VALUES(
    v_jean_marie.id,v_owner_plantation_id,v_owner_beneficiary_id,'technique',5000,0,
    5000,'2026-11-03',now(),'payee','2026-11-14'::date::timestamptz,
    v_intervention_id,0,2026
  )
  ON CONFLICT (intervention_id,plantation_id,type_commission)
    WHERE intervention_id IS NOT NULL AND plantation_id IS NOT NULL AND type_commission='technique'
  DO UPDATE SET
    profile_id=excluded.profile_id,
    client_id=excluded.client_id,
    montant_base=excluded.montant_base,
    montant_commission=excluded.montant_commission,
    statut='payee',
    date_validation=excluded.date_validation,
    periode=excluded.periode;

  -- Réconciliation du portefeuille Jean-Marie : +10 000 FCFA réglés, solde antérieur de 9 000 FCFA conservé.
  UPDATE public.portefeuille_versements
     SET montant_brut=45000,
         montant_paye=36000,
         periode_fin='2026-11-14',
         statut='partiellement_paye',
         notes=replace(
           replace(
             notes,
             '7 prestations techniques à 5 000 FCFA = 35 000 FCFA',
             '9 prestations techniques à 5 000 FCFA = 45 000 FCFA'
           ),
           'Total déjà réglé : 26 000 FCFA',
           'Total déjà réglé : 36 000 FCFA'
         ) || E'\nDeux commissions techniques supplémentaires de 5 000 FCFA chacune ont été réglées le 14/11/2026 : plantation de LOUKOU Paulin et plantation bénéficiaire particulier de Zongo Boukary. Total réglé porté à 36 000 FCFA; solde restant 9 000 FCFA.',
         updated_at=now()
   WHERE id='e0124f21-df2d-4c56-985c-1cfc9da1c671'
     AND profile_id=v_jean_marie.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Le récapitulatif de commissions Jean-Marie est absent; impossible de réconcilier le solde.';
  END IF;

  PERFORM public.recalculer_portefeuilles_commissions();

  -- Contrôles bloquants avant validation de la migration.
  SELECT count(*) INTO v_existing_count
    FROM public.plantation_activations
   WHERE lot_id=v_lot.id
     AND client_id=v_client_id
     AND statut='active'
     AND surface_client_ha=1
     AND surface_proprietaire_ha=1;

  IF v_existing_count<>1 THEN
    RAISE EXCEPTION 'L’activation partagée 1 ha + 1 ha n’est pas correctement enregistrée.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.plantations
     WHERE id=v_plantation_id AND client_id=v_client_id
       AND parcelle_id=v_parcelle.id AND lot_id=v_lot.id
       AND superficie_ha=1 AND date_plantation='2026-11-03'
       AND statut IN ('actif','active')
  ) THEN
    RAISE EXCEPTION 'La plantation de Paulin n’est pas correctement rattachée.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.plantations
     WHERE id=v_owner_plantation_id AND client_id=v_owner_beneficiary_id
       AND parcelle_id=v_parcelle.id
       AND role_attribution='beneficiaire_particulier'
       AND superficie_ha=1 AND date_plantation='2026-11-03'
       AND statut IN ('actif','active')
  ) THEN
    RAISE EXCEPTION 'La plantation de 1 ha de Zongo Boukary comme bénéficiaire particulier est incorrecte.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.acquisitions
     WHERE client_id=v_owner_beneficiary_id
  ) OR EXISTS (
    SELECT 1 FROM public.paiements
     WHERE client_id=v_owner_beneficiary_id
  ) OR EXISTS (
    SELECT 1 FROM public.clients
     WHERE id=v_owner_beneficiary_id
       AND (offre_id IS NOT NULL OR offre_code IS NOT NULL OR formule_code IS NOT NULL
            OR coalesce(montant_total_contrat,0)<>0
            OR coalesce(paiement_initial_montant,0)<>0
            OR coalesce(montant_pi_total,0)<>0
            OR coalesce(mensualite_montant,0)<>0)
  ) THEN
    RAISE EXCEPTION 'Le bénéficiaire particulier Zongo Boukary ne doit porter aucune offre ni donnée financière.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lots_hectares
     WHERE id=v_lot.id AND client_id=v_client_id
       AND acquisition_id=v_acquisition_id
       AND statut='attribue'
       AND surface_attribuee_ha=1
       AND surface_disponible_ha=0
  ) THEN
    RAISE EXCEPTION 'Le lot L01 n’est pas affecté correctement à Paulin.';
  END IF;

  IF (SELECT count(*) FROM public.commissions
       WHERE intervention_id=v_intervention_id
         AND profile_id=v_jean_marie.id
         AND type_commission='technique'
         AND statut='payee'
         AND montant_commission=5000)<>2 THEN
    RAISE EXCEPTION 'Les deux commissions techniques réglées ne sont pas enregistrées.';
  END IF;

  IF (SELECT count(*) FROM public.paiements
       WHERE id=v_payment_id AND client_id=v_client_id
         AND acquisition_id=v_acquisition_id
         AND montant=90700 AND montant_paye=90700
         AND date_paiement::date='2026-11-01'
         AND statut='valide' AND est_paiement_initial)<>1 THEN
    RAISE EXCEPTION 'Le paiement initial de Paulin n’est pas correctement enregistré.';
  END IF;

  IF (SELECT count(*) FROM public.finance_transactions
       WHERE source_type='paiement' AND source_id=v_payment_id
         AND amount=90700 AND status='valide')<>1 THEN
    RAISE EXCEPTION 'L’écriture d’encaissement du paiement initial est absente.';
  END IF;

  IF (SELECT count(*) FROM public.finance_transactions
       WHERE source_type='commission'
         AND source_id IN (
           SELECT id FROM public.commissions WHERE intervention_id=v_intervention_id
         )
         AND amount=5000 AND status='valide')<>2 THEN
    RAISE EXCEPTION 'Les deux écritures financières de commissions ne sont pas créées.';
  END IF;

  IF v_pending_foncier THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.acquisitions
       WHERE id=v_acquisition_id
         AND lot_id=v_lot.id
         AND statut='souscrite'
         AND validation_statut='a_valider'
         AND coalesce((metadata->>'foncier_convention_en_attente')::boolean,false)
    ) THEN
      RAISE EXCEPTION 'L’acquisition doit rester souscrite et à valider jusqu’au rattachement de la convention.';
    END IF;
  END IF;

  IF (SELECT montant_brut FROM public.portefeuille_versements
       WHERE id='e0124f21-df2d-4c56-985c-1cfc9da1c671')<>45000
     OR (SELECT montant_paye FROM public.portefeuille_versements
       WHERE id='e0124f21-df2d-4c56-985c-1cfc9da1c671')<>36000 THEN
    RAISE EXCEPTION 'Le récapitulatif des commissions Jean-Marie n’est pas réconcilié.';
  END IF;
END;
$migration$;
