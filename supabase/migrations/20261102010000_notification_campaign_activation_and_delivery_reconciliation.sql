-- Notification campaign activation/execution separation and delivery phone reconciliation.
-- Idempotent and non-destructive: preserves all existing campaigns and delivery history.
ALTER TABLE public.notification_campaigns
  ADD COLUMN IF NOT EXISTS actif boolean NOT NULL DEFAULT true;

UPDATE public.notification_campaigns
SET actif = CASE WHEN statut IN ('brouillon', 'suspendue', 'annule') THEN false ELSE true END
WHERE actif IS DISTINCT FROM CASE WHEN statut IN ('brouillon', 'suspendue', 'annule') THEN false ELSE true END;

CREATE INDEX IF NOT EXISTS notification_campaigns_active_schedule_idx
  ON public.notification_campaigns (actif, statut, programme_le)
  WHERE programme_le IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_deliveries_campaign_status_idx
  ON public.notification_deliveries (campaign_id, canal, statut, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_delivery_attempt_idx
  ON public.notification_delivery_attempts (delivery_id, attempt_number DESC);

-- Backfill only missing phone values from actual CRM source records; never fabricate numbers.
UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(NULLIF(BTRIM(l.whatsapp), ''), NULLIF(BTRIM(l.telephone), ''), NULLIF(BTRIM(l.telephone_secondaire), ''))
FROM public.leads l
WHERE d.source_id = l.id AND d.source_type IN ('lead', 'prospect')
  AND NULLIF(BTRIM(d.recipient_phone), '') IS NULL
  AND COALESCE(NULLIF(BTRIM(l.whatsapp), ''), NULLIF(BTRIM(l.telephone), ''), NULLIF(BTRIM(l.telephone_secondaire), '')) IS NOT NULL;

UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(NULLIF(BTRIM(c.whatsapp), ''), NULLIF(BTRIM(c.telephone), ''), NULLIF(BTRIM(c.telephone_secondaire), ''))
FROM public.clients c
WHERE d.source_id = c.id
  AND d.source_type IN ('client', 'proprietaire_foncier', 'beneficiaire_particulier', 'proprietaire_foncier+beneficiaire_particulier')
  AND NULLIF(BTRIM(d.recipient_phone), '') IS NULL
  AND COALESCE(NULLIF(BTRIM(c.whatsapp), ''), NULLIF(BTRIM(c.telephone), ''), NULLIF(BTRIM(c.telephone_secondaire), '')) IS NOT NULL;

UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(NULLIF(BTRIM(p.whatsapp), ''), NULLIF(BTRIM(p.telephone), ''), NULLIF(BTRIM(p.telephone_secondaire), ''))
FROM public.profiles p
WHERE d.source_id = p.id AND d.source_type = 'equipe'
  AND NULLIF(BTRIM(d.recipient_phone), '') IS NULL
  AND COALESCE(NULLIF(BTRIM(p.whatsapp), ''), NULLIF(BTRIM(p.telephone), ''), NULLIF(BTRIM(p.telephone_secondaire), '')) IS NOT NULL;
