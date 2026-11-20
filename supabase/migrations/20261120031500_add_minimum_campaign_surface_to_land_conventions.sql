ALTER TABLE public.proprietaires_terres ADD COLUMN IF NOT EXISTS surface_campagne_ha numeric;
ALTER TABLE public.conventions_foncieres ADD COLUMN IF NOT EXISTS surface_campagne_ha numeric;
