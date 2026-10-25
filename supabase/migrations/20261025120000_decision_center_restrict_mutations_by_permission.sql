-- Renforce la séparation lecture/écriture : la lecture seule ne peut ni modifier ni supprimer des sources.
drop policy if exists decision_financing_sources_access on public.decision_financing_sources;
drop policy if exists decision_financing_sources_read on public.decision_financing_sources;
create policy decision_financing_sources_read on public.decision_financing_sources for select to authenticated using (public.can_access_decision_center('view'));
create policy decision_financing_sources_insert on public.decision_financing_sources for insert to authenticated with check (public.can_access_decision_center('manage') and (verified_by is null or verified_by = auth.uid()));
create policy decision_financing_sources_update on public.decision_financing_sources for update to authenticated using (public.can_access_decision_center('manage')) with check (public.can_access_decision_center('manage'));
create policy decision_financing_sources_delete on public.decision_financing_sources for delete to authenticated using (public.can_access_decision_center('manage'));
drop policy if exists decision_scenarios_access on public.decision_scenarios;
create policy decision_scenarios_read on public.decision_scenarios for select to authenticated using (public.can_access_decision_center('view'));
create policy decision_scenarios_insert on public.decision_scenarios for insert to authenticated with check (public.can_access_decision_center('create') and created_by = auth.uid());
create policy decision_scenarios_update on public.decision_scenarios for update to authenticated using (public.can_access_decision_center('manage') or (created_by = auth.uid() and public.can_access_decision_center('create'))) with check (public.can_access_decision_center('manage') or (created_by = auth.uid() and public.can_access_decision_center('create')));
create policy decision_scenarios_delete on public.decision_scenarios for delete to authenticated using (public.can_access_decision_center('manage'));
drop policy if exists decision_proposals_update on public.decision_proposals;
create policy decision_proposals_update on public.decision_proposals for update to authenticated
 using (public.can_access_decision_center('manage') or public.can_access_decision_center('approve') or (public.can_access_decision_center('create') and created_by = auth.uid() and status in ('draft','proposed','modified')))
 with check (public.can_access_decision_center('manage') or public.can_access_decision_center('approve') or (public.can_access_decision_center('create') and created_by = auth.uid() and status in ('draft','proposed','modified')));
