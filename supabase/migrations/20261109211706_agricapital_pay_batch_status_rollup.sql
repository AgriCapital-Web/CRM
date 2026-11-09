
CREATE OR REPLACE FUNCTION private.finance_payout_refresh_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  total_count integer;
  succeeded_count integer;
  failed_count integer;
  cancelled_count integer;
  processing_count integer;
  approved_count integer;
  pending_count integer;
  next_status text;
BEGIN
  IF coalesce(new.batch_id,old.batch_id) IS NULL THEN RETURN new; END IF;
  SELECT count(*),
    count(*) FILTER (WHERE status='succeeded'),
    count(*) FILTER (WHERE status='failed'),
    count(*) FILTER (WHERE status='cancelled'),
    count(*) FILTER (WHERE status='processing'),
    count(*) FILTER (WHERE status='approved'),
    count(*) FILTER (WHERE status IN ('pending_approval','draft'))
  INTO total_count,succeeded_count,failed_count,cancelled_count,processing_count,approved_count,pending_count
  FROM public.finance_payouts WHERE batch_id=coalesce(new.batch_id,old.batch_id);

  next_status:=CASE
    WHEN total_count=0 THEN 'draft'
    WHEN succeeded_count=total_count THEN 'succeeded'
    WHEN failed_count=total_count THEN 'failed'
    WHEN cancelled_count=total_count THEN 'cancelled'
    WHEN succeeded_count+failed_count+cancelled_count=total_count AND succeeded_count>0 THEN 'partially_succeeded'
    WHEN processing_count>0 OR succeeded_count>0 THEN 'processing'
    WHEN approved_count>0 THEN 'approved'
    WHEN pending_count>0 THEN 'pending_approval'
    ELSE 'draft'
  END;

  UPDATE public.finance_payout_batches
    SET status=next_status,
        payout_count=total_count,
        total_amount=coalesce((SELECT sum(amount) FROM public.finance_payouts WHERE batch_id=coalesce(new.batch_id,old.batch_id)),0),
        updated_at=now()
    WHERE id=coalesce(new.batch_id,old.batch_id);
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_finance_payout_refresh_batch ON public.finance_payouts;
CREATE TRIGGER trg_finance_payout_refresh_batch
AFTER INSERT OR UPDATE OF status ON public.finance_payouts
FOR EACH ROW EXECUTE FUNCTION private.finance_payout_refresh_batch();
