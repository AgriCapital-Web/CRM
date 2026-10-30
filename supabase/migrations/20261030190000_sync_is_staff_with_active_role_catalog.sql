-- Keep the staff RLS predicate aligned with the active role catalogue.
-- Previously, responsable_district and newer official roles were omitted,
-- so their role_permissions SELECT policy returned no rows and the CRM
-- could redirect the user to a blank protected dashboard.

create or replace function private.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.code = ur.role and ar.actif = true
    where ur.user_id = _user_id
  );
$function$;
