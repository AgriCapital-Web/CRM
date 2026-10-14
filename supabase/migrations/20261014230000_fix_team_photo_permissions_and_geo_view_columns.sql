-- Fix the geography view columns consumed by the CRM.
create or replace view public.v_geo_sous_prefectures as
select
  sp.id,
  sp.nom,
  sp.code,
  sp.departement_id,
  sp.est_active,
  sp.created_at,
  sp.code_sp,
  sp.sp_assigned_at,
  dep.est_actif as departement_actif,
  r.est_active as region_actif,
  d.est_actif as district_actif,
  (coalesce(d.est_actif,false) and coalesce(r.est_active,false) and coalesce(dep.est_actif,false) and coalesce(sp.est_active,false)) as est_active_effectif,
  dep.nom as departement_nom,
  r.nom as region_nom,
  d.nom as district_nom
from public.sous_prefectures sp
join public.departements dep on dep.id=sp.departement_id
join public.regions r on r.id=dep.region_id
join public.districts d on d.id=r.district_id;

-- Permit team managers and PDG/DG to upload and replace team photos.
drop policy if exists photos_equipes_insert_managers on storage.objects;
create policy photos_equipes_insert_managers on storage.objects
for insert to authenticated
with check (bucket_id = 'photos-equipes' and (
  private.is_global_admin(auth.uid())
  or private.has_role(auth.uid(),'pdg')
  or private.has_role(auth.uid(),'dg')
  or private.has_role_permission('parametres.manage_teams')
));

drop policy if exists photos_equipes_update_managers on storage.objects;
create policy photos_equipes_update_managers on storage.objects
for update to authenticated
using (bucket_id = 'photos-equipes' and (
  private.is_global_admin(auth.uid())
  or private.has_role(auth.uid(),'pdg')
  or private.has_role(auth.uid(),'dg')
  or private.has_role_permission('parametres.manage_teams')
))
with check (bucket_id = 'photos-equipes' and (
  private.is_global_admin(auth.uid())
  or private.has_role(auth.uid(),'pdg')
  or private.has_role(auth.uid(),'dg')
  or private.has_role_permission('parametres.manage_teams')
));
