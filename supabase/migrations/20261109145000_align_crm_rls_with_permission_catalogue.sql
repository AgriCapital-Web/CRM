-- Les actions d'administration CRM sont exprimées par permissions dédiées.
-- Les helpers legacy is_admin restent disponibles pour les autres applications.
begin;

drop policy if exists "Admins delete acquisition_lots" on public.acquisition_lots;
create policy "PDG delete acquisition lots"
  on public.acquisition_lots for delete to authenticated
  using (private.crm_is_global_admin((select auth.uid())));

drop policy if exists "Admins delete clients" on public.clients;
create policy "Clients delete by permission"
  on public.clients for delete to authenticated
  using (private.crm_has_role_permission('clients.delete'));

drop policy if exists "Admins delete conventions" on public.conventions_foncieres;
create policy "Conventions delete by permission"
  on public.conventions_foncieres for delete to authenticated
  using (private.crm_has_role_permission('proprietaires.delete'));

drop policy if exists "Admins delete cotitulaires" on public.cotitulaires_mandataires;
create policy "Cotitulaires delete by permission"
  on public.cotitulaires_mandataires for delete to authenticated
  using (private.crm_has_role_permission('proprietaires.delete'));

drop policy if exists "Admins delete documents_convention" on public.documents_convention;
create policy "Convention documents delete by permission"
  on public.documents_convention for delete to authenticated
  using (private.crm_has_role_permission('proprietaires.delete'));

drop policy if exists "Admins delete domaines" on public.domaines;
create policy "Domaines delete by permission"
  on public.domaines for delete to authenticated
  using (private.crm_has_role_permission('proprietaires.delete'));

drop policy if exists "Admins delete leads" on public.leads;
create policy "Leads delete by permission"
  on public.leads for delete to authenticated
  using (private.crm_has_role_permission('leads.delete'));

drop policy if exists "Admins delete lots" on public.lots_hectares;
create policy "Lots delete by permission"
  on public.lots_hectares for delete to authenticated
  using (private.crm_has_role_permission('proprietaires.delete'));

drop policy if exists "Admins can delete proprietaires" on public.proprietaires_terres;
create policy "Proprietaires delete by permission"
  on public.proprietaires_terres for delete to authenticated
  using (private.crm_has_role_permission('proprietaires.delete'));

drop policy if exists "campements_auth_read_active" on public.campements;
create policy "Campements read active or geo managers"
  on public.campements for select to authenticated
  using (est_actif is true or private.crm_has_role_permission('parametres.manage_geo'));

drop policy if exists "Authenticated read active departements" on public.departements;
create policy "Departements read active or geo managers"
  on public.departements for select to authenticated
  using (est_actif is true or private.crm_has_role_permission('parametres.manage_geo'));

drop policy if exists "Authenticated read active districts" on public.districts;
create policy "Districts read active or geo managers"
  on public.districts for select to authenticated
  using (est_actif is true or private.crm_has_role_permission('parametres.manage_geo'));

drop policy if exists "Authenticated read active regions" on public.regions;
create policy "Regions read active or geo managers"
  on public.regions for select to authenticated
  using (est_active is true or private.crm_has_role_permission('parametres.manage_geo'));

drop policy if exists "Authenticated read active sous_prefectures" on public.sous_prefectures;
create policy "Sous prefectures read active or geo managers"
  on public.sous_prefectures for select to authenticated
  using (est_active is true or private.crm_has_role_permission('parametres.manage_geo'));

drop policy if exists "Authenticated read active villages" on public.villages;
create policy "Villages read active or geo managers"
  on public.villages for select to authenticated
  using (est_actif is true or private.crm_has_role_permission('parametres.manage_geo'));

drop policy if exists "Insert notifications restricted" on public.notifications;
create policy "Notifications insert by sender permission"
  on public.notifications for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or private.crm_has_role_permission('messagerie.send')
    or private.crm_has_role_permission('parametres.manage_system')
  );

drop policy if exists "Users read own profile photo" on storage.objects;
create policy "Users read own profile photo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'photos-profils'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (storage.foldername(name))[2] = (select auth.uid())::text
      or private.crm_has_role_permission('utilisateurs.view')
    )
  );

drop policy if exists "Staff create retraits" on public.retraits_portefeuille;
create policy "Staff create own or finance-authorized retraits"
  on public.retraits_portefeuille for insert to authenticated
  with check (
    private.is_staff((select auth.uid()))
    and (
      user_id is null
      or user_id = (select auth.uid())
      or private.crm_has_role_permission('finance.manage')
    )
  );

drop policy if exists "Staff update own retraits or admins" on public.retraits_portefeuille;
create policy "Staff update own or finance-authorized retraits"
  on public.retraits_portefeuille for update to authenticated
  using (
    private.crm_has_role_permission('finance.manage')
    or (
      private.is_staff((select auth.uid()))
      and user_id = (select auth.uid())
    )
  )
  with check (
    private.crm_has_role_permission('finance.manage')
    or (
      private.is_staff((select auth.uid()))
      and user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
commit;
