-- Keep the staff RLS predicate aligned with the active role catalogue.
-- Legacy responsable_zone assignments map to the official responsable_district role.

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
    join public.app_roles ar
      on ar.code = case when ur.role = 'responsable_zone' then 'responsable_district' else ur.role end
     and ar.actif = true
    where ur.user_id = _user_id
  );
$function$;
