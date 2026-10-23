create or replace function public.workspace_list_finance_users()
returns table(id uuid, nom_complet text, email text, poste text, relation_rh text, actif boolean, salaire_base numeric, role_codes text[], role_names text[])
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.nom_complet,p.email,p.poste,p.relation_rh,p.actif,p.salaire_base,
 coalesce(array_agg(distinct ur.role) filter(where ur.role is not null),'{}'::text[]),
 coalesce(array_agg(distinct ar.nom) filter(where ar.nom is not null),'{}'::text[])
 from public.profiles p left join public.user_roles ur on ur.user_id=p.user_id
 left join public.app_roles ar on lower(ar.code)=lower(ur.role)
 where p.user_id is not null and public.workspace_current_profile_id() is not null
 group by p.id,p.nom_complet,p.email,p.poste,p.relation_rh,p.actif,p.salaire_base
 order by p.nom_complet;
$$;
grant execute on function public.workspace_list_finance_users() to authenticated;