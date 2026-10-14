-- Origine du pipeline au moment de la conversion, pour séparer les indicateurs leads/prospects.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS etape_conversion text;

-- Les anciennes conversions étaient suivies comme conversions de leads avant la séparation du pipeline.
UPDATE public.leads
SET etape_conversion = 'lead'
WHERE (etape_pipeline = 'converti' OR statut = 'converti' OR converti_at IS NOT NULL)
  AND etape_conversion IS NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_etape_conversion_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_etape_conversion_check
  CHECK (etape_conversion IS NULL OR etape_conversion IN ('lead', 'prospect'));

CREATE INDEX IF NOT EXISTS idx_leads_etape_conversion
  ON public.leads (etape_conversion)
  WHERE etape_conversion IS NOT NULL;
