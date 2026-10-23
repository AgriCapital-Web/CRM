create or replace function public.workspace_list_teams_with_members()
returns table(id uuid, nom text, member_profile_ids uuid[])
language sql stable security definer set search_path=public,pg_temp
as $$
 select e.id,e.nom,coalesce(array_agg(distinct em.profile_id) filter(where em.profile_id is not null),'{}'::uuid[])
 from public.equipes e left join public.equipe_membres em on em.equipe_id=e.id
 where coalesce(e.actif,true)=true and public.workspace_current_profile_id() is not null
 group by e.id,e.nom order by e.nom
$$;
revoke all on function public.workspace_list_teams_with_members() from public,anon;
grant execute on function public.workspace_list_teams_with_members() to authenticated;
