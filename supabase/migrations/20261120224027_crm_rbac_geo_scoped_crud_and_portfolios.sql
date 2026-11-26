begin;

CREATE OR REPLACE FUNCTION private.crm_user_can_access_geo(p_user_id uuid, p_region_id uuid, p_district_id uuid, p_departement_id uuid, p_sous_prefecture_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user_id is not null and (
    private.crm_is_global_admin(p_user_id)
    or private.crm_user_has_global_scope(p_user_id)
    or exists (
      select 1 from public.zone_assignments z
      where z.user_id=p_user_id
        and (
          (z.zone_type='region' and z.zone_id=p_region_id)
          or (z.zone_type='district' and z.zone_id=p_district_id)
          or (z.zone_type='departement' and z.zone_id=p_departement_id)
          or (z.zone_type='sous_prefecture' and z.zone_id=p_sous_prefecture_id)
        )
    )
    or exists (
      select 1 from public.user_roles ur
      join public.app_roles ar on ar.code=ur.role and ar.actif=true
      join public.profiles p on p.user_id=p_user_id
      where
        (ar.niveau_couverture='region' and p.region_id is not null and p.region_id=p_region_id)
        or (ar.niveau_couverture='district' and p.district_id is not null and p.district_id=p_district_id)
    )
  );
$function$


update public.app_roles set libelle_couverture='Département',updated_at=now()
where code in ('commercial','chef_equipe_technique') and niveau_couverture='departement'
  and libelle_couverture is distinct from 'Département';

drop policy if exists "CRM clients insert by permission" on public.clients;
create policy clients_insert_by_permission_and_geo_scope on public.clients for insert to authenticated with check (
  private.crm_has_role_permission('clients.create') and created_by=(select auth.uid())
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id)
);

drop policy if exists "CRM users create owned leads" on public.leads;
create policy leads_insert_by_permission_and_geo_scope on public.leads for insert to authenticated with check (
  private.crm_has_role_permission('leads.create') and created_by=(select auth.uid())
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id)
  and (assigned_to is null or assigned_to=(select auth.uid()) or private.can_supervise_leads((select auth.uid()))
    or private.can_service_assign_lead((select auth.uid()),assigned_to))
);

drop policy if exists "CRM parcelles insert by permission" on public.parcelles;
create policy parcelles_insert_by_permission_and_geo_scope on public.parcelles for insert to authenticated with check (
  private.crm_has_role_permission('parcelles.create') and created_by=(select auth.uid())
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id)
);

drop policy if exists "CRM plantations insert by permission" on public.plantations;
create policy plantations_insert_by_permission_and_client_scope on public.plantations for insert to authenticated with check (
  private.crm_has_role_permission('plantations.create') and private.can_access_client((select auth.uid()),client_id)
);

drop policy if exists "Authorized users can insert proprietaires" on public.proprietaires_terres;
drop policy if exists "Support global insert landowners v2" on public.proprietaires_terres;
create policy proprietaires_insert_by_permission_and_geo_scope on public.proprietaires_terres for insert to authenticated with check (
  private.crm_has_role_permission('proprietaires.create') and created_by=(select auth.uid())
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id)
);

drop policy if exists "Authorized users can view proprietaires" on public.proprietaires_terres;
drop policy if exists "Support global read landowners v2" on public.proprietaires_terres;
create policy proprietaires_read_by_permission_and_geo_scope on public.proprietaires_terres for select to authenticated using (
  private.crm_has_role_permission('proprietaires.view')
  and (created_by=(select auth.uid()) or private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id))
);

drop policy if exists "CRM landowners update restricted business roles" on public.proprietaires_terres;
create policy proprietaires_update_by_permission_and_geo_scope on public.proprietaires_terres for update to authenticated
using (private.crm_has_role_permission('proprietaires.update')
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id))
with check (private.crm_has_role_permission('proprietaires.update')
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id));

drop policy if exists "Authorized staff delete proprietaires" on public.proprietaires_terres;
drop policy if exists "Proprietaires delete by permission" on public.proprietaires_terres;
create policy proprietaires_delete_by_permission_and_geo_scope on public.proprietaires_terres for delete to authenticated using (
  private.crm_has_role_permission('proprietaires.delete')
  and private.crm_user_can_access_geo((select auth.uid()),region_id,district_id,departement_id,sous_prefecture_id)
);

