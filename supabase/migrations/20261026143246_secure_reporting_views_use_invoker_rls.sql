-- Respect the querying user's grants and RLS when reading sensitive reporting views.
-- Keep v_public_signup_roles as a narrowly filtered SECURITY DEFINER view for account-request forms.
alter view public.v_performance_equipes set (security_invoker = true);
alter view public.v_planning_budget_reconciliation set (security_invoker = true);
