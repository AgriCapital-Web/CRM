CREATE OR REPLACE FUNCTION public.create_plantation_after_mise_en_terre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client public.clients%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_sub public.client_souscriptions%rowtype;
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
begin
  if new.type_intervention<>'mise_en_terre' or new.statut<>'realisee' then return new; end if;
  if new.client_id is null then raise exception 'La mise en terre doit être rattachée à un Client'; end if;
  select * into v_client from public.clients where id=new.client_id;
  if v_client.id is null then raise exception 'Client du parcours technique introuvable'; end if;

  v_lot_id:=new.lot_id;
  v_parcelle_id:=new.parcelle_id;
  if new.souscription_id is not null then
    select * into v_sub from public.client_souscriptions where id=new.souscription_id and client_id=new.client_id for update;
    if v_sub.id is null then raise exception 'Souscription du client introuvable'; end if;
    if v_sub.statut_technique='mise_en_terre_realisee' then
      if exists(select 1 from public.plantations where souscription_id=v_sub.id) then return new; end if;
    end if;
    v_lot_id:=coalesce(v_lot_id,v_sub.lot_id);
    v_parcelle_id:=coalesce(v_parcelle_id,v_sub.parcelle_id);
    if v_sub.parcelle_id is not null and v_parcelle_id is distinct from v_sub.parcelle_id then
      raise exception 'La parcelle de l’intervention ne correspond pas à la souscription';
    end if;
    v_surface:=v_sub.superficie_ha;
    v_role:='beneficiaire';
    v_active:=v_sub.montant_pi_total<=0 or exists(
      select 1 from public.paiements p where p.souscription_id=v_sub.id
        and coalesce(p.est_paiement_initial,false)
        and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed')
    );
  end if;

  if v_lot_id is not null then
    select * into v_lot from public.lots_hectares where id=v_lot_id for update;
    if v_lot.id is null then raise exception 'Lot introuvable pour la mise en terre'; end if;
    if v_lot.client_id is distinct from new.client_id then raise exception 'Le lot n’est pas attribué à ce client'; end if;
    if v_parcelle_id is not null and v_parcelle_id is distinct from v_lot.parcelle_id then raise exception 'Le lot ne correspond pas à la parcelle de l’intervention'; end if;
    v_parcelle_id:=coalesce(v_parcelle_id,v_lot.parcelle_id);
    if new.souscription_id is null then v_surface:=greatest(0,coalesce(v_lot.surface_ha,0)); end if;
  end if;
  if v_parcelle_id is null then raise exception 'La parcelle doit être précisée dans l’intervention technique'; end if;
  select * into v_parcelle from public.parcelles where id=v_parcelle_id for update;
  if v_parcelle.id is null then raise exception 'Parcelle introuvable pour la mise en terre'; end if;

  if new.souscription_id is null then
    if v_lot_id is null then v_surface:=greatest(0,coalesce(v_client.total_hectares,0)); end if;
    if v_client.type_client='beneficiaire_particulier' and v_lot_id is null then
      select coalesce(max(ba.surface_attribuee_ha),v_surface),coalesce(max(ba.role_attribution),'beneficiaire')
        into v_surface,v_role from public.beneficiaire_attributions ba
        where ba.client_id=v_client.id and ba.parcelle_id=v_parcelle.id and ba.statut='active';
    end if;
    v_active:=coalesce(v_client.compte_actif,false) or v_client.paiement_initial_paye_at is not null or v_client.pi_paye_at is not null;
  end if;
  if coalesce(v_surface,0)<=0 then raise exception 'La superficie du dossier ou de la souscription doit être positive avant la mise en terre'; end if;

  v_density:=coalesce(v_parcelle.plantation_densite_plants,143);
  v_date:=new.date_intervention::date;
  v_name:='Plantation '||coalesce(nullif(v_client.nom_complet,''),v_client.id_unique);
  v_actor:=coalesce(auth.uid(),v_client.created_by);

  if new.souscription_id is not null then
    select p.id into v_existing from public.plantations p where p.souscription_id=new.souscription_id order by p.created_at desc limit 1;
  else
    select p.id into v_existing from public.plantations p where p.client_id=v_client.id and p.parcelle_id=v_parcelle.id
      and ((v_lot_id is not null and p.lot_id=v_lot_id) or (v_lot_id is null and p.lot_id is null))
      order by p.created_at desc limit 1;
  end if;

  if v_existing is null then
    insert into public.plantations(
      client_id,parcelle_id,role_attribution,nom,nom_plantation,superficie_ha,superficie_activee,nombre_plants,densite_plants,
      district_id,region_id,departement_id,sous_prefecture_id,village,village_nom,localite,
      localisation_gps_lat,localisation_gps_lng,latitude,longitude,date_plantation,date_activation,statut,statut_global,
      type_culture,notes,created_by,updated_by,lot_id,souscription_id
    ) values (
      v_client.id,v_parcelle.id,v_role,v_name,v_name,v_surface,case when v_active then v_surface else 0 end,
      (v_surface*v_density)::integer,v_density,v_parcelle.district_id,v_parcelle.region_id,v_parcelle.departement_id,
      v_parcelle.sous_prefecture_id,v_parcelle.village,v_parcelle.village,v_parcelle.village,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_date,case when v_active then v_date else null end,case when v_active then 'actif' else 'en_attente_pi' end,
      case when v_active then 'actif' else 'en_attente_pi' end,coalesce(v_parcelle.plantation_type_culture,'Palmier à huile'),
      case when new.souscription_id is not null then 'Créée après validation technique de la souscription '||new.souscription_id::text
        else 'Créée automatiquement après validation technique de la mise en terre.' end,
      v_actor,v_actor,v_lot_id,new.souscription_id
    ) returning id into v_existing;
  else
    update public.plantations set date_plantation=coalesce(date_plantation,v_date),
      date_activation=case when v_active then coalesce(date_activation,v_date) else null end,
      superficie_ha=case when new.souscription_id is not null then v_surface else superficie_ha end,
      superficie_activee=case when v_active then v_surface else 0 end,
      nombre_plants=(v_surface*v_density)::integer,densite_plants=v_density,
      lot_id=coalesce(lot_id,v_lot_id),souscription_id=coalesce(souscription_id,new.souscription_id),
      statut=case when v_active then 'actif' else 'en_attente_pi' end,
      statut_global=case when v_active then 'actif' else 'en_attente_pi' end,updated_at=now()
      where id=v_existing;
  end if;

  update public.clients set parcelle_id=coalesce(parcelle_id,v_parcelle.id),
    nombre_plantations=(select count(*) from public.plantations where client_id=v_client.id and statut not in ('archive','supprime')),
    phase_actuelle='plantation',updated_at=now() where id=v_client.id;
  if new.souscription_id is not null then
    update public.client_souscriptions set parcelle_id=coalesce(parcelle_id,v_parcelle.id),
      statut_technique='mise_en_terre_realisee',statut=case when v_active then 'active' else 'en_attente_paiement' end,updated_at=now()
      where id=new.souscription_id;
  elsif v_client.type_client='beneficiaire_particulier' then
    insert into public.beneficiaire_attributions(client_id,parcelle_id,plantation_id,surface_attribuee_ha,role_attribution,statut,notes)
    select v_client.id,v_parcelle.id,v_existing,v_surface,v_role,'active','Rattachement automatique de la plantation individuelle à la parcelle.'
    where not exists(select 1 from public.beneficiaire_attributions ba where ba.client_id=v_client.id
      and ba.parcelle_id=v_parcelle.id and ba.plantation_id=v_existing and ba.statut='active');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_client_parcel_from_technical()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Le mode foncier est déterminé par l'offre de cette souscription, pas par
  -- l'offre historique principale du client.
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