drop policy if exists "CRM leadership global leads read v2" on public.leads;
drop policy if exists "Scoped staff view leads" on public.leads;
create policy leads_read_by_permission_and_scope on public.leads for select to authenticated using (
  (private.crm_has_role_permission('leads.view') and private.can_access_lead((select auth.uid()),id))
  or (private.crm_has_role_permission('leads.create') and (created_by=(select auth.uid()) or assigned_to=(select auth.uid())))
);

drop policy if exists "Leads delete by permission" on public.leads;
drop policy if exists "Scoped staff delete leads" on public.leads;
create policy leads_delete_by_permission_and_scope on public.leads for delete to authenticated using (
  private.crm_has_role_permission('leads.delete') and private.can_access_lead((select auth.uid()),id)
);

drop policy if exists "Scoped staff update leads" on public.leads;
create policy leads_update_by_permission_and_scope on public.leads for update to authenticated
using (
  (private.crm_has_role_permission('leads.update')
    or (private.crm_has_role_permission('leads.create') and (created_by=(select auth.uid()) or assigned_to=(select auth.uid()))))
  and private.can_access_lead((select auth.uid()),id)
)
with check (
  (private.crm_has_role_permission('leads.update')
    or (private.crm_has_role_permission('leads.create') and (created_by=(select auth.uid()) or assigned_to=(select auth.uid()))))
  and private.can_access_lead((select auth.uid()),id)
  and (assigned_to is null or assigned_to=(select auth.uid())
    or private.can_assign_lead_to((select auth.uid()),assigned_to))
);

drop policy if exists pdg_read_only_parcelles_delete on public.parcelles;
drop policy if exists pdg_read_only_parcelles_insert on public.parcelles;
drop policy if exists pdg_read_only_parcelles_update on public.parcelles;
drop policy if exists pdg_read_only_plantations_delete on public.plantations;
drop policy if exists pdg_read_only_plantations_insert on public.plantations;
drop policy if exists pdg_read_only_plantations_update on public.plantations;

drop policy if exists "Portfolio scoped read" on public.portefeuilles;
create policy portefeuille_read_by_role_scope on public.portefeuilles for select to authenticated using (
  private.crm_has_role_permission('portefeuilles.view')
  and (
    user_id=(select auth.uid())
    or private.crm_user_has_global_scope((select auth.uid()))
    or (
      exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='responsable_operations')
      and (
        exists(select 1 from public.profiles viewer join public.profiles target on target.user_id=portefeuilles.user_id
          where viewer.user_id=(select auth.uid()) and viewer.region_id is not null and viewer.region_id=target.region_id)
        or exists(select 1 from public.zone_assignments z join public.profiles target on target.user_id=portefeuilles.user_id
          where z.user_id=(select auth.uid()) and z.zone_type='region' and z.zone_id=target.region_id)
      )
    )
    or (
      exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='responsable_commercial')
      and exists(select 1 from public.profiles viewer join public.profiles target on target.user_id=portefeuilles.user_id
        where viewer.user_id=(select auth.uid()) and viewer.region_id is not null and viewer.region_id=target.region_id)
      and exists(select 1 from public.user_roles tr where tr.user_id=portefeuilles.user_id
        and tr.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
    )
    or (
      exists(select 1 from public.profiles viewer join public.profiles target on target.user_id=portefeuilles.user_id
        where viewer.user_id=(select auth.uid()) and (
          (viewer.equipe_id is not null and viewer.equipe_id=target.equipe_id)
          or exists(select 1 from public.equipe_membres vm join public.equipe_membres tm on tm.equipe_id=vm.equipe_id
            where vm.profile_id=viewer.id and tm.profile_id=target.id)
        ))
      and exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
        and ur.role in ('chef_equipe_commercial','chef_equipe_technique','chef_equipe_service_client'))
    )
  )
);

notify pgrst, 'reload schema';
commit;