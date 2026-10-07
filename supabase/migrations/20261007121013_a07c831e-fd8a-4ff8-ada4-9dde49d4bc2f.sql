DO $$
DECLARE f record;
BEGIN
 FOR f IN select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prorettype <> 'trigger'::regtype
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.proname not in ('cleanup_rate_limits','cleanup_expired_otp','sync_anstat_admin_2021','_http_wait_json','notification_vapid_config','notification_get_internal_secret','finalize_portal_payment','mark_overdue_payments','recompute_pending_pi','recalculer_portefeuilles_commissions')
 LOOP
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
 END LOOP;
END $$;
ALTER TABLE public.leads ALTER COLUMN region_residence DROP NOT NULL;