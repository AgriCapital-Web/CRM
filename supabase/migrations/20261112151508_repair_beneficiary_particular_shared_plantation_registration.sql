BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_manual_plantation_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() <= 1
     AND coalesce(current_setting('app.internal_plantation_write', true), '') NOT IN (
       'register_beneficiaire_particulier',
       'sync_owner_plantation_for_shared_parcel'
     ) THEN
    RAISE EXCEPTION 'Une plantation ne peut pas être créée manuellement. Elle est créée automatiquement après validation technique de la mise en terre ou par un parcours foncier autorisé.';
  END IF;
  RETURN NEW;
END
$function$;

DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.sync_owner_plantation_for_shared_parcel(uuid,uuid,uuid)'::regprocedure)
    INTO v_definition;
  IF position($old$  IF NOT FOUND THEN
    INSERT INTO public.plantations($old$ IN v_definition)=0 THEN
    RAISE EXCEPTION 'Point d''insertion de la plantation propriétaire introuvable';
  END IF;
  v_definition := replace(
    v_definition,
    $old$  IF NOT FOUND THEN
    INSERT INTO public.plantations($old$,
    $new$  IF NOT FOUND THEN
    PERFORM set_config('app.internal_plantation_write','sync_owner_plantation_for_shared_parcel',true);
    INSERT INTO public.plantations($new$
  );
  EXECUTE v_definition;
END $$;

DO $$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.register_beneficiaire_particulier(jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
    INTO v_definition;

  v_old := $old$v_parcelle public.parcelles%rowtype; v_plantation public.plantations%rowtype; v_doc jsonb;$old$;
  v_new := $new$v_parcelle public.parcelles%rowtype; v_plantation public.plantations%rowtype; v_doc jsonb; v_beneficiary_surface numeric; v_physical_surface numeric; v_existing_alloc numeric; v_density integer; v_plants integer;$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Déclaration de register_beneficiaire_particulier introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if v_nom_complet is null then raise exception 'Nom du bénéficiaire obligatoire'; end if;$old$;
  v_new := $new$  if v_nom_complet is null then raise exception 'Nom du bénéficiaire obligatoire'; end if;
  v_beneficiary_surface := coalesce(nullif(p_plantation->>'superficie_ha','')::numeric,0);
  if v_beneficiary_surface < 0.5 or abs(v_beneficiary_surface*2-round(v_beneficiary_surface*2)) > 0.000001 then
    raise exception 'La quote-part minimale est de 0,50 ha, par pas de 0,50 ha';
  end if;
  v_density := coalesce(nullif(p_plantation->>'densite_plants','')::integer,nullif(p_parcelle->>'plantation_densite_plants','')::integer,143);
  if v_density <= 0 then v_density := 143; end if;
  v_physical_surface := ceil(greatest(coalesce(nullif(p_parcelle->>'surface_totale_ha','')::numeric,0),2*v_beneficiary_surface)*2)/2;
  v_plants := coalesce(nullif(p_plantation->>'nombre_plants','')::integer,round(v_physical_surface*v_density)::integer);$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Validation bénéficiaire introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      v_owner.id,coalesce(nullif(trim(p_parcelle->>'nom'),''),'Parcelle Zakaria'),coalesce((p_parcelle->>'surface_totale_ha')::numeric,0),
      coalesce((p_parcelle->>'surface_totale_ha')::numeric,0),coalesce((p_parcelle->>'surface_totale_ha')::numeric,0),0,
      coalesce((p_parcelle->>'surface_totale_ha')::numeric,0),'actif_agricole',$old$;
  v_new := $new$      v_owner.id,coalesce(nullif(trim(p_parcelle->>'nom'),''),'Parcelle bénéficiaire'),v_physical_surface,
      v_physical_surface/2,v_physical_surface/2,0,
      v_physical_surface/2,'foncier',$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Valeurs de création de parcelle introuvables'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    update public.parcelles set proprietaire_id=coalesce(v_owner.id,proprietaire_id),mode_surface='actif_agricole',
      village=coalesce(nullif(trim(p_parcelle->>'village'),''),village),updated_by=v_uid,updated_at=now()$old$;
  v_new := $new$    update public.parcelles set proprietaire_id=coalesce(v_owner.id,proprietaire_id),mode_surface='foncier',
      surface_totale_ha=greatest(coalesce(surface_totale_ha,0),v_physical_surface),
      surface_attribuee_ha=coalesce(surface_attribuee_ha,0),plantation_partagee_activee=true,
      plantation_surface_cible_ha=greatest(coalesce(plantation_surface_cible_ha,0),v_physical_surface),
      plantation_densite_plants=v_density,
      village=coalesce(nullif(trim(p_parcelle->>'village'),''),village),updated_by=v_uid,updated_at=now()$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Mise à jour de parcelle existante introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      coalesce((p_plantation->>'superficie_ha')::numeric,0),0,0,0,0,'beneficiaire_particulier','non_requis','non_requis',v_uid,v_uid$old$;
  v_new := $new$      v_beneficiary_surface,0,0,0,0,'beneficiaire_particulier','non_requis','non_requis',v_uid,v_uid$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Surface initiale du bénéficiaire introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      total_hectares=coalesce((p_plantation->>'superficie_ha')::numeric,total_hectares),updated_by=v_uid,updated_at=now()$old$;
  v_new := $new$      total_hectares=v_beneficiary_surface,updated_by=v_uid,updated_at=now()$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Mise à jour de surface du client introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  select * into v_plantation from public.plantations where client_id=v_client.id and parcelle_id=v_parcelle.id order by created_at limit 1;$old$;
  v_new := $new$  select p.* into v_plantation from public.plantations p
   where p.parcelle_id=v_parcelle.id
     and (p.client_id=v_client.id or exists(
       select 1 from public.beneficiaire_attributions ba
       where ba.client_id=v_client.id and ba.parcelle_id=v_parcelle.id and ba.plantation_id=p.id
     ))
   order by p.created_at limit 1;$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Recherche de plantation bénéficiaire introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if v_plantation.id is null then$old$;
  v_new := $new$  select coalesce(sum(ba.surface_attribuee_ha),0) into v_existing_alloc
    from public.beneficiaire_attributions ba
   where ba.parcelle_id=v_parcelle.id and ba.statut='active' and ba.client_id<>v_client.id;
  v_physical_surface := ceil(greatest(coalesce(v_parcelle.surface_totale_ha,0),2*(v_existing_alloc+v_beneficiary_surface))*2)/2;
  update public.parcelles set mode_surface='foncier',surface_totale_ha=v_physical_surface,
    surface_attribuee_ha=v_existing_alloc,plantation_partagee_activee=true,
    plantation_surface_cible_ha=v_physical_surface,plantation_densite_plants=v_density,
    updated_by=v_uid,updated_at=now() where id=v_parcelle.id returning * into v_parcelle;
  if v_plantation.id is null then$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Point de synchronisation de parcelle introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      client_id,parcelle_id,nom,nom_plantation,superficie_ha,superficie_activee,nombre_plants,densite_plants,region_id,departement_id,sous_prefecture_id,
      village,village_nom,localite,latitude,longitude,date_plantation,date_activation,statut,statut_global,type_culture,notes,notes_internes,created_by,updated_by$old$;
  v_new := $new$      client_id,parcelle_id,role_attribution,nom,nom_plantation,superficie_ha,superficie_activee,surface_reellement_plantee,nombre_plants,nombre_plants_prevus,densite_plants,densite_cible,district_id,region_id,departement_id,sous_prefecture_id,
      village,village_nom,localite,latitude,longitude,date_plantation,date_activation,statut,statut_global,type_culture,notes,notes_internes,created_by,updated_by$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Colonnes de création de plantation introuvables'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    insert into public.plantations($old$;
  v_new := $new$    perform set_config('app.internal_plantation_write','register_beneficiaire_particulier',true);
    insert into public.plantations($new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Insertion de plantation introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      v_client.id,v_parcelle.id,coalesce(nullif(trim(p_plantation->>'nom'),''),'Plantation YAO KONAN EMMANUEL — Zakaria'),
      coalesce(nullif(trim(p_plantation->>'nom_plantation'),''),'Plantation YAO KONAN EMMANUEL — Zakaria'),
      coalesce((p_plantation->>'superficie_ha')::numeric,2),coalesce((p_plantation->>'superficie_activee')::numeric,(p_plantation->>'superficie_ha')::numeric,2),
      coalesce((p_plantation->>'nombre_plants')::integer,0),coalesce((p_plantation->>'densite_plants')::integer,0),
      nullif(p_parcelle->>'region_id','')::uuid,nullif(p_parcelle->>'departement_id','')::uuid,nullif(p_parcelle->>'sous_prefecture_id','')::uuid,$old$;
  v_new := $new$      null,v_parcelle.id,'partage',coalesce(nullif(trim(p_plantation->>'nom'),''),'Plantation partagée — '||v_nom_complet),
      coalesce(nullif(trim(p_plantation->>'nom_plantation'),''),'Plantation partagée — '||v_nom_complet),
      v_physical_surface,v_physical_surface,v_physical_surface,v_plants,v_plants,v_density,v_density,
      v_parcelle.district_id,v_parcelle.region_id,v_parcelle.departement_id,v_parcelle.sous_prefecture_id,$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Valeurs de création de plantation introuvables'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    update public.plantations set superficie_ha=coalesce((p_plantation->>'superficie_ha')::numeric,superficie_ha),
      superficie_activee=coalesce((p_plantation->>'superficie_activee')::numeric,superficie_activee),updated_by=v_uid,updated_at=now()$old$;
  v_new := $new$    update public.plantations set client_id=null,role_attribution='partage',
      superficie_ha=v_physical_surface,superficie_activee=v_physical_surface,surface_reellement_plantee=v_physical_surface,
      nombre_plants=coalesce(nullif(nombre_plants,0),v_plants),nombre_plants_prevus=v_plants,
      densite_plants=v_density,densite_cible=v_density,updated_by=v_uid,updated_at=now()$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Mise à jour de plantation introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  for v_doc in select value from jsonb_array_elements(coalesce(p_documents,'[]'::jsonb)) loop$old$;
  v_new := $new$  update public.beneficiaire_attributions
     set surface_attribuee_ha=v_beneficiary_surface,role_attribution='beneficiaire',statut='active',updated_by=v_uid,updated_at=now()
   where client_id=v_client.id and parcelle_id=v_parcelle.id and plantation_id=v_plantation.id;
  if not found then
    insert into public.beneficiaire_attributions(client_id,parcelle_id,plantation_id,surface_attribuee_ha,role_attribution,statut,notes,created_by,updated_by)
    values(v_client.id,v_parcelle.id,v_plantation.id,v_beneficiary_surface,'beneficiaire','active',
      'Quote-part bénéficiaire de '||v_beneficiary_surface||' ha dans une plantation partagée.',v_uid,v_uid);
  end if;
  update public.parcelles
     set surface_attribuee_ha=(select coalesce(sum(ba.surface_attribuee_ha),0) from public.beneficiaire_attributions ba where ba.parcelle_id=v_parcelle.id and ba.statut='active'),
         updated_by=v_uid,updated_at=now()
   where id=v_parcelle.id;
  for v_doc in select value from jsonb_array_elements(coalesce(p_documents,'[]'::jsonb)) loop$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Point d''insertion de l''attribution bénéficiaire introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END $$;

COMMIT;
