-- Separate the review lifecycle from operational client/acquisition statuses.
alter table public.clients
  add column if not exists validation_statut text not null default 'a_valider',
  add column if not exists validation_commentaire text,
  add column if not exists validation_demande_at timestamptz,
  add column if not exists validation_par uuid references auth.users(id) on delete set null,
  add column if not exists validation_at timestamptz;
alter table public.clients drop constraint if exists clients_validation_statut_check;
alter table public.clients add constraint clients_validation_statut_check check (validation_statut in ('a_valider','modification_demandee','valide'));

alter table public.acquisitions
  add column if not exists validation_statut text not null default 'a_valider',
  add column if not exists validation_commentaire text,
  add column if not exists validation_demande_at timestamptz,
  add column if not exists validation_par uuid references auth.users(id) on delete set null,
  add column if not exists validation_at timestamptz;
alter table public.acquisitions drop constraint if exists acquisitions_validation_statut_check;
alter table public.acquisitions add constraint acquisitions_validation_statut_check check (validation_statut in ('a_valider','modification_demandee','valide'));

create index if not exists clients_validation_statut_created_at_idx on public.clients(validation_statut, created_at desc);
create index if not exists acquisitions_validation_statut_created_at_idx on public.acquisitions(validation_statut, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.finance_expenses'::regclass and conname='finance_expenses_profile_id_fkey') then
    alter table public.finance_expenses add constraint finance_expenses_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null;
  end if;
end $$;

insert into public.role_permissions(role_code,permission_code) values
  ('pdg','clients.validate'),('service_client','clients.validate'),('chef_equipe_service_client','clients.validate'),
  ('pdg','acquisitions.validate'),('service_client','acquisitions.validate'),('chef_equipe_service_client','acquisitions.validate')
on conflict (role_code,permission_code) do nothing;

create or replace function public.notify_client_validation_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_name text := coalesce(nullif(trim(new.nom_complet),''), nullif(trim(concat_ws(' ',new.nom_famille,new.prenoms)),''), new.id::text); v_reviewer record;
begin
  if tg_op='INSERT' then
    for v_reviewer in select distinct ur.user_id from public.user_roles ur where ur.role in ('pdg','service_client','chef_equipe_service_client') loop
      insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
      values(v_reviewer.user_id,'client_validation','Nouveau client à valider','Le dossier de '||v_name||' attend la validation du service client / PDG.',
        jsonb_build_object('client_id',new.id,'route','/acquisitions?validation=attente'),false,'client-validation:new:'||new.id::text||':'||v_reviewer.user_id::text)
      on conflict do nothing;
    end loop;
  elsif new.validation_statut is distinct from old.validation_statut and new.validation_statut='modification_demandee' and new.created_by is not null then
    insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
    values(new.created_by,'client_modification','Modification demandée','Le dossier de '||v_name||' doit être corrigé : '||coalesce(nullif(trim(new.validation_commentaire),''),'consultez les remarques du service client.'),
      jsonb_build_object('client_id',new.id,'route','/client/'||new.id::text,'allow_edit',true),false,
      'client-validation:edit:'||new.id::text||':'||coalesce(new.validation_demande_at::text,now()::text))
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_client_validation_review on public.clients;
create trigger trg_notify_client_validation_review after insert or update of validation_statut on public.clients for each row execute function public.notify_client_validation_review();

create or replace function public.notify_acquisition_validation_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_client_name text; v_reviewer record;
begin
  if tg_op='INSERT' then
    select coalesce(nullif(trim(c.nom_complet),''),c.id::text) into v_client_name from public.clients c where c.id=new.client_id;
    for v_reviewer in select distinct ur.user_id from public.user_roles ur where ur.role in ('pdg','service_client','chef_equipe_service_client') loop
      insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
      values(v_reviewer.user_id,'acquisition_validation','Vente à valider','L’acquisition de '||coalesce(v_client_name,'un client')||' attend sa validation.',
        jsonb_build_object('acquisition_id',new.id,'client_id',new.client_id,'route','/acquisitions?validation=ventes'),false,
        'acquisition-validation:new:'||new.id::text||':'||v_reviewer.user_id::text)
      on conflict do nothing;
    end loop;
  elsif new.validation_statut is distinct from old.validation_statut and new.validation_statut='modification_demandee' and new.created_by is not null then
    insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
    values(new.created_by,'acquisition_modification','Correction de vente demandée','La vente doit être corrigée : '||coalesce(nullif(trim(new.validation_commentaire),''),'consultez les remarques de validation.'),
      jsonb_build_object('acquisition_id',new.id,'client_id',new.client_id,'route','/acquisitions/'||new.client_id::text,'allow_edit',true),false,
      'acquisition-validation:edit:'||new.id::text||':'||coalesce(new.validation_demande_at::text,now()::text))
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_acquisition_validation_review on public.acquisitions;
create trigger trg_notify_acquisition_validation_review after insert or update of validation_statut on public.acquisitions for each row execute function public.notify_acquisition_validation_review();

create or replace function public.review_client_validation(p_client_id uuid,p_action text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_client public.clients%rowtype; v_user uuid := auth.uid();
begin
  if v_user is null or not (private.has_role_permission('clients.validate') or exists(select 1 from public.user_roles where user_id=v_user and role in ('pdg','service_client','chef_equipe_service_client'))) then
    raise exception 'Vous n’êtes pas autorisé à valider les dossiers clients.' using errcode='42501';
  end if;
  if p_action not in ('valider','demander_modification') then raise exception 'Action de validation inconnue.'; end if;
  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'Client introuvable.'; end if;
  if p_action='valider' then
    update public.clients set validation_statut='valide',validation_commentaire=null,validation_par=v_user,validation_at=now(),
      documents_valides_at=coalesce(documents_valides_at,now()),validation_demande_at=null,updated_by=v_user,updated_at=now() where id=p_client_id;
  else
    if nullif(trim(coalesce(p_comment,'')),'') is null then raise exception 'Indiquez les corrections à effectuer.'; end if;
    update public.clients set validation_statut='modification_demandee',validation_commentaire=trim(p_comment),validation_demande_at=now(),
      validation_par=v_user,validation_at=null,updated_by=v_user,updated_at=now() where id=p_client_id;
  end if;
  return jsonb_build_object('client_id',p_client_id,'validation_statut',case when p_action='valider' then 'valide' else 'modification_demandee' end);
end $$;
create or replace function public.review_acquisition_validation(p_acquisition_id uuid,p_action text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_acquisition public.acquisitions%rowtype; v_user uuid := auth.uid();
begin
  if v_user is null or not (private.has_role_permission('acquisitions.validate') or exists(select 1 from public.user_roles where user_id=v_user and role in ('pdg','service_client','chef_equipe_service_client'))) then
    raise exception 'Vous n’êtes pas autorisé à valider les ventes.' using errcode='42501';
  end if;
  if p_action not in ('valider','demander_modification') then raise exception 'Action de validation inconnue.'; end if;
  select * into v_acquisition from public.acquisitions where id=p_acquisition_id for update;
  if v_acquisition.id is null then raise exception 'Vente introuvable.'; end if;
  if p_action='valider' then
    update public.acquisitions set validation_statut='valide',validation_commentaire=null,validation_par=v_user,validation_at=now(),validation_demande_at=null,updated_at=now() where id=p_acquisition_id;
  else
    if nullif(trim(coalesce(p_comment,'')),'') is null then raise exception 'Indiquez les corrections à effectuer.'; end if;
    update public.acquisitions set validation_statut='modification_demandee',validation_commentaire=trim(p_comment),validation_demande_at=now(),validation_par=v_user,validation_at=null,updated_at=now() where id=p_acquisition_id;
  end if;
  return jsonb_build_object('acquisition_id',p_acquisition_id,'validation_statut',case when p_action='valider' then 'valide' else 'modification_demandee' end);
end $$;
revoke all on function public.review_client_validation(uuid,text,text) from public,anon;
grant execute on function public.review_client_validation(uuid,text,text) to authenticated;
revoke all on function public.review_acquisition_validation(uuid,text,text) from public,anon;
grant execute on function public.review_acquisition_validation(uuid,text,text) to authenticated;
