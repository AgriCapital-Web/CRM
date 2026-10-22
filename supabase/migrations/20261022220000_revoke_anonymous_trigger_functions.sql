-- Trigger handlers must not be callable directly as RPCs.
revoke all on function public.cascade_geo_activation() from public, anon, authenticated;
revoke all on function public.cascade_geo_activation_trigger() from public, anon, authenticated;
revoke all on function public.internal_touch_conversation() from public, anon, authenticated;
revoke all on function public.sync_planting_to_acquisition() from public, anon, authenticated;
revoke all on function public.sync_technical_preceding_steps() from public, anon, authenticated;
revoke all on function public.workspace_guard_document_owner_change() from public, anon, authenticated;
grant execute on function public.cascade_geo_activation() to service_role;
grant execute on function public.cascade_geo_activation_trigger() to service_role;
grant execute on function public.internal_touch_conversation() to service_role;
grant execute on function public.sync_planting_to_acquisition() to service_role;
grant execute on function public.sync_technical_preceding_steps() to service_role;
grant execute on function public.workspace_guard_document_owner_change() to service_role;
