-- AgriCapital 360: annual action planning and departmental budget control.
create table if not exists public.strategic_plans (
 id uuid primary key default gen_random_uuid(), fiscal_year integer not null check(fiscal_year between 2000 and 2200),
 title text not null check(length(trim(title)) between 3 and 180), strategic_objective text,
 status text not null default 'draft' check(status in ('draft','submitted','approved','active','closed','rejected')),
 assumptions text, created_by uuid not null default auth.uid() references auth.users(id),
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(fiscal_year,title));
create table if not exists public.strategic_actions (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.strategic_plans(id) on delete cascade,
 department text not null, team_id uuid references public.equipes(id) on delete set null,
 title text not null check(length(trim(title)) between 3 and 200), description text,
 owner_profile_id uuid references public.profiles(id) on delete set null, starts_on date, due_on date,
 indicator text, target_value numeric(18,2), current_value numeric(18,2) not null default 0, unit text,
 status text not null default 'planned' check(status in ('planned','in_progress','at_risk','completed','cancelled')),
 progress_percent numeric(5,2) not null default 0 check(progress_percent between 0 and 100),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), check(due_on is null or starts_on is null or due_on >= starts_on));
create table if not exists public.department_budgets (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.strategic_plans(id) on delete cascade,
 department text not null, category text not null, description text,
 budget_initial numeric(18,2) not null default 0 check(budget_initial>=0),
 budget_revised numeric(18,2) not null default 0 check(budget_revised>=0),
 committed_amount numeric(18,2) not null default 0 check(committed_amount>=0),
 actual_amount numeric(18,2) not null default 0 check(actual_amount>=0),
 revenue_forecast numeric(18,2) not null default 0 check(revenue_forecast>=0),
 actual_revenue numeric(18,2) not null default 0 check(actual_revenue>=0),
 status text not null default 'draft' check(status in ('draft','submitted','approved','locked')), justification text,
 created_by uuid not null default auth.uid() references auth.users(id), approved_by uuid references auth.users(id),
 approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(plan_id,department,category));
create table if not exists public.strategic_plan_audit (
 id bigint generated always as identity primary key, plan_id uuid references public.strategic_plans(id) on delete set null,
 entity_type text not null, entity_id uuid, action text not null, before_data jsonb, after_data jsonb,
 actor_id uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists strategic_plans_year_status_idx on public.strategic_plans(fiscal_year,status);
create index if not exists strategic_actions_plan_department_idx on public.strategic_actions(plan_id,department,status);
create index if not exists department_budgets_plan_department_idx on public.department_budgets(plan_id,department,status);
create index if not exists strategic_plan_audit_plan_created_idx on public.strategic_plan_audit(plan_id,created_at desc);
alter table public.strategic_plans enable row level security;
alter table public.strategic_actions enable row level security;
alter table public.department_budgets enable row level security;
alter table public.strategic_plan_audit enable row level security;
drop policy if exists strategic_plans_finance_read on public.strategic_plans;
create policy strategic_plans_finance_read on public.strategic_plans for select to authenticated using(public.finance_can_view());
drop policy if exists strategic_plans_finance_insert on public.strategic_plans;
create policy strategic_plans_finance_insert on public.strategic_plans for insert to authenticated with check(public.finance_can_manage() and created_by=auth.uid());
drop policy if exists strategic_plans_finance_update on public.strategic_plans;
create policy strategic_plans_finance_update on public.strategic_plans for update to authenticated using(public.finance_can_manage()) with check(public.finance_can_manage());
drop policy if exists strategic_actions_finance_read on public.strategic_actions;
create policy strategic_actions_finance_read on public.strategic_actions for select to authenticated using(public.finance_can_view());
drop policy if exists strategic_actions_finance_insert on public.strategic_actions;
create policy strategic_actions_finance_insert on public.strategic_actions for insert to authenticated with check(public.finance_can_manage() and created_by=auth.uid());
drop policy if exists strategic_actions_finance_update on public.strategic_actions;
create policy strategic_actions_finance_update on public.strategic_actions for update to authenticated using(public.finance_can_manage()) with check(public.finance_can_manage());
drop policy if exists strategic_actions_finance_delete on public.strategic_actions;
create policy strategic_actions_finance_delete on public.strategic_actions for delete to authenticated using(public.finance_can_manage());
drop policy if exists department_budgets_finance_read on public.department_budgets;
create policy department_budgets_finance_read on public.department_budgets for select to authenticated using(public.finance_can_view());
drop policy if exists department_budgets_finance_insert on public.department_budgets;
create policy department_budgets_finance_insert on public.department_budgets for insert to authenticated with check(public.finance_can_manage() and created_by=auth.uid());
drop policy if exists department_budgets_finance_update on public.department_budgets;
create policy department_budgets_finance_update on public.department_budgets for update to authenticated using(public.finance_can_manage()) with check(public.finance_can_manage());
drop policy if exists department_budgets_finance_delete on public.department_budgets;
create policy department_budgets_finance_delete on public.department_budgets for delete to authenticated using(public.finance_can_manage());
drop policy if exists strategic_plan_audit_finance_read on public.strategic_plan_audit;
create policy strategic_plan_audit_finance_read on public.strategic_plan_audit for select to authenticated using(public.finance_can_manage());
drop policy if exists strategic_plan_audit_finance_insert on public.strategic_plan_audit;
create policy strategic_plan_audit_finance_insert on public.strategic_plan_audit for insert to authenticated with check(public.finance_can_manage() and actor_id=auth.uid());
grant select,insert,update,delete on public.strategic_plans,public.strategic_actions,public.department_budgets to authenticated;
grant select,insert on public.strategic_plan_audit to authenticated;
grant usage,select on sequence public.strategic_plan_audit_id_seq to authenticated;