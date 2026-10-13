alter table public.clients add column if not exists contrat_solde_at timestamptz;

create or replace function public.generate_client_id()
returns text language plpgsql security definer set search_path to 'public'
as $function$
declare v_next bigint;
begin
  perform pg_advisory_xact_lock(hashtext('agricapital.clients.id_unique'));
  select coalesce(max(substring(id_unique from '^AGC-([0-9]+)$')::bigint),0)+1 into v_next
  from public.clients where id_unique ~ '^AGC-[0-9]+$';
  return 'AGC-' || lpad(v_next::text,6,'0');
end;
$function$;

create or replace function public.actualiser_statut_client(p_client_id uuid)
returns text language plpgsql set search_path to 'public'
as $function$
declare v_status text; v_reste numeric; v_retard integer; v_compte boolean; v_total numeric;
begin
  select compte_actif,coalesce(reste_a_payer,0),coalesce(jours_retard,0),coalesce(montant_total_contrat,0)
    into v_compte,v_reste,v_retard,v_total
  from public.v_client_synthese where client_id=p_client_id;
  if not found then return null; end if;
  if coalesce(v_compte,false)=false then v_status:='ferme';
  elsif exists(select 1 from public.clients where id=p_client_id and statut_global='suspendu') then v_status:='suspendu';
  elsif v_retard>0 then v_status:='retard';
  else v_status:='a_jour'; end if;
  update public.clients set statut_global=v_status,
    contrat_solde_at=case when v_total>0 and v_reste<=0 then coalesce(contrat_solde_at,now()) else null end
  where id=p_client_id;
  return v_status;
end;
$function$;

do $fix_donald$
declare v_client public.clients%rowtype; v_parcelle_id uuid; v_village text;
begin
  select * into v_client from public.clients where id_unique='AGC-000012' and upper(nom_complet)='KOUAKOU KONAN DONALD' for update;
  if not found then
    select * into v_client from public.clients where id_unique='AGC-000007' and upper(nom_complet)='KOUAKOU KONAN DONALD' for update;
  end if;
  if not found then return; end if;
  if exists(select 1 from public.clients where id_unique='AGC-000007' and id<>v_client.id) then
    raise exception 'AGC-000007 est déjà attribué à un autre client; arrêt sans modification';
  end if;
  update public.clients set id_unique='AGC-000007',commercial_id='bd9579fd-1d07-4431-9cc4-b57dfeeab593',updated_at=now() where id=v_client.id;
  select nom into v_village from public.villages where id=v_client.village_id;
  v_village:=coalesce(v_village,v_client.localite,'Localité à confirmer');
  if v_client.parcelle_id is null then
    insert into public.parcelles(nom,surface_totale_ha,surface_proprietaire_ha,surface_agricapital_ha,surface_attribuee_ha,surface_disponible_ha,district_id,region_id,departement_id,sous_prefecture_id,village,localisation_gps_lat,localisation_gps_lng,statut,mode_surface,notes,plantation_partagee_activee,plantation_surface_cible_ha,plantation_type_culture,plantation_densite_plants,plantation_date_activation,created_by,updated_by)
    values('Parcelle client — '||v_client.nom_complet,1,1,0,0,0,v_client.district_id,v_client.region_id,v_client.departement_id,v_client.sous_prefecture_id,v_village,null,null,'validee','propriete_client','Parcelle client de 1 ha. Mise en terre confirmée par la Direction; date terrain exacte et coordonnées GPS à renseigner.',false,1,'Palmier à huile',143,null,v_client.created_by,v_client.updated_by)
    returning id into v_parcelle_id;
    update public.clients set parcelle_id=v_parcelle_id,updated_at=now() where id=v_client.id;
  else v_parcelle_id:=v_client.parcelle_id; end if;
  if not exists(select 1 from public.plantations where client_id=v_client.id and parcelle_id=v_parcelle_id and coalesce(statut,'') not in ('archive','supprime')) then
    insert into public.interventions_techniques(client_id,parcelle_id,type_intervention,date_intervention,statut,densite_plants,observations,recommandations)
    values(v_client.id,v_parcelle_id,'mise_en_terre',current_date,'realisee',143,'Régularisation administrative à la demande de la Direction : la mise en terre est déjà réalisée. La date indiquée est celle de régularisation; la date terrain exacte reste à confirmer.','Compléter la date terrain exacte et les coordonnées GPS après confirmation.');
    update public.plantations set date_plantation=null,notes=concat_ws(' ',nullif(notes,''),'Plantation existante confirmée par la Direction; date exacte de mise en terre à confirmer.') where client_id=v_client.id and parcelle_id=v_parcelle_id;
  end if;
  update public.clients set phase_actuelle='plantation',nombre_plantations=(select count(*) from public.plantations where client_id=v_client.id and statut not in ('archive','supprime')),parcelle_id=v_parcelle_id,commercial_id='bd9579fd-1d07-4431-9cc4-b57dfeeab593',updated_at=now() where id=v_client.id;
  perform public.actualiser_statut_client(v_client.id);
end;
$fix_donald$;

do $sync$
declare v_id uuid;
begin
  for v_id in select client_id from public.v_client_synthese where coalesce(montant_total_contrat,0)>0 loop
    perform public.actualiser_statut_client(v_id);
  end loop;
end;
$sync$;

select setval('public.clients_agc_id_seq',greatest(coalesce((select max(substring(id_unique from '^AGC-([0-9]+)$')::bigint) from public.clients where id_unique ~ '^AGC-[0-9]+$'),1),1),true);
