-- Publish internal collaboration events to Supabase Realtime, without changing existing data.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['internal_conversations','internal_conversation_members','internal_messages','internal_message_receipts','internal_message_reactions','internal_meetings','internal_meeting_participants'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
grant select,insert,update,delete on public.internal_conversations,public.internal_conversation_members,public.internal_messages,public.internal_message_receipts,public.internal_message_reactions,public.internal_meetings,public.internal_meeting_participants to authenticated;
grant select,insert,update,delete on public.finance_historical_import_batches,public.finance_historical_ledger to authenticated;
alter table public.internal_messages replica identity full;
alter table public.internal_conversations replica identity full;
alter table public.internal_meetings replica identity full;