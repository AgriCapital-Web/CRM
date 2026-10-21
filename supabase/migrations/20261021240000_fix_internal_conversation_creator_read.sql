drop policy if exists internal_conversations_read on public.internal_conversations;
create policy internal_conversations_read on public.internal_conversations for select to authenticated
using (created_by_profile_id=public.internal_current_profile_id() or public.internal_is_conversation_member(id));