begin;

drop policy if exists app_roles_insert_by_role_permission on public.app_roles;
create policy app_roles_insert_by_create_permission
  on public.app_roles for insert to authenticated
  with check (private.crm_has_role_permission('roles.create'));

drop policy if exists app_roles_update_by_role_permission on public.app_roles;
create policy app_roles_update_by_update_permission
  on public.app_roles for update to authenticated
  using (private.crm_has_role_permission('roles.update'))
  with check (private.crm_has_role_permission('roles.update'));

drop policy if exists app_roles_delete_by_role_permission on public.app_roles;
create policy app_roles_delete_by_delete_permission
  on public.app_roles for delete to authenticated
  using (private.crm_has_role_permission('roles.delete'));

commit;