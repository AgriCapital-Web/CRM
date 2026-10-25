-- Return only the room identifier needed by the external guest call UI.
drop function if exists public.workspace_redeem_external_meeting_invite(text);
create function public.workspace_redeem_external_meeting_invite(p_token_hash text)
returns table(meeting_id uuid, meeting_title text, starts_at timestamptz, ends_at timestamptz, join_url text, provider_room_id text, invitee_name text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invite public.internal_external_meeting_invites%rowtype;
begin
 if length(coalesce(p_token_hash,'')) < 40 or length(p_token_hash) > 128 then return; end if;
 select * into v_invite from public.internal_external_meeting_invites i where i.token_hash=p_token_hash and i.revoked_at is null and i.expires_at>now() and i.use_count<i.max_uses for update;
 if not found then return; end if;
 update public.internal_external_meeting_invites set use_count=use_count+1 where id=v_invite.id;
 return query select m.id,m.title,m.starts_at,m.ends_at,m.join_url,m.provider_room_id,v_invite.invitee_name from public.internal_meetings m where m.id=v_invite.meeting_id and m.status not in ('cancelled','canceled');
end $$;
revoke all on function public.workspace_redeem_external_meeting_invite(text) from public,authenticated;
grant execute on function public.workspace_redeem_external_meeting_invite(text) to anon,authenticated;
