alter table public.finance_transactions add column if not exists proof_path text;
alter table public.finance_transactions add column if not exists proof_name text;
alter table public.tickets_techniques add column if not exists traite_par uuid references public.profiles(id) on delete set null;
alter table public.tickets_techniques add column if not exists traite_at timestamptz;
create index if not exists idx_tickets_techniques_traite_at on public.tickets_techniques(traite_at desc);