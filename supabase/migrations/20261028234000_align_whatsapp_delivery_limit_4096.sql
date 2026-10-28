-- Align WhatsApp delivery validation with the supported 4,096-character message limit.
-- The previous 350-character trigger rejected campaign delivery-row inserts before
-- provider dispatch, leaving campaigns marked failed with no per-recipient journal rows.
CREATE OR REPLACE FUNCTION public.enforce_notification_delivery_message_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.canal, '')) = 'sms'
     and char_length(regexp_replace(btrim(coalesce(new.contenu, '')), '\\s+', ' ', 'g')) > 155 then
    raise exception 'Le SMS ne peut pas dépasser 155 caractères, espaces et signes compris.';
  end if;
  if lower(coalesce(new.canal, '')) = 'whatsapp'
     and char_length(coalesce(new.contenu, '')) > 4096 then
    raise exception 'Le message WhatsApp ne peut pas dépasser 4096 caractères.';
  end if;
  return new;
end;
$function$;
