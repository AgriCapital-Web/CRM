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
  v_owner_plantation_found boolean := false;
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
     AND c.type_client='beneficiaire_particulier'
   ORDER BY CASE WHEN c.parcelle_id=p_parcelle_id THEN 0 ELSE 1 END,c.created_at
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

  -- Le profil bénéficiaire propriétaire porte la surface individuelle attribuée;
  -- il permet de maintenir la plantation même si une ancienne activation manque.
  IF v_owner_client_id IS NOT NULL THEN
    v_surface:=greatest(v_surface,coalesce(v_owner_client.total_hectares,0));
  END IF;

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

    v_owner_plantation_found:=FOUND;
    PERFORM set_config('app.internal_plantation_write','sync_owner_plantation_for_shared_parcel',true);

    IF NOT v_owner_plantation_found THEN
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
      v_owner_plantation_id:=v_owner_plantation.id;
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
      v_owner_plantation_id:=coalesce(v_owner_plantation_id,v_owner_plantation.id);
    END IF;

    IF v_owner_plantation_id IS NULL THEN
      SELECT id INTO v_owner_plantation_id
        FROM public.plantations
       WHERE parcelle_id=p_parcelle_id
         AND client_id=v_owner_client_id
         AND role_attribution='beneficiaire_particulier'
         AND statut='active'
       ORDER BY created_at DESC
       LIMIT 1;
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

DO $$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT offre_snapshot INTO v_snapshot
    FROM public.acquisitions
   WHERE id='39be445f-e724-45fa-9770-d779c5dda280'
     AND client_id='bd329d85-a259-477b-a98e-7058cd982d7f';

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Le snapshot de l’acquisition PalmInvest de Paulin est absent.';
  END IF;

  UPDATE public.clients
     SET offre_code='palm-invest',
         offre_nom='PalmInvest',
         famille_offre='PALMINVEST',
         formule_code='PALMINVEST_AUTONOME',
         formule_nom='Autonome',
         gestion_type='autonome',
         offre_snapshot=v_snapshot,
         updated_at=now()
   WHERE id='bd329d85-a259-477b-a98e-7058cd982d7f'
     AND offre_id='f3e61a92-abfd-4b01-9b83-0a4ae4c52502';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La fiche client PalmInvest de Paulin n’a pas été mise à jour.';
  END IF;

  UPDATE public.portefeuille_versements
     SET notes=replace(
       notes,
       'Total déjà réglé : 36 000 FCFA, composé de quatre règlements',
       'Total déjà réglé avant les commissions du 14/11 : 26 000 FCFA, composé de quatre règlements'
     ),
     updated_at=now()
   WHERE id='e0124f21-df2d-4c56-985c-1cfc9da1c671';

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
     WHERE id='bd329d85-a259-477b-a98e-7058cd982d7f'
       AND offre_code='palm-invest'
       AND offre_nom='PalmInvest'
       AND formule_code='PALMINVEST_AUTONOME'
       AND formule_nom='Autonome'
       AND gestion_type='autonome'
  ) THEN
    RAISE EXCEPTION 'Les informations de l’offre PalmInvest ne sont pas visibles sur la fiche client.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.portefeuille_versements
     WHERE id='e0124f21-df2d-4c56-985c-1cfc9da1c671'
       AND montant_brut=45000
       AND montant_paye=36000
       AND notes LIKE '%Total déjà réglé avant les commissions du 14/11 : 26 000 FCFA%'
       AND notes LIKE '%Total réglé porté à 36 000 FCFA%'
  ) THEN
    RAISE EXCEPTION 'Le détail du récapitulatif de commissions Jean-Marie reste incohérent.';
  END IF;
END $$;
