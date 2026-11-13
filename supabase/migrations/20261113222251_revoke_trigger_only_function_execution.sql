-- These functions are invoked only by database triggers, never by the Data API.
-- PostgreSQL does not require callers to hold EXECUTE when a trigger fires.
REVOKE EXECUTE ON FUNCTION public.guard_profile_salary_base() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_profile_team_department() FROM PUBLIC, anon, authenticated;
