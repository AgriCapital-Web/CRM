-- Keep the public account request role selector synchronized with the database catalogue.
-- Privileged governance/admin roles remain excluded from self-registration.
CREATE OR REPLACE VIEW public.v_public_signup_roles AS
SELECT code, nom, niveau_couverture, actif, niveau
FROM public.app_roles
WHERE actif IS TRUE
  AND code NOT IN ('super_admin', 'pdg', 'dg');

GRANT SELECT ON public.v_public_signup_roles TO anon, authenticated;
