create or replace function public.internal_is_conversation_owner(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(select 1 from public.internal_conversations c
    where c.id=p_conversation_id and c.created_by_profile_id=public.internal_current_profile_id())
$$;
revoke all on function public.internal_is_conversation_owner(uuid) from public;
grant execute on function public.internal_is_conversation_owner(uuid) to authenticated;
drop policy if exists internal_members_insert on public.internal_conversation_members;
create policy internal_members_insert on public.internal_conversation_members for insert to authenticated
with check (
  public.internal_is_conversation_owner(conversation_id)
  and exists (select 1 from public.profiles p where p.id=profile_id and coalesce(p.actif,false)=true and p.user_id is not null)
);
drop policy if exists internal_members_delete on public.internal_conversation_members;
create policy internal_members_delete on public.internal_conversation_members for delete to authenticated
using (public.internal_is_conversation_owner(conversation_id));