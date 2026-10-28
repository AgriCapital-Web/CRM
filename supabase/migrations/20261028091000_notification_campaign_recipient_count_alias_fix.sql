-- Make JSONB set-returning aliases explicit and revalidate recipient-count synchronization.
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
        SELECT DISTINCT entries.item ->> 'source_type' AS source_type,
                        entries.item ->> 'source_id' AS source_id
        FROM jsonb_array_elements(selected) AS entries(item)
        WHERE NULLIF(entries.item ->> 'source_type', '') IS NOT NULL
          AND NULLIF(entries.item ->> 'source_id', '') IS NOT NULL
      ) AS normalized;
    NEW.total_destinataires := COALESCE(selected_count, 0);
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.notification_campaigns
SET total_destinataires = total_destinataires
WHERE jsonb_typeof(criteres -> 'selected_recipients') = 'array';
