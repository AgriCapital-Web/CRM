begin;

drop policy if exists independent_service_catalog_staff_read on public.independent_service_catalog;
create policy independent_service_catalog_staff_read
on public.independent_service_catalog
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array[
        'pdg','dg','service_client','chef_equipe_service_client','comptable',
        'manager_commercial_national','responsable_operations',
        'technicien','chef_equipe_technique','manager_technique_national'
      ])
  )
);

drop policy if exists independent_service_customers_technician_read on public.independent_service_customers;
create policy independent_service_customers_technician_read
on public.independent_service_customers
for select to authenticated
using (
  exists (
    select 1
    from public.independent_service_proformas q
    join public.user_roles ur on ur.user_id = (select auth.uid())
    where q.client_id = independent_service_customers.id
      and q.archived_at is null
      and q.status = any (array['acceptee','en_cours'])
      and ur.role = any (array[
        'pdg','dg','technicien','chef_equipe_technique',
        'manager_technique_national','responsable_operations'
      ])
  )
);

drop policy if exists independent_service_items_technician_read on public.independent_service_items;
create policy independent_service_items_technician_read
on public.independent_service_items
for select to authenticated
using (
  exists (
    select 1
    from public.independent_service_proformas q
    join public.user_roles ur on ur.user_id = (select auth.uid())
    where q.id = independent_service_items.proforma_id
      and q.archived_at is null
      and q.status = any (array['acceptee','en_cours'])
      and ur.role = any (array[
        'pdg','dg','technicien','chef_equipe_technique',
        'manager_technique_national','responsable_operations'
      ])
  )
);

drop policy if exists independent_service_events_technician_insert on public.independent_service_events;
create policy independent_service_events_technician_insert
on public.independent_service_events
for insert to authenticated
with check (
  event_code = 'technical_intervention'
  and actor_type = 'staff'
  and actor_id = (select auth.uid())
  and exists (
    select 1
    from public.independent_service_proformas q
    join public.user_roles ur on ur.user_id = (select auth.uid())
    where q.id = independent_service_events.proforma_id
      and q.archived_at is null
      and q.status = any (array['acceptee','en_cours'])
      and ur.role = any (array[
        'pdg','dg','technicien','chef_equipe_technique',
        'manager_technique_national','responsable_operations'
      ])
  )
);

create index if not exists independent_service_proformas_technical_status_idx
  on public.independent_service_proformas (status, created_at desc)
  where archived_at is null;
create index if not exists independent_service_events_proforma_created_idx
  on public.independent_service_events (proforma_id, created_at desc);

commit;
