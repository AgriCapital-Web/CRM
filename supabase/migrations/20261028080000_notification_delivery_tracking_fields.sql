ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS notification_deliveries_campaign_created_idx
  ON public.notification_deliveries (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_created_idx
  ON public.notification_deliveries (statut, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_automation_created_idx
  ON public.notification_deliveries (automation_id, created_at DESC);

COMMENT ON COLUMN public.notification_deliveries.delivered_at IS 'Heure de livraison confirmée par le fournisseur, si un accusé est disponible.';
COMMENT ON COLUMN public.notification_deliveries.read_at IS 'Heure de lecture confirmée par le fournisseur, si disponible.';
COMMENT ON COLUMN public.notification_deliveries.provider_status IS 'Statut brut renvoyé par le fournisseur pour audit.';
