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
create or replace function private.crm_is_global_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg(_user_id);
$$;

revoke all on function private.crm_is_global_admin(uuid) from public, anon;
grant execute on function private.crm_is_global_admin(uuid) to authenticated, service_role;

-- Les fonctions historiques is_admin ne doivent plus assimiler DG ou Responsable des Opérations au PDG.
-- Les fonctions historiques public.is_admin/private.is_admin restent inchangées
-- afin de préserver les autres applications partageant cette base. Le CRM utilise
-- private.crm_is_global_admin pour son accès global réservé au rôle PDG.

-- Le modèle d'autorisation CRM est isolé des helpers partagés avec les portails et AcreMap.
create or replace function private.crm_has_role_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $crm_permission$
  select private.crm_is_global_admin((select auth.uid()))
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
      where ur.user_id = (select auth.uid())
        and rp.permission_code = p_permission_code
    );
$crm_permission$;

revoke all on function private.crm_has_role_permission(text) from public, anon;
grant execute on function private.crm_has_role_permission(text) to authenticated, service_role;

-- L'ancien helper nominatif ne repose plus sur une adresse e-mail.
create or replace function private.is_immutable_admin_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $crm_immutable$
  select private.crm_is_global_admin(_user_id);
$crm_immutable$;

-- La gestion des demandes de compte relève d'une permission dédiée, pas d'un statut global d'administrateur.
drop policy if exists "Admins view account requests" on public.account_requests;
drop policy if exists "Admins update account requests" on public.account_requests;
drop policy if exists "Admins delete account requests" on public.account_requests;
create policy "Account requests view by permission"
  on public.account_requests for select to authenticated
  using (private.crm_has_role_permission('parametres.manage_users'));
create policy "Account requests update by permission"
  on public.account_requests for update to authenticated
  using (private.crm_has_role_permission('parametres.manage_users'))
  with check (private.crm_has_role_permission('parametres.manage_users'));
create policy "Account requests delete by permission"
  on public.account_requests for delete to authenticated
  using (private.crm_has_role_permission('parametres.manage_users'));

-- Les permissions de rôle sont résolues exclusivement côté base.
create or replace function private.crm_has_role_permission(p_permission_code text)
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

revoke all on function private.crm_has_role_permission(text) from public, anon;
grant execute on function private.crm_has_role_permission(text) to authenticated, service_role;

create or replace function public.crm_current_user_has_app_permission(required_code text)
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

revoke all on function public.crm_current_user_has_app_permission(text) from public, anon;
grant execute on function public.crm_current_user_has_app_permission(text) to authenticated, service_role;

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
create or replace function public.crm_current_user_permissions()
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
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('chef_equipe_commercial','responsable_commercial','responsable_operations'))
    union all select 'system.commercial_director'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('responsable_commercial','manager_commercial_national','responsable_operations'))
    union all select 'system.technical_manager'
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('chef_equipe_technique','manager_technique_national','responsable_operations'))
    union all select 'system.manage_account_requests'
      where (select is_pdg from actor) or private.crm_has_role_permission('parametres.manage_users')
    union all select 'system.manage_user_credentials'
      where (select is_pdg from actor) or private.crm_has_role_permission('utilisateurs.update') or private.crm_has_role_permission('utilisateurs.reset_password')
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
      where (select is_pdg from actor) or exists (select 1 from role_codes where role in ('responsable_operations','manager_commercial_national','manager_technique_national'))
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
    union all select 'system.role_technique' where exists (select 1 from role_codes where role = 'chef_equipe_technique')
  )
  select coalesce(array_agg(code order by code), array[]::text[])
  from (
    select code from granted
    union
    select code from capabilities
  ) effective;
$$;

revoke all on function public.crm_current_user_permissions() from public, anon;
grant execute on function public.crm_current_user_permissions() to authenticated, service_role;

-- Les candidats et responsables d'équipe sont sélectionnés côté serveur.
create or replace function public.get_available_team_members(p_equipe_id uuid)
returns table (
  id uuid,
  nom_complet text,
  user_id uuid,
  equipe_id uuid,
  roles text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team_type text;
  v_member_role text;
  v_leader_role text;
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les candidats de cette équipe'
      using errcode = '42501';
  end if;

  select e.type_equipe into v_team_type
  from public.equipes e
  where e.id = p_equipe_id;

  if v_team_type is null then
    raise exception 'Équipe introuvable' using errcode = 'P0002';
  end if;

  v_member_role := case when v_team_type = 'technique' then 'technicien' else 'commercial' end;
  v_leader_role := case when v_team_type = 'technique' then 'chef_equipe_technique' else 'chef_equipe_commercial' end;

  return query
  select p.id, p.nom_complet, p.user_id, p.equipe_id,
         array_agg(distinct lower(btrim(ur.role)) order by lower(btrim(ur.role)))
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where p.actif is true
    and p.user_id is not null
    and (
      lower(btrim(ur.role)) in (v_member_role, v_leader_role, 'pdg', 'dg')
    )
    and not exists (
      select 1 from public.equipe_membres em
      where em.equipe_id = p_equipe_id and em.profile_id = p.id
    )
  group by p.id, p.nom_complet, p.user_id, p.equipe_id
  order by p.nom_complet;
end;
$$;

create or replace function public.get_team_responsible_candidates(p_team_type text)
returns table (
  id uuid,
  nom_complet text,
  user_id uuid,
  roles text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les responsables d'équipe'
      using errcode = '42501';
  end if;
  if p_team_type not in ('commercial','technique') then
    raise exception 'Type d'équipe invalide' using errcode = '22023';
  end if;
  v_role := case when p_team_type = 'technique' then 'chef_equipe_technique' else 'chef_equipe_commercial' end;

  return query
  select p.id, p.nom_complet, p.user_id,
         array_agg(distinct lower(btrim(ur.role)) order by lower(btrim(ur.role)))
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where p.actif is true
    and p.user_id is not null
    and lower(btrim(ur.role)) = v_role
  group by p.id, p.nom_complet, p.user_id
  order by p.nom_complet;
end;
$$;

revoke all on function public.get_available_team_members(uuid) from public, anon;
revoke all on function public.get_team_responsible_candidates(text) from public, anon;
grant execute on function public.get_available_team_members(uuid) to authenticated, service_role;
grant execute on function public.get_team_responsible_candidates(text) to authenticated, service_role;

-- La fonction centrale finance ne donne plus de privilège global au DG.
create or replace function public.finance_can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.expenses')
    or private.crm_has_role_permission('finance.associates')
    or private.crm_has_role_permission('finance.payroll')
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
    or private.crm_has_role_permission('finance.view')
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
    or private.crm_has_role_permission('finance.payroll')
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
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.expenses')
    or private.crm_has_role_permission('finance.payroll')
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and lower(btrim(ur.role)) in ('comptable','responsable_operations')
    );
$$;

-- La politique globale PDG CRM est créée dans la migration suivante avec exclusion explicite
-- des tables AcreMap, des portails séparés, des jetons et des journaux immuables.

notify pgrst, 'reload schema';
commit;
