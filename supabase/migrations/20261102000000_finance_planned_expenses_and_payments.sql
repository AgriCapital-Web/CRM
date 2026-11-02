-- Planned expenses, payment tracking, and auditable conversion to actual sorties.
-- Existing expense rows remain compatible: transaction_id is nullable for future unpaid records.
begin;
alter table public.finance_expenses alter column transaction_id drop not null;
alter table public.finance_expenses
  add column if not exists expense_date date not null default current_date,
  add column if not exists due_date date,
  add column if not exists total_amount numeric(14,2),
  add column if not exists paid_amount numeric(14,2) not null default 0,
  add column if not exists status text not null default 'paid',
  add column if not exists beneficiary_name text,
  add column if not exists payment_method text,
  add column if not exists notes text;
update public.finance_expenses
set total_amount = coalesce(total_amount, (select ft.amount from public.finance_transactions ft where ft.id=finance_expenses.transaction_id)),
    paid_amount = case when status='paid' then coalesce(paid_amount,(select ft.amount from public.finance_transactions ft where ft.id=finance_expenses.transaction_id),0) else paid_amount end
where total_amount is null;
alter table public.finance_expenses alter column total_amount set default 0;
alter table public.finance_expenses alter column total_amount set not null;
alter table public.finance_expenses drop constraint if exists finance_expenses_status_check;
alter table public.finance_expenses add constraint finance_expenses_status_check check (status in ('unpaid','partial','paid','cancelled'));
alter table public.finance_expenses drop constraint if exists finance_expenses_amount_check;
alter table public.finance_expenses add constraint finance_expenses_amount_check check (total_amount >= 0 and paid_amount >= 0 and paid_amount <= total_amount);
create table if not exists public.finance_expense_payments (
 id uuid primary key default gen_random_uuid(),
 expense_id uuid not null references public.finance_expenses(id) on delete cascade,
 transaction_id uuid not null unique references public.finance_transactions(id) on delete restrict,
 amount numeric(14,2) not null check (amount > 0),
 paid_at timestamptz not null default now(),
 payment_method text,
 proof_path text,
 proof_name text,
 created_by uuid,
 created_at timestamptz not null default now()
);
create index if not exists finance_expenses_status_due_idx on public.finance_expenses(status,due_date);
create index if not exists finance_expense_payments_expense_idx on public.finance_expense_payments(expense_id,paid_at);
commit;
