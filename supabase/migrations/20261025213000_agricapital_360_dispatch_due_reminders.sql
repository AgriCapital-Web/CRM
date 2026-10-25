-- Deliver due in-app reminders on a one-minute schedule.
create or replace function public.workspace_dispatch_due_reminders()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; v_count integer := 0;
begin
 for r in select id,recipient_profile_id,event_id,task_id from public.workspace_reminders where status='pending' and remind_at<=now() order by remind_at for update skip locked limit 200 loop
  if r.event_id is not null then
   insert into public.workspace_notifications(recipient_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
   select r.recipient_profile_id,'event_reminder','Rappel de calendrier',e.title||' commence à '||to_char(e.starts_at at time zone 'Africa/Abidjan','DD/MM/YYYY HH24:MI'),'/connect?module=activities','workspace_event',e.id from public.workspace_events e where e.id=r.event_id and e.status='scheduled';
  elsif r.task_id is not null then
   insert into public.workspace_notifications(recipient_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
   select r.recipient_profile_id,'task_reminder','Rappel de tâche',t.title||case when t.due_at is not null then ' — échéance '||to_char(t.due_at at time zone 'Africa/Abidjan','DD/MM/YYYY HH24:MI') else '' end,'/connect?module=activities','workspace_task',t.id from public.workspace_tasks t where t.id=r.task_id and t.status not in ('done','cancelled');
  end if;
  update public.workspace_reminders set status='sent',sent_at=now(),attempts=attempts+1 where id=r.id;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function public.workspace_dispatch_due_reminders() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from cron.job where jobname='agricapital-360-reminders-every-minute') then
  perform cron.schedule('agricapital-360-reminders-every-minute','* * * * *','select public.workspace_dispatch_due_reminders();');
 end if;
end $$;
