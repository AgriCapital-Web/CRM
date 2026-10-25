-- Allow a secure meeting link to be reopened by the same guest/device and avoid duplicate reminders.
create or replace function public.workspace_create_external_meeting_invite(
 p_meeting_id uuid, p_token_hash text, p_invitee_email text default null,
 p_invitee_name text default null, p_expires_at timestamptz default now() + interval '24 hours'
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null or public.internal_current_profile_id() is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_token_hash,'')) < 40 or length(p_token_hash) > 128 then raise exception 'Invalid invite token hash'; end if;
 if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then raise exception 'Invite expiry must be within 30 days'; end if;
 if not exists(select 1 from public.internal_meetings m where m.id=p_meeting_id and m.created_by_profile_id=public.internal_current_profile_id()) then raise exception 'Meeting not found or not owned'; end if;
 insert into public.internal_external_meeting_invites(meeting_id,token_hash,invitee_email,invitee_name,expires_at,max_uses,created_by_profile_id)
 values(p_meeting_id,p_token_hash,nullif(trim(p_invitee_email),''),nullif(trim(p_invitee_name),''),p_expires_at,20,public.internal_current_profile_id()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.workspace_create_external_meeting_invite(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.workspace_create_external_meeting_invite(uuid,text,text,text,timestamptz) to authenticated;
create or replace function public.workspace_queue_task_reminder()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.workspace_reminders set status='cancelled' where task_id=new.id and status='pending';
 if new.due_at is not null and new.status not in ('done','cancelled') then
  insert into public.workspace_reminders(recipient_profile_id,task_id,remind_at,channel)
  values(coalesce(new.assigned_to_profile_id,new.created_by_profile_id),new.id,greatest(now(),new.due_at-interval '15 minutes'),'in_app');
 end if; return new;
end $$;
create or replace function public.workspace_queue_event_reminder()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.workspace_reminders set status='cancelled' where event_id=new.id and status='pending';
 if new.status='scheduled' then
  insert into public.workspace_reminders(recipient_profile_id,event_id,remind_at,channel)
  values(new.created_by_profile_id,new.id,greatest(now(),new.starts_at-interval '15 minutes'),'in_app');
 end if; return new;
end $$;
