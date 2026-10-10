-- Remove the retired commercial parcel step from each offer configuration.
delete from public.offre_formulaire_etapes
where code = 'parcelle'
  and actif = false;

-- Acquisition drafts are private to their creator. The table had RLS enabled
-- but no policies, so the app could not reliably read or persist drafts.
drop policy if exists "Users read own acquisition drafts" on public.acquisitions_brouillon;
drop policy if exists "Users create own acquisition drafts" on public.acquisitions_brouillon;
drop policy if exists "Users update own acquisition drafts" on public.acquisitions_brouillon;
drop policy if exists "Users delete own acquisition drafts" on public.acquisitions_brouillon;

create policy "Users read own acquisition drafts"
on public.acquisitions_brouillon
for select
to authenticated
using (created_by = (select auth.uid()));

create policy "Users create own acquisition drafts"
on public.acquisitions_brouillon
for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "Users update own acquisition drafts"
on public.acquisitions_brouillon
for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "Users delete own acquisition drafts"
on public.acquisitions_brouillon
for delete
to authenticated
using (created_by = (select auth.uid()));
