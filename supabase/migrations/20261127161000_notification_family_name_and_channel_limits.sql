-- Unify recipient names and notification channel limits.
-- SMS remains limited to one GSM-7 message; the Edge Function performs the
-- final septet check after the family name has been inserted.
-- Automatic routing allows up to 250 characters for international WhatsApp;
-- the dispatcher still enforces the shorter SMS limit for +225 destinations.

CREATE OR REPLACE FUNCTION public.enforce_notification_message_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF lower(coalesce(NEW.canal, '')) IN ('sms', 'email_sms')
     AND char_length(regexp_replace(btrim(coalesce(NEW.contenu, '')), '[[:space:]]+', ' ', 'g')) > 158 THEN
    RAISE EXCEPTION 'Le SMS ne peut pas dépasser 158 caractères, espaces et signes compris.';
  END IF;
  IF lower(coalesce(NEW.canal, '')) IN ('whatsapp', 'auto')
     AND char_length(coalesce(NEW.contenu, '')) > 250 THEN
    RAISE EXCEPTION 'Le message WhatsApp ne peut pas dépasser 250 caractères.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_notification_sms_length()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF lower(coalesce(NEW.canal, '')) IN ('sms', 'email_sms')
     AND char_length(coalesce(NEW.contenu, '')) > 158 THEN
    RAISE EXCEPTION 'Le SMS ne peut pas dépasser 158 caractères, espaces et signes compris.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_notification_campaign_sms_content_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  body_without_name text;
  content_limit integer;
BEGIN
  IF lower(coalesce(NEW.canal, '')) IN ('sms', 'email_sms') THEN
    SELECT sms_content_max_characters
      INTO content_limit
      FROM public.notification_channel_policy
      WHERE id = true;
    content_limit := coalesce(content_limit, 158);
    body_without_name := regexp_replace(
      coalesce(NEW.contenu, ''),
      '[{][[:space:]]*(dernier_prenom_nom|dernierprenom_nom|nom)[[:space:]]*[}]',
      '',
      'gi'
    );
    body_without_name := regexp_replace(body_without_name, '[[:space:]]+', ' ', 'g');
    IF char_length(btrim(body_without_name)) > content_limit THEN
      RAISE EXCEPTION 'Le contenu SMS de campagne dépasse % caractères hors nom.', content_limit
        USING errcode = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
