-- Étape commerciale indépendante du statut de qualification : aucun contact n'est dupliqué.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS etape_pipeline text NOT NULL DEFAULT 'lead';
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS civilite text;

UPDATE public.leads
SET etape_pipeline = CASE
  WHEN client_id IS NOT NULL OR proprietaire_id IS NOT NULL OR statut = 'converti' THEN 'converti'
  WHEN statut IN ('qualifie', 'interesse', 'tres_interesse', 'en_discussion', 'preparation_dossier', 'pret_souscrire') THEN 'prospect'
  ELSE 'lead'
END;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_etape_pipeline_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_etape_pipeline_check
  CHECK (etape_pipeline IN ('lead', 'prospect', 'converti'));
CREATE INDEX IF NOT EXISTS idx_leads_etape_pipeline_created_at
  ON public.leads (etape_pipeline, created_at DESC);
