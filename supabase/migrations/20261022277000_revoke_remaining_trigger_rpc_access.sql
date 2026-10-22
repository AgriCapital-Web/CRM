-- These functions are trigger handlers and must not be exposed as direct RPCs.
revoke all on function public.enforce_technical_visit_media_limit() from public, anon, authenticated;
grant execute on function public.enforce_technical_visit_media_limit() to service_role;

revoke all on function public.trg_notification_client_created() from public, anon, authenticated;
grant execute on function public.trg_notification_client_created() to service_role;

revoke all on function public.trg_notification_document_validated() from public, anon, authenticated;
grant execute on function public.trg_notification_document_validated() to service_role;

revoke all on function public.trg_notification_technical_intervention() from public, anon, authenticated;
grant execute on function public.trg_notification_technical_intervention() to service_role;

revoke all on function public.trg_notification_technical_visit() from public, anon, authenticated;
grant execute on function public.trg_notification_technical_visit() to service_role;

revoke all on function public.validate_client_acquisition_foncier() from public, anon, authenticated;
grant execute on function public.validate_client_acquisition_foncier() to service_role;
