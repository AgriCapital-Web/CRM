-- Server-side consumers receive the same effective permission result as the CRM UI.
CREATE OR REPLACE FUNCTION public.crm_user_app_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    array_agg(DISTINCT ap.code ORDER BY ap.code),
    ARRAY[]::text[]
  )
  FROM public.app_permissions ap
  WHERE ap.actif IS TRUE
    AND (
      private.crm_is_global_admin(_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_code = ur.role
        WHERE ur.user_id = _user_id
          AND rp.permission_code = ap.code
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_can_supervise_leads(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.can_supervise_leads(_user_id);
$function$;

REVOKE ALL ON FUNCTION public.crm_user_app_permissions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_user_app_permissions(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_can_supervise_leads(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_supervise_leads(uuid) TO service_role;