CREATE OR REPLACE FUNCTION public.handle_paiement_valide()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.statut <> 'valide' or coalesce(old.statut,'')='valide' then return new; end if;

  if coalesce(new.est_paiement_initial,false) then
    update public.clients
    set paiement_initial_paye_at=coalesce(paiement_initial_paye_at,now()),updated_at=now()
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

CREATE OR REPLACE FUNCTION public.trg_activate_client_lot_after_initial_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lot record;
  v_activation jsonb;
  v_owner_id uuid;
  v_subscription_lot uuid;
begin
  if not coalesce(new.est_paiement_initial,false)
     or lower(coalesce(new.statut,'')) not in ('valide','paye','paid','success','successful','completed')
     or (tg_op='UPDATE' and lower(coalesce(old.statut,'')) in ('valide','paye','paid','success','successful','completed')) then
    return new;
  end if;

  if new.souscription_id is not null then
    select s.lot_id into v_subscription_lot
    from public.client_souscriptions s
    where s.id=new.souscription_id and s.client_id=new.client_id;
    if v_subscription_lot is null then return new; end if;
    select l.id,l.client_id,l.parcelle_id,l.surface_ha,l.reference
      into v_lot from public.lots_hectares l
      where l.id=v_subscription_lot and l.client_id=new.client_id and l.statut='attribue';
    if v_lot.id is null then raise exception 'Le lot de cette souscription n’est plus attribué au client'; end if;
    v_activation:=public.activate_client_lot_from_lot(v_lot.id,v_lot.client_id,coalesce(new.date_paiement::date,current_date));
    select p.proprietaire_id into v_owner_id from public.parcelles p where p.id=v_lot.parcelle_id;
    perform public.notification_emit_event('lot_attribue',jsonb_build_object(
      'lot_id',v_lot.id,'client_id',v_lot.client_id,'parcelle_id',v_lot.parcelle_id,
      'proprietaire_id',v_owner_id,'surface',coalesce(v_lot.surface_ha,1),
      'surface_client',coalesce(v_lot.surface_ha,1),'surface_proprietaire',coalesce(v_lot.surface_ha,1),
      'lot_reference',coalesce(v_lot.reference,v_lot.id::text),
      'date_activation',coalesce(new.date_paiement::date,current_date),
      'souscription_id',new.souscription_id
    ));
    update public.client_souscriptions set statut='active',updated_at=now()
      where id=new.souscription_id and statut='souscrite';
    return new;
  end if;

  for v_lot in
    select l.id,l.client_id,l.parcelle_id,l.surface_ha,l.reference
    from public.lots_hectares l
    where l.client_id=new.client_id and l.statut='attribue'
    order by l.created_at
  loop
    v_activation:=public.activate_client_lot_from_lot(v_lot.id,v_lot.client_id,coalesce(new.date_paiement::date,current_date));
    select p.proprietaire_id into v_owner_id from public.parcelles p where p.id=v_lot.parcelle_id;
    perform public.notification_emit_event('lot_attribue',jsonb_build_object(
      'lot_id',v_lot.id,'client_id',v_lot.client_id,'parcelle_id',v_lot.parcelle_id,
      'proprietaire_id',v_owner_id,'surface',coalesce(v_lot.surface_ha,1),
      'surface_client',coalesce(v_lot.surface_ha,1),'surface_proprietaire',coalesce(v_lot.surface_ha,1),
      'lot_reference',coalesce(v_lot.reference,v_lot.id::text),
      'date_activation',coalesce(new.date_paiement::date,current_date)
    ));
  end loop;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_technical_plantation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p record;
  v_plantation_id uuid;
  target_count integer;
