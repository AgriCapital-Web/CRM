create or replace function public.workspace_notify_strategic_action_owner()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.owner_profile_id is not null
     and (tg_op = 'INSERT' or new.owner_profile_id is distinct from old.owner_profile_id) then
    insert into public.workspace_notifications(recipient_profile_id,actor_profile_id,notification_type,title,body,target_path,entity_type,entity_id)
    values(new.owner_profile_id,null,'strategic_action_assigned','Action du plan d’action attribuée',new.title || case when new.due_on is not null then ' — échéance ' || to_char(new.due_on,'DD/MM/YYYY') else '' end,'/connect?module=budgets','strategic_action',new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_workspace_notify_strategic_action_owner on public.strategic_actions;
create trigger trg_workspace_notify_strategic_action_owner
after insert or update of owner_profile_id on public.strategic_actions
for each row execute function public.workspace_notify_strategic_action_owner();