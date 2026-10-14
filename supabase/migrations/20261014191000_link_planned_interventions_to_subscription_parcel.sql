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
  if new.client_id is null then return new; end if;
  select * into v_client from public.clients where id=new.client_id;
  if not found then return new; end if;

  if new.souscription_id is not null then
    select * into v_sub from public.client_souscriptions where id=new.souscription_id and client_id=new.client_id;
    if not found then raise exception 'La souscription ne correspond pas au client de l’intervention'; end if;
    v_is_client_land:=coalesce(v_sub.necessite_foncier_client,false);
    v_surface:=coalesce(v_sub.superficie_ha,0);
    if v_sub.parcelle_id is not null and new.parcelle_id is not null and v_sub.parcelle_id is distinct from new.parcelle_id then
      raise exception 'La parcelle de l’intervention ne correspond pas à la souscription';
    end if;
    v_parcelle:=coalesce(new.parcelle_id,v_sub.parcelle_id);
    if v_parcelle is not null then
      update public.client_souscriptions set parcelle_id=coalesce(parcelle_id,v_parcelle),updated_at=now()
        where id=new.souscription_id;
      new.parcelle_id:=v_parcelle;
    end if;
    -- Même une intervention planifiée doit conserver son lien à la bonne parcelle.
    if new.statut<>'realisee' then return new; end if;
  else
    if new.statut<>'realisee' then return new; end if;
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
      plantation_densite_plants,plantation_date_activation,created_by,updated_by,proprietaire_id
    ) values (
      coalesce(nullif(v_client.localite,''),v_client.nom_complet,'Parcelle client'),
      v_surface,v_surface,0,0,0,v_client.district_id,v_client.region_id,v_client.departement_id,v_client.sous_prefecture_id,
      v_client.localite,null,null,'a_valider','propriete_client',
      'Parcelle créée automatiquement lors d’une intervention liée à une souscription sur terrain propre.',
      false,v_surface,'Palmier à huile',143,null,v_client.created_by,v_client.updated_by,v_client.proprietaire_id
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

create or replace function public.validate_formula_technical_intervention()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_formula text;
  v_plantation_date date;
  v_client_id uuid;
  v_client_parcelle uuid;
  v_sub public.client_souscriptions%rowtype;
  v_plantation_subscription uuid;
begin
  if new.plantation_id is not null then
    select p.client_id,p.parcelle_id,p.date_plantation,coalesce(s.formule_code,c.formule_code),p.souscription_id
      into v_client_id,new.parcelle_id,v_plantation_date,v_formula,v_plantation_subscription
    from public.plantations p
    join public.clients c on c.id=p.client_id
    left join public.client_souscriptions s on s.id=p.souscription_id
    where p.id=new.plantation_id;
    if v_client_id is null then raise exception 'Plantation introuvable pour l’intervention'; end if;
    if new.client_id is null then new.client_id:=v_client_id; end if;
    if new.client_id is distinct from v_client_id then raise exception 'Le Client de l’intervention ne correspond pas à la plantation sélectionnée'; end if;
    if new.souscription_id is null then new.souscription_id:=v_plantation_subscription; end if;
  else
    v_client_id:=new.client_id;
    if new.souscription_id is not null then
      select * into v_sub from public.client_souscriptions where id=new.souscription_id;
      if not found then raise exception 'Souscription introuvable pour l’intervention'; end if;
      if v_client_id is null then v_client_id:=v_sub.client_id; new.client_id:=v_client_id; end if;
      if v_client_id is distinct from v_sub.client_id then raise exception 'La souscription ne correspond pas au client de l’intervention'; end if;
      v_formula:=v_sub.formule_code;
      v_client_parcelle:=v_sub.parcelle_id;
      if new.parcelle_id is null and v_client_parcelle is not null then new.parcelle_id:=v_client_parcelle;
      elsif new.parcelle_id is not null and v_client_parcelle is not null and new.parcelle_id is distinct from v_client_parcelle then
        raise exception 'La parcelle de l’intervention ne correspond pas à la souscription sélectionnée';
      end if;
      select p.date_plantation into v_plantation_date from public.plantations p
        where p.souscription_id=new.souscription_id order by p.date_plantation desc nulls last limit 1;
    elsif v_client_id is not null then
      select c.formule_code,c.parcelle_id into v_formula,v_client_parcelle from public.clients c where c.id=v_client_id;
      if new.parcelle_id is null and v_client_parcelle is not null then new.parcelle_id:=v_client_parcelle;
      elsif new.parcelle_id is not null and v_client_parcelle is not null and new.parcelle_id is distinct from v_client_parcelle then
        raise exception 'La parcelle de l’intervention ne correspond pas au dossier Client';
      end if;
      select p.date_plantation into v_plantation_date from public.plantations p
        where p.client_id=v_client_id and p.parcelle_id=new.parcelle_id
        order by p.date_plantation desc nulls last limit 1;
    end if;
  end if;

  if new.type_intervention='mise_en_terre' and new.statut='realisee'
     and (new.client_id is null or new.parcelle_id is null) then
    raise exception 'La mise en terre réalisée doit être rattachée à un Client et à une parcelle';
  end if;
  if coalesce(v_formula,'') like 'PALMTERROIR%' and v_plantation_date is not null
     and new.date_intervention::date>v_plantation_date
     and new.type_intervention not in ('suivi_mensuel','autre') then
    raise exception 'Intervention non autorisée pour PalmTerroir après la mise en terre : %',new.type_intervention;
  elsif coalesce(v_formula,'') like 'PALMTERROIR%'
     and (v_plantation_date is null or new.date_intervention::date<v_plantation_date)
     and new.type_intervention not in ('validation_parcelle','piquetage','trouaison','mise_en_terre','autre') then
    raise exception 'Intervention non autorisée pour PalmTerroir avant la mise en terre : %',new.type_intervention;
  end if;
  return new;
end;
$function$;
