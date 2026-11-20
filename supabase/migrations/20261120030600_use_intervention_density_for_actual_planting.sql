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

  v_density:=coalesce(nullif(NEW.densite_plants,0),nullif(v_parcelle.plantation_densite_plants,0),143);
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
