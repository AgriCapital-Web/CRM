-- Trigger functions are internal implementation details and must not be exposed as RPCs.
revoke all on function public.validate_client_selected_offer_formula() from public, anon, authenticated;
revoke all on function public.create_acquisition_for_new_client() from public, anon, authenticated;
revoke all on function public.sync_offre_fields_on_client() from public, anon, authenticated;
revoke all on function public.trg_client_recompute() from public, anon, authenticated;
revoke all on function public.trg_recalculer_parametres_financiers_client() from public, anon, authenticated;
grant execute on function public.validate_client_selected_offer_formula() to service_role;
grant execute on function public.create_acquisition_for_new_client() to service_role;
grant execute on function public.sync_offre_fields_on_client() to service_role;
grant execute on function public.trg_client_recompute() to service_role;
grant execute on function public.trg_recalculer_parametres_financiers_client() to service_role;
