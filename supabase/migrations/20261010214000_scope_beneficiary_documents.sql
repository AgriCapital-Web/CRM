-- Uploaded beneficiary files are writable only by staff with the relevant
-- client permission and access to that exact client record.
drop policy if exists "CRM beneficiary documents select by client scope" on public.beneficiaire_documents;
drop policy if exists "CRM beneficiary documents insert by client scope" on public.beneficiaire_documents;
drop policy if exists "CRM beneficiary documents update by client scope" on public.beneficiaire_documents;
drop policy if exists "CRM beneficiary documents delete by client scope" on public.beneficiaire_documents;

create policy "CRM beneficiary documents select by client scope"
on public.beneficiaire_documents for select to authenticated
using (
  client_id is not null
  and private.has_role_permission('clients.view')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM beneficiary documents insert by client scope"
on public.beneficiaire_documents for insert to authenticated
with check (
  client_id is not null
  and (private.has_role_permission('clients.create') or private.has_role_permission('clients.update'))
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM beneficiary documents update by client scope"
on public.beneficiaire_documents for update to authenticated
using (
  client_id is not null
  and private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
)
with check (
  client_id is not null
  and private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM beneficiary documents delete by client scope"
on public.beneficiaire_documents for delete to authenticated
using (
  client_id is not null
  and private.has_role_permission('clients.delete')
  and private.can_access_client((select auth.uid()), client_id)
);
