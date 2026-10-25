create or replace function public.workspace_event_has_participant(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_event_participants ep
    where ep.event_id = p_event_id and ep.profile_id = p_profile_id
  );
$$;
revoke all on function public.workspace_event_has_participant(uuid,uuid) from public;
grant execute on function public.workspace_event_has_participant(uuid,uuid) to authenticated;
drop policy if exists workspace_events_read on public.workspace_events;
create policy workspace_events_read on public.workspace_events
for select to authenticated
using (
  created_by_profile_id = public.internal_current_profile_id()
  or (visibility = 'team' and public.internal_current_profile_id() is not null)
  or public.workspace_event_has_participant(id, public.internal_current_profile_id())
);
drop policy if exists workspace_event_participants_read on public.workspace_event_participants;
create policy workspace_event_participants_read on public.workspace_event_participants
for select to authenticated
using (
  profile_id = public.internal_current_profile_id()
  or exists (
    select 1 from public.workspace_events e
    where e.id = workspace_event_participants.event_id
      and e.created_by_profile_id = public.internal_current_profile_id()
  )
);