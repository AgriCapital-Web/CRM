
-- Documents attached to a landowner/convention must be readable and writable
-- by authorized CRM staff; previously this table had only an admin DELETE policy.
DROP POLICY IF EXISTS "CRM staff view landowner documents" ON public.documents_convention;
CREATE POLICY "CRM staff view landowner documents"
ON public.documents_convention FOR SELECT TO authenticated
USING (
  (private.has_role_permission('proprietaires.view'::text)
    OR private.has_role_permission('documents.view'::text)
    OR private.has_role_permission('documents.upload'::text))
  AND (
    proprietaire_id IS NULL
    OR EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id)
  )
);

DROP POLICY IF EXISTS "CRM staff add landowner documents" ON public.documents_convention;
CREATE POLICY "CRM staff add landowner documents"
ON public.documents_convention FOR INSERT TO authenticated
WITH CHECK (
  (private.has_role_permission('documents.upload'::text)
    OR private.has_role_permission('proprietaires.create'::text)
    OR private.has_role_permission('proprietaires.update'::text))
  AND (
    proprietaire_id IS NULL
    OR EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id)
  )
);

DROP POLICY IF EXISTS "CRM staff update landowner documents" ON public.documents_convention;
CREATE POLICY "CRM staff update landowner documents"
ON public.documents_convention FOR UPDATE TO authenticated
USING (
  (private.has_role_permission('documents.upload'::text)
    OR private.has_role_permission('proprietaires.update'::text))
  AND (
    proprietaire_id IS NULL
    OR EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id)
  )
)
WITH CHECK (
  (private.has_role_permission('documents.upload'::text)
    OR private.has_role_permission('proprietaires.update'::text))
  AND (
    proprietaire_id IS NULL
    OR EXISTS (SELECT 1 FROM public.proprietaires_terres p WHERE p.id = documents_convention.proprietaire_id)
  )
);
