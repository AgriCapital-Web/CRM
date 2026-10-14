-- Allow authorized geography managers (including PDG/DG global admins) to manage zone assignments.
-- Keep the restriction server-side; do not grant blanket write access to every authenticated user.
DROP POLICY IF EXISTS "CRM manage zone assignments by geo permission" ON public.zone_assignments;

CREATE POLICY "CRM manage zone assignments by geo permission"
ON public.zone_assignments
FOR ALL
TO authenticated
USING (
  private.has_role_permission('parametres.manage_geo')
  OR private.is_global_admin(auth.uid())
)
WITH CHECK (
  private.has_role_permission('parametres.manage_geo')
  OR private.is_global_admin(auth.uid())
);
