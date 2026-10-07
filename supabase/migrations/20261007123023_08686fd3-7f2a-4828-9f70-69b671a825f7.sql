DROP POLICY IF EXISTS "CRM users create owned leads" ON public.leads;
CREATE POLICY "CRM users create owned leads" ON public.leads FOR INSERT TO authenticated
WITH CHECK (
  private.has_role_permission('leads.create')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND COALESCE(p.actif,true))
  AND created_by = (SELECT auth.uid())
  AND (assigned_to IS NULL OR assigned_to = (SELECT auth.uid())
       OR private.can_supervise_leads((SELECT auth.uid()))
       OR private.can_service_assign_lead((SELECT auth.uid()), assigned_to))
);
DROP POLICY IF EXISTS "Scoped staff delete leads" ON public.leads;
CREATE POLICY "Scoped staff delete leads" ON public.leads FOR DELETE TO authenticated
USING (private.has_role_permission('leads.delete') AND private.can_access_lead((SELECT auth.uid()), id));