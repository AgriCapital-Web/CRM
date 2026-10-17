BEGIN;

-- Normalize legacy cash-labelled receipts to the requested Wave label.
UPDATE public.paiements
SET mode_paiement = 'Wave'
WHERE lower(btrim(coalesce(mode_paiement, ''))) IN ('comptant', 'cash', 'espèces', 'especes', 'paiement comptant');

-- Contract mode is distinct from the payment channel. Existing cash-plan records use the
-- supported initial-payment + instalment schedule going forward.
UPDATE public.clients
SET mode_paiement = 'echeancier'
WHERE lower(btrim(coalesce(mode_paiement, ''))) IN ('comptant', 'cash', 'paiement comptant');

-- Cover foreign-key lookups and deletes. IF NOT EXISTS makes deployment/replay safe.
CREATE INDEX IF NOT EXISTS idx_acquisition_lots_acquisition_id ON public.acquisition_lots (souscription_id);
CREATE INDEX IF NOT EXISTS idx_acquisitions_created_by ON public.client_souscriptions (created_by);
CREATE INDEX IF NOT EXISTS idx_acquisitions_offre_id ON public.client_souscriptions (offre_id);
CREATE INDEX IF NOT EXISTS idx_acquisitions_parcelle_id ON public.client_souscriptions (parcelle_id);
CREATE INDEX IF NOT EXISTS idx_acquisitions_promotion_id ON public.client_souscriptions (promotion_id);
CREATE INDEX IF NOT EXISTS idx_equipe_membres_created_by ON public.equipe_membres (created_by);
CREATE INDEX IF NOT EXISTS idx_interventions_techniques_acquisition_id ON public.interventions_techniques (souscription_id);
CREATE INDEX IF NOT EXISTS idx_notification_client_preferences_updated_by ON public.notification_client_preferences (updated_by);
CREATE INDEX IF NOT EXISTS idx_plantations_acquisition_id ON public.plantations (souscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_region_id ON public.profiles (region_id);

-- Internal trigger/maintenance routines must not be callable by anonymous API clients.
REVOKE EXECUTE ON FUNCTION public.compute_commission_foncier_client() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_technical_visit_media_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_lead_prospect_client_links() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_equipe_responsable_membership() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_lead_to_prospect_record() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_notification_client_created() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_notification_document_validated() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_notification_technical_intervention() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_notification_technical_visit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_client_souscription_foncier() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.compute_commission_foncier_client() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_technical_visit_media_limit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_lead_prospect_client_links() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_equipe_responsable_membership() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_lead_to_prospect_record() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_notification_client_created() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_notification_document_validated() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_notification_technical_intervention() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_notification_technical_visit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_client_souscription_foncier() TO authenticated, service_role;

COMMIT;
