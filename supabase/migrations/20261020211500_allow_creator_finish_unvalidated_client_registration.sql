-- Allow the creator to finish the initial registration only while the dossier remains unvalidated.
-- This supports post-insert media/document links in the acquisition wizard without granting
-- commercial users ongoing edit rights to an official client dossier.
create policy "CRM creators finish unvalidated client registration"
on public.clients
for update
to authenticated
using (
  private.has_role_permission('clients.create')
  and created_by = (select auth.uid())
  and documents_valides_at is null
  and coalesce(phase_actuelle, 'pre_activation') = 'pre_activation'
)
with check (
  private.has_role_permission('clients.create')
  and created_by = (select auth.uid())
  and documents_valides_at is null
  and coalesce(phase_actuelle, 'pre_activation') = 'pre_activation'
);
