create or replace function public.set_user_primary_zone_assignment(p_user_id uuid, p_zone_type text, p_zone_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
begin
  if auth.uid() is null or not (private.is_global_admin(auth.uid()) or private.has_role_permission('parametres.manage_geo')) then
    raise exception 'Permission insuffisante pour modifier la couverture géographique.' using errcode='42501';
  end if;
  if p_zone_type is not null and p_zone_type not in ('district','region','departement','sous_prefecture') then
    raise exception 'Type de zone invalide.' using errcode='22023';
  end if;
  if (p_zone_type is null) <> (p_zone_id is null) then
    raise exception 'Le type et l’identifiant de zone doivent être renseignés ensemble.' using errcode='22023';
  end if;
  delete from public.zone_assignments where user_id=p_user_id;
  if p_zone_type is not null then
    insert into public.zone_assignments(user_id,zone_type,zone_id,created_by)
    values (p_user_id,p_zone_type,p_zone_id,auth.uid());
  end if;
end;
$function$;
revoke all on function public.set_user_primary_zone_assignment(uuid,text,uuid) from public;
grant execute on function public.set_user_primary_zone_assignment(uuid,text,uuid) to authenticated;
