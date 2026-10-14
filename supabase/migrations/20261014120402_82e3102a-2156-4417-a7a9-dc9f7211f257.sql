-- A freshly inserted row is not yet visible inside the scope helpers (statement snapshot),
-- so INSERT ... RETURNING failed for anyone who is not global/service staff.
-- The author / assignee is now recognised directly on the row.
ALTER POLICY "Scoped staff view leads" ON public.leads USING (
  ((created_by = (SELECT auth.uid())) OR (assigned_to = (SELECT auth.uid())))
  OR (private.can_access_lead(auth.uid(), id) AND ((NOT (EXISTS ( SELECT 1
     FROM user_roles ur
    WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['mobilisateur_foncier'::text, 'superviseur_mobilisation_fonciere'::text])))))) OR (EXISTS ( SELECT 1
     FROM user_roles ur
    WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'mobilisateur_foncier'::text) AND (leads.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
     FROM (user_roles ur
       JOIN profiles p ON ((p.user_id = ur.user_id)))
    WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'superviseur_mobilisation_fonciere'::text) AND (p.region_id = leads.region_id))))))
);

ALTER POLICY "CRM clients select by permission and scope" ON public.clients USING (
  private.has_role_permission('clients.view'::text) AND (
    created_by = (SELECT auth.uid())
    OR commercial_id = (SELECT auth.uid())
    OR private.can_access_client((SELECT auth.uid()), id)
  )
);

ALTER POLICY "CRM parcelles select by permission and scope" ON public.parcelles USING (
  private.has_role_permission('parcelles.view'::text) AND (
    created_by = (SELECT auth.uid())
    OR private.can_access_parcelle((SELECT auth.uid()), id)
  )
);