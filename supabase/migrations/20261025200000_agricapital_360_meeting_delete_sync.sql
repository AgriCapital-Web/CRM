-- Keep the workspace calendar consistent when a formal meeting is deleted.
-- The shared trigger function marks the linked calendar event as cancelled.
drop trigger if exists workspace_sync_meeting_calendar_delete_trigger on public.internal_meetings;
create trigger workspace_sync_meeting_calendar_delete_trigger
after delete on public.internal_meetings
for each row execute function public.workspace_sync_meeting_calendar();
