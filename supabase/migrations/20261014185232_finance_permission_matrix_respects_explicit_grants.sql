-- Finance access follows explicit permission grants as well as the existing
-- standard finance roles, so additional authorized roles can be granted access.
CREATE OR REPLACE FUNCTION public.finance_can_view()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.has_role_permission('finance.view')
    or exists(
      select 1 from public.user_roles
      where user_id=(select auth.uid())
        and role in ('pdg','dg','comptable','responsable_operations','associe_actionnaire')
    );
$function$;

CREATE OR REPLACE FUNCTION public.finance_can_manage()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.has_role_permission('finance.manage')
    or exists(
      select 1 from public.user_roles
      where user_id=(select auth.uid())
        and role in ('pdg','dg','comptable')
    );
$function$;
