-- Trigger-only routines must not be callable as PostgREST RPC endpoints.
-- PostgreSQL executes a trigger function through its trigger; callers do not need EXECUTE.
revoke all on function public.workspace_notify_event_participant() from public, anon, authenticated;
revoke all on function public.workspace_notify_project_owner() from public, anon, authenticated;
revoke all on function public.workspace_notify_strategic_action_owner() from public, anon, authenticated;
revoke all on function public.workspace_notify_task_assignment() from public, anon, authenticated;
revoke all on function public.workspace_queue_event_reminder() from public, anon, authenticated;
revoke all on function public.workspace_queue_task_reminder() from public, anon, authenticated;
revoke all on function public.workspace_sync_meeting_calendar() from public, anon, authenticated;
