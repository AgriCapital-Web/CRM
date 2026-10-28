-- Keep manually selected campaign recipient counts consistent with persisted selections.
-- Non-manual audiences keep the count calculated by the recipient preview.
CREATE OR REPLACE FUNCTION public.sync_notification_campaign_selected_recipient_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  selected jsonb;
  selected_count integer;
BEGIN
  selected := NEW.criteres -> 'selected_recipients';
  IF jsonb_typeof(selected) = 'array' THEN
    SELECT count(*)::integer
      INTO selected_count
      FROM (
        SELECT DISTINCT
          item ->> 'source_type' AS source_type,
          item ->> 'source_id' AS source_id
        FROM jsonb_array_elements(selected) AS item
        WHERE NULLIF(item ->> 'source_type', '') IS NOT NULL
          AND NULLIF(item ->> 'source_id', '') IS NOT NULL
      ) AS normalized;
    NEW.total_destinataires := COALESCE(selected_count, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_notification_campaign_selected_recipient_count
  ON public.notification_campaigns;

CREATE TRIGGER trg_sync_notification_campaign_selected_recipient_count
BEFORE INSERT OR UPDATE OF criteres, total_destinataires
ON public.notification_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.sync_notification_campaign_selected_recipient_count();

-- Repair existing manually selected campaigns without inventing recipients.
UPDATE public.notification_campaigns
SET total_destinataires = (
  SELECT count(*)::integer
  FROM (
    SELECT DISTINCT
      item ->> 'source_type' AS source_type,
      item ->> 'source_id' AS source_id
    FROM jsonb_array_elements(criteres -> 'selected_recipients') AS item
    WHERE NULLIF(item ->> 'source_type', '') IS NOT NULL
      AND NULLIF(item ->> 'source_id', '') IS NOT NULL
  ) AS normalized
)
WHERE jsonb_typeof(criteres -> 'selected_recipients') = 'array';
