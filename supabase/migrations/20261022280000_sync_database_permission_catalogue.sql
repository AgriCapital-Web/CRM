-- Keep the database permission catalogue aligned with every permission actually assigned to roles.
-- The catalogue had only one row while role_permissions referenced 97 distinct codes,
-- which left the role-management UI without the complete permission list.
insert into public.app_permissions (code,module,action,libelle,description,actif)
select distinct
  rp.permission_code,
  split_part(rp.permission_code,'.',1),
  coalesce(nullif(split_part(rp.permission_code,'.',2),''),'manage'),
  initcap(replace(replace(rp.permission_code,'.',' — '),'_',' ')),
  'Permission CRM : ' || rp.permission_code,
  true
from public.role_permissions rp
where nullif(btrim(rp.permission_code),'') is not null
on conflict (code) do update
set module=excluded.module,
    action=excluded.action,
    libelle=case when coalesce(btrim(public.app_permissions.libelle),'')='' then excluded.libelle else public.app_permissions.libelle end,
    description=case when coalesce(btrim(public.app_permissions.description),'')='' then excluded.description else public.app_permissions.description end,
    actif=true,
    updated_at=now();

-- Ensure permission catalogue entries are not accidentally disabled while still assigned.
update public.app_permissions ap
set actif=true, updated_at=now()
where exists(select 1 from public.role_permissions rp where rp.permission_code=ap.code)
  and ap.actif is distinct from true;
