create or replace function public.workspace_notify_project_owner()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.owner_profile_id is not null then
    insert into public.workspace_notifications(recipient_profile_id,actor_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
    values(new.owner_profile_id,null,'project_assigned','Projet attribué',new.name || case when new.due_on is not null then ' — échéance ' || to_char(new.due_on,'DD/MM/YYYY') else '' end,'/connect?module=activities','workspace_project',new.id);
  end if;
  return new;
end $$;