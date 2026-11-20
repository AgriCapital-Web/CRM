create or replace function public.get_team_member_counts()
returns table(equipe_id uuid, effectif bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les effectifs des équipes.' using errcode = '42501';
  end if;

  return query
  select em.equipe_id, count(*)::bigint
  from public.equipe_membres em
  join public.profiles p on p.id = em.profile_id and p.actif is true
  group by em.equipe_id;
end;
$function$;

create or replace function public.get_team_member_details(p_equipe_id uuid)
returns table(id uuid, nom_complet text, telephone text, user_id uuid, actif boolean, roles text[])
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les membres de cette équipe.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.equipes e where e.id = p_equipe_id) then
    raise exception 'Équipe introuvable.' using errcode = 'P0002';
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

revoke all on function public.get_team_member_counts() from public, anon;
revoke all on function public.get_team_member_details(uuid) from public, anon;
grant execute on function public.get_team_member_counts() to authenticated;
grant execute on function public.get_team_member_details(uuid) to authenticated;