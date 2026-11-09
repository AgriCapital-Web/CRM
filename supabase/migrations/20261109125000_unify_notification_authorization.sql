-- Centralize app-permission checks for authenticated UI and server-side dispatchers.
CREATE OR REPLACE FUNCTION private.crm_user_has_role_permission(
  p_user_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    private.crm_is_global_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_code = ur.role
      JOIN public.app_permissions ap ON ap.code = rp.permission_code AND ap.actif IS TRUE
      WHERE ur.user_id = p_user_id
        AND rp.permission_code = p_permission_code
    );
$function$;

CREATE OR REPLACE FUNCTION public.crm_current_user_has_app_permission(required_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.crm_user_has_role_permission((SELECT auth.uid()), required_code);
$function$;

CREATE OR REPLACE FUNCTION public.crm_user_has_app_permission(
  _user_id uuid,
  _required_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.crm_user_has_role_permission(_user_id, _required_code);
$function$;

REVOKE ALL ON FUNCTION private.crm_user_has_role_permission(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.crm_user_has_role_permission(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.crm_current_user_has_app_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_current_user_has_app_permission(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_user_has_app_permission(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_user_has_app_permission(uuid,text) TO service_role;
