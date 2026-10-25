-- Les approbateurs doivent pouvoir versionner et auditer les transitions qu'ils sont autorisés à effectuer.
drop policy if exists decision_versions_insert on public.decision_proposal_versions;
create policy decision_versions_insert on public.decision_proposal_versions for insert to authenticated
with check ((public.can_access_decision_center('create') or public.can_access_decision_center('approve') or public.can_access_decision_center('manage')) and changed_by = auth.uid());
drop policy if exists decision_audit_insert on public.decision_center_audit;
create policy decision_audit_insert on public.decision_center_audit for insert to authenticated
with check ((public.can_access_decision_center('create') or public.can_access_decision_center('approve') or public.can_access_decision_center('manage')) and actor_user_id = auth.uid());
