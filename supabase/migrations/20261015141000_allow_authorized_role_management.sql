-- Allow PDG/DG to manage role assignments globally, while other authorized
-- users continue to be governed by their explicit roles.create/update/delete permissions.
-- This fixes the mismatch where UI permission allowed the action but RLS rejected it.
DROP POLICY IF EXISTS "CRM roles insert by permission" ON public.user_roles;
CREATE POLICY "CRM roles insert by permission"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_global_admin((SELECT auth.uid()))
  OR private.has_role_permission('roles.create')
);

DROP POLICY IF EXISTS "CRM roles update by permission" ON public.user_roles;
CREATE POLICY "CRM roles update by permission"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  private.is_global_admin((SELECT auth.uid()))
  OR private.has_role_permission('roles.update')
)
WITH CHECK (
  private.is_global_admin((SELECT auth.uid()))
  OR private.has_role_permission('roles.update')
);

DROP POLICY IF EXISTS "CRM roles delete by permission" ON public.user_roles;
CREATE POLICY "CRM roles delete by permission"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  private.is_global_admin((SELECT auth.uid()))
  OR private.has_role_permission('roles.delete')
);
