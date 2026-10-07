CREATE POLICY "CRM interventions select by plantation permission and client scope"
ON public.interventions_techniques FOR SELECT TO authenticated
USING (private.has_role_permission('plantations.view') AND client_id IS NOT NULL AND private.can_access_client((select auth.uid()), client_id));