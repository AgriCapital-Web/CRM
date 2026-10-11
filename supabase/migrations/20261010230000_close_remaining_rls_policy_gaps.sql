-- Close remaining RLS gaps identified by the production security audit.
-- These policies preserve deny-by-default and apply existing role + record-scope checks.

-- Beneficiary attribution records inherit the permissions and scope of their client.
drop policy if exists "CRM beneficiary attributions select by client scope" on public.beneficiaire_attributions;
drop policy if exists "CRM beneficiary attributions insert by client scope" on public.beneficiaire_attributions;
drop policy if exists "CRM beneficiary attributions update by client scope" on public.beneficiaire_attributions;
drop policy if exists "CRM beneficiary attributions delete by client scope" on public.beneficiaire_attributions;

create policy "CRM beneficiary attributions select by client scope"
on public.beneficiaire_attributions for select to authenticated
using (
  client_id is not null
  and private.has_role_permission('clients.view')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM beneficiary attributions insert by client scope"
on public.beneficiaire_attributions for insert to authenticated
with check (
  client_id is not null
  and (private.has_role_permission('beneficiaires.create') or private.has_role_permission('clients.create') or private.has_role_permission('clients.update'))
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM beneficiary attributions update by client scope"
on public.beneficiaire_attributions for update to authenticated
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

create policy "CRM beneficiary attributions delete by client scope"
on public.beneficiaire_attributions for delete to authenticated
using (
  client_id is not null
  and private.has_role_permission('clients.delete')
  and private.can_access_client((select auth.uid()), client_id)
);

-- The notification configuration screen is restricted to system administrators
-- through the existing parametres.manage_system permission.
drop policy if exists "CRM notification segments manage system" on public.notification_segments;
drop policy if exists "CRM notification campaigns manage system" on public.notification_campaigns;
drop policy if exists "CRM notification automations manage system" on public.notification_automations;

create policy "CRM notification segments manage system"
on public.notification_segments for all to authenticated
using (private.has_role_permission('parametres.manage_system'))
with check (private.has_role_permission('parametres.manage_system'));

create policy "CRM notification campaigns manage system"
on public.notification_campaigns for all to authenticated
using (private.has_role_permission('parametres.manage_system'))
with check (private.has_role_permission('parametres.manage_system'));

create policy "CRM notification automations manage system"
on public.notification_automations for all to authenticated
using (private.has_role_permission('parametres.manage_system'))
with check (private.has_role_permission('parametres.manage_system'));

-- Legacy activation records are accessible only when tied to a client in the
-- caller's assigned scope and the corresponding plantation permission is granted.
drop policy if exists "CRM plantation activations select by client scope" on public.plantation_activations;
drop policy if exists "CRM plantation activations insert by client scope" on public.plantation_activations;
drop policy if exists "CRM plantation activations update by client scope" on public.plantation_activations;
drop policy if exists "CRM plantation activations delete by client scope" on public.plantation_activations;

create policy "CRM plantation activations select by client scope"
on public.plantation_activations for select to authenticated
using (
  client_id is not null
  and private.has_role_permission('plantations.view')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM plantation activations insert by client scope"
on public.plantation_activations for insert to authenticated
with check (
  client_id is not null
  and private.has_role_permission('plantations.create')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM plantation activations update by client scope"
on public.plantation_activations for update to authenticated
using (
  client_id is not null
  and private.has_role_permission('plantations.update')
  and private.can_access_client((select auth.uid()), client_id)
)
with check (
  client_id is not null
  and private.has_role_permission('plantations.update')
  and private.can_access_client((select auth.uid()), client_id)
);

create policy "CRM plantation activations delete by client scope"
on public.plantation_activations for delete to authenticated
using (
  client_id is not null
  and private.has_role_permission('plantations.delete')
  and private.can_access_client((select auth.uid()), client_id)
);
