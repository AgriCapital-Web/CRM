begin;

drop policy if exists app_roles_read_by_role_admin on public.app_roles;
create policy app_roles_read_by_role_admin_or_self
  on public.app_roles for select to authenticated
  using (
    private.crm_has_role_permission('roles.view')
    or private.crm_has_role_permission('roles.manage_permissions')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id=(select auth.uid()) and ur.role=app_roles.code
    )
  );

drop policy if exists config_read_staff on public.configurations_systeme;
create policy config_read_by_system_configuration_permission
  on public.configurations_systeme for select to authenticated
  using (private.crm_has_role_permission('parametres.manage_system'));

notify pgrst, 'reload schema';
commit;