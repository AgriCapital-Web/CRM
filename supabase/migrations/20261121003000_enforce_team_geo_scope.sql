begin;

alter table public.equipes
  add column if not exists district_id uuid references public.districts(id);

update public.equipes e
set district_id = r.district_id
from public.regions r
where e.region_id = r.id
  and e.district_id is distinct from r.district_id;

create or replace function public.sync_equipe_district_from_region()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.region_id is null then
    new.district_id := null;
  else
    select r.district_id into new.district_id
    from public.regions r
    where r.id = new.region_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_equipe_district_from_region on public.equipes;
create trigger trg_sync_equipe_district_from_region
before insert or update of region_id on public.equipes
for each row execute function public.sync_equipe_district_from_region();

create or replace function private.crm_user_can_manage_team(p_user_id uuid, p_equipe_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select p_user_id is not null and (
    private.crm_is_global_admin(p_user_id)
    or (
      private.crm_user_has_role_permission(p_user_id, 'parametres.manage_teams')
      and exists (
        select 1 from public.equipes e
        where e.id = p_equipe_id
          and private.crm_user_can_access_geo(p_user_id, e.region_id, e.district_id, null, null)
      )
    )
  );
$function$;

create or replace function private.crm_user_can_manage_team_location(
  p_user_id uuid, p_region_id uuid, p_district_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select p_user_id is not null and (
    private.crm_is_global_admin(p_user_id)
    or (
      private.crm_user_has_role_permission(p_user_id, 'parametres.manage_teams')
      and (p_region_id is not null or p_district_id is not null)
      and private.crm_user_can_access_geo(p_user_id, p_region_id, p_district_id, null, null)
    )
  );
$function$;

create or replace function private.crm_user_can_assign_profile_to_team(
  p_user_id uuid, p_profile_id uuid, p_equipe_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.equipes e
    join public.profiles p on p.id = p_profile_id and p.actif is true
    where e.id = p_equipe_id
      and private.crm_user_can_manage_team(p_user_id, e.id)
      and (e.region_id is null or p.region_id = e.region_id)
      and (e.district_id is null or p.district_id = e.district_id)
      and private.crm_user_can_access_geo(p_user_id, p.region_id, p.district_id, null, null)
  );
$function$;

drop policy if exists "CRM equipes manage by parameter permission" on public.equipes;
create policy equipes_insert_by_geo_scope
  on public.equipes for insert to authenticated
  with check (
    private.crm_user_can_manage_team_location((select auth.uid()), region_id, district_id)
    and (
      responsable_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = equipes.responsable_id and p.actif is true
          and (equipes.region_id is null or p.region_id = equipes.region_id)
          and (equipes.district_id is null or p.district_id = equipes.district_id)
      )
    )
  );

create policy equipes_update_by_geo_scope
  on public.equipes for update to authenticated
  using (private.crm_user_can_manage_team((select auth.uid()), id))
  with check (
    private.crm_user_can_manage_team_location((select auth.uid()), region_id, district_id)
    and (
      responsable_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = equipes.responsable_id and p.actif is true
          and (equipes.region_id is null or p.region_id = equipes.region_id)
          and (equipes.district_id is null or p.district_id = equipes.district_id)
      )
    )
  );

create policy equipes_delete_by_geo_scope
  on public.equipes for delete to authenticated
  using (private.crm_user_can_manage_team((select auth.uid()), id));

drop policy if exists equipe_membres_select_managers on public.equipe_membres;
create policy equipe_membres_select_managers
  on public.equipe_membres for select to authenticated
  using (private.crm_user_can_manage_team((select auth.uid()), equipe_id));

drop policy if exists equipe_membres_insert_managers on public.equipe_membres;
create policy equipe_membres_insert_managers
  on public.equipe_membres for insert to authenticated
  with check (private.crm_user_can_assign_profile_to_team((select auth.uid()), profile_id, equipe_id));

drop policy if exists equipe_membres_delete_managers on public.equipe_membres;
create policy equipe_membres_delete_managers
  on public.equipe_membres for delete to authenticated
  using (private.crm_user_can_manage_team((select auth.uid()), equipe_id));

