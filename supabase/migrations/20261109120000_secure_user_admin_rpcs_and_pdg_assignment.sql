-- User administration: database-enforced caller checks and role-PDG assignment.
-- The Edge Function supplies the authenticated actor id; service-role RPCs do
-- not rely on auth.uid(), which is null in that server-to-server context.

CREATE OR REPLACE FUNCTION public.admin_set_user_roles_with_primary_authorized(
  p_user_id uuid,
  p_roles text[],
  p_primary_role text,
  p_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_user_id IS NULL
     OR NOT (public.is_admin(p_actor_user_id) OR private.is_global_admin(p_actor_user_id)) THEN
    RAISE EXCEPTION 'Action réservée à un administrateur autorisé.'
      USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_roles IS NULL OR cardinality(p_roles) = 0 THEN
    RAISE EXCEPTION 'Utilisateur et au moins un rôle sont obligatoires.'
      USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_roles) AS requested(role_code)
    WHERE lower(requested.role_code) IN ('pdg','dg','super_admin','admin','administrateur','president','président')
  ) AND NOT private.is_global_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Seul le rôle PDG peut attribuer un rôle de gouvernance.'
      USING errcode = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_roles) AS requested(role_code)
    LEFT JOIN public.app_roles ar
      ON ar.code = requested.role_code
     AND ar.actif IS TRUE
    WHERE ar.code IS NULL
  ) THEN
    RAISE EXCEPTION 'Un ou plusieurs rôles sont inconnus ou inactifs.'
      USING errcode = '22023';
  END IF;

  IF p_primary_role IS NULL OR NOT (p_primary_role = ANY(p_roles)) THEN
    RAISE EXCEPTION 'Le rôle principal doit figurer parmi les rôles attribués.'
      USING errcode = '22023';
  END IF;

  PERFORM public.admin_set_user_roles_with_primary(
    p_user_id,
    p_roles,
    p_primary_role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_active_authorized(
  p_user_id uuid,
  p_actif boolean,
  p_actor_user_id uuid
)
RETURNS TABLE(profile_id uuid, user_id uuid, actif boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_user_id IS NULL
     OR NOT (public.is_admin(p_actor_user_id) OR private.is_global_admin(p_actor_user_id)) THEN
    RAISE EXCEPTION 'Action réservée à un administrateur autorisé.'
      USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_actif IS NULL THEN
    RAISE EXCEPTION 'Utilisateur et statut sont obligatoires.'
      USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.admin_set_profile_active(p_user_id, p_actif);
END;
$function$;

-- These legacy RPCs are now internal implementation details. Only the
-- authorized wrappers may be called by the server-side admin Edge Function.
REVOKE ALL ON FUNCTION public.admin_set_user_roles_with_primary(uuid,text[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles_with_primary(uuid,text[],text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_profile_active(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(uuid,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_user_roles_with_primary_authorized(uuid,text[],text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles_with_primary_authorized(uuid,text[],text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_profile_active_authorized(uuid,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active_authorized(uuid,boolean,uuid) TO service_role;
