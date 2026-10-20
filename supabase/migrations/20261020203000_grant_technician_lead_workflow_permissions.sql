-- Ensure technicians can open the Leads/Prospects screens and maintain their own records.
-- The route is guarded by leads.view, while RLS separately checks leads.create/update.
-- Granting only leads.create left technicians unable to open the screen or review saved leads.
insert into public.role_permissions (role_code, permission_code)
select 'technicien', required.permission_code
from (values ('leads.view'), ('leads.update')) as required(permission_code)
where not exists (
  select 1
  from public.role_permissions existing
  where existing.role_code = 'technicien'
    and existing.permission_code = required.permission_code
);
