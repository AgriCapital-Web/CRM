-- Ensure security-sensitive views respect the querying user's RLS policies.
alter view public.v_client_synthese set (security_invoker = true);
alter view public.v_geo_sous_prefectures set (security_invoker = true);

-- Business RPCs require a signed-in staff session; trigger-only functions are not public RPC endpoints.
revoke execute on function public.acquisition_current_payment_state(uuid) from public, anon;
grant execute on function public.acquisition_current_payment_state(uuid) to authenticated, service_role;

revoke execute on function public.create_client_acquisition(uuid, uuid, text, numeric, text, uuid, uuid, text) from public, anon;
grant execute on function public.create_client_acquisition(uuid, uuid, text, numeric, text, uuid, uuid, text) to authenticated, service_role;

revoke execute on function public.enforce_single_primary_user_role() from public, anon, authenticated;
revoke execute on function public.set_technical_report_client_visibility() from public, anon, authenticated;
revoke execute on function public.sync_technical_report_media_visibility() from public, anon, authenticated;
