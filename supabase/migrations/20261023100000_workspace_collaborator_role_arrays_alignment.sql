-- Keep role codes and labels aligned by role code for role-based invitations.
drop function if exists public.workspace_list_collaborators_with_roles();
create function public.workspace_list_collaborators_with_roles()
returns table(id uuid, nom_complet text, email text, poste text, role_codes text[], role_names text[])
language sql stable security definer set search_path=public,pg_temp
as $$
 select p.id,p.nom_complet,p.email,p.poste,
        coalesce(r.role_codes,'{}'::text[]),coalesce(r.role_names,'{}'::text[])
 from public.profiles p
 left join lateral (
   select array_agg(ur.role order by ur.role) as role_codes,
          array_agg(coalesce(ar.nom,ur.role) order by ur.role) as role_names
   from public.user_roles ur
   left join public.app_roles ar on lower(ar.code)=lower(ur.role)
   where ur.user_id=p.user_id
 ) r on true
 where coalesce(p.actif,false)=true and p.user_id is not null
   and public.workspace_current_profile_id() is not null
 order by p.nom_complet
$$;
revoke all on function public.workspace_list_collaborators_with_roles() from public,anon;
grant execute on function public.workspace_list_collaborators_with_roles() to authenticated;
