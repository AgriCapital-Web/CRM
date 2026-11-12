-- Global 24-hour notification de-duplication across campaigns, automations and channels.
-- The fingerprint is based only on normalized recipient digits + normalized message body.
-- A scope/event key must never allow the same text to bypass the global guard.

create or replace function public.notification_claim_send_guard(
  p_recipient text, p_channel text, p_content text
) returns boolean
language plpgsql
set search_path = public
as $function$
declare
  v_recipient text := regexp_replace(coalesce(p_recipient,''), '[^0-9]', '', 'g');
  v_content text := lower(regexp_replace(trim(coalesce(p_content,'')), '[[:space:]]+', ' ', 'g'));
  v_fingerprint text;
  v_rows integer;
begin
  if v_recipient = '' or v_content = '' then return true; end if;
  delete from public.notification_send_guard where expires_at <= now();
  v_fingerprint := md5(v_recipient || chr(31) || v_content);
  insert into public.notification_send_guard(fingerprint, recipient_key, channel, content_hash, status, expires_at)
  values (v_fingerprint, v_recipient, coalesce(p_channel,'unknown'), md5(v_content), 'reserved', now() + interval '24 hours')
  on conflict (fingerprint) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;

create or replace function public.notification_finish_send_guard(
  p_recipient text, p_channel text, p_content text, p_message_id text default null
) returns void
language plpgsql
set search_path = public
as $function$
declare
  v_recipient text := regexp_replace(coalesce(p_recipient,''), '[^0-9]', '', 'g');
  v_content text := lower(regexp_replace(trim(coalesce(p_content,'')), '[[:space:]]+', ' ', 'g'));
begin
  if v_recipient = '' or v_content = '' then return; end if;
  update public.notification_send_guard
  set status='accepted', provider_message_id=p_message_id
  where fingerprint=md5(v_recipient || chr(31) || v_content);
end;
$function$;

create or replace function public.notification_release_send_guard(
  p_recipient text, p_channel text, p_content text
) returns void
language plpgsql
set search_path = public
as $function$
declare
  v_recipient text := regexp_replace(coalesce(p_recipient,''), '[^0-9]', '', 'g');
  v_content text := lower(regexp_replace(trim(coalesce(p_content,'')), '[[:space:]]+', ' ', 'g'));
begin
  if v_recipient = '' or v_content = '' then return; end if;
  delete from public.notification_send_guard
  where fingerprint=md5(v_recipient || chr(31) || v_content)
    and status='reserved';
end;
$function$;

create or replace function public.notification_claim_send_guard(
  p_recipient text, p_channel text, p_content text, p_scope text
) returns boolean
language plpgsql
set search_path = public
as $function$
begin
  return public.notification_claim_send_guard(p_recipient,p_channel,p_content);
end;
$function$;

create or replace function public.notification_finish_send_guard(
  p_recipient text, p_channel text, p_content text, p_message_id text, p_scope text
) returns void
language plpgsql
set search_path = public
as $function$
begin
  perform public.notification_finish_send_guard(p_recipient,p_channel,p_content,p_message_id);
end;
$function$;

create or replace function public.notification_release_send_guard(
  p_recipient text, p_channel text, p_content text, p_scope text
) returns void
language plpgsql
set search_path = public
as $function$
begin
  perform public.notification_release_send_guard(p_recipient,p_channel,p_content);
end;
$function$;

-- Backfill the active de-duplication window from messages already accepted by Senndo.
insert into public.notification_send_guard
(fingerprint,recipient_key,channel,content_hash,status,provider_message_id,created_at,expires_at)
select distinct on (fingerprint)
  fingerprint,recipient_key,channel,content_hash,'accepted',provider_message_id,
  sent_at,sent_at + interval '24 hours'
from (
  select
    md5(regexp_replace(coalesce(recipient_phone,''),'[^0-9]','','g') || chr(31) ||
        lower(regexp_replace(trim(coalesce(contenu,'')),'[[:space:]]+',' ','g'))) as fingerprint,
    regexp_replace(coalesce(recipient_phone,''),'[^0-9]','','g') as recipient_key,
    coalesce(canal,'unknown') as channel,
    md5(lower(regexp_replace(trim(coalesce(contenu,'')),'[[:space:]]+',' ','g'))) as content_hash,
    provider_message_id,
    coalesce(sent_at,created_at) as sent_at
  from public.notification_deliveries
  where statut in ('envoye','livre','lu')
    and coalesce(sent_at,created_at) >= now() - interval '24 hours'
    and nullif(regexp_replace(coalesce(recipient_phone,''),'[^0-9]','','g'),'') is not null
    and nullif(trim(coalesce(contenu,'')),'') is not null
) sent
where sent_at + interval '24 hours' > now()
on conflict (fingerprint) do update
set status='accepted',
    provider_message_id=coalesce(excluded.provider_message_id,public.notification_send_guard.provider_message_id),
    expires_at=greatest(public.notification_send_guard.expires_at,excluded.expires_at);
