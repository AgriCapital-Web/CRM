-- Username login is handled by the rate-limited Edge Function; retire the legacy RPC.
revoke execute on function public.resolve_username_email(text) from public, anon, authenticated;
