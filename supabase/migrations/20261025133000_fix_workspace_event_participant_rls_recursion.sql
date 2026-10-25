-- Break the RLS cycle between workspace_events and workspace_event_participants.
create or replace function public.workspace_event_is_owner(p_event_id uuid,p_profile_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_events e where e.id=p_event_id and e.created_by_profile_id=p_profile_id);
$$;
revoke all on function public.workspace_event_is_owner(uuid,uuid) from public;
grant execute on function public.workspace_event_is_owner(uuid,uuid) to authenticated;
drop policy if exists workspace_event_participants_manage on public.workspace_event_participants;
create policy workspace_event_participants_manage on public.workspace_event_participants for all to authenticated
using(public.workspace_event_is_owner(event_id,public.internal_current_profile_id()))
with check(public.workspace_event_is_owner(event_id,public.internal_current_profile_id()));
drop policy if exists workspace_event_participants_read on public.workspace_event_participants;
create policy workspace_event_participants_read on public.workspace_event_participants for select to authenticated
using(profile_id=public.internal_current_profile_id() or public.workspace_event_is_owner(event_id,public.internal_current_profile_id()));