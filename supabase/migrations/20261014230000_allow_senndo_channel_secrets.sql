CREATE OR REPLACE FUNCTION private.senndo_get_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'vault', 'private'
AS $function$
DECLARE v_value text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_name NOT IN ('senndo_api_key','senndo_webhook_secret','senndo_email_sender_id','senndo_whatsapp_sender_phone') THEN
    RAISE EXCEPTION 'invalid secret name' USING errcode = '22023';
  END IF;
  SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
  RETURN v_value;
END;
$function$;

CREATE OR REPLACE FUNCTION private.senndo_store_secret(p_name text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'vault', 'private'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_name NOT IN ('senndo_api_key','senndo_webhook_secret','senndo_email_sender_id','senndo_whatsapp_sender_phone') THEN
    RAISE EXCEPTION 'invalid secret name' USING errcode = '22023';
  END IF;
  IF p_value IS NULL OR length(trim(p_value)) < 8 OR length(p_value) > 4096 THEN
    RAISE EXCEPTION 'invalid secret value' USING errcode = '22023';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'AgriCapital Senndo integration secret', NULL);
  ELSE
    PERFORM vault.update_secret(v_id, p_value, p_name, 'AgriCapital Senndo integration secret', NULL);
  END IF;
END;
$function$;