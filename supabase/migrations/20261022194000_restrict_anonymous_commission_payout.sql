-- Commission payouts are privileged financial mutations. Signed-in staff use this RPC;
-- anonymous/public clients must never be able to call it.
REVOKE EXECUTE ON FUNCTION public.finance_record_commission_payment(uuid, uuid[], numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_record_commission_payment(uuid, uuid[], numeric, date, text, text) TO authenticated;
