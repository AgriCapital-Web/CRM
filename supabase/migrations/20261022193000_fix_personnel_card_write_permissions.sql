-- Align personnel-card writes with the same permission the CRM UI checks.
-- The previous table policy was SELECT-only, and Storage writes were limited to
-- two hard-coded roles, so authorized HR/user managers could still receive RLS denials.
DROP POLICY IF EXISTS cartes_update_hr_or_permission ON public.cartes_personnel;
CREATE POLICY cartes_update_hr_or_permission
ON public.cartes_personnel
FOR UPDATE
TO authenticated
USING (
  private.is_rh((SELECT auth.uid()))
  OR private.has_role_permission('utilisateurs.update')
)
WITH CHECK (
  private.is_rh((SELECT auth.uid()))
  OR private.has_role_permission('utilisateurs.update')
);

DROP POLICY IF EXISTS cartes_photos_write ON storage.objects;
CREATE POLICY cartes_photos_write
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cartes-personnel'
  AND (
    private.is_global_admin((SELECT auth.uid()))
    OR private.has_role_permission('utilisateurs.update')
  )
);

DROP POLICY IF EXISTS cartes_photos_update ON storage.objects;
CREATE POLICY cartes_photos_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cartes-personnel'
  AND (
    private.is_global_admin((SELECT auth.uid()))
    OR private.has_role_permission('utilisateurs.update')
  )
)
WITH CHECK (
  bucket_id = 'cartes-personnel'
  AND (
    private.is_global_admin((SELECT auth.uid()))
    OR private.has_role_permission('utilisateurs.update')
  )
);