begin
  v_plantation_id:=new.plantation_id;
  if v_plantation_id is null and new.souscription_id is not null
     and new.type_intervention='mise_en_terre' and new.statut='realisee' then
    select id into v_plantation_id from public.plantations where souscription_id=new.souscription_id order by created_at desc limit 1;
  end if;
  if v_plantation_id is null or new.statut<>'realisee' then return new; end if;
  select * into p from public.plantations where id=v_plantation_id;
  if p.id is null then return new; end if;

  if new.type_intervention='mise_en_terre' then
    target_count:=coalesce(new.nombre_plants_realises,round(coalesce(p.superficie_ha,0)*coalesce(new.densite_plants,p.densite_cible,143)));
    update public.plantations
    set date_plantation=coalesce(date_plantation,new.date_intervention),
        date_activation=case when p.statut='actif' then coalesce(date_activation,new.date_intervention) else null end,
        statut_global=case when p.statut='actif' then 'actif' else coalesce(p.statut,'en_attente_pi') end,
        densite_cible=coalesce(new.densite_plants,densite_cible,143),
        densite_plants=coalesce(new.densite_plants,densite_cible,143),
        nombre_plants_prevus=coalesce(new.nombre_plants_prevus,nombre_plants_prevus,round(superficie_ha*coalesce(new.densite_plants,densite_cible,143))),
        nombre_plants_mis_en_terre=target_count,
        nombre_plants=target_count,
        surface_reellement_plantee=coalesce(surface_reellement_plantee,superficie_ha),
        taux_reussite=coalesce(taux_reussite,100),updated_at=now()
    where id=v_plantation_id;
  elsif new.type_intervention='remplacement' then
    update public.plantations set nombre_plants_remplaces=coalesce(nombre_plants_remplaces,0)+coalesce(new.nombre_plants_remplaces,0),updated_at=now()
      where id=v_plantation_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_client_souscription_foncier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lot public.lots_hectares%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot_available boolean;
  v_lot_reserved_for_subscription boolean;
