begin;

update public.app_roles
set libelle_couverture='Département',updated_at=now()
where code in ('commercial','chef_equipe_technique')
  and niveau_couverture='departement'
  and libelle_couverture is distinct from 'Département';

drop policy if exists "Staff read acquisition lots within scope" on public.acquisition_lots;
create policy acquisition_lots_read_by_client_permission_and_scope
  on public.acquisition_lots for select to authenticated
  using (private.crm_has_role_permission('clients.view')
    and private.can_access_client((select auth.uid()),client_id));

drop policy if exists "Staff read remboursements" on public.remboursements;
create policy remboursements_read_by_payment_permission_and_client_scope
  on public.remboursements for select to authenticated
  using (
    (private.crm_has_role_permission('paiements.view')
      or private.crm_has_role_permission('clients.view_money')
      or private.crm_has_role_permission('finance.view'))
    and private.can_access_client((select auth.uid()),client_id)
  );

drop policy if exists "Staff view retraits" on public.retraits_portefeuille;
create policy retraits_read_by_owner_or_payout_manager
  on public.retraits_portefeuille for select to authenticated
  using (
    user_id=(select auth.uid())
    or private.crm_has_role_permission('finance.payouts')
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('portefeuilles.manage_payouts')
  );

drop policy if exists "Staff create own or finance-authorized retraits" on public.retraits_portefeuille;
create policy retraits_insert_by_owner_or_payout_manager
  on public.retraits_portefeuille for insert to authenticated
  with check (
    (user_id=(select auth.uid()) and private.crm_has_role_permission('portefeuilles.view'))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('portefeuilles.manage_payouts')
  );

drop policy if exists "Staff update own or finance-authorized retraits" on public.retraits_portefeuille;
create policy retraits_update_by_owner_or_payout_manager
  on public.retraits_portefeuille for update to authenticated
  using (
    private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('portefeuilles.manage_payouts')
    or (user_id=(select auth.uid()) and statut='en_attente'
        and private.crm_has_role_permission('portefeuilles.view'))
  )
  with check (
    private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('portefeuilles.manage_payouts')
    or (user_id=(select auth.uid()) and statut='en_attente'
        and date_traitement is null and traite_par is null
        and private.crm_has_role_permission('portefeuilles.view'))
  );

drop policy if exists "Staff read transferts" on public.transferts_paiements;
create policy transferts_paiements_read_by_payment_scope
  on public.transferts_paiements for select to authenticated
  using (
    (private.crm_has_role_permission('paiements.view')
      or private.crm_has_role_permission('finance.view'))
    and private.can_access_client((select auth.uid()),client_source_id)
    and private.can_access_client((select auth.uid()),client_dest_id)
  );

drop policy if exists "Staff read zone_assignments" on public.zone_assignments;
create policy zone_assignments_read_own_or_geo_admin
  on public.zone_assignments for select to authenticated
  using (
    user_id=(select auth.uid())
    or private.crm_has_role_permission('parametres.manage_geo')
    or private.crm_has_role_permission('parametres.manage_teams')
    or private.crm_has_role_permission('parametres.manage_users')
  );

drop policy if exists role_perms_select_staff on public.role_permissions;
create policy role_permissions_read_by_role_admin
  on public.role_permissions for select to authenticated
  using (
    private.crm_has_role_permission('roles.view')
    or private.crm_has_role_permission('roles.manage_permissions')
  );

drop policy if exists app_roles_select_staff on public.app_roles;
create policy app_roles_read_by_role_admin
  on public.app_roles for select to authenticated
  using (
    private.crm_has_role_permission('roles.view')
    or private.crm_has_role_permission('roles.manage_permissions')
  );

drop policy if exists app_permissions_select_staff on public.app_permissions;
create policy app_permissions_read_by_role_admin
  on public.app_permissions for select to authenticated
  using (
    private.crm_has_role_permission('roles.view')
    or private.crm_has_role_permission('roles.manage_permissions')
  );

drop policy if exists hist_actions_insert_staff on public.historique_actions;
create policy historique_actions_insert_as_self
  on public.historique_actions for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and (
      private.crm_has_role_permission('clients.update')
      or private.crm_has_role_permission('leads.update')
      or private.crm_has_role_permission('rapports.manage_technique')
      or private.crm_has_role_permission('parametres.view_audit')
    )
  );

notify pgrst, 'reload schema';
commit;