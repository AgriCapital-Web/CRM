-- Unified agenda: persisted recurrence and reminder preferences for workspace events.
alter table public.workspace_events
  add column if not exists recurrence_rule text not null default 'none',
  add column if not exists reminder_offset_minutes integer,
  add column if not exists alarm_enabled boolean not null default false;

alter table public.workspace_events
  drop constraint if exists workspace_events_recurrence_rule_check;
alter table public.workspace_events
  add constraint workspace_events_recurrence_rule_check
  check (recurrence_rule in ('none','daily','weekly','monthly','yearly'));

alter table public.workspace_events
  drop constraint if exists workspace_events_reminder_offset_minutes_check;
alter table public.workspace_events
  add constraint workspace_events_reminder_offset_minutes_check
  check (reminder_offset_minutes is null or reminder_offset_minutes >= 0);

comment on column public.workspace_events.recurrence_rule is 'Règle de répétition de l’événement dans l’agenda unifié.';
comment on column public.workspace_events.reminder_offset_minutes is 'Délai du rappel avant le début de l’événement, en minutes.';
comment on column public.workspace_events.alarm_enabled is 'Indique si un rappel CRM doit être programmé pour cet événement.';
