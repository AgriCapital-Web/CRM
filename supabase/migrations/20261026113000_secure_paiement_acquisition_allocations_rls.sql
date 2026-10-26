-- Restrict acquisition payment allocation access to authenticated finance users.
-- Read access follows the finance visibility helper; writes require finance management permission.
create policy paiement_acquisition_allocations_finance_read
on public.paiement_acquisition_allocations
for select to authenticated
using (public.finance_can_view());

create policy paiement_acquisition_allocations_finance_insert
on public.paiement_acquisition_allocations
for insert to authenticated
with check (public.finance_can_manage());

create policy paiement_acquisition_allocations_finance_update
on public.paiement_acquisition_allocations
for update to authenticated
using (public.finance_can_manage())
with check (public.finance_can_manage());

create policy paiement_acquisition_allocations_finance_delete
on public.paiement_acquisition_allocations
for delete to authenticated
using (public.finance_can_manage());
