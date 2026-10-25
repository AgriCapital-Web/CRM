-- Per-event configurable reminders, internal participants and external email invitations.
alter table public.workspace_reminders
  add column if not exists reminder_offset_minutes integer,
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.workspace_event_external_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workspace_events(id) on delete cascade,
  email text not null check (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
  full_name text,
  invited_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  email_status text not null default 'queued' check (email_status in ('queued','sent','failed')),
  email_provider text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id,email)
);
alter table public.workspace_event_external_guests enable row level security;
drop policy if exists workspace_event_external_guests_read_owner on public.workspace_event_external_guests;
create policy workspace_event_external_guests_read_owner on public.workspace_event_external_guests
 for select to authenticated using (invited_by_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_event_external_guests_manage_owner on public.workspace_event_external_guests;
create policy workspace_event_external_guests_manage_owner on public.workspace_event_external_guests
 for all to authenticated using (invited_by_profile_id=public.internal_current_profile_id())
 with check (invited_by_profile_id=public.internal_current_profile_id());
grant select,insert,update,delete on public.workspace_event_external_guests to authenticated;
revoke all on public.workspace_event_external_guests from anon;

create index if not exists workspace_event_external_guests_pending_idx
 on public.workspace_event_external_guests(created_at) where email_status='queued';

-- Keep a default 15-minute reminder; the event form replaces it with the creator's selection.
create or replace function public.workspace_queue_event_reminder()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.workspace_reminders set status='cancelled'
 where event_id=new.id and status='pending';
 if new.status='scheduled' then
  insert into public.workspace_reminders(recipient_profile_id,event_id,remind_at,channel,reminder_offset_minutes,created_by_profile_id)
  values(new.created_by_profile_id,new.id,greatest(now(),new.starts_at-interval '15 minutes'),'in_app',15,new.created_by_profile_id);
 end if;
 return new;
end $$;
