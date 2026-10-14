-- Keep the client synthesis view subject to the caller's row-level security.
-- This view contains personal, contract and payment-derived information.
ALTER VIEW public.v_client_synthese SET (security_invoker = true);

REVOKE ALL ON TABLE public.v_client_synthese FROM anon;
GRANT SELECT ON TABLE public.v_client_synthese TO authenticated;