create or replace function public.assign_profile_to_equipe(p_profile_id uuid, p_equipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_user_can_assign_profile_to_team(auth.uid(), p_profile_id, p_equipe_id) then
    raise exception 'Accès refusé : équipe ou collaborateur hors de votre périmètre.' using errcode = '42501';
  end if;

  insert into public.equipe_membres (equipe_id, profile_id, created_by)
  values (p_equipe_id, p_profile_id, auth.uid())
  on conflict (equipe_id, profile_id) do nothing;

  update public.profiles
  set equipe_id = p_equipe_id, updated_at = now()
  where id = p_profile_id and equipe_id is null;
end;
$function$;

create or replace function public.remove_profile_from_equipe(p_profile_id uuid, p_equipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_next_equipe uuid;
begin
  if auth.uid() is null or not private.crm_user_can_manage_team(auth.uid(), p_equipe_id) then
    raise exception 'Accès refusé : équipe hors de votre périmètre.' using errcode = '42501';
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

create or replace function public.get_team_member_counts()
returns table(equipe_id uuid, effectif bigint)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les effectifs des équipes.' using errcode = '42501';
  end if;
  return query
  select e.id, count(em.profile_id)::bigint
  from public.equipes e
  left join public.equipe_membres em on em.equipe_id = e.id
  left join public.profiles p on p.id = em.profile_id and p.actif is true
  where private.crm_user_can_manage_team(auth.uid(), e.id)
  group by e.id;
end;
$function$;

create or replace function public.get_team_member_details(p_equipe_id uuid)
returns table(id uuid, nom_complet text, telephone text, user_id uuid, actif boolean, roles text[])
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_user_can_manage_team(auth.uid(), p_equipe_id) then
    raise exception 'Permission insuffisante pour consulter les membres de cette équipe.' using errcode = '42501';
  end if;
  return query
  select p.id, p.nom_complet, p.telephone, p.user_id, p.actif,
         coalesce(array_agg(distinct lower(btrim(ur.role)) order by lower(btrim(ur.role)))
           filter (where ur.role is not null), array[]::text[])
  from public.equipe_membres em
  join public.profiles p on p.id = em.profile_id
  left join public.user_roles ur on ur.user_id = p.user_id
  where em.equipe_id = p_equipe_id and p.actif is true
  group by p.id, p.nom_complet, p.telephone, p.user_id, p.actif
  order by p.nom_complet;
end;
$function$;

create or replace function public.get_available_team_members(p_equipe_id uuid)
returns table(id uuid, nom_complet text, user_id uuid, equipe_id uuid, roles text[])
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_team public.equipes%rowtype;
  v_member_role text;
  v_leader_role text;
begin
  if auth.uid() is null or not private.crm_user_can_manage_team(auth.uid(), p_equipe_id) then
    raise exception 'Permission insuffisante pour consulter les candidats de cette équipe.' using errcode = '42501';
  end if;

  select * into v_team from public.equipes where id = p_equipe_id;
  if not found then raise exception 'Équipe introuvable.' using errcode = 'P0002'; end if;

  v_member_role := case when v_team.type_equipe = 'technique' then 'technicien' else 'commercial' end;
  v_leader_role := case when v_team.type_equipe = 'technique' then 'chef_equipe_technique' else 'chef_equipe_commercial' end;

  return query
  select p.id, p.nom_complet, p.user_id, p.equipe_id,
         array_agg(distinct lower(btrim(ur.role)) order by lower(btrim(ur.role)))
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where p.actif is true and p.user_id is not null
    and (lower(btrim(ur.role)) in (v_member_role, v_leader_role))
    and (v_team.region_id is null or p.region_id = v_team.region_id)
    and (v_team.district_id is null or p.district_id = v_team.district_id)
    and private.crm_user_can_access_geo(auth.uid(), p.region_id, p.district_id, null, null)
    and not exists (
      select 1 from public.equipe_membres em
      where em.equipe_id = p_equipe_id and em.profile_id = p.id
    )
  group by p.id, p.nom_complet, p.user_id, p.equipe_id
  order by p.nom_complet;
end;
$function$;

create or replace function public.get_team_responsible_candidates(p_team_type text)
returns table(id uuid, nom_complet text, user_id uuid, roles text[])
language plpgsql stable security definer set search_path = ''
as $function$
declare v_role text;
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les responsables d''équipe.' using errcode = '42501';
  end if;
  if p_team_type not in ('commercial','technique') then
    raise exception 'Type d''équipe invalide.' using errcode = '22023';
  end if;
  v_role := case when p_team_type = 'technique' then 'chef_equipe_technique' else 'chef_equipe_commercial' end;

  return query
  select p.id, p.nom_complet, p.user_id,
         array_agg(distinct lower(btrim(ur.role)) order by lower(btrim(ur.role)))
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where p.actif is true and p.user_id is not null
    and lower(btrim(ur.role)) = v_role
    and private.crm_user_can_access_geo(auth.uid(), p.region_id, p.district_id, null, null)
  group by p.id, p.nom_complet, p.user_id
  order by p.nom_complet;
end;
$function$;

create or replace function public.get_team_responsible_candidates(p_team_type text, p_region_id uuid)
returns table(id uuid, nom_complet text, user_id uuid, roles text[])
language plpgsql stable security definer set search_path = ''
as $function$
declare v_role text; v_district_id uuid;
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les responsables d''équipe.' using errcode = '42501';
  end if;
  if p_team_type not in ('commercial','technique') then
    raise exception 'Type d''équipe invalide.' using errcode = '22023';
  end if;
  if p_region_id is not null then
    select r.district_id into v_district_id from public.regions r where r.id = p_region_id;
    if not private.crm_user_can_access_geo(auth.uid(), p_region_id, v_district_id, null, null) then
      raise exception 'Région hors de votre périmètre.' using errcode = '42501';
    end if;
  end if;
  v_role := case when p_team_type = 'technique' then 'chef_equipe_technique' else 'chef_equipe_commercial' end;

  return query
  select p.id, p.nom_complet, p.user_id,
         array_agg(distinct lower(btrim(ur.role)) order by lower(btrim(ur.role)))
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where p.actif is true and p.user_id is not null
    and lower(btrim(ur.role)) = v_role
    and (p_region_id is null or p.region_id = p_region_id)
    and private.crm_user_can_access_geo(auth.uid(), p.region_id, p.district_id, null, null)
  group by p.id, p.nom_complet, p.user_id
  order by p.nom_complet;
end;
$function$;

revoke all on function public.get_team_member_counts() from public, anon;
revoke all on function public.get_team_member_details(uuid) from public, anon;
revoke all on function public.get_available_team_members(uuid) from public, anon;
revoke all on function public.get_team_responsible_candidates(text) from public, anon;
revoke all on function public.get_team_responsible_candidates(text, uuid) from public, anon;
grant execute on function public.get_team_member_counts() to authenticated;
grant execute on function public.get_team_member_details(uuid) to authenticated;
grant execute on function public.get_available_team_members(uuid) to authenticated;
grant execute on function public.get_team_responsible_candidates(text) to authenticated;
grant execute on function public.get_team_responsible_candidates(text, uuid) to authenticated;

commit;