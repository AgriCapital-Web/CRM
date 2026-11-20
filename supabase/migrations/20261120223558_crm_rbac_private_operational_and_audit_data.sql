begin;

drop policy if exists "Staff view notes" on public.activity_notes;
create policy activity_notes_read_by_author_or_audit
  on public.activity_notes for select to authenticated
  using (user_id=(select auth.uid()) or private.crm_has_role_permission('parametres.view_audit'));

drop policy if exists hist_actions_select_staff on public.historique_actions;
create policy historique_actions_read_by_scope
  on public.historique_actions for select to authenticated
  using (
    user_id=(select auth.uid())
    or private.crm_has_role_permission('parametres.view_audit')
    or (client_id is not null and private.can_access_client((select auth.uid()),client_id))
  );

drop policy if exists "Staff view history" on public.historique_activites;
create policy historique_activites_read_by_author_or_audit
  on public.historique_activites for select to authenticated
  using (user_id=(select auth.uid()) or private.crm_has_role_permission('parametres.view_audit'));

drop policy if exists "Staff read grille" on public.grille_remuneration;
create policy grille_remuneration_read_by_payroll_permission
  on public.grille_remuneration for select to authenticated
  using (
    private.crm_has_role_permission('finance.payroll')
    or private.crm_has_role_permission('ressources_humaines.manage_payroll')
    or private.crm_has_role_permission('parametres.manage_system')
  );

drop policy if exists "Staff read domaines" on public.domaines;
create policy domaines_read_by_owner_scope
  on public.domaines for select to authenticated
  using (
    private.crm_has_role_permission('proprietaires.view')
    and (
      private.crm_user_has_global_scope((select auth.uid()))
      or created_by=(select auth.uid())
      or exists (
        select 1 from public.zone_assignments z
        where z.user_id=(select auth.uid())
          and z.zone_type='sous_prefecture'
          and z.zone_id=domaines.sous_prefecture_id
      )
    )
  );
drop policy if exists "Domaines delete by permission" on public.domaines;
create policy domaines_delete_by_permission_and_scope
  on public.domaines for delete to authenticated
  using (
    private.crm_has_role_permission('proprietaires.delete')
    and (
      private.crm_user_has_global_scope((select auth.uid()))
      or created_by=(select auth.uid())
      or exists (
        select 1 from public.zone_assignments z
        where z.user_id=(select auth.uid()) and z.zone_type='sous_prefecture'
          and z.zone_id=domaines.sous_prefecture_id
      )
    )
  );

drop policy if exists "Staff read kkiapay_events" on public.kkiapay_events;
create policy kkiapay_events_read_by_payment_scope
  on public.kkiapay_events for select to authenticated
  using (
    private.crm_has_role_permission('paiements.view')
    and exists (
      select 1 from public.paiements p
      where p.id=kkiapay_events.paiement_id
        and private.can_access_client((select auth.uid()),p.client_id)
    )
  );

drop policy if exists "Staff read notification deliveries" on public.notification_deliveries;
create policy notification_deliveries_read_by_owner_or_system_admin
  on public.notification_deliveries for select to authenticated
  using (user_id=(select auth.uid()) or private.crm_has_role_permission('parametres.manage_system'));

drop policy if exists "Staff read notification provider events" on public.notification_provider_events;
create policy notification_provider_events_read_by_system_admin
  on public.notification_provider_events for select to authenticated
  using (private.crm_has_role_permission('parametres.manage_system'));

drop policy if exists "Users delete own notifications" on public.notifications;
create policy notifications_delete_own_or_system_admin
  on public.notifications for delete to authenticated
  using (user_id=(select auth.uid()) or private.crm_has_role_permission('parametres.manage_system'));

