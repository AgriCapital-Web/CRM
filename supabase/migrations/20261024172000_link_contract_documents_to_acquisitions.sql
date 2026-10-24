alter table public.documents_acquisition
  add column if not exists acquisition_id uuid references public.acquisitions(id) on delete set null;
create index if not exists idx_documents_acquisition_acquisition_id
  on public.documents_acquisition(acquisition_id);