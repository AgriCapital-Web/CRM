-- A client-created acquisition belongs to the same dossier review; do not queue it
-- for a second manual validation or notify reviewers when it is already validated.
create or replace function public.notify_acquisition_validation_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_client_name text;
  v_reviewer record;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.validation_statut,'') = 'a_valider'
       and coalesce(new.metadata->>'created_from_client_workflow','false') <> 'true'
       and coalesce(new.metadata->>'source', '') <> 'clients' then
      select coalesce(nullif(trim(c.nom_complet), ''), c.id::text)
        into v_client_name
      from public.clients c where c.id = new.client_id;
      for v_reviewer in
        select distinct ur.user_id from public.user_roles ur
        where ur.role in ('pdg', 'service_client', 'chef_equipe_service_client')
      loop
        insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
        values (
          v_reviewer.user_id, 'acquisition_validation', 'Vente à valider',
          'L’acquisition de ' || coalesce(v_client_name, 'un client') || ' attend sa validation.',
          jsonb_build_object('acquisition_id', new.id, 'client_id', new.client_id, 'route', '/acquisitions?validation=ventes'),
          false, 'acquisition-validation:new:' || new.id::text || ':' || v_reviewer.user_id::text
        ) on conflict do nothing;
      end loop;
    end if;
  elsif new.validation_statut is distinct from old.validation_statut
     and new.validation_statut = 'modification_demandee'
     and new.created_by is not null then
    insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
    values (
      new.created_by, 'acquisition_modification', 'Correction de vente demandée',
      'La vente doit être corrigée : ' || coalesce(nullif(trim(new.validation_commentaire), ''), 'consultez les remarques de validation.'),
      jsonb_build_object('acquisition_id', new.id, 'client_id', new.client_id, 'route', '/acquisitions/' || new.client_id::text, 'allow_edit', true),
      false, 'acquisition-validation:edit:' || new.id::text || ':' || coalesce(new.validation_demande_at::text, now()::text)
    ) on conflict do nothing;
  end if;
  return new;
end;
$function$;

create or replace function public.review_client_validation(p_client_id uuid, p_action text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_client public.clients%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null or not (
    private.has_role_permission('clients.validate')
    or exists(select 1 from public.user_roles where user_id=v_user and role in ('pdg','service_client','chef_equipe_service_client'))
  ) then
    raise exception 'Vous n’êtes pas autorisé à valider les dossiers clients.' using errcode='42501';
  end if;
  if p_action not in ('valider','demander_modification') then
    raise exception 'Action de validation inconnue.';
  end if;
  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'Client introuvable.'; end if;

  if p_action='valider' then
    update public.clients set validation_statut='valide',validation_commentaire=null,
      validation_par=v_user,validation_at=now(),validation_demande_at=null,updated_by=v_user,updated_at=now()
    where id=p_client_id;

    -- Auto-created acquisition is the same client dossier, not a second approval queue.
    update public.acquisitions set validation_statut='valide',validation_commentaire=null,
      validation_par=v_user,validation_at=now(),validation_demande_at=null,updated_at=now()
    where client_id=p_client_id
      and (metadata->>'created_from_client_workflow'='true' or metadata->>'source'='clients')
      and validation_statut in ('a_valider','modification_demandee');

    perform public.create_paiement_initial(p_client_id);
  else
    if nullif(trim(coalesce(p_comment,'')),'') is null then
      raise exception 'Indiquez les corrections à effectuer.';
    end if;
    update public.clients set validation_statut='modification_demandee',
      validation_commentaire=trim(p_comment),validation_demande_at=now(),
      validation_par=v_user,validation_at=null,updated_by=v_user,updated_at=now()
    where id=p_client_id;
  end if;
  return jsonb_build_object('client_id',p_client_id,'validation_statut',case when p_action='valider' then 'valide' else 'modification_demandee' end);
end;
$function$;

-- Mark acquisitions created by our data repair as workflow-generated and suppress
-- obsolete "Vente à valider" inbox entries for those already-approved records.
update public.acquisitions
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('source','clients','created_from_client_workflow',true),
    updated_at=now()
where metadata->>'source'='client_validation_backfill';

update public.notifications n
set read=true, updated_at=now()
where n.type='acquisition_validation'
  and exists (
    select 1 from public.acquisitions a
    where a.id::text=n.data->>'acquisition_id'
      and a.validation_statut='valide'
      and a.metadata->>'created_from_client_workflow'='true'
  );
