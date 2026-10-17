create table if not exists public.acremap_integration_settings (
 id text primary key default 'default' check (id = 'default'),
 api_base_url text not null default '', api_key text not null default '', webhook_secret text not null default '',
 enabled boolean not null default false, updated_at timestamptz not null default now()
);
alter table public.acremap_integration_settings enable row level security;
-- Les secrets ne sont jamais lisibles depuis le navigateur : lecture/écriture via
-- l'Edge Function acremap-settings, qui utilise la clé service_role après contrôle du rôle.
drop policy if exists acremap_settings_manage on public.acremap_integration_settings;
revoke all on table public.acremap_integration_settings from anon, authenticated;
grant all on table public.acremap_integration_settings to service_role;

alter table public.proprietaires_terres
  add column if not exists nombre_lots_agricapital integer not null default 0,
  add column if not exists part_agricapital_ha numeric not null default 0,
  add column if not exists part_proprietaire_ha numeric not null default 0,
  add column if not exists part_agricapital_pct numeric not null default 0,
  add column if not exists part_proprietaire_pct numeric not null default 0;

create table if not exists public.acremap_morcellements (
 id text primary key, event_id text unique, owner_id text, parcelle_id text, reference text,
 status text not null default 'received', payload jsonb not null default '{}'::jsonb,
 source_updated_at timestamptz, received_at timestamptz not null default now()
);
create table if not exists public.acremap_lots (
 id text primary key, plan_id text not null references public.acremap_morcellements(id) on delete cascade,
 owner_id text, code text not null, part text, kind text, area_m2 numeric,
 payload jsonb not null default '{}'::jsonb, received_at timestamptz not null default now(), unique(plan_id,code)
);
alter table public.acremap_morcellements enable row level security;
alter table public.acremap_lots enable row level security;
drop policy if exists acremap_results_read on public.acremap_morcellements;
create policy acremap_results_read on public.acremap_morcellements for select to authenticated
using (private.has_role_permission('proprietaires.view') or private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'pdg') or private.has_role(auth.uid(),'dg'));
drop policy if exists acremap_lots_read on public.acremap_lots;
create policy acremap_lots_read on public.acremap_lots for select to authenticated
using (private.has_role_permission('proprietaires.view') or private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'pdg') or private.has_role(auth.uid(),'dg'));
grant select on public.acremap_morcellements, public.acremap_lots to authenticated;
grant all on public.acremap_morcellements, public.acremap_lots to service_role;
