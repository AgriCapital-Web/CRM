-- Add a visible, persisted title to independent-service quotes.
-- Safe for environments where the quote table has already been provisioned.
ALTER TABLE IF EXISTS public.independent_service_proformas
  ADD COLUMN IF NOT EXISTS title text;

UPDATE public.independent_service_proformas
SET title = 'Devis de prestations indépendantes'
WHERE title IS NULL OR btrim(title) = '';

ALTER TABLE IF EXISTS public.independent_service_proformas
  ALTER COLUMN title SET DEFAULT 'Devis de prestations indépendantes';
