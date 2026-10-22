-- Every defined CRM role may create its own leads and prospects.
-- Existing RLS still restricts assignment, visibility, updates and deletion by scope.
insert into public.role_permissions (role_code, permission_code)
select r.code, p.permission_code
from public.app_roles r
cross join (values ('leads.create'::text), ('leads.view'::text)) as p(permission_code)
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_code = r.code and rp.permission_code = p.permission_code
);
