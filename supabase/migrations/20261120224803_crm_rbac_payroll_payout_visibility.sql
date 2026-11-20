begin;

drop policy if exists finance_payout_batches_select on public.finance_payout_batches;
create policy finance_payout_batches_select_by_finance_or_payroll
  on public.finance_payout_batches for select to authenticated
  using (
    public.finance_can_view()
    or (public.finance_can_view_payroll() and lower(coalesce(metadata->>'category',''))='salary')
  );

drop policy if exists finance_payouts_select on public.finance_payouts;
create policy finance_payouts_select_by_finance_or_payroll
  on public.finance_payouts for select to authenticated
  using (
    public.finance_can_view()
    or (public.finance_can_view_payroll() and lower(coalesce(category,''))='salary')
  );

drop policy if exists finance_payout_beneficiaries_select on public.finance_payout_beneficiaries;
create policy finance_payout_beneficiaries_select_by_finance_or_payroll
  on public.finance_payout_beneficiaries for select to authenticated
  using (
    public.finance_can_view()
    or (public.finance_can_view_payroll() and beneficiary_type='employee')
  );

drop policy if exists finance_payout_audit_select on public.finance_payout_audit_events;
create policy finance_payout_audit_select_by_finance_or_payroll
  on public.finance_payout_audit_events for select to authenticated
  using (
    public.finance_can_view()
    or (public.finance_can_view_payroll() and exists (
      select 1 from public.finance_payouts p
      where p.id=finance_payout_audit_events.payout_id and lower(coalesce(p.category,''))='salary'
    ))
  );

notify pgrst, 'reload schema';
commit;