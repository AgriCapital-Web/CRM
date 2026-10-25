create or replace function public.workspace_notify_task_assignment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.assigned_to_profile_id is not null
     and new.assigned_to_profile_id is distinct from new.created_by_profile_id
     and (tg_op = 'INSERT' or new.assigned_to_profile_id is distinct from old.assigned_to_profile_id) then
    insert into public.workspace_notifications(recipient_profile_id,actor_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
    values(new.assigned_to_profile_id,new.created_by_profile_id,'task_assigned','Nouvelle tâche attribuée',new.title || case when new.due_at is not null then ' — échéance ' || to_char(new.due_at at time zone 'Africa/Abidjan','DD/MM/YYYY HH24:MI') else '' end,'/connect?module=activities','workspace_task',new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_workspace_notify_task_assignment on public.workspace_tasks;
create trigger trg_workspace_notify_task_assignment after insert or update of assigned_to_profile_id on public.workspace_tasks for each row execute function public.workspace_notify_task_assignment();

create or replace function public.workspace_notify_event_participant()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.workspace_events%rowtype;
begin
  select * into e from public.workspace_events where id=new.event_id;
  if not found then return new; end if;
  if new.profile_id is not null and new.profile_id is distinct from e.created_by_profile_id then
    insert into public.workspace_notifications(recipient_profile_id,actor_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
    values(new.profile_id,e.created_by_profile_id,'event_invitation','Invitation à un événement',e.title || ' — ' || to_char(e.starts_at at time zone 'Africa/Abidjan','DD/MM/YYYY HH24:MI'),'/connect?module=activities','workspace_event',e.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_workspace_notify_event_participant on public.workspace_event_participants;
create trigger trg_workspace_notify_event_participant after insert on public.workspace_event_participants for each row execute function public.workspace_notify_event_participant();

create or replace function public.workspace_notify_project_owner()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.owner_profile_id is not null then
    insert into public.workspace_notifications(recipient_profile_id,actor_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
    values(new.owner_profile_id,null,'project_assigned','Projet attribué',new.name || case when new.due_on is not null then ' — échéance ' || to_char(new.due_on,'DD/MM/YYYY') else '' end,'/connect?module=activities','workspace_project',new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_workspace_notify_project_owner on public.workspace_projects;
create trigger trg_workspace_notify_project_owner after insert on public.workspace_projects for each row execute function public.workspace_notify_project_owner();