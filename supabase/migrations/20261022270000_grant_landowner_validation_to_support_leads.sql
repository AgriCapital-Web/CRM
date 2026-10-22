insert into public.role_permissions (role_code, permission_code)
select 'chef_equipe_service_client', 'proprietaires.validate'
where exists (select 1 from public.app_roles where code='chef_equipe_service_client')
  and not exists (
    select 1 from public.role_permissions
    where role_code='chef_equipe_service_client' and permission_code='proprietaires.validate'
  );