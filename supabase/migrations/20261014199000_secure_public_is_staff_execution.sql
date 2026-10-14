-- Fix permission denied when authenticated RPCs check whether the current
-- user is staff. Restrict the helper to the caller's own identity unless the
-- caller is an admin; never allow arbitrary authenticated role probing.
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    ((_user_id = auth.uid()) and private.is_staff(auth.uid()))
    or private.is_admin(auth.uid());
$function$;

revoke all on function public.is_staff(uuid) from public, anon;
grant execute on function public.is_staff(uuid) to authenticated, service_role;
