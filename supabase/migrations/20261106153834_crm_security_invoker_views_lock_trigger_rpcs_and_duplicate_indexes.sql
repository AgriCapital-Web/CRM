begin;

drop policy if exists app_roles_public_signup_select on public.app_roles;
create policy app_roles_public_signup_select
on public.app_roles
for select to anon
using (
  actif is true
  and code = any (array[
    'commercial','technicien','mobilisateur_foncier',
    'superviseur_mobilisation_fonciere','chef_equipe_commercial',
    'chef_equipe_technique','responsable_commercial','responsable_operations',
    'responsable_district','comptable','service_client'
  ])
);
grant select on public.app_roles to anon;

alter view public.v_client_synthese set (security_invoker = true);
alter view public.v_public_signup_roles set (security_invoker = true);

revoke execute on function public.generate_prospect_id() from public, anon, authenticated;
revoke execute on function public.prepare_agricapital_notification() from public, anon, authenticated;
revoke execute on function public.snapshot_acquisition_offer_contract() from public, anon, authenticated;
revoke execute on function public.snapshot_client_offer_contract() from public, anon, authenticated;
revoke execute on function public.snapshot_offer_workflow_config() from public, anon, authenticated;
revoke execute on function public.validate_client_contact_role_duplicates() from public, anon, authenticated;

drop index if exists public.crm_parties_type_personne_idx;
drop index if exists public.strategic_plans_year_status_idx;

commit;
