BEGIN;
UPDATE public.proprietaires_terres SET lieu_residence = COALESCE(NULLIF(BTRIM(lieu_residence), ''), NULLIF(BTRIM(domicile), '')) WHERE domicile IS NOT NULL AND BTRIM(domicile) <> '';
ALTER TABLE public.proprietaires_terres DROP COLUMN IF EXISTS domicile;
COMMIT;