begin;

drop policy if exists independent_service_customers_staff_read on public.independent_service_customers;
drop policy if exists independent_service_customers_technician_read on public.independent_service_customers;
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
        and q.status = any (array['acceptee','en_cours'])
    )
  )
);

drop policy if exists independent_service_items_staff_read on public.independent_service_items;
drop policy if exists independent_service_items_technician_read on public.independent_service_items;
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
        and q.status = any (array['acceptee','en_cours'])
    )
  )
);

drop policy if exists independent_service_proformas_staff_read on public.independent_service_proformas;
drop policy if exists independent_service_proformas_technician_read on public.independent_service_proformas;
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
    status = any (array['acceptee','en_cours'])
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

drop policy if exists independent_service_events_staff_read on public.independent_service_events;
drop policy if exists independent_service_events_technician_read on public.independent_service_events;
create policy independent_service_events_staff_read
on public.independent_service_events
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
    event_code = 'technical_intervention'
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

drop policy if exists independent_service_events_authorized_insert on public.independent_service_events;
drop policy if exists independent_service_events_technician_insert on public.independent_service_events;
create policy independent_service_events_authorized_insert
on public.independent_service_events
for insert to authenticated
with check (
  actor_type = 'staff'
  and actor_id = (select auth.uid())
  and (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = any (array['pdg','dg','service_client','chef_equipe_service_client'])
    )
    or (
      event_code = 'technical_intervention'
      and exists (
        select 1 from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role = any (array[
            'pdg','dg','technicien','chef_equipe_technique',
            'manager_technique_national','responsable_operations'
          ])
      )
      and exists (
        select 1 from public.independent_service_proformas q
        where q.id = independent_service_events.proforma_id
          and q.archived_at is null
          and q.status = any (array['acceptee','en_cours'])
      )
    )
  )
);

commit;
