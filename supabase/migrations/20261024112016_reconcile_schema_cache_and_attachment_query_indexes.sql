-- Reconcile the live database's query-performance changes in version control.
-- Keep the PostgREST schema cache in sync after the migration is applied.
begin;
create index if not exists idx_internal_meeting_attachments_meeting_id on public.internal_meeting_attachments (meeting_id);
create index if not exists idx_internal_meeting_attachments_uploaded_by on public.internal_meeting_attachments (uploaded_by_profile_id);
create index if not exists idx_internal_message_attachments_conversation_id on public.internal_message_attachments (conversation_id);
create index if not exists idx_internal_message_attachments_message_id on public.internal_message_attachments (message_id);
create index if not exists idx_internal_message_attachments_uploaded_by on public.internal_message_attachments (uploaded_by_profile_id);
notify pgrst, 'reload schema';
commit;
