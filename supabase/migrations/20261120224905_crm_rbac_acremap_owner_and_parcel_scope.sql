begin;

drop policy if exists acremap_lots_read on public.acremap_lots;
create policy acremap_lots_read_by_owner_scope on public.acremap_lots for select to authenticated using (
  private.crm_has_role_permission('proprietaires.view')
  and exists (
    select 1 from public.proprietaires_terres o
    where (o.id::text=acremap_lots.owner_id::text or o.id_unique=acremap_lots.owner_id::text)
      and private.crm_user_can_access_geo((select auth.uid()),o.region_id,o.district_id,o.departement_id,o.sous_prefecture_id)
  )
);

drop policy if exists acremap_results_read on public.acremap_morcellements;
create policy acremap_results_read_by_owner_or_parcel_scope on public.acremap_morcellements for select to authenticated using (
  private.crm_has_role_permission('proprietaires.view')
  and (
    exists (
      select 1 from public.proprietaires_terres o
      where (o.id::text=acremap_morcellements.owner_id::text or o.id_unique=acremap_morcellements.owner_id::text)
        and private.crm_user_can_access_geo((select auth.uid()),o.region_id,o.district_id,o.departement_id,o.sous_prefecture_id)
    )
    or exists (
      select 1 from public.parcelles p
      where p.id::text=acremap_morcellements.parcelle_id::text
        and private.can_access_parcelle((select auth.uid()),p.id)
    )
  )
);

notify pgrst, 'reload schema';
commit;