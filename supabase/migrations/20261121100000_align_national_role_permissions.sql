-- Align the national leadership and HR role matrices with their defined responsibilities.
-- The live database was updated and verified before this migration was added to source control.

insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values
  ('manager_commercial_national','dashboard.view'),
  ('manager_commercial_national','clients.view'),
  ('manager_commercial_national','leads.view'),
  ('manager_commercial_national','leads.create'),
  ('manager_commercial_national','leads.update'),
  ('manager_commercial_national','leads.assign'),
  ('manager_commercial_national','commissions.view'),
  ('manager_commercial_national','messagerie.view'),
  ('manager_commercial_national','messagerie.send'),
  ('manager_commercial_national','offres.view'),
  ('manager_commercial_national','paiements.view'),
  ('manager_commercial_national','parcelles.view'),
  ('manager_commercial_national','plantations.view'),
  ('manager_commercial_national','portefeuilles.view'),
  ('manager_commercial_national','proprietaires.view'),
  ('manager_commercial_national','documents.view'),
  ('manager_commercial_national','tickets.view'),
  ('manager_commercial_national','tickets.create'),
  ('manager_commercial_national','tickets.update'),
  ('manager_commercial_national','system.can_supervise_leads'),
  ('manager_commercial_national','system.commercial_manager'),
  ('manager_commercial_national','system.commercial_director'),
  ('manager_commercial_national','system.view_team_commissions'),

  ('manager_technique_national','dashboard.view'),
  ('manager_technique_national','clients.view'),
  ('manager_technique_national','documents.upload'),
  ('manager_technique_national','documents.view'),
  ('manager_technique_national','messagerie.view'),
  ('manager_technique_national','parcelles.view'),
  ('manager_technique_national','plantations.create'),
  ('manager_technique_national','plantations.update'),
  ('manager_technique_national','plantations.view'),
  ('manager_technique_national','proprietaires.view'),
  ('manager_technique_national','rapports.manage_technique'),
  ('manager_technique_national','rapports.view_technique'),
  ('manager_technique_national','tickets.create'),
  ('manager_technique_national','tickets.update'),
  ('manager_technique_national','tickets.view'),
  ('manager_technique_national','system.role_technique'),
  ('manager_technique_national','system.technical_manager'),

  ('ressources_humaines','dashboard.view')
) as v(role_code, permission_code)
where exists (select 1 from public.app_roles r where r.code = v.role_code and r.actif is true)
  and exists (select 1 from public.app_permissions p where p.code = v.permission_code and p.actif is true)
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_code = v.role_code and rp.permission_code = v.permission_code
  );

create or replace function private.can_supervise_leads(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
    select 1
    from public.user_roles
    where user_id = _user_id
      and role in (
        'responsable_operations',
        'responsable_commercial',
        'chef_equipe_commercial',
        'manager_commercial_national',
        'service_client',
        'chef_equipe_service_client',
        'pdg'
      )
  );
$function$;

-- Remove only the obsolete permission mapping for a role absent from both the
-- role catalogue and all user assignments.
delete from public.role_permissions rp
where rp.role_code = 'directeur_tc'
  and not exists (select 1 from public.app_roles r where r.code = rp.role_code)
  and not exists (select 1 from public.user_roles ur where ur.role = rp.role_code);
