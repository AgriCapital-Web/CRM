-- Public account-request forms need a safe, restricted list of eligible roles.
-- Do not grant anonymous users direct access to the full internal role catalog.
CREATE OR REPLACE VIEW public.v_public_signup_roles AS
SELECT code, nom, niveau_couverture, actif, niveau
FROM public.app_roles
WHERE actif IS TRUE
  AND code IN (
    'commercial',
    'technicien',
    'mobilisateur_foncier',
    'superviseur_mobilisation_fonciere',
    'chef_equipe_commercial',
    'chef_equipe_technique',
    'responsable_commercial',
    'responsable_operations',
    'responsable_district',
    'comptable',
    'service_client'
  );

GRANT SELECT ON public.v_public_signup_roles TO anon, authenticated;
