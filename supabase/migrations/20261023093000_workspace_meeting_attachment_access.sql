drop policy if exists internal_workspace_files_read on storage.objects;
create policy internal_workspace_files_read on storage.objects for select to authenticated
using (
 bucket_id='internal-message-attachments'
 and (
   exists(select 1 from public.internal_message_attachments a where a.storage_path=storage.objects.name and public.internal_is_conversation_member(a.conversation_id))
   or exists(select 1 from public.internal_meeting_attachments a where a.storage_path=storage.objects.name and public.internal_can_read_meeting(a.meeting_id))
 )
);
