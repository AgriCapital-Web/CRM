-- Reconcile campaign counters with persisted delivery rows.
-- Only closed campaign states are recalculated. Active/running/suspended/cancelled
-- campaigns are not changed. Recipient target is preserved when it exceeds logged rows.
-- Also recover missing WhatsApp recipient numbers from the existing staff profile fields.

UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(
  NULLIF(BTRIM(p.whatsapp), ''),
  CASE WHEN NULLIF(BTRIM(p.whatsapp_local), '') IS NOT NULL
       THEN COALESCE(NULLIF(BTRIM(p.whatsapp_indicatif), ''), '+225') || BTRIM(p.whatsapp_local) END,
  NULLIF(BTRIM(p.telephone), ''),
  CASE WHEN NULLIF(BTRIM(p.telephone_local), '') IS NOT NULL
       THEN COALESCE(NULLIF(BTRIM(p.telephone_indicatif), ''), '+225') || BTRIM(p.telephone_local) END,
  NULLIF(BTRIM(p.telephone_secondaire), ''),
  CASE WHEN NULLIF(BTRIM(p.telephone_secondaire_local), '') IS NOT NULL
       THEN COALESCE(NULLIF(BTRIM(p.telephone_secondaire_indicatif), ''), '+225') || BTRIM(p.telephone_secondaire_local) END
)
FROM public.profiles p
WHERE d.source_type = 'equipe'
  AND d.source_id = p.id
  AND d.canal = 'whatsapp'
  AND NULLIF(BTRIM(d.recipient_phone), '') IS NULL
  AND COALESCE(
    NULLIF(BTRIM(p.whatsapp), ''),
    NULLIF(BTRIM(p.whatsapp_local), ''),
    NULLIF(BTRIM(p.telephone), ''),
    NULLIF(BTRIM(p.telephone_local), ''),
    NULLIF(BTRIM(p.telephone_secondaire), ''),
    NULLIF(BTRIM(p.telephone_secondaire_local), '')
  ) IS NOT NULL;

WITH delivery_counts AS (
  SELECT
    campaign_id,
    COUNT(*)::integer AS tracked_count,
    COUNT(*) FILTER (WHERE statut IN ('envoye','livre','lu'))::integer AS accepted_count,
    COUNT(*) FILTER (WHERE statut = 'echoue')::integer AS failed_count,
    COUNT(*) FILTER (WHERE statut = 'incertain')::integer AS uncertain_count
  FROM public.notification_deliveries
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id
)
UPDATE public.notification_campaigns c
SET
  total_destinataires = GREATEST(COALESCE(c.total_destinataires, 0), dc.tracked_count),
  total_envoyes = dc.accepted_count,
  total_echecs = dc.failed_count,
  statut = CASE
    WHEN dc.failed_count > 0 AND dc.accepted_count > 0 THEN 'partiel'
    WHEN dc.failed_count > 0 AND dc.accepted_count = 0 THEN 'echoue'
    WHEN dc.uncertain_count > 0 THEN 'partiel'
    WHEN dc.accepted_count > 0 THEN 'termine'
    ELSE c.statut
  END,
  termine_le = CASE
    WHEN c.statut IN ('active','en_cours') THEN c.termine_le
    ELSE COALESCE(c.termine_le, now())
  END,
  updated_at = now()
FROM delivery_counts dc
WHERE c.id = dc.campaign_id
  AND c.statut NOT IN ('active','en_cours','suspendue','annule')
  AND (
    c.total_envoyes IS DISTINCT FROM dc.accepted_count
    OR c.total_echecs IS DISTINCT FROM dc.failed_count
    OR c.total_destinataires < dc.tracked_count
    OR c.statut IS DISTINCT FROM CASE
      WHEN dc.failed_count > 0 AND dc.accepted_count > 0 THEN 'partiel'
      WHEN dc.failed_count > 0 AND dc.accepted_count = 0 THEN 'echoue'
      WHEN dc.uncertain_count > 0 THEN 'partiel'
      WHEN dc.accepted_count > 0 THEN 'termine'
      ELSE c.statut
    END
  );
