-- Correct planning form constraints and align reconciliation with the live finance journal vocabulary.
alter table public.strategic_plans drop constraint if exists strategic_plans_horizon_check;
alter table public.strategic_plans add constraint strategic_plans_horizon_check
  check (planning_horizon in ('annual','multi_year','quarterly','monthly','operational'));

create or replace view public.v_planning_budget_reconciliation
with (security_invoker=true) as
select
  b.id as budget_id,
  b.plan_id,
  b.department,
  b.category,
  b.project_name,
  b.activity_name,
  b.period_start,
  b.period_end,
  coalesce(sum(case
    when lower(coalesce(t.direction,'')) in ('sortie','out','expense','debit')
     and lower(coalesce(t.status,'')) in ('valide','paid','completed','validated','approved','confirmed')
    then a.allocated_amount else 0 end),0) as linked_actual_expenses,
  coalesce(sum(case
    when lower(coalesce(t.direction,'')) in ('entree','in','income','credit','revenue')
     and lower(coalesce(t.status,'')) in ('valide','paid','completed','validated','approved','confirmed')
    then a.allocated_amount else 0 end),0) as linked_actual_revenue,
  count(distinct t.id) filter (
    where lower(coalesce(t.status,'')) in ('valide','paid','completed','validated','approved','confirmed')
  ) as linked_transactions,
  b.actual_amount as manually_entered_actual_amount,
  b.actual_revenue as manually_entered_actual_revenue,
  coalesce(sum(a.allocated_amount),0) as total_allocated
from public.department_budgets b
left join public.finance_transaction_budget_allocations a on a.budget_id=b.id
left join public.finance_transactions t on t.id=a.transaction_id
group by b.id,b.plan_id,b.department,b.category,b.project_name,b.activity_name,
  b.period_start,b.period_end,b.actual_amount,b.actual_revenue;

-- Explicit SQL privileges are required in addition to row-level security policies.
grant select, insert, update, delete on public.finance_transaction_budget_allocations to authenticated;
grant select on public.v_planning_budget_reconciliation to authenticated;
