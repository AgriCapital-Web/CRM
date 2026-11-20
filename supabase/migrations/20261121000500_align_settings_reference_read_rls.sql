begin;

drop policy if exists "CRM roles select by permission" on public.user_roles;
create policy crm_user_roles_read_by_management_scope
  on public.user_roles for select to authenticated
  using (
    private.crm_is_global_admin((select auth.uid()))
    or private.crm_has_role_permission('roles.manage_permissions')
    or private.crm_has_role_permission('utilisateurs.view')
    or private.crm_has_role_permission('parametres.manage_teams')
    or private.crm_has_role_permission('parametres.manage_geo')
    or (
      private.crm_has_role_permission('roles.view')
      and user_id = (select auth.uid())
    )
  );

drop policy if exists app_roles_read_by_role_admin_or_self on public.app_roles;
create policy app_roles_read_by_management_scope_or_self
  on public.app_roles for select to authenticated
  using (
    private.crm_has_role_permission('roles.view')
    or private.crm_has_role_permission('roles.manage_permissions')
    or private.crm_has_role_permission('utilisateurs.view')
    or private.crm_has_role_permission('parametres.manage_teams')
    or private.crm_has_role_permission('parametres.manage_geo')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = app_roles.code
    )
  );

drop policy if exists zone_assignments_read_own_or_geo_admin on public.zone_assignments;
create policy zone_assignments_read_by_management_scope
  on public.zone_assignments for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.crm_has_role_permission('parametres.manage_geo')
    or private.crm_has_role_permission('parametres.manage_teams')
    or private.crm_has_role_permission('parametres.manage_users')
    or private.crm_has_role_permission('utilisateurs.view')
  );

drop policy if exists cartes_select_hr_or_own on public.cartes_personnel;
create policy cartes_select_hr_or_user_management
  on public.cartes_personnel for select to authenticated
  using (
    private.is_rh((select auth.uid()))
    or private.crm_has_role_permission('utilisateurs.view')
    or profile_id = private.current_profile_id()
  );

commit;