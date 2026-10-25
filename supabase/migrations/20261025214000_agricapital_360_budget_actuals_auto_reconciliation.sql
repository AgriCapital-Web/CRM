-- Keep manual baseline values for audit, but expose linked expense/revenue transaction counts
-- so the UI can switch to ledger-derived actuals once allocations exist.
create or replace view public.v_planning_budget_reconciliation as
select b.id as budget_id,b.plan_id,b.department,b.category,b.project_name,b.activity_name,b.period_start,b.period_end,
 coalesce(sum(case when lower(coalesce(t.direction,''))=any(array['sortie','out','expense','debit']) and lower(coalesce(t.status,''))=any(array['valide','paid','completed','validated','approved','confirmed']) then a.allocated_amount else 0 end),0) as linked_actual_expenses,
 coalesce(sum(case when lower(coalesce(t.direction,''))=any(array['entree','in','income','credit','revenue']) and lower(coalesce(t.status,''))=any(array['valide','paid','completed','validated','approved','confirmed']) then a.allocated_amount else 0 end),0) as linked_actual_revenue,
 count(distinct t.id) filter(where lower(coalesce(t.status,''))=any(array['valide','paid','completed','validated','approved','confirmed'])) as linked_transactions,
 b.actual_amount as manually_entered_actual_amount,b.actual_revenue as manually_entered_actual_revenue,
 coalesce(sum(a.allocated_amount),0) as total_allocated,
 count(distinct t.id) filter(where lower(coalesce(t.direction,''))=any(array['sortie','out','expense','debit']) and lower(coalesce(t.status,''))=any(array['valide','paid','completed','validated','approved','confirmed'])) as linked_expense_transactions,
 count(distinct t.id) filter(where lower(coalesce(t.direction,''))=any(array['entree','in','income','credit','revenue']) and lower(coalesce(t.status,''))=any(array['valide','paid','completed','validated','approved','confirmed'])) as linked_revenue_transactions
from public.department_budgets b
left join public.finance_transaction_budget_allocations a on a.budget_id=b.id
left join public.finance_transactions t on t.id=a.transaction_id
group by b.id,b.plan_id,b.department,b.category,b.project_name,b.activity_name,b.period_start,b.period_end,b.actual_amount,b.actual_revenue;
