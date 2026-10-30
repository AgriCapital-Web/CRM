create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  statut text not null default 'en_cours'
    check (statut in ('en_cours','accepte_fournisseur','echoue','incertain')),
  provider_message_id text,
  provider_status text,
  provider_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (delivery_id, attempt_number)
);

create index if not exists notification_delivery_attempts_delivery_idx
  on public.notification_delivery_attempts(delivery_id, attempt_number desc);

alter table public.notification_delivery_attempts enable row level security;
revoke all on public.notification_delivery_attempts from public, anon, authenticated;

comment on table public.notification_delivery_attempts is
  'Historique append-only des tentatives fournisseur pour chaque notification; accessible uniquement au service role.';
