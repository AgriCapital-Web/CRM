CREATE OR REPLACE FUNCTION public.finance_payout_approve_batch(p_batch_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_batch public.finance_payout_batches;
  v_pending integer;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Permission finance.manage requise.';
  END IF;
  SELECT * INTO v_batch FROM public.finance_payout_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status NOT IN ('pending_approval','approved') THEN
    RAISE EXCEPTION 'Lot introuvable ou déjà traité.';
  END IF;
  IF v_batch.created_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Auto-validation interdite : un autre responsable doit approuver ce lot.';
  END IF;
  SELECT count(*) INTO v_pending FROM public.finance_payouts
    WHERE batch_id=p_batch_id AND status='pending_approval' AND created_by IS DISTINCT FROM auth.uid();
  IF v_pending=0 THEN RAISE EXCEPTION 'Aucun décaissement du lot ne peut être approuvé.'; END IF;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  UPDATE public.finance_payouts
    SET status='approved',approved_by=auth.uid(),approved_at=now()
    WHERE batch_id=p_batch_id AND status='pending_approval' AND created_by IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.finance_payout_batches
    SET approved_by=auth.uid(),approved_at=now(),updated_at=now()
    WHERE id=p_batch_id;
  RETURN v_updated;
END;
$function$

REVOKE ALL ON FUNCTION public.finance_payout_approve_batch(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_payout_approve_batch(uuid) TO authenticated;
