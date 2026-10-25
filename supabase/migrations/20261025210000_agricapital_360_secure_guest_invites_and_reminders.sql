-- AgriCapital 360: secure external guest entry and durable reminder scheduling.
create table if not exists public.workspace_reminders (
 id uuid primary key default gen_random_uuid(),
 recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
 event_id uuid references public.workspace_events(id) on delete cascade,
 task_id uuid references public.workspace_tasks(id) on delete cascade,
 remind_at timestamptz not null,
 channel text not null default 'in_app' check(channel in ('in_app','email','sms','whatsapp')),
 status text not null default 'pending' check(status in ('pending','sent','cancelled','failed')),
 sent_at timestamptz, attempts integer not null default 0 check(attempts>=0), last_error text,
 created_at timestamptz not null default now(),
 check (((event_id is not null)::int + (task_id is not null)::int) = 1)
);
create index if not exists workspace_reminders_due_idx on public.workspace_reminders(remind_at) where status='pending';
create index if not exists workspace_reminders_recipient_idx on public.workspace_reminders(recipient_profile_id,remind_at desc);
alter table public.workspace_reminders enable row level security;
drop policy if exists workspace_reminders_read_own on public.workspace_reminders;
create policy workspace_reminders_read_own on public.workspace_reminders for select to authenticated using(recipient_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_reminders_manage_own on public.workspace_reminders;
create policy workspace_reminders_manage_own on public.workspace_reminders for all to authenticated using(recipient_profile_id=public.internal_current_profile_id()) with check(recipient_profile_id=public.internal_current_profile_id());
grant select,insert,update,delete on public.workspace_reminders to authenticated;
revoke all on public.workspace_reminders from anon;

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
 values(p_meeting_id,p_token_hash,nullif(trim(p_invitee_email),''),nullif(trim(p_invitee_name),''),p_expires_at,1,public.internal_current_profile_id()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.workspace_create_external_meeting_invite(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.workspace_create_external_meeting_invite(uuid,text,text,text,timestamptz) to authenticated;

create or replace function public.workspace_redeem_external_meeting_invite(p_token_hash text)
returns table(meeting_id uuid, meeting_title text, starts_at timestamptz, ends_at timestamptz, join_url text, invitee_name text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invite public.internal_external_meeting_invites%rowtype;
begin
 if length(coalesce(p_token_hash,'')) < 40 or length(p_token_hash) > 128 then return; end if;
 select * into v_invite from public.internal_external_meeting_invites i where i.token_hash=p_token_hash and i.revoked_at is null and i.expires_at>now() and i.use_count<i.max_uses for update;
 if not found then return; end if;
 update public.internal_external_meeting_invites set use_count=use_count+1 where id=v_invite.id;
 return query select m.id,m.title,m.starts_at,m.ends_at,m.join_url,v_invite.invitee_name from public.internal_meetings m where m.id=v_invite.meeting_id and m.status not in ('cancelled','canceled');
end $$;
revoke all on function public.workspace_redeem_external_meeting_invite(text) from public,authenticated;
grant execute on function public.workspace_redeem_external_meeting_invite(text) to anon,authenticated;

create or replace function public.workspace_queue_task_reminder()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.workspace_reminders set status='cancelled' where task_id=new.id and status='pending';
 if new.due_at is not null and new.status not in ('done','cancelled') then
  insert into public.workspace_reminders(recipient_profile_id,task_id,remind_at,channel)
  values(coalesce(new.assigned_to_profile_id,new.created_by_profile_id),new.id,greatest(now(),new.due_at-interval '15 minutes'),'in_app');
 end if;
 return new;
end $$;
drop trigger if exists workspace_task_reminder_queue on public.workspace_tasks;
create trigger workspace_task_reminder_queue after insert or update of due_at,assigned_to_profile_id,status on public.workspace_tasks for each row execute function public.workspace_queue_task_reminder();

create or replace function public.workspace_queue_event_reminder()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.workspace_reminders set status='cancelled' where event_id=new.id and status='pending';
 if new.status='scheduled' then
  insert into public.workspace_reminders(recipient_profile_id,event_id,remind_at,channel)
  values(new.created_by_profile_id,new.id,greatest(now(),new.starts_at-interval '15 minutes'),'in_app');
 end if;
 return new;
end $$;
drop trigger if exists workspace_event_reminder_queue on public.workspace_events;
create trigger workspace_event_reminder_queue after insert or update of starts_at,status on public.workspace_events for each row execute function public.workspace_queue_event_reminder();

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_reminders') then alter publication supabase_realtime add table public.workspace_reminders; end if;
exception when undefined_object then null; end $$;
