-- Automatically attach a new Auth identity to one unlinked CRM client when the identity is unambiguous.
-- Never match by name alone, never overwrite an existing user_id, and never expose this helper to API roles.

CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.internal_coverage_sync', true)='true'
     OR current_setting('app.internal_account_link', true)='true'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.user_id:=OLD.user_id;
  NEW.taux_commission:=OLD.taux_commission;
  NEW.poste:=OLD.poste;
  NEW.equipe_id:=OLD.equipe_id;
  NEW.actif:=OLD.actif;
  NEW.district_id:=OLD.district_id;
  NEW.region_id:=OLD.region_id;
  NEW.departement:=OLD.departement;
  NEW.relation_rh:=OLD.relation_rh;
  NEW.username:=OLD.username;
  NEW.email:=OLD.email;
  NEW.telephone:=OLD.telephone;
  NEW.telephone_indicatif:=OLD.telephone_indicatif;
  NEW.telephone_local:=OLD.telephone_local;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.internal_coverage_sync', true)='true'
     OR current_setting('app.internal_account_link', true)='true'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.taux_commission:=OLD.taux_commission;
  NEW.actif:=OLD.actif;
  NEW.equipe_id:=OLD.equipe_id;
  NEW.poste:=OLD.poste;
  NEW.district_id:=OLD.district_id;
  NEW.region_id:=OLD.region_id;
  NEW.departement:=OLD.departement;
  NEW.user_id:=OLD.user_id;
  NEW.username:=OLD.username;
  NEW.relation_rh:=OLD.relation_rh;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.validate_client_commercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF current_setting('app.internal_account_link', true)='true' THEN
    RETURN NEW;
  END IF;
  IF NEW.commercial_id IS NOT NULL AND NOT private.is_commercial_assignable(NEW.commercial_id) THEN
    RAISE EXCEPTION 'Le commercial sélectionné est inactif ou ne possède aucun rôle commercial autorisé.';
  END IF;
  IF NEW.commercial_id IS NOT NULL AND NOT private.can_assign_commercial_to(auth.uid(), NEW.commercial_id) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas attribuer ce Client à ce commercial.';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.link_existing_client_to_auth_user(
  p_user_id uuid, p_email text, p_phone text, p_whatsapp text, p_name text, p_piece text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id uuid;
  v_match_count integer := 0;
  v_updated integer := 0;
  v_name text := lower(regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_piece text := lower(trim(coalesce(p_piece, '')));
  v_previous_internal text;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  WITH candidates AS (
    SELECT c.id
    FROM public.clients c
    WHERE c.user_id IS NULL
      AND coalesce(c.is_internal, false) = false
      AND (
        (v_email <> '' AND lower(trim(coalesce(c.email, ''))) = v_email
          AND (v_name = '' OR lower(regexp_replace(trim(coalesce(nullif(c.nom_complet, ''), nullif(concat_ws(' ', c.nom_famille, c.prenoms), ''), c.nom, '')), '[[:space:]]+', ' ', 'g')) = v_name))
        OR (v_name <> ''
          AND lower(regexp_replace(trim(coalesce(nullif(c.nom_complet, ''), nullif(concat_ws(' ', c.nom_famille, c.prenoms), ''), c.nom, '')), '[[:space:]]+', ' ', 'g')) = v_name
          AND v_phone <> ''
          AND v_phone IN (regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), regexp_replace(coalesce(c.whatsapp, ''), '[^0-9]', '', 'g')))
        OR (v_name <> '' AND v_piece <> ''
          AND lower(regexp_replace(trim(coalesce(nullif(c.nom_complet, ''), nullif(concat_ws(' ', c.nom_famille, c.prenoms), ''), c.nom, '')), '[[:space:]]+', ' ', 'g')) = v_name
          AND lower(trim(coalesce(c.numero_piece, ''))) = v_piece)
        OR (v_name <> '' AND v_whatsapp <> ''
          AND lower(regexp_replace(trim(coalesce(nullif(c.nom_complet, ''), nullif(concat_ws(' ', c.nom_famille, c.prenoms), ''), c.nom, '')), '[[:space:]]+', ' ', 'g')) = v_name
          AND v_whatsapp IN (regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), regexp_replace(coalesce(c.whatsapp, ''), '[^0-9]', '', 'g')))
      )
  )
  SELECT count(*)::integer, (array_agg(id))[1]
    INTO v_match_count, v_client_id
  FROM candidates;

  -- Zero or multiple candidates are deliberately left unlinked for manual review.
  IF v_match_count <> 1 THEN RETURN NULL; END IF;

  v_previous_internal := current_setting('app.internal_account_link', true);
  PERFORM set_config('app.internal_account_link', 'true', true);
  UPDATE public.clients SET user_id = p_user_id, updated_at = now()
   WHERE id = v_client_id AND user_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('app.internal_account_link', coalesce(v_previous_internal, 'false'), true);

  IF v_updated <> 1 THEN RETURN NULL; END IF;
  RETURN v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION private.link_existing_client_to_auth_user(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_username text;
  v_pending boolean;
  v_existing_profile uuid;
  v_meta_name text;
  v_meta_phone text;
  v_meta_whatsapp text;
  v_meta_piece text;
  v_previous_internal text;
BEGIN
  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  v_pending := nullif(new.raw_user_meta_data->>'pending_role', '') IS NOT NULL;
  v_existing_profile := nullif(new.raw_user_meta_data->>'existing_profile_id','')::uuid;

  v_meta_name := lower(regexp_replace(trim(coalesce(
    new.raw_user_meta_data->>'nom_complet',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  )), '[[:space:]]+', ' ', 'g'));
  v_meta_phone := regexp_replace(coalesce(new.phone, new.raw_user_meta_data->>'telephone', ''), '[^0-9]', '', 'g');
  v_meta_whatsapp := regexp_replace(coalesce(new.raw_user_meta_data->>'whatsapp', ''), '[^0-9]', '', 'g');
  v_meta_piece := lower(trim(coalesce(
    new.raw_user_meta_data->>'numero_piece_identite',
    new.raw_user_meta_data->>'identity_document_number',
    ''
  )));

  IF v_existing_profile IS NULL AND new.email IS NOT NULL THEN
    SELECT p.id INTO v_existing_profile
    FROM public.profiles p
    WHERE p.user_id IS NULL
      AND lower(trim(coalesce(p.email,''))) = lower(trim(new.email))
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_profile IS NULL AND v_meta_name <> '' THEN
    SELECT p.id INTO v_existing_profile
    FROM public.profiles p
    WHERE p.user_id IS NULL
      AND lower(regexp_replace(trim(coalesce(p.nom_complet,'')), '[[:space:]]+', ' ', 'g')) = v_meta_name
      AND (
        (new.email IS NOT NULL AND lower(trim(coalesce(p.email,''))) = lower(trim(new.email)))
        OR (v_meta_phone <> '' AND v_meta_phone IN (
          regexp_replace(coalesce(p.telephone,''), '[^0-9]', '', 'g'),
          regexp_replace(coalesce(p.whatsapp,''), '[^0-9]', '', 'g')
        ))
        OR (v_meta_whatsapp <> '' AND v_meta_whatsapp IN (
          regexp_replace(coalesce(p.telephone,''), '[^0-9]', '', 'g'),
          regexp_replace(coalesce(p.whatsapp,''), '[^0-9]', '', 'g')
        ))
        OR (v_meta_piece <> '' AND lower(trim(coalesce(p.numero_piece_identite,''))) = v_meta_piece)
      )
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_profile IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_existing_profile AND user_id IS NULL) THEN
    v_previous_internal := current_setting('app.internal_account_link', true);
    PERFORM set_config('app.internal_account_link', 'true', true);

    UPDATE public.profiles
       SET user_id = new.id,
           email = coalesce(new.email, email),
           nom_complet = coalesce(nullif(new.raw_user_meta_data->>'nom_complet',''), nom_complet),
           username = coalesce(nullif(v_username,''), username),
           actif = CASE WHEN v_pending THEN false ELSE actif END
     WHERE id = v_existing_profile
       AND user_id IS NULL;

    PERFORM set_config('app.internal_account_link', coalesce(v_previous_internal, 'false'), true);

    PERFORM private.link_existing_client_to_auth_user(new.id, new.email, v_meta_phone, v_meta_whatsapp, v_meta_name, v_meta_piece);
    RETURN new;
  END IF;

  INSERT INTO public.profiles (id,user_id,email,nom_complet,username,actif)
  VALUES (
    new.id, new.id, new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nom_complet',''), split_part(new.email,'@',1)),
    v_username, NOT v_pending
  )
  ON CONFLICT (id) DO UPDATE
    SET user_id = excluded.user_id,
        email = excluded.email,
        nom_complet = excluded.nom_complet,
        username = excluded.username,
        actif = CASE WHEN v_pending THEN false ELSE public.profiles.actif END;

  PERFORM private.link_existing_client_to_auth_user(new.id, new.email, v_meta_phone, v_meta_whatsapp, v_meta_name, v_meta_piece);
  RETURN new;
END;
$function$;
