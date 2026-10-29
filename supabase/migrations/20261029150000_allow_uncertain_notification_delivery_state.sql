alter table public.notification_deliveries drop constraint if exists notification_deliveries_statut_check;
alter table public.notification_deliveries add constraint notification_deliveries_statut_check
check (statut = any (array['en_attente','en_cours','envoye','livre','echoue','ignore','incertain']::text[]));