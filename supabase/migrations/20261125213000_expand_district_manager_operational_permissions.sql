-- Le responsable de district supervise les opérations commerciales,
-- techniques et foncières de son district, sans recevoir les droits financiers globaux.

insert into public.role_permissions (role_code, permission_code)
select 'responsable_district', p.code
from public.app_permissions p
where p.actif = true
  and p.code in (
    'acquisitions.validate',
    'beneficiaires.create',
    'documents.validate',
    'plantations.create',
    'proprietaires.validate',
    'rapports.export'
  )
on conflict (role_code, permission_code) do nothing;

comment on table public.role_permissions is
'Permissions par rôle. Les permissions opérationnelles du responsable de district sont limitées par les contrôles géographiques/RLS du district.';
