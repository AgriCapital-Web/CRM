-- Remove obsolete civil-status and birth fields from stored independent-service customer JSON.
UPDATE public.independent_service_customers
SET details = COALESCE(details, '{}'::jsonb)
  - 'date_naissance'
  - 'lieu_naissance'
  - 'statut_marital'
WHERE details ?| ARRAY['date_naissance','lieu_naissance','statut_marital'];

-- Normalize quote title casing and preserve a default for older records.
UPDATE public.independent_service_proformas
SET title = upper(trim(title))
WHERE title IS NOT NULL AND title <> upper(trim(title));
