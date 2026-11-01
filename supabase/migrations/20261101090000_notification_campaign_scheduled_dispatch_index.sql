-- Accelerate the scheduled notification campaign queue.
-- Dispatch is performed by notification-cron -> notification-dispatch(run_scheduled_campaigns).
create index if not exists idx_notification_campaigns_due_schedule
  on public.notification_campaigns (programme_le asc)
  where statut = 'programme' and programme_le is not null;
