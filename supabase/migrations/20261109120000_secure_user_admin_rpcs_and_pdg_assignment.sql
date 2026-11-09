-- User administration: caller checks and role assignment are enforced in PostgreSQL.
-- Service-role RPCs accept an actor id only after the Edge Function has validated the JWT.
begin;

create or replace function public.admin_set_user_roles_with_primary_authorized(
  p_user_id uuid, p_roles text[], p_primary_role text, p_actor_user_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_actor_user_id is null or (
    not private.is_global_admin(p_actor_user_id)
    and not exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
      where ur.user_id = p_actor_user_id
        and rp.permission_code in ('roles.manage_permissions','utilisateurs.create')
    )
  ) then
    raise exception 'Permission insuffisante pour gérer les rôles ou créer un compte.' using errcode = '42501';
  end if;

  if p_user_id is null or p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'Utilisateur et au moins un rôle sont obligatoires.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_roles) as requested(role_code)
    where lower(requested.role_code) in ('pdg','dg','super_admin','admin','administrateur','president','président')
  ) and not private.is_global_admin(p_actor_user_id) then
    raise exception 'Seul le PDG peut attribuer un rôle de gouvernance.' using errcode = '42501';
  end if;

  if not private.is_global_admin(p_actor_user_id) and exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and lower(ur.role) in ('pdg','dg','super_admin','admin','administrateur','president','président')
  ) then
    raise exception 'Seul le PDG peut modifier les rôles d’un compte de gouvernance.' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(p_roles) as requested(role_code)
    left join public.app_roles ar on ar.code = requested.role_code and ar.actif is true
    where ar.code is null
  ) then
    raise exception 'Un ou plusieurs rôles sont inconnus ou inactifs.' using errcode = '22023';
  end if;

  if p_primary_role is null or not (p_primary_role = any(p_roles)) then
    raise exception 'Le rôle principal doit figurer parmi les rôles attribués.' using errcode = '22023';
  end if;

  perform public.admin_set_user_roles_with_primary(p_user_id, p_roles, p_primary_role);
  perform set_config('app.internal_account_link', 'true', true);
  update public.profiles
  set poste = p_primary_role,
      relation_rh = case
        when 'pdg' = any(p_roles) then 'PDG'
        when 'dg' = any(p_roles) then 'DG'
        when 'associe_actionnaire' = any(p_roles) then 'Associé / Actionnaire'
        when relation_rh in ('PDG','DG','Associé / Actionnaire') then 'Employé'
        else relation_rh
      end
  where user_id = p_user_id;
  perform set_config('app.internal_account_link', 'false', true);
end;
$function$;

create or replace function public.admin_set_profile_active_authorized(
  p_user_id uuid, p_actif boolean, p_actor_user_id uuid
) returns table(profile_id uuid, user_id uuid, actif boolean)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_actor_user_id is null or (
    not private.is_global_admin(p_actor_user_id)
    and not exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
      where ur.user_id = p_actor_user_id
        and rp.permission_code in ('utilisateurs.update','utilisateurs.delete')
    )
  ) then
    raise exception 'Permission insuffisante pour modifier le statut de ce compte.' using errcode = '42501';
  end if;

  if p_user_id is null or p_actif is null then
    raise exception 'Utilisateur et statut sont obligatoires.' using errcode = '22023';
  end if;

  if not private.is_global_admin(p_actor_user_id) and exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and lower(trim(ur.role)) in ('pdg','dg','super_admin','admin','administrateur','president','président')
  ) then
    raise exception 'Seul le PDG peut modifier le statut d’un compte de gouvernance.' using errcode = '42501';
  end if;

  return query select * from public.admin_set_profile_active(p_user_id, p_actif);
end;
$function$;

create or replace function public.admin_update_username_authorized(
  p_user_id uuid, p_username text, p_actor_user_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_updated integer := 0;
begin
  if p_user_id is null or p_actor_user_id is null or length(v_username) < 3 or length(v_username) > 30 or v_username !~ '^[a-z0-9._-]+$' then
    raise exception 'Compte et identifiant valide obligatoires.' using errcode = '22023';
  end if;

  if not private.is_global_admin(p_actor_user_id) and not exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_code = ur.role
    join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
    where ur.user_id = p_actor_user_id and rp.permission_code = 'utilisateurs.update'
  ) then
    raise exception 'Permission insuffisante pour modifier cet identifiant.' using errcode = '42501';
  end if;

  if not private.is_global_admin(p_actor_user_id) and exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and lower(trim(ur.role)) in ('pdg','dg','super_admin','admin','administrateur','president','président')
  ) then
    raise exception 'Seul le PDG peut modifier les identifiants d’un compte de gouvernance.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(p.username) = v_username and coalesce(p.user_id, p.id) <> p_user_id
  ) then
    raise exception 'Cet identifiant est déjà utilisé.' using errcode = '23505';
  end if;

  perform set_config('app.internal_account_link', 'true', true);
  update public.profiles set username = v_username, updated_at = now()
  where user_id = p_user_id or id = p_user_id;
  get diagnostics v_updated = row_count;
  perform set_config('app.internal_account_link', 'false', true);
  if v_updated = 0 then
    raise exception 'Profil associé au compte introuvable.' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.admin_set_user_roles_with_primary(uuid,text[],text) from public, anon, authenticated;
grant execute on function public.admin_set_user_roles_with_primary(uuid,text[],text) to service_role;
revoke all on function public.admin_set_profile_active(uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_profile_active(uuid,boolean) to service_role;
revoke all on function public.admin_set_user_roles_with_primary_authorized(uuid,text[],text,uuid) from public, anon, authenticated;
grant execute on function public.admin_set_user_roles_with_primary_authorized(uuid,text[],text,uuid) to service_role;
revoke all on function public.admin_set_profile_active_authorized(uuid,boolean,uuid) from public, anon, authenticated;
grant execute on function public.admin_set_profile_active_authorized(uuid,boolean,uuid) to service_role;
revoke all on function public.admin_update_username_authorized(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_update_username_authorized(uuid,text,uuid) to service_role;

notify pgrst, 'reload schema';
commit;