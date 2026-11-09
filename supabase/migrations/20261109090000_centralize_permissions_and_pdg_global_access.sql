-- Centralise les permissions dans PostgreSQL. Le rôle PDG est le seul rôle global.
begin;

create or replace function private.is_pdg(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id is not null and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and lower(btrim(ur.role)) = 'pdg'
  );
$$;

revoke all on function private.is_pdg(uuid) from public, anon;
grant execute on function private.is_pdg(uuid) to authenticated, service_role;

-- Aucun nom, email ou identifiant de personne n'entre dans la règle : le rôle attribué fait foi.
create or replace function private.is_global_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg(_user_id);
$$;

revoke all on function private.is_global_admin(uuid) from public, anon;
grant execute on function private.is_global_admin(uuid) to authenticated, service_role;

-- Les permissions de rôle sont résolues exclusivement côté base.
create or replace function private.has_role_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
      where ur.user_id = (select auth.uid())
        and rp.permission_code = p_permission_code
    );
$$;

revoke all on function private.has_role_permission(text) from public, anon;
grant execute on function private.has_role_permission(text) to authenticated, service_role;

create or replace function public.current_user_has_app_permission(required_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
      where ur.user_id = (select auth.uid())
        and rp.permission_code = required_code
    );
$$;

revoke all on function public.current_user_has_app_permission(text) from public, anon;
grant execute on function public.current_user_has_app_permission(text) to authenticated, service_role;

-- Correction globale réservée au PDG pour les bénéficiaires particuliers.
insert into public.app_permissions (code, module, action, libelle, description, actif)
values ('clients.update_private_beneficiary', 'clients', 'update_private_beneficiary',
        'Clients — Corriger les bénéficiaires particuliers',
        'Modification corrective des fiches bénéficiaires particuliers réservée au rôle PDG.',
        true)
on conflict (code) do update set
  module = excluded.module,
  action = excluded.action,
  libelle = excluded.libelle,
  description = excluded.description,
  actif = true,
  updated_at = now();

-- API unique consommée par le frontend : elle ne renvoie que des permissions calculées en SQL.
-- Les capacités system.* sont également résolues ici, jamais par comparaison de rôles dans React.
create or replace function public.current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select (select auth.uid()) as user_id,
           private.is_pdg((select auth.uid())) as is_pdg
  ),
  role_codes as (
    select lower(btrim(ur.role)) as role
    from public.user_roles ur, actor a
    where ur.user_id = a.user_id
  ),
  granted as (
    select ap.code
    from public.app_permissions ap, actor a
    where ap.actif is true
      and (
        a.is_pdg
        or exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_code = ur.role
          where ur.user_id = a.user_id
            and rp.permission_code = ap.code
        )
      )
  ),
  capabilities(code) as (
    select 'system.global_admin' where (select is_pdg from actor)
    union all select 'system.can_supervise_leads'
      where (select is_pdg from actor)
         or exists (select 1 from role_codes where role in ('responsable_operations','responsable_commercial','chef_equipe_commercial','service_client','chef_equipe_service_client'))
    union all select 'system.service_client'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('service_client','chef_equipe_service_client'))
    union all select 'system.commercial_assignable'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('commercial','chef_equipe_commercial','responsable_commercial'))
    union all select 'system.commercial_manager'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('responsable_commercial','manager_commercial_national','responsable_operations'))
    union all select 'system.commercial_director'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('manager_commercial_national','responsable_operations'))
    union all select 'system.technical_manager'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('chef_equipe_technique','manager_technique_national','responsable_operations'))
    union all select 'system.manage_account_requests'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','service_client','chef_equipe_service_client'))
    union all select 'system.manage_user_credentials'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','responsable_operations'))
    union all select 'system.client_only'
      where exists (select 1 from role_codes where role in ('client','client_portal'))
    union all select 'system.transfer_plantation'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('service_client','chef_equipe_service_client'))
    union all select 'system.independent_service_customers'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations'))
    union all select 'system.independent_service_proformas'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations'))
    union all select 'system.independent_service_items'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations'))
    union all select 'system.view_team_commissions'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('responsable_commercial','chef_equipe_commercial','responsable_operations'))
    union all select 'system.commercial_role'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('commercial','chef_equipe_commercial','responsable_commercial','manager_commercial_national'))
    union all select 'system.zone_scope_global'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','responsable_operations','manager_commercial_national','manager_technique_national'))
    union all select 'system.independent_service_write'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','service_client','chef_equipe_service_client'))
    union all select 'system.independent_service_operations'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','technicien','chef_equipe_technique','manager_technique_national','responsable_operations'))
    union all select 'system.manage_hr'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('dg','ressources_humaines','responsable_rh','rh','responsable_operations'))
    union all select 'system.role_pdg' where exists (select 1 from role_codes where role = 'pdg')
    union all select 'system.role_responsable_commercial' where exists (select 1 from role_codes where role = 'responsable_commercial')
    union all select 'system.role_chef_equipe' where exists (select 1 from role_codes where role in ('chef_equipe_commercial','chef_equipe_technique','chef_equipe_service_client'))
    union all select 'system.role_commercial' where exists (select 1 from role_codes where role = 'commercial')
    union all select 'system.role_technique' where exists (select 1 from role_codes where role in ('technicien','chef_equipe_technique','manager_technique_national'))
  )
  select coalesce(array_agg(code order by code), array[]::text[])
  from (
    select code from granted
    union
    select code from capabilities
  ) effective;
$$;

revoke all on function public.current_user_permissions() from public, anon;
grant execute on function public.current_user_permissions() to authenticated, service_role;

-- La fonction centrale finance ne donne plus de privilège global au DG.
create or replace function public.finance_can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or private.has_role_permission('finance.manage')
    or private.has_role_permission('finance.expenses')
    or private.has_role_permission('finance.associates')
    or private.has_role_permission('finance.payroll')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and lower(btrim(ur.role)) = 'comptable'
    );
$$;

create or replace function public.finance_can_view()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or private.has_role_permission('finance.view')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and lower(btrim(ur.role)) in ('comptable','responsable_operations','associe_actionnaire')
    );
$$;

create or replace function public.finance_can_view_payroll()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or private.has_role_permission('finance.payroll')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and lower(btrim(ur.role)) = 'comptable'
    );
$$;

create or replace function public.workspace_can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or private.has_role_permission('finance.manage')
    or private.has_role_permission('finance.expenses')
    or private.has_role_permission('finance.payroll')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and lower(btrim(ur.role)) in ('comptable','responsable_operations')
    );
$$;

-- Accès global PDG sur toutes les tables publiques déjà protégées par RLS.
-- Les autres rôles continuent d'être évalués par les politiques existantes.
do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relrowsecurity is true
  loop
    execute format('drop policy if exists pdg_global_all_access on %I.%I', r.schema_name, r.table_name);
    execute format(
      'create policy pdg_global_all_access on %I.%I for all to authenticated using (private.is_pdg((select auth.uid()))) with check (private.is_pdg((select auth.uid())))',
      r.schema_name, r.table_name
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;
