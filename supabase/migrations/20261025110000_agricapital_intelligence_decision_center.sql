-- AgriCapital Intelligence: centre de décision, simulations, délégations et traçabilité.
-- Le schéma ne contient aucun taux bancaire inventé : seules les offres vérifiées sont enregistrées.
create table if not exists public.decision_access_grants (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 permissions text[] not null default array['view']::text[], granted_by uuid references auth.users(id),
 revoked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id)
);
create table if not exists public.decision_financing_sources (
 id uuid primary key default gen_random_uuid(), provider_name text not null, product_name text not null,
 nominal_annual_rate numeric(8,5) not null check (nominal_annual_rate between 0 and 100),
 effective_annual_rate numeric(8,5) check (effective_annual_rate is null or effective_annual_rate between 0 and 100),
 fees numeric(16,2) not null default 0 check (fees >= 0), insurance_monthly numeric(16,2) not null default 0 check (insurance_monthly >= 0),
 currency text not null default 'XOF', source_url text, source_reference text, observed_at timestamptz not null default now(),
 valid_until date, verified_by uuid references auth.users(id), is_active boolean not null default true, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.decision_scenarios (
 id uuid primary key default gen_random_uuid(), title text not null,
 scenario_type text not null check (scenario_type in ('financing','investment','staffing','operations','other')),
 inputs jsonb not null default '{}'::jsonb, results jsonb not null default '{}'::jsonb,
 source_snapshot jsonb not null default '{}'::jsonb, assumptions jsonb not null default '{}'::jsonb,
 risk_notes jsonb not null default '[]'::jsonb, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.decision_proposals (
 id uuid primary key default gen_random_uuid(), title text not null,
 category text not null check (category in ('financing','investment','staffing','training','organization','operations','land','commercial','technical','other')),
 summary text not null default '', rationale text not null default '', proposed_action text not null default '',
 source_modules text[] not null default '{}'::text[], source_period_start date, source_period_end date,
 source_snapshot jsonb not null default '{}'::jsonb, assumptions jsonb not null default '{}'::jsonb,
 options jsonb not null default '[]'::jsonb, risks jsonb not null default '[]'::jsonb,
 confidence numeric(5,2) check (confidence is null or confidence between 0 and 100), amount numeric(16,2),
 status text not null default 'draft' check (status in ('draft','proposed','in_review','approved','rejected','modified','executed','closed','cancelled')),
 priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
 responsible_profile_id uuid references public.profiles(id), due_at date,
 created_by uuid not null references auth.users(id), updated_by uuid references auth.users(id), decided_by uuid references auth.users(id),
 decided_at timestamptz, decision_reason text, executed_at timestamptz, outcome jsonb, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.decision_proposal_versions (
 id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.decision_proposals(id) on delete restrict,
 version_number integer not null, snapshot jsonb not null, changed_by uuid not null references auth.users(id),
 change_reason text, created_at timestamptz not null default now(), unique(proposal_id, version_number)
);
create table if not exists public.decision_approvals (
 id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.decision_proposals(id) on delete restrict,
 action text not null check (action in ('submitted','approved','rejected','modified','executed','closed','cancelled','commented')),
 actor_user_id uuid not null references auth.users(id), reason text, previous_status text, new_status text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.decision_center_audit (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users(id),
 entity_type text not null, entity_id uuid, action text not null, before_state jsonb, after_state jsonb, reason text, created_at timestamptz not null default now()
);
create table if not exists public.decision_center_settings (
 key text primary key, value jsonb not null default '{}'::jsonb, description text,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create index if not exists decision_proposals_status_created_idx on public.decision_proposals(status, created_at desc) where deleted_at is null;
create index if not exists decision_proposals_category_idx on public.decision_proposals(category, created_at desc) where deleted_at is null;
create index if not exists decision_approvals_proposal_idx on public.decision_approvals(proposal_id, created_at desc);
create index if not exists decision_versions_proposal_idx on public.decision_proposal_versions(proposal_id, version_number desc);
create index if not exists decision_financing_active_idx on public.decision_financing_sources(is_active, observed_at desc);
create or replace function public.can_access_decision_center(required_permission text default 'view')
returns boolean language sql stable security definer set search_path = public, auth as $$
 select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()
   and lower(coalesce(ur.role,'')) ~ '(pdg|president|président|directeur general|directeur général|(^|[^a-z])dg([^a-z]|$)|admin)')
 or exists (select 1 from public.decision_access_grants g where g.user_id = auth.uid() and g.revoked_at is null
   and (required_permission = any(g.permissions) or 'admin' = any(g.permissions)));
$$;
create or replace function public.decision_center_is_executive()
returns boolean language sql stable security definer set search_path = public, auth as $$
 select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()
   and lower(coalesce(ur.role,'')) ~ '(pdg|president|président|directeur general|directeur général|(^|[^a-z])dg([^a-z]|$)|admin)');
$$;
alter table public.decision_access_grants enable row level security;
alter table public.decision_financing_sources enable row level security;
alter table public.decision_scenarios enable row level security;
alter table public.decision_proposals enable row level security;
alter table public.decision_proposal_versions enable row level security;
alter table public.decision_approvals enable row level security;
alter table public.decision_center_audit enable row level security;
alter table public.decision_center_settings enable row level security;
drop policy if exists decision_access_grants_read on public.decision_access_grants;
create policy decision_access_grants_read on public.decision_access_grants for select to authenticated using (public.decision_center_is_executive() or user_id = auth.uid());
drop policy if exists decision_access_grants_write on public.decision_access_grants;
create policy decision_access_grants_write on public.decision_access_grants for all to authenticated using (public.decision_center_is_executive()) with check (public.decision_center_is_executive());
drop policy if exists decision_financing_sources_access on public.decision_financing_sources;
create policy decision_financing_sources_access on public.decision_financing_sources for all to authenticated using (public.can_access_decision_center('view')) with check (public.can_access_decision_center('manage'));
drop policy if exists decision_scenarios_access on public.decision_scenarios;
create policy decision_scenarios_access on public.decision_scenarios for all to authenticated using (public.can_access_decision_center('view')) with check (public.can_access_decision_center('create'));
drop policy if exists decision_proposals_access on public.decision_proposals;
create policy decision_proposals_access on public.decision_proposals for select to authenticated using (public.can_access_decision_center('view') and deleted_at is null);
drop policy if exists decision_proposals_insert on public.decision_proposals;
create policy decision_proposals_insert on public.decision_proposals for insert to authenticated with check (public.can_access_decision_center('create') and created_by = auth.uid());
drop policy if exists decision_proposals_update on public.decision_proposals;
create policy decision_proposals_update on public.decision_proposals for update to authenticated
 using (public.can_access_decision_center('manage') or public.can_access_decision_center('approve') or (public.can_access_decision_center('create') and created_by = auth.uid() and status in ('draft','proposed')))
 with check (public.can_access_decision_center('manage') or public.can_access_decision_center('approve') or public.can_access_decision_center('create'));
drop policy if exists decision_versions_access on public.decision_proposal_versions;
create policy decision_versions_access on public.decision_proposal_versions for select to authenticated using (public.can_access_decision_center('view'));
drop policy if exists decision_versions_insert on public.decision_proposal_versions;
create policy decision_versions_insert on public.decision_proposal_versions for insert to authenticated with check (public.can_access_decision_center('create') and changed_by = auth.uid());
drop policy if exists decision_approvals_access on public.decision_approvals;
create policy decision_approvals_access on public.decision_approvals for select to authenticated using (public.can_access_decision_center('view'));
drop policy if exists decision_approvals_insert on public.decision_approvals;
create policy decision_approvals_insert on public.decision_approvals for insert to authenticated with check ((public.can_access_decision_center('approve') or public.can_access_decision_center('manage')) and actor_user_id = auth.uid());
drop policy if exists decision_audit_access on public.decision_center_audit;
create policy decision_audit_access on public.decision_center_audit for select to authenticated using (public.can_access_decision_center('view'));
drop policy if exists decision_audit_insert on public.decision_center_audit;
create policy decision_audit_insert on public.decision_center_audit for insert to authenticated with check (public.can_access_decision_center('create') and actor_user_id = auth.uid());
drop policy if exists decision_settings_access on public.decision_center_settings;
create policy decision_settings_access on public.decision_center_settings for select to authenticated using (public.can_access_decision_center('view'));
drop policy if exists decision_settings_write on public.decision_center_settings;
create policy decision_settings_write on public.decision_center_settings for all to authenticated using (public.can_access_decision_center('manage')) with check (public.can_access_decision_center('manage'));
grant select, insert, update on public.decision_proposals to authenticated;
grant select, insert on public.decision_proposal_versions to authenticated;
grant select, insert on public.decision_approvals to authenticated;
grant select, insert on public.decision_center_audit to authenticated;
grant select, insert, update on public.decision_scenarios to authenticated;
grant select, insert, update on public.decision_financing_sources to authenticated;
grant select, insert, update, delete on public.decision_access_grants to authenticated;
grant select, insert, update, delete on public.decision_center_settings to authenticated;
