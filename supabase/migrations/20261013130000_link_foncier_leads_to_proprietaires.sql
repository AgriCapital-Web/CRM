-- Persist the target owner record when a landowner lead is converted.
alter table public.leads
  add column if not exists proprietaire_id uuid references public.proprietaires_terres(id) on delete set null;
create index if not exists idx_leads_proprietaire_id on public.leads(proprietaire_id);