begin
  if new.necessite_foncier_client then
    if new.lot_id is not null then raise exception 'Une offre sur terrain propre ne peut pas réserver un lot partenaire.'; end if;
    return new;
  end if;
  if new.lot_id is null then raise exception 'Une offre partenaire doit être liée à un lot disponible.'; end if;
  select * into v_lot from public.lots_hectares where id=new.lot_id;
  if v_lot.id is null or v_lot.parcelle_id is null then raise exception 'Lot partenaire introuvable ou sans parcelle.'; end if;
  v_lot_available:=v_lot.client_id is null and v_lot.souscription_id is null and lower(coalesce(v_lot.statut,'')) in ('disponible','libre');
  v_lot_reserved_for_subscription:=v_lot.client_id=new.client_id and v_lot.souscription_id=new.id and v_lot.statut='attribue';
  if not v_lot_available and not v_lot_reserved_for_subscription then
    raise exception 'Le lot n’est plus disponible ou est réservé à une autre souscription.';
  end if;
  select * into v_parcelle from public.parcelles where id=v_lot.parcelle_id;
  if v_parcelle.id is null or v_parcelle.proprietaire_id is null then raise exception 'Le propriétaire partenaire doit être enregistré.'; end if;
  if not exists (
    select 1 from public.conventions_foncieres cf
    where cf.id=v_lot.convention_id and cf.parcelle_id=v_lot.parcelle_id and cf.statut='active'
  ) then raise exception 'Le lot doit dépendre d’une convention foncière active.'; end if;
  if new.parcelle_id is distinct from v_lot.parcelle_id then raise exception 'La parcelle de la souscription ne correspond pas au lot réservé.'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_formula_technical_intervention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_formula text;
  v_plantation_date date;
  v_client_id uuid;
  v_client_parcelle uuid;
  v_sub public.client_souscriptions%rowtype;
begin
  if new.plantation_id is not null then
    select p.client_id,p.parcelle_id,p.date_plantation,coalesce(s.formule_code,c.formule_code)
      into v_client_id,new.parcelle_id,v_plantation_date,v_formula
    from public.plantations p
    join public.clients c on c.id=p.client_id
    left join public.client_souscriptions s on s.id=p.souscription_id
    where p.id=new.plantation_id;
    if v_client_id is null then raise exception 'Plantation introuvable pour l’intervention'; end if;
    if new.client_id is null then new.client_id:=v_client_id; end if;
    if new.client_id is distinct from v_client_id then raise exception 'Le Client de l’intervention ne correspond pas à la plantation sélectionnée'; end if;
    if new.souscription_id is null then
      select p.souscription_id into new.souscription_id from public.plantations p where p.id=new.plantation_id;
    end if;
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
