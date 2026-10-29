-- Apply a single consistent AgriCapital identity and idempotency key to in-app notifications.
create or replace function public.prepare_agricapital_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_identity text;
  v_minute text;
begin
  if new.dedupe_key is null or btrim(new.dedupe_key) = '' then
    v_identity := coalesce(
      nullif(new.data->>'dedupe_key',''),
      nullif(new.data->>'payment_id',''),
      nullif(new.data->>'paiement_id',''),
      nullif(new.data->>'document_id',''),
      nullif(new.data->>'comment_id',''),
      nullif(new.data->>'intervention_id',''),
      nullif(new.data->>'visite_id',''),
      nullif(new.data->>'recolte_id',''),
      nullif(new.data->>'plantation_id',''),
      nullif(new.data->>'account_request_id',''),
      nullif(new.data->>'request_id',''),
      nullif(new.data->>'transaction_id',''),
      nullif(new.data->>'event_id',''),
      nullif(new.data->>'campaign_id',''),
      nullif(new.data->>'automation_id','')
    );
    if v_identity is null then
      v_minute := to_char(date_trunc('minute', now() at time zone 'UTC'), 'YYYYMMDDHH24MI');
      v_identity := 'minute:' || v_minute || ':' || md5(coalesce(new.title,'') || '|' || coalesce(new.message,''));
    end if;
    new.dedupe_key := left('agricapital:' || coalesce(new.user_id::text,'unknown') || ':' ||
      coalesce(new.type,'notification') || ':' || v_identity, 250);
  end if;

  if new.title is not null and new.title <> '' and new.title !~* '^AgriCapital\s*[·|—-]' then
    new.title := 'AgriCapital · ' || new.title;
  end if;
  if new.message is not null and new.message <> ''
     and new.message !~* 'notification automatique'
     and new.message !~* '^AgriCapital\s*\(auto\)' then
    new.message := 'AgriCapital · Notification automatique : ' || new.message;
  end if;

  if exists (select 1 from public.notifications n where n.dedupe_key = new.dedupe_key) then
    return null;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_prepare_agricapital_notification on public.notifications;
create trigger trg_prepare_agricapital_notification
before insert on public.notifications
for each row execute function public.prepare_agricapital_notification();
