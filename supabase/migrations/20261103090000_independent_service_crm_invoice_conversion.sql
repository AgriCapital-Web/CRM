-- CRM-owned conversion of an accepted independent-service quote into an invoice.
-- Idempotent: a quote can have at most one active invoice.
begin;

create or replace function public.convert_independent_service_quote_to_invoice(p_quote_id uuid)
returns public.independent_service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.independent_service_proformas%rowtype;
  v_invoice public.independent_service_invoices%rowtype;
  v_role text;
  v_number text;
begin
  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = auth.uid()
    and ur.role in ('pdg','dg','service_client','chef_equipe_service_client','comptable')
  limit 1;

  if v_role is null then
    raise exception 'Accès non autorisé à la conversion en facture';
  end if;

  select * into v_quote
  from public.independent_service_proformas
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'Devis introuvable';
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
    (p_quote_id, left(v_number, 60), 'issued', 'XOF', v_quote.total_amount, 0, auth.uid())
  returning * into v_invoice;

  insert into public.independent_service_events
    (proforma_id, event_code, actor_type, actor_id, details)
  values
    (p_quote_id, 'issued', 'staff', auth.uid(), jsonb_build_object('invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number));

  return v_invoice;
end;
$$;

revoke all on function public.convert_independent_service_quote_to_invoice(uuid) from public, anon;
grant execute on function public.convert_independent_service_quote_to_invoice(uuid) to authenticated;

commit;
