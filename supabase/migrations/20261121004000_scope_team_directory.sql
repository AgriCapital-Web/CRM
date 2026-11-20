create or replace function public.get_team_directory_for_current_user()
returns table(
  id uuid,
  nom text,
  responsable_id uuid,
  region_id uuid,
  district_id uuid,
  type_equipe text,
  actif boolean,
  zone_couverture text,
  photo_url text,
  created_at timestamptz,
  region_nom text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_staff(auth.uid()) then
    raise exception 'Accès réservé aux collaborateurs.' using errcode = '42501';
  end if;

  return query
  select e.id, e.nom, e.responsable_id, e.region_id, e.district_id,
         e.type_equipe, e.actif, e.zone_couverture, e.photo_url, e.created_at,
         r.nom
  from public.equipes e
  left join public.regions r on r.id = e.region_id
  where (
    not private.crm_has_role_permission('parametres.manage_teams')
    or private.crm_user_can_manage_team(auth.uid(), e.id)
  )
  order by e.created_at desc;
end;
$function$;

revoke all on function public.get_team_directory_for_current_user() from public, anon;
grant execute on function public.get_team_directory_for_current_user() to authenticated;