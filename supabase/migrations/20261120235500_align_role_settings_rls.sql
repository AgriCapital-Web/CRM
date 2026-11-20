begin;

drop policy if exists app_roles_delete_global_admin on public.app_roles;
create policy app_roles_delete_by_role_permission
  on public.app_roles for delete to authenticated
  using (private.crm_has_role_permission('roles.manage_permissions'));

drop policy if exists app_roles_insert_global_admin on public.app_roles;
create policy app_roles_insert_by_role_permission
  on public.app_roles for insert to authenticated
  with check (private.crm_has_role_permission('roles.manage_permissions'));

drop policy if exists app_roles_update_global_admin on public.app_roles;
create policy app_roles_update_by_role_permission
  on public.app_roles for update to authenticated
  using (private.crm_has_role_permission('roles.manage_permissions'))
  with check (private.crm_has_role_permission('roles.manage_permissions'));

drop policy if exists app_permissions_delete_global_admin on public.app_permissions;
create policy app_permissions_delete_by_role_permission
  on public.app_permissions for delete to authenticated
  using (private.crm_has_role_permission('roles.manage_permissions'));

drop policy if exists app_permissions_insert_global_admin on public.app_permissions;
create policy app_permissions_insert_by_role_permission
  on public.app_permissions for insert to authenticated
  with check (private.crm_has_role_permission('roles.manage_permissions'));

drop policy if exists app_permissions_update_global_admin on public.app_permissions;
create policy app_permissions_update_by_role_permission
  on public.app_permissions for update to authenticated
  using (private.crm_has_role_permission('roles.manage_permissions'))
  with check (private.crm_has_role_permission('roles.manage_permissions'));

create or replace function public.crm_set_role_permissions(
  p_role_code text,
  p_permission_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_name text;
  v_actor_name text;
  v_codes text[] := coalesce(p_permission_codes, array[]::text[]);
  v_count integer := 0;
begin
  if auth.uid() is null or not private.crm_has_role_permission('roles.manage_permissions') then
    raise exception 'Accès refusé : permission de gestion des rôles requise.' using errcode = '42501';
  end if;

  select nom into v_role_name
  from public.app_roles
  where code = p_role_code and actif is true;

  if not found then
    raise exception 'Rôle introuvable ou inactif.' using errcode = '22023';
  end if;

  if cardinality(v_codes) > 250 then
    raise exception 'Trop de permissions pour un rôle.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_codes) requested(code)
    left join public.app_permissions ap on ap.code = requested.code and ap.actif is true
    where ap.code is null
  ) then
    raise exception 'Une ou plusieurs permissions sont inconnues ou inactives.' using errcode = '22023';
  end if;

  delete from public.role_permissions where role_code = p_role_code;

  insert into public.role_permissions(role_code, permission_code)
  select p_role_code, requested.code
  from (select distinct unnest(v_codes) as code) requested;

  get diagnostics v_count = row_count;

  select p.nom_complet into v_actor_name
  from public.profiles p
  where p.user_id = auth.uid()
  order by p.created_at desc
  limit 1;

  insert into public.admin_audit_logs(
    acteur_user_id, acteur_libelle, cible_libelle, action, entite, entite_id,
    ancienne_valeur, nouvelle_valeur, statut, details, source
  ) values (
    auth.uid(), coalesce(v_actor_name, 'Administrateur'), v_role_name,
    'MODIFICATION_PERMISSIONS_ROLE', 'role_permissions', p_role_code,
    null, jsonb_build_object('permissions', coalesce(v_codes, array[]::text[])),
    'succes', 'Matrice des permissions du rôle mise à jour.', 'settings'
  );

  return jsonb_build_object('success', true, 'role_code', p_role_code, 'permission_count', v_count);
end;
$function$;

revoke all on function public.crm_set_role_permissions(text,text[]) from public, anon;
grant execute on function public.crm_set_role_permissions(text,text[]) to authenticated;

commit;