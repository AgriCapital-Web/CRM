-- Preserve free-text locality values when the geographic cascade is not yet selected.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS localite text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS localite text;
