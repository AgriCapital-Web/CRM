begin;

-- Keep catalogue reads in one SELECT policy; separate write actions to avoid
-- overlapping permissive ALL + SELECT policies.
drop policy if exists independent_service_catalog_managers_write on public.independent_service_catalog;

create policy independent_service_catalog_managers_insert
on public.independent_service_catalog
for insert to authenticated
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['pdg','dg','service_client','chef_equipe_service_client'])
  )
);

create policy independent_service_catalog_managers_update
on public.independent_service_catalog
for update to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['pdg','dg','service_client','chef_equipe_service_client'])
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['pdg','dg','service_client','chef_equipe_service_client'])
  )
);

create policy independent_service_catalog_managers_delete
on public.independent_service_catalog
for delete to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['pdg','dg','service_client','chef_equipe_service_client'])
  )
);

-- Align the SECURITY DEFINER invoice conversion gate with the CRM action
-- visibility and the write policies on independent-service quotes/items.
create or replace function public.convert_independent_service_quote_to_invoice(p_quote_id uuid)
returns public.independent_service_invoices
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_quote public.independent_service_proformas%rowtype;
  v_invoice public.independent_service_invoices%rowtype;
  v_number text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any (array['pdg','dg','service_client','chef_equipe_service_client'])
  ) then
    raise exception 'Accès non autorisé à la conversion en facture'
      using errcode = '42501';
  end if;

  select * into v_quote
  from public.independent_service_proformas
  where id = p_quote_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Devis introuvable ou archivé';
  end if;

  if v_quote.status <> 'acceptee' then
    raise exception 'Seul un devis accepté peut être converti en facture';
  end if;

  select * into v_invoice
  from public.independent_service_invoices
  where proforma_id = p_quote_id and status <> 'cancelled'
  limit 1;

  if found then
    return v_invoice;
  end if;

  v_number := 'FAC-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(regexp_replace(coalesce(v_quote.reference, p_quote_id::text), '[^A-Za-z0-9]', '', 'g'));

  insert into public.independent_service_invoices
    (proforma_id, invoice_number, status, currency, amount_due, amount_paid, created_by)
  values
    (p_quote_id, left(v_number, 60), 'issued', coalesce(v_quote.currency, 'XOF'), v_quote.total_amount, 0, auth.uid())
  returning * into v_invoice;

  insert into public.independent_service_events
    (proforma_id, event_code, actor_type, actor_id, details)
  values
    (p_quote_id, 'issued', 'staff', auth.uid(),
     jsonb_build_object('invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number));

  return v_invoice;
end;
$function$;

revoke all on function public.convert_independent_service_quote_to_invoice(uuid) from public, anon;
grant execute on function public.convert_independent_service_quote_to_invoice(uuid) to authenticated;

commit;