create or replace function public.set_strategic_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create or replace function public.audit_strategic_plan_change()
returns trigger language plpgsql set search_path = public as $$
declare v_plan_id uuid; v_entity_id uuid; v_before jsonb; v_after jsonb; v_action text;
begin
 if TG_OP = 'DELETE' then v_entity_id := OLD.id; v_before := to_jsonb(OLD); v_after := null; v_action := 'delete';
 else v_entity_id := NEW.id; v_after := to_jsonb(NEW); v_before := case when TG_OP='UPDATE' then to_jsonb(OLD) else null end; v_action := lower(TG_OP); end if;
 if TG_TABLE_NAME='strategic_plans' then v_plan_id := v_entity_id;
 elsif TG_OP='DELETE' then v_plan_id := OLD.plan_id;
 else v_plan_id := NEW.plan_id; end if;
 insert into public.strategic_plan_audit(plan_id,entity_type,entity_id,action,before_data,after_data,actor_id)
 values(v_plan_id,TG_TABLE_NAME,v_entity_id,v_action,v_before,v_after,auth.uid());
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end; $$;
drop trigger if exists strategic_plans_updated_at on public.strategic_plans;
create trigger strategic_plans_updated_at before update on public.strategic_plans for each row execute function public.set_strategic_updated_at();
drop trigger if exists strategic_actions_updated_at on public.strategic_actions;
create trigger strategic_actions_updated_at before update on public.strategic_actions for each row execute function public.set_strategic_updated_at();
drop trigger if exists department_budgets_updated_at on public.department_budgets;
create trigger department_budgets_updated_at before update on public.department_budgets for each row execute function public.set_strategic_updated_at();
drop trigger if exists strategic_plans_audit on public.strategic_plans;
create trigger strategic_plans_audit after insert or update or delete on public.strategic_plans for each row execute function public.audit_strategic_plan_change();
drop trigger if exists strategic_actions_audit on public.strategic_actions;
create trigger strategic_actions_audit after insert or update or delete on public.strategic_actions for each row execute function public.audit_strategic_plan_change();
drop trigger if exists department_budgets_audit on public.department_budgets;
create trigger department_budgets_audit after insert or update or delete on public.department_budgets for each row execute function public.audit_strategic_plan_change();