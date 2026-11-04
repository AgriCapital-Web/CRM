-- Restrict Convention foncière visibility to roles with an explicit business need.
-- The sidebar and both list/detail routes already gate on proprietaires.view.
-- This migration aligns the database role-permission matrix with that same gate.
BEGIN;

-- Remove this permission from every role first, preventing legacy broad grants from
-- continuing to expose the page to operational roles that are not authorized.
DELETE FROM public.role_permissions
WHERE permission_code = 'proprietaires.view'
  AND role_code NOT IN (
    'pdg',
    'dg',
    'responsable_operations',
    'superviseur_mobilisation_fonciere',
    'mobilisateur_foncier',
    'service_client',
    'chef_equipe_service_client',
    'associe_actionnaire'
  );

-- Grant visibility to the explicitly approved roles.
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT approved.role_code, 'proprietaires.view'
FROM (VALUES
  ('pdg'),
  ('dg'),
  ('responsable_operations'),
  ('superviseur_mobilisation_fonciere'),
  ('mobilisateur_foncier'),
  ('service_client'),
  ('chef_equipe_service_client'),
  ('associe_actionnaire')
) AS approved(role_code)
WHERE EXISTS (
  SELECT 1 FROM public.app_roles r
  WHERE r.code = approved.role_code AND r.actif IS TRUE
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Keep the permission visible in the permission catalogue for role administration.
INSERT INTO public.app_permissions (code, module, action, libelle, description, actif)
VALUES (
  'proprietaires.view',
  'proprietaires',
  'view',
  'Consulter les conventions foncières',
  'Accès à la page Convention foncière selon les rôles autorisés',
  TRUE
)
ON CONFLICT (code) DO UPDATE
SET actif = TRUE,
    updated_at = NOW();

COMMIT;
