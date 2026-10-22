-- Personnel card classifications must not default to CDI or employee.
-- The founder/PDG is not an employee or contractor and has indefinite card validity.
ALTER TABLE public.cartes_personnel ALTER COLUMN type_contrat DROP NOT NULL;
ALTER TABLE public.cartes_personnel ALTER COLUMN type_contrat DROP DEFAULT;
ALTER TABLE public.cartes_personnel ALTER COLUMN statut_agent DROP NOT NULL;
ALTER TABLE public.cartes_personnel ALTER COLUMN statut_agent DROP DEFAULT;
ALTER TABLE public.cartes_personnel ALTER COLUMN date_expiration DROP NOT NULL;
ALTER TABLE public.cartes_personnel ALTER COLUMN date_expiration DROP DEFAULT;

UPDATE public.cartes_personnel
SET type_contrat = NULL,
    statut_agent = NULL,
    date_expiration = CASE
      WHEN lower(coalesce(role_code, '')) = 'pdg' THEN NULL
      ELSE date_expiration
    END,
    updated_at = now()
WHERE type_contrat IS NOT NULL
   OR statut_agent IS NOT NULL
   OR (lower(coalesce(role_code, '')) = 'pdg' AND date_expiration IS NOT NULL);
