begin;

-- Backfill the explicit name fields from the Auth metadata written by the
-- signup flow. This avoids guessing the order of names in nom_complet.
update public.account_requests ar
set nom = coalesce(nullif(ar.nom, ''), nullif(u.raw_user_meta_data ->> 'nom', '')),
    prenoms = coalesce(nullif(ar.prenoms, ''), nullif(u.raw_user_meta_data ->> 'prenoms', ''))
from auth.users u
where u.id = ar.auth_user_id
  and (nullif(ar.nom, '') is null or nullif(ar.prenoms, '') is null);

-- Restore fields that were accepted in account_requests but not copied to
-- profiles by the previous signup implementation.
with latest_request as (
  select distinct on (ar.auth_user_id)
    ar.auth_user_id, ar.nom, ar.prenoms, ar.telephone,
    ar.telephone_indicatif, ar.telephone_local, ar.poste_souhaite,
    ar.departement, ar.photo_url, ar.district_id, ar.region_id
  from public.account_requests ar
  where ar.auth_user_id is not null
  order by ar.auth_user_id, ar.created_at desc, ar.id desc
)
update public.profiles p
set nom = coalesce(nullif(p.nom, ''), nullif(r.nom, '')),
    prenoms = coalesce(nullif(p.prenoms, ''), nullif(r.prenoms, '')),
    telephone = coalesce(nullif(r.telephone, ''), p.telephone),
    telephone_indicatif = coalesce(r.telephone_indicatif, p.telephone_indicatif),
    telephone_local = coalesce(r.telephone_local, p.telephone_local),
    poste = coalesce(nullif(r.poste_souhaite, ''), p.poste),
    departement = coalesce(nullif(r.departement, ''), p.departement),
    photo_url = coalesce(nullif(p.photo_url, ''), nullif(r.photo_url, '')),
    district_id = coalesce(r.district_id, p.district_id),
    region_id = coalesce(r.region_id, p.region_id),
    updated_at = now()
from latest_request r
where p.user_id = r.auth_user_id;

create or replace function public.admin_sync_account_request_profile(
  p_request_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
      telephone = coalesce(nullif(v_request.telephone, ''), telephone),
      telephone_indicatif = coalesce(v_request.telephone_indicatif, telephone_indicatif),
      telephone_local = coalesce(v_request.telephone_local, telephone_local),
      username = coalesce(v_request.username, username),
      poste = coalesce(nullif(v_request.poste_souhaite, ''), poste),
      departement = coalesce(nullif(v_request.departement, ''), departement),
      photo_url = coalesce(nullif(v_request.photo_url, ''), photo_url),
      district_id = coalesce(v_request.district_id, district_id),
      region_id = coalesce(v_request.region_id, region_id),
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

revoke all on function public.admin_sync_account_request_profile(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_sync_account_request_profile(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
