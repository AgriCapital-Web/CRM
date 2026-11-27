ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS genre text;

ALTER TABLE public.account_requests
  ADD COLUMN IF NOT EXISTS genre text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_genre_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_genre_check CHECK (genre IS NULL OR genre IN ('M', 'F'));

ALTER TABLE public.account_requests
  DROP CONSTRAINT IF EXISTS account_requests_genre_check;
ALTER TABLE public.account_requests
  ADD CONSTRAINT account_requests_genre_check CHECK (genre IS NULL OR genre IN ('M', 'F'));

CREATE OR REPLACE FUNCTION public.admin_sync_account_request_profile(p_request_id uuid, p_actor_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request public.account_requests%rowtype;
  v_profile_id uuid;
  v_allowed boolean;
begin
  select * into v_request
  from public.account_requests
  where id = p_request_id
  for update;

  if not found or v_request.auth_user_id is null then
    raise exception 'Demande de compte ou compte Auth introuvable.';
  end if;

  select public.crm_user_has_app_permission(
    _user_id := p_actor_user_id,
    _required_code := 'parametres.manage_users'
  ) into v_allowed;

  if coalesce(v_allowed, false) is not true then
    raise exception 'Permission de gestion des comptes insuffisante.'
      using errcode = '42501';
  end if;

  if v_request.statut not in ('en_attente', 'approuve') then
    raise exception 'La demande doit être en attente ou approuvée pour synchroniser son profil.';
  end if;

  perform pg_catalog.set_config('app.internal_account_link', 'true', true);

  update public.profiles
  set email = v_request.email,
      nom_complet = v_request.nom_complet,
      nom = coalesce(nullif(v_request.nom, ''), nom),
      prenoms = coalesce(nullif(v_request.prenoms, ''), prenoms),
      genre = coalesce(v_request.genre, genre),
      telephone = coalesce(nullif(v_request.telephone, ''), telephone),
      telephone_indicatif = coalesce(v_request.telephone_indicatif, telephone_indicatif),
      telephone_local = coalesce(v_request.telephone_local, telephone_local),
      username = coalesce(v_request.username, username),
      poste = coalesce(nullif(v_request.poste_souhaite, ''), poste),
      departement = coalesce(nullif(v_request.departement, ''), departement),
      photo_url = coalesce(nullif(v_request.photo_url, ''), photo_url),
      district_id = coalesce(v_request.district_id, district_id),
      region_id = coalesce(v_request.region_id, region_id),
      type_compte = 'interne',
      password_change_required = false,
      updated_at = now()
  where user_id = v_request.auth_user_id
     or id = v_request.auth_user_id
  returning id into v_profile_id;

  if v_profile_id is null then
    raise exception 'Profil du compte introuvable.';
  end if;

  return v_profile_id;
end;
$function$;
