-- Permet d'auditer la soumission d'une proposition par un utilisateur autorisé à la créer.
drop policy if exists decision_approvals_insert on public.decision_approvals;
create policy decision_approvals_insert on public.decision_approvals for insert to authenticated
with check (actor_user_id = auth.uid() and (
 (action = 'submitted' and public.can_access_decision_center('create'))
 or public.can_access_decision_center('approve')
 or public.can_access_decision_center('manage')
));
