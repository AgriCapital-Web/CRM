-- Une plantation de la part propriétaire est un actif foncier, pas une souscription client.
-- Autoriser client_id NULL uniquement pour les lignes canoniques propriétaire.
ALTER TABLE public.plantations
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.plantations
  ADD CONSTRAINT plantations_client_required_except_owner
  CHECK (client_id IS NOT NULL OR role_attribution = 'proprietaire');

CREATE INDEX IF NOT EXISTS idx_plantations_owner_share_parcelle
  ON public.plantations (parcelle_id)
  WHERE role_attribution = 'proprietaire' AND client_id IS NULL;
