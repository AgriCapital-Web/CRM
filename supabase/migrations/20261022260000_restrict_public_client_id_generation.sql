-- ID generation is only required by authenticated client creation triggers; public callers cannot enumerate the next client ID.
revoke execute on function public.generate_client_id(text) from public, anon;
grant execute on function public.generate_client_id(text) to authenticated, service_role;
