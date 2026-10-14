-- Multi-team membership support. Keeps profiles.equipe_id as a backwards-compatible primary team.
create table if not exists public.equipe_membres (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint equipe_membres_equipe_profile_unique unique (equipe_id, profile_id)
);

create index if not exists equipe_membres_profile_idx on public.equipe_membres(profile_id);
create index if not exists equipe_membres_equipe_idx on public.equipe_membres(equipe_id);
alter table public.equipe_membres enable row level security;

drop policy if exists equipe_membres_select_managers on public.equipe_membres;
create policy equipe_membres_select_managers on public.equipe_membres
for select to authenticated
using (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()));

drop policy if exists equipe_membres_insert_managers on public.equipe_membres;
create policy equipe_membres_insert_managers on public.equipe_membres
for insert to authenticated
with check (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()));

drop policy if exists equipe_membres_delete_managers on public.equipe_membres;
create policy equipe_membres_delete_managers on public.equipe_membres
for delete to authenticated
using (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()));

grant select, insert, update, delete on public.equipe_membres to authenticated;

-- Migrate all existing primary-team assignments without changing them.
insert into public.equipe_membres (equipe_id, profile_id)
select p.equipe_id, p.id
from public.profiles p
where p.equipe_id is not null
on conflict (equipe_id, profile_id) do nothing;

create or replace function public.assign_profile_to_equipe(p_profile_id uuid, p_equipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
begin
  if auth.uid() is null or not (
    private.has_role_permission('parametres.manage_teams')
    or private.is_global_admin(auth.uid())
  ) then
    raise exception 'Permission refusée pour gérer les membres des équipes'
      using errcode = '42501';
  end if;

  if p_equipe_id is null then
    raise exception 'Pour retirer un membre, utilisez remove_profile_from_equipe'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.equipes where id = p_equipe_id and actif = true) then
    raise exception 'Équipe introuvable ou inactive' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id and actif = true) then
    raise exception 'Profil introuvable ou inactif' using errcode = 'P0002';
  end if;

  insert into public.equipe_membres (equipe_id, profile_id, created_by)
  values (p_equipe_id, p_profile_id, auth.uid())
  on conflict (equipe_id, profile_id) do nothing;

  -- Ne jamais écraser une équipe principale déjà enregistrée.
  update public.profiles
     set equipe_id = p_equipe_id, updated_at = now()
   where id = p_profile_id and equipe_id is null;
end;
$function$;

create or replace function public.remove_profile_from_equipe(p_profile_id uuid, p_equipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_next_equipe uuid;
begin
  if auth.uid() is null or not (
    private.has_role_permission('parametres.manage_teams')
    or private.is_global_admin(auth.uid())
  ) then
    raise exception 'Permission refusée pour gérer les membres des équipes'
      using errcode = '42501';
  end if;

  delete from public.equipe_membres
   where profile_id = p_profile_id and equipe_id = p_equipe_id;

  select em.equipe_id into v_next_equipe
    from public.equipe_membres em
   where em.profile_id = p_profile_id
   order by em.created_at asc
   limit 1;

  update public.profiles
     set equipe_id = v_next_equipe, updated_at = now()
   where id = p_profile_id and equipe_id = p_equipe_id;
end;
$function$;

revoke all on function public.assign_profile_to_equipe(uuid, uuid) from public, anon;
grant execute on function public.assign_profile_to_equipe(uuid, uuid) to authenticated;
revoke all on function public.remove_profile_from_equipe(uuid, uuid) from public, anon;
grant execute on function public.remove_profile_from_equipe(uuid, uuid) to authenticated;
