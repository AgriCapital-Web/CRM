-- Client viewers can consult the financial history on the client record.
-- The global Payments module remains protected by its dedicated permission.
drop policy if exists "CRM paiements select by permission and scope" on public.paiements;
create policy "CRM paiements select by permission and scope"
on public.paiements
for select
to authenticated
using (
  (
    private.has_role_permission('paiements.view')
    or private.has_role_permission('clients.view')
  )
  and private.can_access_client((select auth.uid()), client_id)
);

-- Allow the same scoped client viewers to read the currency balance used by
-- the client financial summary. Write operations remain separately restricted.
create policy "Client viewers can read scoped money balance"
on public.client_monnaie_mouvements
for select
to authenticated
using (
  private.has_role_permission('clients.view')
  and private.can_access_client((select auth.uid()), client_id)
);
