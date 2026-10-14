-- Keep delivery claiming atomic while a notification is being dispatched.
-- This prevents parallel cron/manual dispatches from sending the same push twice.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_statut_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_statut_check
  check (statut = any (array[
    'en_attente'::text,
    'en_cours'::text,
    'envoye'::text,
    'livre'::text,
    'echoue'::text,
    'ignore'::text
  ]));
