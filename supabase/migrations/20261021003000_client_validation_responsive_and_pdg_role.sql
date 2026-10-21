-- Tighten the client review audience, allow scoped correction of returned client files,
-- notify the responsible commercial team, and keep the PDG on one global role.
delete from public.user_roles ur
where ur.role <> 'pdg'
  and ur.user_id in (
    select primary_role.user_id
    from public.user_roles primary_role
    where primary_role.role = 'pdg' and primary_role.is_primary = true
  );

delete from public.role_permissions
where permission_code in ('clients.validate', 'acquisitions.validate')
  and role_code not in ('pdg', 'service_client', 'chef_equipe_service_client');

insert into public.role_permissions(role_code, permission_code)
values
  ('pdg', 'clients.validate'),
  ('service_client', 'clients.validate'),
  ('chef_equipe_service_client', 'clients.validate'),
  ('pdg', 'acquisitions.validate'),
  ('service_client', 'acquisitions.validate'),
  ('chef_equipe_service_client', 'acquisitions.validate')
on conflict (role_code, permission_code) do nothing;

create or replace function private.can_correct_returned_client_scope(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and (
        c.created_by = (select auth.uid())
        or c.commercial_id = (select auth.uid())
        or (
          private.can_access_client((select auth.uid()), c.id)
          and exists (
            select 1
            from public.user_roles ur
            where ur.user_id = (select auth.uid())
              and ur.role in ('chef_equipe_commercial', 'responsable_commercial')
          )
        )
      )
  );
$$;

revoke all on function private.can_correct_returned_client_scope(uuid) from public, anon;
grant execute on function private.can_correct_returned_client_scope(uuid) to authenticated;

drop policy if exists "CRM authorized commercial team correct returned clients" on public.clients;
create policy "CRM authorized commercial team correct returned clients"
on public.clients
for update
to authenticated
using (
  validation_statut = 'modification_demandee'
  and private.can_correct_returned_client_scope(id)
)
with check (
  validation_statut in ('modification_demandee', 'a_valider')
  and private.can_correct_returned_client_scope(id)
);

create or replace function private.prevent_returned_client_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.validation_statut = 'modification_demandee'
     and new.commercial_id is distinct from old.commercial_id
     and not coalesce(private.is_global_admin((select auth.uid())), false) then
    raise exception 'Le commercial responsable ne peut pas être modifié pendant la correction d’un dossier retourné.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_returned_client_assignment_change() from public, anon, authenticated;
drop trigger if exists trg_prevent_returned_client_assignment_change on public.clients;
create trigger trg_prevent_returned_client_assignment_change
before update of commercial_id on public.clients
for each row execute function private.prevent_returned_client_assignment_change();

create or replace function public.notify_client_validation_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(
    nullif(trim(new.nom_complet), ''),
    nullif(trim(concat_ws(' ', new.nom_famille, new.prenoms)), ''),
    new.id::text
  );
  v_reviewer record;
  v_recipient record;
begin
  if tg_op = 'INSERT' then
    for v_reviewer in
      select distinct ur.user_id
      from public.user_roles ur
      where ur.role in ('pdg', 'service_client', 'chef_equipe_service_client')
    loop
      insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
      values (
        v_reviewer.user_id,
        'client_validation',
        'Nouveau client à valider',
        'Le dossier de ' || v_name || ' attend la validation du service client / PDG.',
        jsonb_build_object('client_id', new.id, 'route', '/acquisitions/validation?type=clients'),
        false,
        'client-validation:new:' || new.id::text || ':' || v_reviewer.user_id::text
      )
      on conflict do nothing;
    end loop;
  elsif new.validation_statut is distinct from old.validation_statut
        and new.validation_statut = 'modification_demandee' then
    for v_recipient in
      select distinct target.user_id
      from (
        select new.created_by as user_id
        union
        select new.commercial_id as user_id
        union
        select manager.user_id
        from public.profiles assigned
        join public.equipes e
          on e.id = assigned.equipe_id
          or exists (
            select 1 from public.equipe_membres em
            where em.equipe_id = e.id and em.profile_id = assigned.id
          )
        join public.profiles manager
          on manager.id = e.responsable_id or manager.id = e.superviseur_id
        where assigned.user_id = new.commercial_id
        union
        select manager.user_id
        from public.profiles assigned
        join public.profiles manager
          on manager.equipe_id = assigned.equipe_id
          or exists (
            select 1
            from public.equipe_membres assigned_member
            join public.equipe_membres manager_member
              on manager_member.equipe_id = assigned_member.equipe_id
            where assigned_member.profile_id = assigned.id
              and manager_member.profile_id = manager.id
          )
        join public.user_roles ur
          on ur.user_id = manager.user_id
         and ur.role in ('chef_equipe_commercial', 'responsable_commercial')
        where assigned.user_id = new.commercial_id
          and assigned.equipe_id is not null
      ) target
      where target.user_id is not null
    loop
      insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
      values (
        v_recipient.user_id,
        'client_modification',
        'Correction demandée sur un dossier client',
        'Le dossier de ' || v_name || ' doit être corrigé : ' ||
          coalesce(nullif(trim(new.validation_commentaire), ''), 'consultez les remarques du service client.'),
        jsonb_build_object(
          'client_id', new.id,
          'route', '/client/' || new.id::text || '?validation=1',
          'allow_edit', true
        ),
        false,
        'client-validation:edit:' || new.id::text || ':' ||
          coalesce(new.validation_demande_at::text, now()::text) || ':' || v_recipient.user_id::text
      )
      on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$$;

comment on function public.notify_client_validation_review() is
  'Notifie le service de validation à la création, puis le créateur, le commercial responsable et sa hiérarchie lors d’une demande de correction. La validation du dossier ne déclenche pas à elle seule l’activation du compte portail.';
