begin;
create index if not exists independent_service_portal_otps_customer_id_idx
  on public.independent_service_portal_otps (customer_id);
create index if not exists independent_service_portal_sessions_customer_id_idx
  on public.independent_service_portal_sessions (customer_id);
commit;