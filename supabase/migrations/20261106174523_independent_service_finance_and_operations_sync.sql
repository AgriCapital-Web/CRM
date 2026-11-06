begin;

-- A scheduled intervention must not prematurely move an accepted quote to "en_cours".
-- A completed technical intervention closes the operational quote lifecycle.
create or replace function public.independent_service_mark_proforma_in_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
begin
  if new.event_code <> 'technical_intervention' then
    return new;
  end if;

  v_status := lower(coalesce(nullif(trim(new.details->>'statut'), ''), 'en_cours'));

  if v_status = 'planifiee' then
    return new;
  elsif v_status = 'terminee' then
    update public.independent_service_proformas
       set status = 'terminee',
           completed_at = coalesce(completed_at, now()),
           updated_at = now()
     where id = new.proforma_id
       and status in ('acceptee', 'en_cours');
  else
    update public.independent_service_proformas
       set status = 'en_cours',
           updated_at = now()
     where id = new.proforma_id
       and status = 'acceptee';
  end if;

  return new;
end;
$function$;

-- Staff finance access is read-only. Portal/payment mutations stay server-side
-- through the service-role payment workflow.
drop policy if exists independent_service_invoices_finance_read on public.independent_service_invoices;
create policy independent_service_invoices_finance_read
on public.independent_service_invoices
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array[
        'pdg','dg','comptable','service_client','chef_equipe_service_client',
        'manager_commercial_national','responsable_operations'
      ])
  )
);

drop policy if exists independent_service_payments_finance_read on public.independent_service_payments;
create policy independent_service_payments_finance_read
on public.independent_service_payments
for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array[
        'pdg','dg','comptable','service_client','chef_equipe_service_client',
        'manager_commercial_national','responsable_operations'
      ])
  )
);

grant select on public.independent_service_invoices to authenticated;
grant select on public.independent_service_payments to authenticated;
revoke insert, update, delete on public.independent_service_invoices from anon, authenticated;
revoke insert, update, delete on public.independent_service_payments from anon, authenticated;

commit;