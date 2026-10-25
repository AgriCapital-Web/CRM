-- AgriCapital 360: keep formal meetings synchronized with the personal/team calendar.
-- The trigger runs only for persisted meetings; it does not invent a second meeting record.
create or replace function public.workspace_sync_meeting_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    update public.workspace_events
       set status = 'cancelled', updated_at = now()
     where linked_meeting_id = old.id and status <> 'cancelled';
    return old;
  end if;

  insert into public.workspace_events
    (title, description, event_type, visibility, starts_at, ends_at, all_day,
     timezone, status, created_by_profile_id, linked_meeting_id, created_at, updated_at)
  values
    (new.title, coalesce(new.description, new.agenda), 'meeting', 'participants',
     new.starts_at, new.ends_at, false, 'Africa/Abidjan',
     case when new.status in ('cancelled','canceled') then 'cancelled'
          when new.status in ('completed','finished') then 'completed'
          else 'scheduled' end,
     new.created_by_profile_id, new.id, now(), now())
  on conflict (linked_meeting_id) do update set
    title = excluded.title,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists workspace_sync_meeting_calendar_trigger on public.internal_meetings;
create trigger workspace_sync_meeting_calendar_trigger
after insert or update of title, description, agenda, starts_at, ends_at, status
on public.internal_meetings
for each row execute function public.workspace_sync_meeting_calendar();

create unique index if not exists workspace_events_linked_meeting_uidx
  on public.workspace_events(linked_meeting_id) where linked_meeting_id is not null;

create index if not exists workspace_events_owner_start_idx
  on public.workspace_events(created_by_profile_id, starts_at desc);
create index if not exists workspace_tasks_creator_due_idx
  on public.workspace_tasks(created_by_profile_id, due_at);
create index if not exists workspace_projects_owner_due_idx
  on public.workspace_projects(owner_profile_id, due_on);
