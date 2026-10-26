-- Restrict decision-center helper functions to signed-in users.
-- This migration is already applied to Supabase as version 20261026143322.
revoke execute on function public.can_access_decision_center(text) from public, anon;
revoke execute on function public.can_view_decision_proposal(uuid) from public, anon;
revoke execute on function public.current_user_has_app_permission(text) from public, anon;
revoke execute on function public.decision_center_can_read_proposal(uuid, text, text, text, uuid, uuid) from public, anon;
revoke execute on function public.decision_center_is_executive() from public, anon;
revoke execute on function public.decision_center_is_pdg() from public, anon;
revoke execute on function public.decision_center_normalize_target() from public, anon;
revoke execute on function public.is_decision_executive() from public, anon;
grant execute on function public.can_access_decision_center(text) to authenticated;
grant execute on function public.can_view_decision_proposal(uuid) to authenticated;
grant execute on function public.current_user_has_app_permission(text) to authenticated;
grant execute on function public.decision_center_can_read_proposal(uuid, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.decision_center_is_executive() to authenticated;
grant execute on function public.decision_center_is_pdg() to authenticated;
grant execute on function public.decision_center_normalize_target() to authenticated;
grant execute on function public.is_decision_executive() to authenticated;
