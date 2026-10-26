create or replace view public.v_workspace_organization_chart
with (security_invoker = true)
as
with staff_base as (
  select p.id as profile_id, p.user_id, p.nom_complet as employee_name,
    p.photo_url as employee_photo_url, p.poste, p.departement, p.actif,
    coalesce(ur.role, '') as role_code,
    coalesce(ar.nom, nullif(p.poste, ''), 'Collaborateur') as role_name,
    coalesce(ar.niveau, 99) as role_level,
    coalesce(p.equipe_id, em.equipe_id) as team_id, e.nom as team_name,
    e.responsable_id as team_responsable_id, e.superviseur_id as team_superviseur_id,
    coalesce(p.region_id, zr.zone_id) as effective_region_id,
    coalesce(p.district_id, zd.zone_id, r.district_id) as effective_district_id,
    r.nom as region_name, d.nom as district_name
  from public.profiles p
  left join lateral (
    select ur0.role from public.user_roles ur0
    where ur0.user_id = p.user_id and ur0.is_primary is true
    order by ur0.created_at desc limit 1
  ) ur on true
  left join public.app_roles ar on ar.code = ur.role
  left join lateral (
    select em0.equipe_id from public.equipe_membres em0
    where em0.profile_id = p.id order by em0.created_at desc limit 1
  ) em on true
  left join public.equipes e on e.id = coalesce(p.equipe_id, em.equipe_id)
  left join lateral (
    select za.zone_id from public.zone_assignments za
    where za.user_id = p.user_id and lower(za.zone_type) in ('region', 'région')
    order by za.created_at desc limit 1
  ) zr on true
  left join lateral (
    select za.zone_id from public.zone_assignments za
    where za.user_id = p.user_id and lower(za.zone_type) = 'district'
    order by za.created_at desc limit 1
  ) zd on true
  left join public.regions r on r.id = coalesce(p.region_id, zr.zone_id)
  left join public.districts d on d.id = coalesce(p.district_id, zd.zone_id, r.district_id)
  where p.actif is distinct from false
), ranked as (
  select employee.*,
    manager.profile_id as manager_profile_id,
    manager.employee_name as manager_name,
    manager.employee_photo_url as manager_photo_url,
    row_number() over (
      partition by employee.profile_id
      order by
        case
          when employee.team_responsable_id = manager.profile_id or employee.team_responsable_id = manager.user_id
            or employee.team_superviseur_id = manager.profile_id or employee.team_superviseur_id = manager.user_id then 0
          when employee.team_id is not null and manager.team_id = employee.team_id then 1
          when employee.effective_district_id is not null and manager.effective_district_id = employee.effective_district_id then 2
          when employee.effective_region_id is not null and manager.effective_region_id = employee.effective_region_id then 3
          else 4
        end, manager.role_level asc, manager.employee_name asc
    ) as manager_rank
  from staff_base employee
  left join staff_base manager
    on manager.profile_id <> employee.profile_id
   and employee.role_level > 1
   and (
      employee.team_responsable_id = manager.profile_id
      or employee.team_responsable_id = manager.user_id
      or employee.team_superviseur_id = manager.profile_id
      or employee.team_superviseur_id = manager.user_id
      or (employee.role_level = 2 and manager.role_level = 1)
      or (employee.role_level = 3 and manager.role_level = 2)
      or (employee.role_level = 4 and manager.role_level = 2)
      or (
        manager.role_level < employee.role_level
        and (
          (employee.team_id is not null and manager.team_id = employee.team_id)
          or (employee.effective_district_id is not null and manager.effective_district_id = employee.effective_district_id)
          or (employee.effective_region_id is not null and manager.effective_region_id = employee.effective_region_id)
        )
      )
   )
)
select profile_id as id, profile_id, manager_profile_id, employee_name, employee_photo_url,
  role_code, role_name, role_level, team_id, team_name,
  effective_region_id as region_id, region_name, effective_district_id as district_id,
  district_name, manager_name, manager_photo_url,
  (role_level > 1 and manager_profile_id is null) as rattachement_a_verifier
from ranked
where manager_rank = 1 or manager_rank is null;

revoke all on public.v_workspace_organization_chart from anon;
grant select on public.v_workspace_organization_chart to authenticated;
