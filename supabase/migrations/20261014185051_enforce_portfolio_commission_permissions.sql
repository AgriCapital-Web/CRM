-- Sensitive financial tables require an explicit role permission, not only team membership.
CREATE OR REPLACE FUNCTION private.can_read_commission(_user_id uuid, _profile_id uuid, _type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      where ur.user_id = _user_id
        and rp.permission_code = 'commissions.view'
    )
    and (
    private.is_global_admin(_user_id)
    or exists(select 1 from public.user_roles where user_id=_user_id and role in ('comptable','responsable_operations'))
    or exists(
      select 1
      from public.profiles viewer
      join public.profiles target on target.id=_profile_id
      where viewer.user_id=_user_id
        and (
          viewer.id=target.id
          or (
            viewer.equipe_id is not null and viewer.equipe_id=target.equipe_id
            and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role in ('chef_equipe_commercial','chef_equipe_technique','chef_equipe_service_client'))
            and (
              (_type='technique' and exists(select 1 from public.user_roles ur where ur.user_id=target.user_id and ur.role='technicien'))
              or (_type<>'technique' and exists(select 1 from public.user_roles ur where ur.user_id=target.user_id and ur.role in ('commercial','chef_equipe_commercial')))
            )
          )
          or (
            exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_commercial')
            and _type<>'technique'
            and exists(select 1 from public.user_roles ur where ur.user_id=target.user_id and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
          )
          or (
            exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='superviseur_mobilisation_fonciere')
            and viewer.region_id is not null and viewer.region_id=target.region_id
            and exists(select 1 from public.user_roles ur where ur.user_id=target.user_id and ur.role='mobilisateur_foncier')
          )
        )
    ));
$function$
;

drop policy if exists "Portfolio scoped read" on public.portefeuilles;
create policy "Portfolio scoped read" on public.portefeuilles
for select to authenticated
using (private.has_role_permission('portefeuilles.view') and ((private.has_role_permission('portefeuilles.view'::text) AND (private.is_global_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['comptable'::text, 'responsable_operations'::text]))))) OR (user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (profiles viewer
     JOIN profiles target ON ((target.user_id = portefeuilles.user_id)))
  WHERE ((viewer.user_id = ( SELECT auth.uid() AS uid)) AND (viewer.equipe_id IS NOT NULL) AND (viewer.equipe_id = target.equipe_id) AND (EXISTS ( SELECT 1
           FROM user_roles ur
          WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['chef_equipe_commercial'::text, 'chef_equipe_technique'::text, 'chef_equipe_service_client'::text])))))))) OR ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = 'responsable_commercial'::text)))) AND (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = portefeuilles.user_id) AND (ur.role = ANY (ARRAY['commercial'::text, 'chef_equipe_commercial'::text, 'responsable_commercial'::text]))))))))));

drop policy if exists "Foncier supervisor regional portfolios" on public.portefeuilles;
create policy "Foncier supervisor regional portfolios" on public.portefeuilles
for select to authenticated
using (private.has_role_permission('portefeuilles.view') and ((private.has_role_permission('portefeuilles.view'::text) AND ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'superviseur_mobilisation_fonciere'::text)))) AND (EXISTS ( SELECT 1
   FROM (profiles viewer
     JOIN profiles target ON ((target.user_id = portefeuilles.user_id)))
  WHERE ((viewer.user_id = auth.uid()) AND (viewer.region_id IS NOT NULL) AND (viewer.region_id = target.region_id) AND (EXISTS ( SELECT 1
           FROM user_roles ur
          WHERE ((ur.user_id = target.user_id) AND (ur.role = 'mobilisateur_foncier'::text)))))))))));
