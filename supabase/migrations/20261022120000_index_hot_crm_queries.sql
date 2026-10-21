-- Cover the hot list and notification queries without duplicating existing indexes.
create index if not exists profiles_created_at_desc_idx on public.profiles (created_at desc);
create index if not exists prospects_created_at_desc_idx on public.prospects (created_at desc);
create index if not exists proprietaires_terres_id_unique_desc_idx on public.proprietaires_terres (id_unique desc);
create index if not exists notifications_user_unread_created_idx on public.notifications (user_id, read, created_at desc);
create index if not exists account_requests_status_created_idx on public.account_requests (statut, created_at desc);

-- These are redundant non-constraint indexes; the existing unique indexes keep the same guarantees.
drop index if exists public.idx_clients_id_unique;
drop index if exists public.uq_notifications_dedupe_key;
