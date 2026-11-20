create or replace function public.get_team_member_counts()
returns table(equipe_id uuid, effectif bigint)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les effectifs des équipes.' using errcode = '42501';
  end if;
  return query
  select e.id, count(p.id)::bigint
  from public.equipes e
  left join public.equipe_membres em on em.equipe_id = e.id
  left join public.profiles p on p.id = em.profile_id and p.actif is true
  where private.crm_user_can_manage_team(auth.uid(), e.id)
  group by e.id;
end;
$function$;