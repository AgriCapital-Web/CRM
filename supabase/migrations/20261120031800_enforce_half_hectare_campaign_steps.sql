ALTER TABLE public.proprietaires_terres
  DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_campagne_check;
ALTER TABLE public.proprietaires_terres
  ADD CONSTRAINT proprietaires_terres_surface_campagne_check
  CHECK (surface_campagne_ha IS NULL OR (
    surface_campagne_ha >= 2
    AND abs((surface_campagne_ha * 2) - round(surface_campagne_ha * 2)) < 0.000001
    AND (surface_totale_declaree_ha IS NULL OR surface_campagne_ha <= surface_totale_declaree_ha)
  ));
ALTER TABLE public.conventions_foncieres
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_campagne_check;
ALTER TABLE public.conventions_foncieres
  ADD CONSTRAINT conventions_foncieres_surface_campagne_check
  CHECK (surface_campagne_ha IS NULL OR (
    surface_campagne_ha >= 2
    AND abs((surface_campagne_ha * 2) - round(surface_campagne_ha * 2)) < 0.000001
    AND (surface_totale_ha IS NULL OR surface_campagne_ha <= surface_totale_ha)
  ));
