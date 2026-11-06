begin;

-- Keep completed independent-service files visible to technical teams so the
-- intervention history and map do not disappear when a quote is closed.
drop policy if exists independent_service_proformas_staff_read on public.independent_service_proformas;
create policy independent_service_proformas_staff_read
on public.independent_service_proformas
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array[
        'pdg','dg','service_client','chef_equipe_service_client',
        'comptable','manager_commercial_national','responsable_operations'
      ])
  )
  or (
    status = any (array['acceptee','en_cours','terminee'])
    and archived_at is null
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = any (array[
          'pdg','dg','technicien','chef_equipe_technique',
          'manager_technique_national','responsable_operations'
        ])
    )
  )
);

drop policy if exists independent_service_customers_staff_read on public.independent_service_customers;
create policy independent_service_customers_staff_read
on public.independent_service_customers
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array[
        'pdg','dg','service_client','chef_equipe_service_client',
        'comptable','manager_commercial_national','responsable_operations'
      ])
  )
  or (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = any (array[
          'pdg','dg','technicien','chef_equipe_technique',
          'manager_technique_national','responsable_operations'
        ])
    )
    and exists (
      select 1 from public.independent_service_proformas q
      where q.client_id = independent_service_customers.id
        and q.archived_at is null
        and q.status = any (array['acceptee','en_cours','terminee'])
    )
  )
);

drop policy if exists independent_service_items_staff_read on public.independent_service_items;
create policy independent_service_items_staff_read
on public.independent_service_items
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array[
        'pdg','dg','service_client','chef_equipe_service_client',
        'comptable','manager_commercial_national','responsable_operations'
      ])
  )
  or (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = any (array[
          'pdg','dg','technicien','chef_equipe_technique',
          'manager_technique_national','responsable_operations'
        ])
    )
    and exists (
      select 1 from public.independent_service_proformas q
      where q.id = independent_service_items.proforma_id
        and q.archived_at is null
        and q.status = any (array['acceptee','en_cours','terminee'])
    )
  )
);

create index if not exists independent_service_customers_created_by_idx on public.independent_service_customers (created_by);
create index if not exists independent_service_customers_updated_by_idx on public.independent_service_customers (updated_by);
create index if not exists independent_service_items_catalog_id_idx on public.independent_service_items (catalog_id);
create index if not exists independent_service_proformas_created_by_idx on public.independent_service_proformas (created_by);
create index if not exists independent_service_proformas_previous_version_id_idx on public.independent_service_proformas (previous_version_id);
create index if not exists independent_service_proformas_updated_by_idx on public.independent_service_proformas (updated_by);

commit;