drop policy if exists "staff can view portal support requests" on public.portail_support_requests;
create policy portail_support_requests_read_by_ticket_scope
  on public.portail_support_requests for select to authenticated
  using (
    private.crm_has_role_permission('tickets.view')
    and (
      assigne_a=(select auth.uid())
      or (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (client_id is null and private.crm_user_has_global_scope((select auth.uid())))
    )
  );

drop policy if exists "staff can update portal support requests" on public.portail_support_requests;
create policy portail_support_requests_update_by_ticket_scope
  on public.portail_support_requests for update to authenticated
  using (
    private.crm_has_role_permission('tickets.update')
    and (
      assigne_a=(select auth.uid())
      or (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (client_id is null and private.crm_user_has_global_scope((select auth.uid())))
    )
  )
  with check (
    private.crm_has_role_permission('tickets.update')
    and (
      assigne_a=(select auth.uid())
      or (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (client_id is null and private.crm_user_has_global_scope((select auth.uid())))
    )
  );

drop policy photos_select_staff on public.photos_plantation;
create policy photos_select_by_plantation_scope
  on public.photos_plantation for select to authenticated
  using (
    private.crm_has_role_permission('plantations.view')
    and exists (
      select 1 from public.plantations pl
      where pl.id=photos_plantation.plantation_id
        and (
          private.can_access_client((select auth.uid()),pl.client_id)
          or private.can_access_parcelle((select auth.uid()),pl.parcelle_id)
          or pl.created_by=(select auth.uid())
        )
    )
  );

drop policy if exists "CRM interventions insert by technical role" on public.interventions_techniques;
create policy interventions_insert_by_technical_permission_and_scope
  on public.interventions_techniques for insert to authenticated
  with check (
    (
      private.crm_has_role_permission('rapports.manage_technique')
      or (
        private.crm_has_role_permission('rapports.view_technique')
        and private.crm_has_role_permission('plantations.update')
        and exists (
          select 1 from public.profiles p
          where p.id=interventions_techniques.agent_technique_id
            and p.user_id=(select auth.uid())
        )
      )
    )
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (parcelle_id is not null and private.can_access_parcelle((select auth.uid()),parcelle_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=interventions_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
  );

drop policy if exists "CRM interventions select by technical scope" on public.interventions_techniques;
create policy interventions_select_by_technical_permission_and_scope
  on public.interventions_techniques for select to authenticated
  using (
    private.crm_has_role_permission('plantations.view')
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (parcelle_id is not null and private.can_access_parcelle((select auth.uid()),parcelle_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=interventions_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
      or exists (
        select 1 from public.profiles p
        where p.id=interventions_techniques.agent_technique_id
          and p.user_id=(select auth.uid())
      )
    )
  );

drop policy if exists "CRM interventions update by technical scope" on public.interventions_techniques;
create policy interventions_update_by_technical_permission_and_scope
  on public.interventions_techniques for update to authenticated
  using (
    (
      private.crm_has_role_permission('rapports.manage_technique')
      or (
        private.crm_has_role_permission('plantations.update')
        and exists (
          select 1 from public.profiles p
          where p.id=interventions_techniques.agent_technique_id
            and p.user_id=(select auth.uid())
        )
      )
    )
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (parcelle_id is not null and private.can_access_parcelle((select auth.uid()),parcelle_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=interventions_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
  )
  with check (
    (
      private.crm_has_role_permission('rapports.manage_technique')
      or (
        private.crm_has_role_permission('plantations.update')
        and exists (
          select 1 from public.profiles p
          where p.id=interventions_techniques.agent_technique_id
            and p.user_id=(select auth.uid())
        )
      )
    )
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (parcelle_id is not null and private.can_access_parcelle((select auth.uid()),parcelle_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=interventions_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
  );

drop policy if exists "Technical staff read technical visit reports" on public.rapports_visites_techniques;
create policy technical_reports_read_by_permission_and_scope
  on public.rapports_visites_techniques for select to authenticated
  using (
    (private.crm_has_role_permission('rapports.view_technique')
      or private.crm_has_role_permission('rapports.manage_technique'))
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=rapports_visites_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
      or exists (
        select 1 from public.profiles p
        where p.id=rapports_visites_techniques.agent_technique_id
          and p.user_id=(select auth.uid())
      )
    )
  );

drop policy if exists "Technician insert technical visit reports" on public.rapports_visites_techniques;
create policy technical_reports_insert_by_permission_and_scope
  on public.rapports_visites_techniques for insert to authenticated
  with check (
    (
      private.crm_has_role_permission('rapports.manage_technique')
      or (private.crm_has_role_permission('rapports.view_technique')
          and private.crm_has_role_permission('plantations.update'))
    )
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=rapports_visites_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
    and (client_visible=false or private.crm_has_role_permission('rapports.manage_technique'))
  );

drop policy if exists "Technical managers update visit reports" on public.rapports_visites_techniques;
drop policy if exists "Technician update own technical visit reports" on public.rapports_visites_techniques;
create policy technical_reports_update_by_permission_and_scope
  on public.rapports_visites_techniques for update to authenticated
  using (
    (
      private.crm_has_role_permission('rapports.manage_technique')
      or (
        private.crm_has_role_permission('rapports.view_technique')
        and private.crm_has_role_permission('plantations.update')
        and exists (
          select 1 from public.profiles p
          where p.id=rapports_visites_techniques.created_by
            and p.user_id=(select auth.uid())
        )
      )
    )
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=rapports_visites_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
  )
  with check (
    (
      private.crm_has_role_permission('rapports.manage_technique')
      or (
        private.crm_has_role_permission('rapports.view_technique')
        and private.crm_has_role_permission('plantations.update')
        and exists (
          select 1 from public.profiles p
          where p.id=rapports_visites_techniques.created_by
            and p.user_id=(select auth.uid())
        )
      )
    )
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl
        where pl.id=rapports_visites_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id)
            or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
    and (client_visible=false or private.crm_has_role_permission('rapports.manage_technique'))
  );

drop policy if exists "Technical staff read visit media" on public.rapports_visites_medias;
create policy technical_report_media_read_by_report_scope
  on public.rapports_visites_medias for select to authenticated
  using (
    exists (
      select 1 from public.rapports_visites_techniques r
      where r.id=rapports_visites_medias.rapport_id
        and (
          ((private.crm_has_role_permission('rapports.view_technique')
            or private.crm_has_role_permission('rapports.manage_technique'))
            and (
              (r.client_id is not null and private.can_access_client((select auth.uid()),r.client_id))
              or (r.plantation_id is not null and exists (
                select 1 from public.plantations pl where pl.id=r.plantation_id
                  and (private.can_access_client((select auth.uid()),pl.client_id)
                    or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
              ))
            ))
          or (rapports_visites_medias.client_visible=true and r.client_id is not null
              and exists (select 1 from public.clients c where c.id=r.client_id and c.user_id=(select auth.uid())))
        )
    )
  );

drop policy if exists "Technical staff insert visit media" on public.rapports_visites_medias;
create policy technical_report_media_insert_by_report_scope
  on public.rapports_visites_medias for insert to authenticated
  with check (
    exists (
      select 1 from public.rapports_visites_techniques r
      where r.id=rapports_visites_medias.rapport_id
        and (
          private.crm_has_role_permission('rapports.manage_technique')
          or (private.crm_has_role_permission('rapports.view_technique')
              and private.crm_has_role_permission('plantations.update')
              and exists (
                select 1 from public.profiles p
                where p.id=r.created_by and p.user_id=(select auth.uid())
              ))
        )
        and (
          (r.client_id is not null and private.can_access_client((select auth.uid()),r.client_id))
          or (r.plantation_id is not null and exists (
            select 1 from public.plantations pl where pl.id=r.plantation_id
              and (private.can_access_client((select auth.uid()),pl.client_id)
                or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
          ))
        )
    )
  );

drop policy if exists "Technical managers update visit media" on public.rapports_visites_medias;
create policy technical_report_media_update_by_report_scope
  on public.rapports_visites_medias for update to authenticated
  using (
    private.crm_has_role_permission('rapports.manage_technique')
    and exists (
      select 1 from public.rapports_visites_techniques r
      where r.id=rapports_visites_medias.rapport_id
        and ((r.client_id is not null and private.can_access_client((select auth.uid()),r.client_id))
          or (r.plantation_id is not null and exists (
            select 1 from public.plantations pl where pl.id=r.plantation_id
              and (private.can_access_client((select auth.uid()),pl.client_id)
                or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
          )))
    )
  )
  with check (
    private.crm_has_role_permission('rapports.manage_technique')
    and exists (
      select 1 from public.rapports_visites_techniques r
      where r.id=rapports_visites_medias.rapport_id
        and ((r.client_id is not null and private.can_access_client((select auth.uid()),r.client_id))
          or (r.plantation_id is not null and exists (
            select 1 from public.plantations pl where pl.id=r.plantation_id
              and (private.can_access_client((select auth.uid()),pl.client_id)
                or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
          )))
    )
  );

notify pgrst, 'reload schema';
commit;