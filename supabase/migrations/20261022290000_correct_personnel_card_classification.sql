-- Correct personnel card classifications: never infer employee/CDI from having a CRM account.
-- The PDG is the company owner, not an employee or a service provider.
UPDATE public.cartes_personnel
SET type_contrat = NULL,
    statut_agent = NULL,
    date_expiration = NULL,
    updated_at = now()
WHERE lower(coalesce(role_code, '')) = 'pdg'
   OR profile_id IN (
      SELECT p.id
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE lower(ur.role) = 'pdg'
   );

-- Existing CDI/employee labels were not based on confirmed employment contracts.
-- Clear only these unsupported labels; retain explicit provider/stage/partner values.
UPDATE public.cartes_personnel
SET type_contrat = CASE WHEN lower(coalesce(type_contrat,'')) = 'cdi' THEN NULL ELSE type_contrat END,
    statut_agent = CASE WHEN lower(coalesce(statut_agent,'')) = 'employe' THEN NULL ELSE statut_agent END,
    updated_at = now()
WHERE lower(coalesce(type_contrat,'')) = 'cdi'
   OR lower(coalesce(statut_agent,'')) = 'employe';
