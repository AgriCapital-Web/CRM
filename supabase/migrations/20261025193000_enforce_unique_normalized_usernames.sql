-- Canonical, case-insensitive uniqueness for CRM login identifiers.
-- Passwords remain exclusively in Supabase Auth; profiles.username is the
-- canonical identifier mapped to the Auth user through profiles.user_id.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_unique
ON public.profiles (lower(btrim(username)))
WHERE username IS NOT NULL AND btrim(username) <> '';
