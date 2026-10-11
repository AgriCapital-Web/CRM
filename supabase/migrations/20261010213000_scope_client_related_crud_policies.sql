-- Client-related acquisition records inherit the same permission and scope
-- checks as the parent client. No global staff bypass is introduced.
drop policy if exists "CRM cotitulaires select by client scope" on public.client_cotitulaires_mandataires;
drop policy if exists "CRM cotitulaires insert by client scope" on public.client_cotitulaires_mandataires;
drop policy if exists "CRM cotitulaires update by client scope" on public.client_cotitulaires_mandataires;
drop policy if exists "CRM cotitulaires delete by client scope" on public.client_cotitulaires_mandataires;

create policy "CRM cotitulaires select by client scope"
on public.client_cotitulaires_mandataires for select to authenticated
using (
  private.has_role_permission('clients.view')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM cotitulaires insert by client scope"
on public.client_cotitulaires_mandataires for insert to authenticated
with check (
  private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM cotitulaires update by client scope"
on public.client_cotitulaires_mandataires for update to authenticated
using (
  private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
)
with check (
  private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM cotitulaires delete by client scope"
on public.client_cotitulaires_mandataires for delete to authenticated
using (
  private.has_role_permission('clients.delete')
  and private.can_access_client((select auth.uid()), client_id)
);

drop policy if exists "CRM enquêtes select by client scope" on public.client_enquetes;
drop policy if exists "CRM enquêtes insert by client scope" on public.client_enquetes;
drop policy if exists "CRM enquêtes update by client scope" on public.client_enquetes;
drop policy if exists "CRM enquêtes delete by client scope" on public.client_enquetes;

create policy "CRM enquêtes select by client scope"
on public.client_enquetes for select to authenticated
using (
  private.has_role_permission('clients.view')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM enquêtes insert by client scope"
on public.client_enquetes for insert to authenticated
with check (
  private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM enquêtes update by client scope"
on public.client_enquetes for update to authenticated
using (
  private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
)
with check (
  private.has_role_permission('clients.update')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM enquêtes delete by client scope"
on public.client_enquetes for delete to authenticated
using (
  private.has_role_permission('clients.delete')
  and private.can_access_client((select auth.uid()), client_id)
);
