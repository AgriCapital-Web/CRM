-- Align client-record write permissions with the official approval workflow.
-- Commercial and technical staff can register/view clients but cannot modify an existing dossier.
-- Relation client, Relation client team lead, DG and PDG retain update rights.
delete from public.role_permissions
where permission_code = 'clients.update'
  and role_code not in ('service_client', 'chef_equipe_service_client', 'pdg', 'dg');

-- Technicians can consult technical reports, but cannot manage/edit reports globally.
delete from public.role_permissions
where role_code = 'technicien'
  and permission_code = 'rapports.manage_technique';
