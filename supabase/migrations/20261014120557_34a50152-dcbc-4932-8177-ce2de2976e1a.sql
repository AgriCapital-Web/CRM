-- Rights add up across roles: a user holding service_client AND a role granted clients.update/delete keeps those rights.
ALTER POLICY "CRM clients update by permission and scope" ON public.clients
  USING (private.has_role_permission('clients.update'::text) AND private.can_access_client((SELECT auth.uid()), id))
  WITH CHECK (private.has_role_permission('clients.update'::text) AND private.can_access_client((SELECT auth.uid()), id));
ALTER POLICY "CRM clients delete by explicit permission and scope" ON public.clients
  USING (private.has_role_permission('clients.delete'::text) AND private.can_access_client((SELECT auth.uid()), id));