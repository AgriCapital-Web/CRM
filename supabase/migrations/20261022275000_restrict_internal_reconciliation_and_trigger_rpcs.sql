-- Global lead/prospect reconciliation mutates relationships across many records.
-- It is an internal maintenance operation, not a user-facing RPC.
revoke all on function public.reconcile_lead_prospect_client_links() from public, anon, authenticated;
grant execute on function public.reconcile_lead_prospect_client_links() to service_role;

-- Trigger handlers are invoked by their table triggers, never as direct RPCs.
revoke all on function public.compute_commission_foncier_client() from public, anon, authenticated;
grant execute on function public.compute_commission_foncier_client() to service_role;

revoke all on function public.sync_lead_to_prospect_record() from public, anon, authenticated;
grant execute on function public.sync_lead_to_prospect_record() to service_role;

revoke all on function public.sync_equipe_responsable_membership() from public, anon, authenticated;
grant execute on function public.sync_equipe_responsable_membership() to service_role;
