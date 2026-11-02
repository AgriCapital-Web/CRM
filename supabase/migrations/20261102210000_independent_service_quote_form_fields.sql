-- Align independent-service catalog units with the quote form's agricultural units.
ALTER TABLE IF EXISTS public.independent_service_proformas ADD COLUMN IF NOT EXISTS title text;
UPDATE public.independent_service_catalog SET default_unit = CASE
 WHEN lower(trim(default_unit)) IN ('ha','hectare','hectares') THEN 'hectares'
 WHEN lower(trim(default_unit)) IN ('plt','plant','plants','plante','plantes') THEN 'plantes'
 WHEN lower(trim(default_unit)) IN ('point','points') THEN 'points'
 WHEN lower(trim(default_unit)) IN ('forfait','u') THEN 'forfait'
 ELSE default_unit END
WHERE lower(trim(default_unit)) IN ('ha','hectare','hectares','plt','plant','plants','plante','plantes','point','points','forfait','u');
