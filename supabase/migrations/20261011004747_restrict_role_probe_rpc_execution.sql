-- Role-probe helpers are implementation details, not public RPC endpoints.
-- Their owner-role calls remain available to SECURITY DEFINER routines and triggers.
drop policy if exists "staff can update portal support requests" on public.portail_support_requests;
drop policy if exists "staff can view portal support requests" on public.portail_support_requests;
create policy "staff can update portal support requests" on public.portail_support_requests
for update to authenticated using (private.is_staff((select auth.uid())))
with check (private.is_staff((select auth.uid())));
create policy "staff can view portal support requests" on public.portail_support_requests
for select to authenticated using (private.is_staff((select auth.uid())));

revoke execute on function public.has_role(uuid,text) from public, anon, authenticated;
revoke execute on function public.is_admin(uuid) from public, anon, authenticated;
revoke execute on function public.is_demo(uuid) from public, anon, authenticated;
revoke execute on function public.is_finance_staff(uuid) from public, anon, authenticated;
revoke execute on function public.is_rh(uuid) from public, anon, authenticated;
revoke execute on function public.is_staff(uuid) from public, anon, authenticated;
revoke execute on function public.zone_assignment_expected_type(uuid) from public, anon, authenticated;
