-- Prospects can be created directly, without an artificial lead record.
ALTER TABLE public.prospects ALTER COLUMN lead_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS prospects_lead_id_idx ON public.prospects(lead_id) WHERE lead_id IS NOT NULL;
