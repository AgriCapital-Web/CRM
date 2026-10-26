-- Align the follow-up workspace and client-registration document catalog with the current UI.
-- Historical uploaded files and signed client contracts are deliberately preserved.
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS prochaine_relance_at date;

UPDATE public.prospects p
SET prochaine_relance_at = l.prochaine_relance_at
FROM public.leads l
WHERE p.lead_id = l.id
  AND p.prochaine_relance_at IS NULL
  AND l.prochaine_relance_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_prochaine_relance_at
  ON public.leads (prochaine_relance_at)
  WHERE prochaine_relance_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_prochaine_relance_at
  ON public.prospects (prochaine_relance_at)
  WHERE prochaine_relance_at IS NOT NULL;

-- Remove obsolete upload *configuration* only; never delete uploaded client documents.
DELETE FROM public.offre_formulaire_documents
WHERE lower(coalesce(code, '') || ' ' || coalesce(libelle, '') || ' ' || coalesce(categorie, ''))
  ~ '(justificatif foncier|document de propriete|document de propriété|convention fonciere|convention foncière|pv de consentement familial|annexe)';
