CREATE OR REPLACE FUNCTION public.admin_sync_account_request_profile(
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.account_requests%rowtype;
  v_profile_id uuid;
  v_allowed boolean;
BEGIN
  SELECT * INTO v_request FROM public.account_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Demande de compte ou compte Auth introuvable.';
  END IF;
  SELECT public.crm_user_has_app_permission(
    _user_id := p_actor_user_id,
    _required_code := 'parametres.manage_users'
  ) INTO v_allowed;
  IF coalesce(v_allowed,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Permission de gestion des comptes insuffisante.' USING ERRCODE='42501';
  END IF;
  IF v_request.statut NOT IN ('en_attente','approuve') THEN
    RAISE EXCEPTION 'La demande doit être en attente ou approuvée pour synchroniser son profil.';
  END IF;
  PERFORM pg_catalog.set_config('app.internal_account_link','true',true);
  UPDATE public.profiles
  SET email=v_request.email,
      nom_complet=v_request.nom_complet,
      telephone=v_request.telephone,
      telephone_indicatif=v_request.telephone_indicatif,
      telephone_local=v_request.telephone_local,
      username=coalesce(v_request.username,username),
      poste=coalesce(v_request.poste_souhaite,poste),
      photo_url=coalesce(v_request.photo_url,photo_url),
      district_id=coalesce(v_request.district_id,district_id),
      region_id=coalesce(v_request.region_id,region_id),
      password_change_required=false,
      updated_at=now()
  WHERE user_id=v_request.auth_user_id OR id=v_request.auth_user_id
  RETURNING id INTO v_profile_id;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Profil du compte introuvable.'; END IF;
  RETURN v_profile_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_sync_account_request_profile(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_account_request_profile(uuid,uuid) TO service_role;