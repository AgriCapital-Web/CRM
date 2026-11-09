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
     OR (
       NOT private.is_global_admin(p_actor_user_id)
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_roles ur
         JOIN public.role_permissions rp ON rp.role_code = ur.role
         JOIN public.app_permissions ap ON ap.code = rp.permission_code AND ap.actif IS TRUE
         WHERE ur.user_id = p_actor_user_id
           AND rp.permission_code IN ('roles.manage_permissions','utilisateurs.create')
       )
     ) THEN
    RAISE EXCEPTION 'Permission insuffisante pour gérer les rôles ou créer un compte.'
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

  IF NOT private.is_global_admin(p_actor_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = p_user_id
         AND lower(ur.role) IN ('pdg','dg','super_admin','admin','administrateur','president','président')
     ) THEN
    RAISE EXCEPTION 'Seul le rôle PDG peut modifier les rôles d’un compte de gouvernance.'
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

  -- Keep the profile label aligned with the authoritative user_roles table.
  PERFORM set_config('app.internal_account_link', 'true', true);
  UPDATE public.profiles
  SET relation_rh = CASE
    WHEN 'pdg' = ANY(p_roles) THEN 'PDG'
    WHEN 'dg' = ANY(p_roles) THEN 'DG'
    WHEN relation_rh IN ('PDG','DG') THEN 'Employé'
    ELSE relation_rh
  END
  WHERE user_id = p_user_id;
  PERFORM set_config('app.internal_account_link', 'false', true);
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
     OR (
       NOT private.is_global_admin(p_actor_user_id)
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_roles ur
         JOIN public.role_permissions rp ON rp.role_code = ur.role
         JOIN public.app_permissions ap ON ap.code = rp.permission_code AND ap.actif IS TRUE
         WHERE ur.user_id = p_actor_user_id
           AND rp.permission_code IN ('utilisateurs.update','utilisateurs.delete')
       )
     ) THEN
    RAISE EXCEPTION 'Permission insuffisante pour modifier le statut de ce compte.'
      USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_actif IS NULL THEN
    RAISE EXCEPTION 'Utilisateur et statut sont obligatoires.'
      USING errcode = '22023';
  END IF;

  IF NOT private.is_global_admin(p_actor_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = p_user_id AND lower(trim(ur.role)) IN ('pdg','dg','super_admin','admin','administrateur','president','président')
     ) THEN
    RAISE EXCEPTION 'Seul le rôle PDG peut modifier le statut d’un compte PDG.'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.admin_set_profile_active(p_user_id, p_actif);
END;
$function$;

-- Username updates go through a scoped server-side RPC so profile guards are
-- bypassed only inside this validated transaction, never by the browser.
CREATE OR REPLACE FUNCTION public.admin_update_username_authorized(
  p_user_id uuid,
  p_username text,
  p_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_username text := lower(trim(COALESCE(p_username, '')));
  v_updated integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_actor_user_id IS NULL
     OR v_username !~ '^[a-z0-9._-]{3,30} Only the
-- authorized wrappers may be called by the server-side admin Edge Function.
REVOKE ALL ON FUNCTION public.admin_set_user_roles_with_primary(uuid,text[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles_with_primary(uuid,text[],text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_profile_active(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(uuid,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_user_roles_with_primary_authorized(uuid,text[],text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles_with_primary_authorized(uuid,text[],text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_profile_active_authorized(uuid,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active_authorized(uuid,boolean,uuid) TO service_role;
 THEN
    RAISE EXCEPTION 'Compte et identifiant valide obligatoires.'
      USING errcode = '22023';
  END IF;

  IF NOT private.is_global_admin(p_actor_user_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role_code = ur.role
       JOIN public.app_permissions ap ON ap.code = rp.permission_code AND ap.actif IS TRUE
       WHERE ur.user_id = p_actor_user_id
         AND rp.permission_code = 'utilisateurs.update'
     ) THEN
    RAISE EXCEPTION 'Permission insuffisante pour modifier cet identifiant.'
      USING errcode = '42501';
  END IF;

  IF NOT private.is_global_admin(p_actor_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = p_user_id
         AND lower(trim(ur.role)) IN ('pdg','dg','super_admin','admin','administrateur','president','président')
     ) THEN
    RAISE EXCEPTION 'Seul le PDG peut modifier les identifiants d’un compte de gouvernance.'
      USING errcode = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(p.username) = v_username
      AND COALESCE(p.user_id, p.id) <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Cet identifiant est déjà utilisé.'
      USING errcode = '23505';
  END IF;

  PERFORM set_config('app.internal_account_link', 'true', true);
  UPDATE public.profiles
  SET username = v_username, updated_at = now()
  WHERE user_id = p_user_id OR id = p_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('app.internal_account_link', 'false', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Profil associé au compte introuvable.'
      USING errcode = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_username_authorized(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_username_authorized(uuid,text,uuid) TO service_role;

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
