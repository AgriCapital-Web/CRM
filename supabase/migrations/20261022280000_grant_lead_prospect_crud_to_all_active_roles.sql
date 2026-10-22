-- CRM-wide policy: every active application role can create, view and update
-- leads/prospects. RLS still restricts each user's visible/editable records to
-- their own assignments, supervisory scope, or explicitly granted global scope.
insert into public.role_permissions (role_code, permission_code)
select r.code, p.permission_code
from public.app_roles r
cross join (values ('leads.create'),('leads.view'),('leads.update')) as p(permission_code)
where r.actif = true
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_code = r.code and rp.permission_code = p.permission_code
  );

-- Remove role-name allowlists from the legacy v2 policies; the permission
-- catalogue and the existing scoped policies remain the source of truth.
drop policy if exists "CRM support global leads read v2" on public.leads;
drop policy if exists "CRM support global leads update v2" on public.leads;
drop policy if exists "CRM support global prospects insert v2" on public.prospects;
drop policy if exists "CRM support global prospects read v2" on public.prospects;
drop policy if exists "CRM support global prospects update v2" on public.prospects;
