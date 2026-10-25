alter table public.workspace_notifications
  add column if not exists push_sent_at timestamptz;

update public.workspace_notifications
set push_sent_at = coalesce(created_at, now())
where push_sent_at is null;

create index if not exists idx_workspace_notifications_push_pending
  on public.workspace_notifications(created_at)
  where push_sent_at is null;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'agricapital-360-workspace-webpush-every-minute') then
    perform cron.schedule(
      'agricapital-360-workspace-webpush-every-minute',
      '* * * * *',
      $job$
      select net.http_post(
        url := 'https://rfzfsmpsuempafhkqhra.supabase.co/functions/v1/workspace-push-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-agricapital-automation-secret', public.notification_get_internal_secret()
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
      $job$
    );
  end if;
end $$;