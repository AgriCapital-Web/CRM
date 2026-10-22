-- The official client form allows client editors to upload/update the client's own contract.
-- Align these three RLS operations with the UI permission while keeping them scoped to the client.
drop policy if exists "CRM client editors insert client contract documents" on public.documents_acquisition;
create policy "CRM client editors insert client contract documents"
on public.documents_acquisition for insert to authenticated
with check (
  type_document = 'fiche_contrat'
  and client_id is not null
  and private.has_role_permission('clients.update')
  and private.can_access_client(auth.uid(), client_id)
);

drop policy if exists "CRM client editors read client contract documents" on public.documents_acquisition;
create policy "CRM client editors read client contract documents"
on public.documents_acquisition for select to authenticated
using (
  type_document = 'fiche_contrat'
  and client_id is not null
  and private.has_role_permission('clients.update')
  and private.can_access_client(auth.uid(), client_id)
);

drop policy if exists "CRM client editors update client contract documents" on public.documents_acquisition;
create policy "CRM client editors update client contract documents"
on public.documents_acquisition for update to authenticated
using (
  type_document = 'fiche_contrat'
  and client_id is not null
  and private.has_role_permission('clients.update')
  and private.can_access_client(auth.uid(), client_id)
)
with check (
  type_document = 'fiche_contrat'
  and client_id is not null
  and private.has_role_permission('clients.update')
  and private.can_access_client(auth.uid(), client_id)
);
