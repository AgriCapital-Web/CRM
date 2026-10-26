create or replace view public.v_workspace_organization_chart
with (security_invoker = true)
as
with staff_base as (
  select
    p.id as profile_id,
    p.user_id,
    p.nom_complet as employee_name,
    p.photo_url as employee_photo_url,
    p.poste,
    p.departement,
    p.actif,
    coalesce(ur.role, '') as role_code,
    coalesce(ar.nom, nullif(p.poste, ''), 'Collaborateur') as role_name,
    coalesce(ar.niveau, 99) as role_level,
    coalesce(p.equipe_id, em.equipe_id) as team_id,
    e.nom as team_name,
    e.responsable_id as team_responsable_id,
    e.superviseur_id as team_superviseur_id,
    coalesce(p.region_id, zr.zone_id) as effective_region_id,
    coalesce(p.district_id, zd.zone_id, r.district_id) as effective_district_id,
    r.nom as region_name,
    d.nom as district_name
  from public.profiles p
  left join lateral (
    select ur0.role
    from public.user_roles ur0
    where ur0.user_id = p.user_id and ur0.is_primary is true
    order by ur0.created_at desc
    limit 1
  ) ur on true
  left join public.app_roles ar on ar.code = ur.role
  left join lateral (
    select em0.equipe_id
    from public.equipe_membres em0
    where em0.profile_id = p.id
    order by em0.created_at desc
    limit 1
  ) em on true
  left join public.equipes e on e.id = coalesce(p.equipe_id, em.equipe_id)
  left join lateral (
    select za.zone_id
    from public.zone_assignments za
    where za.user_id = p.user_id and lower(za.zone_type) in ('region', 'rÃ©gion')
    order by za¶»§q«^