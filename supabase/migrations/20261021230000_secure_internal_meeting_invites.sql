-- Only the meeting creator can add participants. Invitees can update their own RSVP.
drop policy if exists internal_meeting_participants_insert on public.internal_meeting_participants;
create policy internal_meeting_participants_insert
on public.internal_meeting_participants
for insert to authenticated
with check (
  exists (
    select 1 from public.internal_meetings m
    where m.id = meeting_id
      and m.created_by_profile_id = public.internal_current_profile_id()
  )
);

-- Keep collaboration changes live in environments where the base migration was applied separately.
do $$
declare t text;
begin
  foreach t in array array[
    'internal_conversations',
    'internal_conversation_members',
    'internal_messages',
    'internal_message_receipts',
    'internal_message_reactions',
    'internal_meetings',
    'internal_meeting_participants'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
