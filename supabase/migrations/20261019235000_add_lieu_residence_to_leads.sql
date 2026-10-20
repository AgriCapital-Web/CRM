-- Nouveau nom métier du champ de résidence pour les leads et prospects.
-- Les anciennes colonnes restent temporairement présentes pour compatibilité,
-- mais les formulaires CRM utilisent désormais lieu_residence.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lieu_residence text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS lieu_residence text;

UPDATE public.leads
SET lieu_residence = campement_quartier
WHERE NULLIF(BTRIM(lieu_residence), '') IS NULL
  AND NULLIF(BTRIM(campement_quartier), '') IS NOT NULL;

UPDATE public.prospects
SET lieu_residence = campement_quartier
WHERE NULLIF(BTRIM(lieu_residence), '') IS NULL
  AND NULLIF(BTRIM(campement_quartier), '') IS NOT NULL;
