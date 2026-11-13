alter table public.notification_event_outbox
  add column if not exists claimed_at timestamptz;
alter table public.notification_event_outbox
  drop constraint if exists notification_event_outbox_statut_check;
alter table public.notification_event_outbox
  add constraint notification_event_outbox_statut_check
  check (statut = any (array['en_attente'::text,'en_cours'::text,'traite'::text,'echoue'::text]));

alter table public.client_account_provision_outbox
  add column if not exists claimed_at timestamptz;
alter table public.client_account_provision_outbox
  drop constraint if exists client_account_provision_outbox_statut_check;
alter table public.client_account_provision_outbox
  add constraint client_account_provision_outbox_statut_check
  check (statut = any (array['en_attente'::text,'en_cours'::text,'traite'::text,'echoue'::text]));