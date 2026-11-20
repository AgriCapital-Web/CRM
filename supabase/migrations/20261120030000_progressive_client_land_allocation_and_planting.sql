
ALTER TABLE public.interventions_techniques
  ADD COLUMN IF NOT EXISTS surface_reellement_plantee_ha numeric(10,2);

COMMENT ON COLUMN public.interventions_techniques.surface_reellement_plantee_ha IS
  'Surface effectivement mise en terre lors de cette intervention; si absente, elle est calculee a partir des plants realises et de la densite.';
COMMENT ON COLUMN public.acquisitions.superficie_ha IS
  'Superficie contractuelle totale du client; independante des hectares attribues et effectivement plantes.';
COMMENT ON COLUMN public.plantations.surface_reellement_plantee IS
  'Surface effectivement plantee sur cette parcelle/ce lot, cumulee depuis les interventions realisees.';

CREATE OR REPLACE FUNCTION public.sync_client_contract_terms_to_acquisition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_surface numeric;
  v_allocated numeric := 0;
  v_available numeric;
  v_pi numeric;
  v_total numeric;
  v_monthly numeric;
  v_family text;
  v_metadata jsonb;
  v_snapshot jsonb;
BEGIN
  IF OLD.total_hectares IS NOT DISTINCT FROM NEW.total_hectares
     AND OLD.superficie_ha IS NOT DISTINCT FROM NEW.superficie_ha
     AND OLD.paiement_initial_montant IS NOT DISTINCT FROM NEW.paiement_initial_montant
     AND OLD.montant_pi_total IS NOT DISTINCT FROM NEW.montant_pi_total
     AND OLD.montant_total_contrat IS NOT DISTINCT FROM NEW.montant_total_contrat
     AND OLD.mensualite_montant IS NOT DISTINCT FROM NEW.mensualite_montant
     AND OLD.offre_snapshot IS NOT DISTINCT FROM NEW.offre_snapshot THEN RETURN NEW; END IF;

  IF lower(coalesce(NEW.type_client,'')) IN ('beneficiaire_particulier','proprietaire_foncier','associe','associe_actionnaire','partenaire') THEN
    RETURN NEW;
  END IF;

  v_surface := COALESCE(NULLIF(NEW.total_hectares,0),NULLIF(NEW.superficie_ha,0));
  IF v_surface IS NULL OR v_surface<=0 THEN RETURN NEW; END IF;

  SELECT a.* INTO v_acquisition
  FROM public.acquisitions a
  WHERE a.client_id=NEW.id
    AND lower(coalesce(a.statut,'')) NOT IN ('annulee','annulé','cancelled','rejected','rejetee')
  ORDER BY a.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(al.surface_ha),0) INTO v_allocated
  FROM public.acquisition_lots al WHERE al.acquisition_id=v_acquisition.id;
  IF v_allocated<=0 AND v_acquisition.lot_id IS NOT NULL THEN
    SELECT COALESCE(lh.surface_attribuee_ha,lh.surface_ha,0) INTO v_allocated
    FROM public.lots_hectares lh WHERE lh.id=v_acquisition.lot_id;
  END IF;

  v_pi := COALESCE(NEW.montant_pi_total,NEW.paiement_initial_montant,v_acquisition.montant_pi_total,0);
  v_total := COALESCE(NEW.montant_total_contrat,v_acquisition.montant_total_contrat,0);
  v_monthly := COALESCE(NEW.mensualite_montant,v_acquisition.mensualite_montant,0);
  v_family := upper(coalesce(v_acquisition.famille_offre,'') || ' ' || coalesce(v_acquisition.offre_code,''));
  v_metadata := COALESCE(v_acquisition.metadata,'{}'::jsonb) || jsonb_build_object('surface_contractuelle_ha',v_surface);

  IF v_allocated>0 AND v_allocated+0.000001<v_surface THEN
    IF v_family LIKE '%PALMINVEST%'
       AND (coalesce((v_metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
         OR coalesce((NEW.metadata->>'deferred_land_allocation')::boolean,false)
         OR v_metadata->>'foncier_convention_en_attente'='true') THEN
      v_metadata := v_metadata || jsonb_build_object(
        'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
        'surface_fonciere_allouee_ha',v_allocated,'surface_fonciere_restante_ha',v_surface-v_allocated
      );
    ELSE
      RAISE EXCEPTION 'La surface contractuelle (%) depasse la surface fonciere attribuee (%). Completez l''attribution fonciere avant modification.',v_surface,v_allocated;
    END IF;
  ELSIF v_allocated>0 THEN
    v_metadata := v_metadata || jsonb_build_object(
      'surface_fonciere_allouee_ha',v_allocated,
      'surface_fonciere_restante_ha',greatest(v_surface-v_allocated,0)
    );
    IF v_surface<=v_allocated+0.000001 THEN v_metadata := v_metadata - 'foncier_a_attribuer_plus_tard'; END IF;
  ELSIF coalesce((NEW.metadata->>'deferred_land_allocation')::boolean,false) THEN
    v_metadata := v_metadata || jsonb_build_object(
      'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
      'surface_fonciere_allouee_ha',0,'surface_fonciere_restante_ha',v_surface
    );
  END IF;

  IF v_acquisition.parcelle_id IS NOT NULL THEN
    SELECT p.surface_disponible_ha INTO v_available FROM public.parcelles p WHERE p.id=v_acquisition.parcelle_id;
    IF v_available IS NOT NULL THEN v_metadata := v_metadata || jsonb_build_object('surface_disponible_parcelle_ha',v_available); END IF;
  END IF;

  v_snapshot := COALESCE(v_acquisition.offre_snapshot,'{}'::jsonb);
  v_snapshot := jsonb_set(v_snapshot,'{contract,superficie_ha}',to_jsonb(v_surface),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,montant_pi_total}',to_jsonb(v_pi),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,paiement_initial_montant}',to_jsonb(v_pi),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,montant_total_contrat}',to_jsonb(v_total),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,mensualite_montant}',to_jsonb(v_monthly),true);
  v_snapshot := jsonb_set(v_snapshot,'{snapshot_at}',to_jsonb(now()::text),true);

  UPDATE public.acquisitions AS acq
  SET superficie_ha = v_surface,
      montant_pi_total=v_pi,
      montant_total_contrat=v_total,
      mensualite_montant=v_monthly,
      offre_snapshot=v_snapshot,
      metadata=v_metadata,
      updated_at=now()
  WHERE acq.id=v_acquisition.id;
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
  v_surface_intervention numeric := 0;
  v_surface_allouee numeric := 0;
  v_surface_plantee_totale numeric := 0;
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

    v_surface:=NULL;
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

  IF NEW.acquisition_id IS NOT NULL THEN
    v_density:=coalesce(nullif(NEW.densite_plants,0),nullif(v_parcelle.plantation_densite_plants,0),143);
    v_surface_intervention:=coalesce(nullif(NEW.surface_reellement_plantee_ha,0),
      CASE WHEN coalesce(NEW.nombre_plants_realises,0)>0 THEN NEW.nombre_plants_realises::numeric/nullif(v_density,0) END,0);
    IF v_surface_intervention<=0 THEN
      RAISE EXCEPTION 'Renseignez la surface réellement plantée ou le nombre de plants effectivement mis en terre.';
    END IF;
    IF v_lot_id IS NULL THEN
      RAISE EXCEPTION 'Chaque mise en terre PalmInvest doit être rattachée à un lot précis.';
    END IF;
    SELECT coalesce(sum(al.surface_ha),0) INTO v_surface_allouee
      FROM public.acquisition_lots al
     WHERE al.acquisition_id=NEW.acquisition_id AND al.client_id=NEW.client_id AND al.lot_id=v_lot_id;
    IF v_surface_allouee<=0 AND v_sub.lot_id=v_lot_id AND v_sub.parcelle_id=v_parcelle_id THEN
      SELECT coalesce(lh.surface_attribuee_ha,lh.surface_ha,0) INTO v_surface_allouee
        FROM public.lots_hectares lh
       WHERE lh.id=v_lot_id AND lh.client_id=NEW.client_id AND lh.acquisition_id=NEW.acquisition_id;
    END IF;
    IF v_surface_allouee<=0 THEN
      RAISE EXCEPTION 'Le lot choisi doit être affecté à cette acquisition avant la mise en terre.';
    END IF;
    SELECT coalesce(sum(coalesce(nullif(it.surface_reellement_plantee_ha,0),
      CASE WHEN coalesce(it.nombre_plants_realises,0)>0
        THEN it.nombre_plants_realises::numeric/nullif(coalesce(nullif(it.densite_plants,0),v_density),0) END,0)),0)
      INTO v_surface
      FROM public.interventions_techniques it
     WHERE it.acquisition_id=NEW.acquisition_id AND it.client_id=NEW.client_id
       AND it.parcelle_id=v_parcelle_id AND it.lot_id=v_lot_id
       AND it.type_intervention='mise_en_terre' AND it.statut='realisee';
    IF v_surface<=0 THEN v_surface:=v_surface_intervention; END IF;
    IF v_surface>v_surface_allouee+0.000001 THEN
      RAISE EXCEPTION 'La surface plantée cumulée (%) dépasse la quote-part foncière affectée (%) sur ce lot.',v_surface,v_surface_allouee;
    END IF;
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
     WHERE p.acquisition_id=NEW.acquisition_id AND p.parcelle_id=v_parcelle.id AND p.lot_id=v_lot_id
     ORDER BY p.created_at DESC LIMIT 1;
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
      lot_id,acquisition_id,surface_reellement_plantee
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
      v_actor,v_actor,v_lot_id,NEW.acquisition_id,v_surface
    )
    RETURNING id INTO v_existing;
  ELSE
    UPDATE public.plantations
       SET date_plantation=coalesce(date_plantation,v_date),
           date_activation=CASE WHEN v_active THEN coalesce(date_activation,v_date) ELSE NULL END,
           superficie_ha=CASE WHEN NEW.acquisition_id IS NOT NULL THEN v_surface ELSE superficie_ha END,
           surface_reellement_plantee=CASE WHEN NEW.acquisition_id IS NOT NULL THEN v_surface ELSE surface_reellement_plantee END,
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
    SELECT coalesce(sum(coalesce(p.surface_reellement_plantee,p.superficie_ha,0)),0)
      INTO v_surface_plantee_totale
      FROM public.plantations p WHERE p.acquisition_id=NEW.acquisition_id AND p.client_id=NEW.client_id;
    UPDATE public.acquisitions
       SET parcelle_id=coalesce(parcelle_id,v_parcelle.id),
           statut_technique=CASE WHEN v_surface_plantee_totale+0.000001>=v_sub.superficie_ha
             THEN 'mise_en_terre_realisee' ELSE 'mise_en_terre_partielle' END,
           statut=CASE
             WHEN v_foncier_pending
              AND NOT (
                coalesce((v_sub.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
                OR coalesce((v_sub.metadata->>'validation_pdg_sans_convention_active')::boolean,false)
              ) THEN 'souscrite'
             WHEN v_active THEN 'active'
             ELSE 'en_attente_paiement'
           END,
           validation_statut=CASE
             WHEN v_foncier_pending
              AND NOT (
                coalesce((v_sub.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
                OR coalesce((v_sub.metadata->>'validation_pdg_sans_convention_active')::boolean,false)
              ) THEN 'a_valider'
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

  IF NEW.acquisition_id IS NOT NULL AND v_existing IS NOT NULL THEN
    UPDATE public.interventions_techniques SET plantation_id=v_existing
     WHERE id=NEW.id AND plantation_id IS DISTINCT FROM v_existing;
  END IF;
  RETURN NEW;
END;
$function$;
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
  v_acquisition public.acquisitions%rowtype;
  v_pending_foncier boolean := false;
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

  SELECT * INTO v_client FROM public.clients WHERE id=NEW.client_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT * INTO v_acquisition
      FROM public.acquisitions
     WHERE id=NEW.acquisition_id
       AND client_id=NEW.client_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Souscription PalmInvest introuvable pour la plantation.';
    END IF;

    v_formula:=upper(coalesce(v_acquisition.formule_code,''));
    v_pending_foncier:=coalesce((v_acquisition.metadata->>'foncier_convention_en_attente')::boolean,false);

    IF v_pending_foncier AND NOT (
      (v_acquisition.statut='souscrite' AND v_acquisition.validation_statut='a_valider')
      OR (
        v_acquisition.statut='active' AND v_acquisition.validation_statut='valide'
        AND (
          coalesce((v_acquisition.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
          OR coalesce((v_acquisition.metadata->>'validation_pdg_sans_convention_active')::boolean,false)
        )
      )
    ) THEN
      RAISE EXCEPTION 'Une acquisition foncière en attente doit être soit en validation, soit explicitement autorisée par la direction.';
    END IF;

  ELSE
    v_formula:=upper(coalesce(v_client.formule_code,''));
  END IF;

  IF coalesce(v_formula,'') NOT LIKE 'PALMINVEST%' OR NEW.parcelle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=NEW.parcelle_id;
  IF NOT FOUND OR NOT coalesce(v_parcelle.plantation_partagee_activee,false) THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit être rattachée à une parcelle partagée activée.';
  END IF;
  IF v_parcelle.proprietaire_id IS NULL THEN
    RAISE EXCEPTION 'La parcelle de plantation partagée doit être liée à un propriétaire foncier validé.';
  END IF;

  IF (v_parcelle.convention_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
     WHERE cf.id=v_parcelle.convention_id
       AND cf.parcelle_id=v_parcelle.id
       AND cf.proprietaire_id=v_parcelle.proprietaire_id
       AND cf.statut='active'
  )) AND NOT v_pending_foncier THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit dépendre d’une convention foncière active ou d’une souscription explicitement en attente de convention.';
  END IF;

  -- Une ligne de plantation représente un lot PalmInvest de 1 ha.
  -- La surface plantée sur ce lot peut progresser par fractions.
  IF coalesce(NEW.superficie_ha,0)<=0 OR NEW.superficie_ha>1.000001 THEN
    RAISE EXCEPTION 'La surface plantée sur un lot PalmInvest doit être comprise entre 0 et 1 ha.';
  END IF;
  v_units:=1;
  IF v_units<=0 THEN
    RAISE EXCEPTION 'Superficie PalmInvest invalide pour une activation partagée.';
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT count(*)::integer
      INTO v_available
      FROM public.acquisition_lots al
      JOIN public.lots_hectares lh ON lh.id=al.lot_id
     WHERE al.acquisition_id=NEW.acquisition_id
       AND al.client_id=NEW.client_id
       AND lh.parcelle_id=NEW.parcelle_id
       AND coalesce(lh.part_type,'agricapital')='agricapital'
       AND abs(coalesce(al.surface_ha,lh.surface_ha,0)-1)<0.0001;

    IF v_available<>v_units THEN
      RAISE EXCEPTION 'L’acquisition PalmInvest doit avoir exactement % lot(s) AgriCapital de 1 ha associé(s); % trouvé(s).',v_units,v_available;
    END IF;
  ELSE
    SELECT count(*)::integer INTO v_available
      FROM (
        SELECT lh.id
          FROM public.lots_hectares lh
         WHERE lh.parcelle_id=NEW.parcelle_id
           AND coalesce(lh.part_type,'agricapital')='agricapital'
           AND lh.client_id=NEW.client_id
           AND lh.surface_ha=1
         ORDER BY lh.numero_h
         LIMIT v_units
      ) available_lots;

    IF v_available<>v_units THEN
      RAISE EXCEPTION 'Nombre de lots AgriCapital de 1 ha insuffisant : % requis, % trouvé(s).',v_units,v_available;
    END IF;
  END IF;

  FOR v_lot IN
    SELECT lh.*
      FROM public.lots_hectares lh
     WHERE lh.parcelle_id=NEW.parcelle_id
       AND coalesce(lh.part_type,'agricapital')='agricapital'
       AND (
         (
           NEW.acquisition_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.acquisition_lots al
              WHERE al.lot_id=lh.id
                AND al.acquisition_id=NEW.acquisition_id
                AND al.client_id=NEW.client_id
                AND abs(coalesce(al.surface_ha,lh.surface_ha,0)-1)<0.0001
           )
         )
         OR (
           NEW.acquisition_id IS NULL
           AND lh.client_id=NEW.client_id
           AND lh.surface_ha=1
         )
       )
     ORDER BY lh.numero_h
     LIMIT v_units
     FOR UPDATE OF lh
  LOOP
    v_activation:=NULL;

    SELECT * INTO v_existing
      FROM public.plantation_activations
     WHERE lot_id=v_lot.id
     FOR UPDATE;

    IF FOUND THEN
      IF v_existing.client_id IS DISTINCT FROM NEW.client_id
         OR v_existing.parcelle_id IS DISTINCT FROM NEW.parcelle_id
         OR v_existing.proprietaire_id IS DISTINCT FROM v_parcelle.proprietaire_id THEN
        RAISE EXCEPTION 'Le lot % possède déjà une activation incompatible.',v_lot.reference;
      END IF;
      v_activation:=v_existing.id;
    ELSE
      INSERT INTO public.plantation_activations(
        lot_id,parcelle_id,proprietaire_id,client_id,
        surface_client_ha,surface_proprietaire_ha,
        statut,date_activation,notes,created_by
      )
      VALUES(
        v_lot.id,NEW.parcelle_id,v_parcelle.proprietaire_id,NEW.client_id,
        1,1,'active',coalesce(NEW.date_activation::date,current_date),
        'Activation partagée PalmInvest : 1 ha client et 1 ha bénéficiaire propriétaire, sans offre ni échéancier propriétaire.',
        NEW.created_by
      )
      ON CONFLICT (lot_id) DO NOTHING
      RETURNING id INTO v_activation;

      IF v_activation IS NULL THEN
        SELECT * INTO v_existing
          FROM public.plantation_activations
         WHERE lot_id=v_lot.id
         FOR UPDATE;
        IF v_existing.id IS NULL
           OR v_existing.client_id IS DISTINCT FROM NEW.client_id
           OR v_existing.parcelle_id IS DISTINCT FROM NEW.parcelle_id
           OR v_existing.proprietaire_id IS DISTINCT FROM v_parcelle.proprietaire_id THEN
          RAISE EXCEPTION 'Conflit d’activation sur le lot %; attribution interrompue.',v_lot.reference;
        END IF;
        v_activation:=v_existing.id;
      END IF;
    END IF;

    UPDATE public.lots_hectares
       SET client_id=NEW.client_id,
           acquisition_id=coalesce(NEW.acquisition_id,acquisition_id),
           statut='attribue',
           date_attribution=coalesce(date_attribution,current_date),
           notes=concat_ws(' ',notes,'Activation PalmInvest liée à une parcelle partagée.')
     WHERE id=v_lot.id;

    v_done:=v_done+1;
    IF v_done=1 AND NEW.activation_id IS NULL THEN
      NEW.activation_id:=v_activation;
    END IF;
  END LOOP;

  IF v_done<>v_units THEN
    RAISE EXCEPTION 'Activation PalmInvest incomplète : % lot(s) requis, % traité(s).',v_units,v_done;
  END IF;

  PERFORM public.sync_owner_plantation_for_shared_parcel(
    NEW.parcelle_id,v_parcelle.proprietaire_id,coalesce(NEW.updated_by,NEW.created_by)
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_create_plantation_after_mise_en_terre ON public.interventions_techniques;
CREATE TRIGGER trg_create_plantation_after_mise_en_terre
AFTER INSERT OR UPDATE OF statut,type_intervention,client_id,parcelle_id,lot_id,acquisition_id,
  nombre_plants_realises,densite_plants,surface_reellement_plantee_ha
ON public.interventions_techniques
FOR EACH ROW EXECUTE FUNCTION public.create_plantation_after_mise_en_terre();

UPDATE public.interventions_techniques
SET surface_reellement_plantee_ha=1
WHERE id='f7c7326b-383b-4fbc-8ac4-0ffc7612da66'
  AND type_intervention='mise_en_terre' AND statut='realisee'
  AND surface_reellement_plantee_ha IS NULL
  AND nombre_plants_realises=143 AND densite_plants=143;

UPDATE public.acquisitions a
SET superficie_ha=10,statut_technique='mise_en_terre_partielle',
    offre_snapshot=jsonb_set(coalesce(a.offre_snapshot,'{}'::jsonb),'{contract,superficie_ha}',to_jsonb(10::numeric),true),
    metadata=coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object(
      'surface_contractuelle_ha',10,'surface_fonciere_allouee_ha',1,'surface_fonciere_restante_ha',9,
      'surface_plantee_ha',1,'surface_non_plantee_ha',9,'foncier_a_attribuer_plus_tard',true,
      'technical_intervention_pending',true,
      'land_allocation_note','Contrat client de 10 ha. 1 ha attribue et plante sur PAR-000008-L01; 9 ha restent a attribuer puis planter progressivement. Plusieurs parcelles peuvent etre rattachees a la meme acquisition.'
    ),updated_at=now()
WHERE a.id='39be445f-e724-45fa-9770-d779c5dda280'
  AND a.client_id='bd329d85-a259-477b-a98e-7058cd982d7f';

UPDATE public.clients
SET total_hectares=10,superficie_ha=10,surface_plantee_ha=1,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'surface_contractuelle_ha',10,'surface_fonciere_allouee_ha',1,'surface_fonciere_restante_ha',9,
      'surface_plantee_ha',1,'surface_non_plantee_ha',9,'foncier_a_attribuer_plus_tard',true,
      'technical_intervention_pending',true
    ),updated_at=now()
WHERE id='bd329d85-a259-477b-a98e-7058cd982d7f';

DO $$
DECLARE v_client numeric; v_acquisition numeric; v_planted numeric; v_allocated numeric;
BEGIN
 SELECT total_hectares,surface_plantee_ha INTO v_client,v_planted
 FROM public.clients WHERE id='bd329d85-a259-477b-a98e-7058cd982d7f';
 SELECT a.superficie_ha,coalesce(sum(al.surface_ha),0) INTO v_acquisition,v_allocated
 FROM public.acquisitions a LEFT JOIN public.acquisition_lots al ON al.acquisition_id=a.id
 WHERE a.id='39be445f-e724-45fa-9770-d779c5dda280' GROUP BY a.id;
 IF v_client<>10 OR v_acquisition<>10 OR v_planted<>1 OR v_allocated<>1 THEN
  RAISE EXCEPTION 'Paulin : separation contrat / foncier attribue / surface plantee non confirmee.';
 END IF;
END;
$$;
