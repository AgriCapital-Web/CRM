-- Client records and client-linked authentication accounts are not internal CRM users.
-- Keep clients and auth.users intact; hide linked profiles from the internal users directory.
create or replace view public.v_internal_users
with (security_invoker = true)
as
select p.*
from public.profiles p
where not exists (select 1 from public.clients c where c.user_id = p.user_id);

grant select on public.v_internal_users to authenticated;
revoke all on public.v_internal_users from anon;

-- Do not leave an internal profile behind when an auth identity is linked to a client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_username text;
  v_pending boolean;
  v_existing_profile uuid;
  v_meta_name text;
  v_meta_phone text;
  v_meta_whatsapp text;
  v_meta_piece text;
  v_previous_internal text;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  v_pending := nullif(new.raw_user_meta_data->>'pending_role', '') is not null;
  v_existing_profile := nullif(new.raw_user_meta_data->>'existing_profile_id','')::uuid;
  v_meta_name := lower(regexp_replace(trim(coalesce(new.raw_user_meta_data->>'nom_complet', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '[[:space:]]+', ' ', 'g'));
  v_meta_phone := regexp_replace(coalesce(new.phone, new.raw_user_meta_data->>'telephone', ''), '[^0-9]', '', 'g');
  v_meta_whatsapp := regexp_replace(coalesce(new.raw_user_meta_data->>'whatsapp', ''), '[^0-9]', '', 'g');
  v_meta_piece := lower(trim(coalesce(new.raw_user_meta_data->>'numero_piece_identite', new.raw_user_meta_data->>'identity_document_number', '')));

  if v_existing_profile is null and new.email is not null then
    select p.id into v_existing_profile from public.profiles p
    where p.user_id is null and lower(trim(coalesce(p.email,''))) = lower(trim(new.email))
    order by p.created_at asc limit 1;
  end if;

  if v_existing_profile is null and v_meta_name <> '' then
    select p.id into v_existing_profile from public.profiles p
    where p.user_id is null
      and lower(regexp_replace(trim(coalesce(p.nom_complet,'')), '[[:space:]]+', ' ', 'g')) = v_meta_name
      and (
        (new.email is not null and lower(trim(coalesce(p.email,''))) = lower(trim(new.email)))
        or (v_meta_phone <> '' and v_meta_phone in (regexp_replace(coalesce(p.telephone,''), '[^0-9]', '', 'g'), regexp_replace(coalesce(p.whatsapp,''), '[^0-9]', '', 'g')))
        or (v_meta_whatsapp <> '' and v_meta_whatsapp in (regexp_replace(coalesce(p.telephone,''), '[^0-9]', '', 'g'), regexp_replace(coalesce(p.whatsapp,''), '[^0-9]', '', 'g')))
        or (v_meta_piece <> '' and lower(trim(coalesce(p.numero_piece_identite,''))) = v_meta_piece)
      )
    order by p.created_at asc limit 1;
  end if;

  if v_existing_profile is not null and exists (select 1 from public.profiles where id = v_existing_profile and user_id is null) then
    v_previous_internal := current_setting('app.internal_account_link', true);
    perform set_config('app.internal_account_link', 'true', true);
    update public.profiles
       set user_id = new.id,
           email = coalesce(new.email, email),
           nom_complet = coalesce(nullif(new.raw_user_meta_data->>'nom_complet',''), nom_complet),
           username = coalesce(nullif(v_username,''), username),
           actif = case when v_pending then false else actif end
     where id = v_existing_profile and user_id is null;
    perform set_config('app.internal_account_link', coalesce(v_previous_internal, 'false'), true);
    perform private.link_existing_client_to_auth_user(new.id, new.email, v_meta_phone, v_meta_whatsapp, v_meta_name, v_meta_piece);
    if exists (select 1 from public.clients c where c.user_id = new.id)
       and not exists (select 1 from public.user_roles ur where ur.user_id = new.id) then
      delete from public.profiles p where p.user_id = new.id;
    end if;
    return new;
  end if;

  insert into public.profiles (id,user_id,email,nom_complet,username,actif)
  values (new.id, new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'nom_complet',''), split_part(new.email,'@',1)), v_username, not v_pending)
  on conflict (id) do update
    set user_id = excluded.user_id,
        email = excluded.email,
        nom_complet = excluded.nom_complet,
        username = excluded.username,
        actif = case when v_pending then false else public.profiles.actif end;

  perform private.link_existing_client_to_auth_user(new.id, new.email, v_meta_phone, v_meta_whatsapp, v_meta_name, v_meta_piece);
  if exists (select 1 from public.clients c where c.user_id = new.id)
     and not exists (select 1 from public.user_roles ur where ur.user_id = new.id) then
    delete from public.profiles p where p.user_id = new.id;
  end if;
  return new;
end;
$function$;

-- Remove only internal user/role records for these six known clients.
with target_clients as (
  select c.user_id from public.clients c
  where c.user_id is not null
    and lower(regexp_replace(trim(coalesce(c.nom_complet, concat_ws(' ', c.prenoms, c.nom_famille), c.nom, '')), '[[:space:]]+', ' ', 'g')) in (
      'dadegoulehe darius','kouakou konan donald','kouakou kouame ferdinand',
      'tionon madou','vanie bi bertin','yao kouakou guy laurent'
    )
)
delete from public.user_roles ur where ur.user_id in (select user_id from target_clients);

with target_clients as (
  select c.user_id from public.clients c
  where c.user_id is not null
    and lower(regexp_replace(trim(coalesce(c.nom_complet, concat_ws(' ', c.prenoms, c.nom_famille), c.nom, '')), '[[:space:]]+', ' ', 'g')) in (
      'dadegoulehe darius','kouakou konan donald','kouakou kouame ferdinand',
      'tionon madou','vanie bi bertin','yao kouakou guy laurent'
    )
)
delete from public.profiles p
where p.user_id in (select user_id from target_clients)
  and lower(regexp_replace(trim(coalesce(p.nom_complet, '')), '[[:space:]]+', ' ', 'g')) in (
    'dadegoulehe darius','kouakou konan donald','kouakou kouame ferdinand',
    'tionon madou','vanie bi bertin','yao kouakou guy laurent'
  )
  and not exists (select 1 from public.user_roles ur where ur.user_id = p.user_id and ur.role = 'pdg');
