alter table public.finance_expenses
  add column if not exists proof_path text,
  add column if not exists proof_name text,
  add column if not exists proof_mime_type text;
