-- Correct staff access to client subscriptions without exposing the public.is_staff(uuid)
-- SECURITY DEFINER helper to authenticated callers. Reuse the private helper already
-- granted to authenticated users and keep the policy scoped to the current session.
drop policy if exists client_souscriptions_staff_select on public.client_souscriptions;
create policy client_souscriptions_staff_select
on public.client_souscriptions
for select
to authenticated
using (private.is_staff((select auth.uid())));
