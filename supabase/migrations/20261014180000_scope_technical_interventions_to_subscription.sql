create or replace function public.ensure_client_parcel_from_technical()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_client public.clients%rowtype;
  v_sub public.client_souscriptions%rowtype;
  v_parcelle uuid;
  v_formula text;
  v_surface numeric;
  v_is_client_land boolean;
  v_target_surface numeric;
begin
  if new.client_id is null or new.statut<>'realisee' then return new; end if;
  select * into v_client from public.clients where id=new.client_id;
  if not found then return new; end if;

  if new.souscription_id is not null then
    select * into v_sub from public.client_souscriptions where id=new.souscription_id and client_id=new.client_id;
    if not found then raise exception 'La souscription ne correspond pas au client de l’intervention'; end if;
    v_is_client_land:=coalesce(v_sub.necessite_foncier_client,false);
    v_surface:=coalesce(v_sub.superficie_ha,0);
  else
    v_formula:=upper(coalesce(v_client.formule_code,''));
    v_is_client_land:=v_formula like 'PALMTERROIR%' or v_formula like 'TERRAPALM%';
    v_surface:=greatest(0,coalesce(v_client.total_hectares,0));
  end if;

  if not v_is_client_land then return new; end if;
  v_parcelle:=coalesce(new.parcelle_id,v_sub.parcelle_id,v_client.parcelle_id);
  if v_parcelle is null then
    insert into public.parcelles(
      nom,surface_totale_ha,surface_proprietaire_ha,surface_agricapital_ha,surface_attribuee_ha,surface_disponible_ha,
      district_id,region_id,departement_id,sous_prefecture_id,village,localisation_gps_lat,localisation_gps_lng,
      statut,mode_surface,notes,plantation_partagee_activee,plantation_surface_cible_ha,plantation_type_culture,
      plantation_densite_plants,plantation_date_activation,created_by,updated_by
    ) values (
      coalesce(nullif(v_client.localite,''),v_client.nom_complet,'Parcelle client'),
      v_surface,v_surface,0,0,0,v_client.district_id,v_client.region_id,v_client.departement_id,v_client.sous_prefecture_id,
      v_client.localite,null,null,'a_valider','propriete_client',
      'Parcelle créée automatiquement lors d’une intervention liée à une souscription sur terrain propre.',
      false,v_surface,'Palmier à huile',143,null,v_client.created_by,v_client.updated_by
    ) returning id into v_parcelle;
  end if;

  v_target_surface:=v_surface;
  if new.souscription_id is not null then
    select coalesce(sum(s.superficie_ha),0)+v_surface into v_target_surface
    from public.client_souscriptions s
    where s.client_id=new.client_id and s.parcelle_id=v_parcelle and s.id<>new.souscription_id;
    update public.client_souscriptions set parcelle_id=coalesce(parcelle_id,v_parcelle),updated_at=now()
      where id=new.souscription_id;
  end if;

  update public.parcelles
  set mode_surface='propriete_client',
      plantation_partagee_activee=false,
      plantation_surface_cible_ha=greatest(coalesce(v_target_surface,plantation_surface_cible_ha,0),0),
      plantation_type_culture='Palmier à huile',
      plantation_densite_plants=coalesce(plantation_densite_plants,143),
      updated_at=now()
  where id=v_parcelle;

  update public.clients set parcelle_id=coalesce(parcelle_id,v_parcelle),updated_at=now() where id=v_client.id;
  new.parcelle_id:=v_parcelle;
  return new;
end;
$function$;

create or replace function public.handle_paiement_valide()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  if new.statut <> 'valide' or coalesce(old.statut,'')='valide' then return new; end if;
  if coalesce(new.est_paiement_initial,false) then
    update public.clients set paiement_initial_paye_at=coalesce(paiement_initial_paye_at,now()),updated_at=now()
    where id=new.client_id;
    perform public.refresh_client_account_activation(new.client_id);
    if new.souscription_id is not null then
      update public.client_souscriptions
      set statut=case when lot_id is not null then 'active' else 'paiement_initial_paye' end,updated_at=now()
      where id=new.souscription_id and client_id=new.client_id and statut='souscrite';
    end if;
  elsif new.type_paiement='MENSUALITE' then
    update public.clients set updated_at=now() where id=new.client_id;
  end if;
  return new;
end;
$function$;
