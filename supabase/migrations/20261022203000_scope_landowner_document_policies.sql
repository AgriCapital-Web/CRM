
-- Restrict convention-document access to linked owners/parcels or global admins.
DROP POLICY IF EXISTS "CRM staff view landowner documents" ON public.documents_convention;
CREATE POLICY "CRM staff view landowner documents"
ON public.documents_convention FOR SELECT TO authenticated
USING (
  private.is_global_admin(auth.uid())
  OR (
    (private.has_role_permission('proprietaires.view'::text)
      OR private.has_role_permission('documents.view'::text)
      OR private.has_role_permission('documents.upload'::text))
    AND (
      (proprietaire_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id))
      OR (proprietaire_id IS NULL AND parcelle_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parcelles pa WHERE pa.id = documents_convention.parcelle_id))
    )
  )
);

DROP POLICY IF EXISTS "CRM staff add landowner documents" ON public.documents_convention;
CREATE POLICY "CRM staff add landowner documents"
ON public.documents_convention FOR INSERT TO authenticated
WITH CHECK (
  private.is_global_admin(auth.uid())
  OR (
    (private.has_role_permission('documents.upload'::text)
      OR private.has_role_permission('proprietaires.create'::text)
      OR private.has_role_permission('proprietaires.update'::text))
    AND (
      (proprietaire_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id))
      OR (proprietaire_id IS NULL AND parcelle_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parcelles pa WHERE pa.id = documents_convention.parcelle_id))
    )
  )
);

DROP POLICY IF EXISTS "CRM staff update landowner documents" ON public.documents_convention;
CREATE POLICY "CRM staff update landowner documents"
ON public.documents_convention FOR UPDATE TO authenticated
USING (
  private.is_global_admin(auth.uid())
  OR (
    (private.has_role_permission('documents.upload'::text)
      OR private.has_role_permission('proprietaires.update'::text))
    AND (
      (proprietaire_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id))
      OR (proprietaire_id IS NULL AND parcelle_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parcelles pa WHERE pa.id = documents_convention.parcelle_id))
    )
  )
)
WITH CHECK (
  private.is_global_admin(auth.uid())
  OR (
    (private.has_role_permission('documents.upload'::text)
      OR private.has_role_permission('proprietaires.update'::text))
    AND (
      (proprietaire_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id))
      OR (proprietaire_id IS NULL AND parcelle_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parcelles pa WHERE pa.id = documents_convention.parcelle_id))
    )
  )
);
