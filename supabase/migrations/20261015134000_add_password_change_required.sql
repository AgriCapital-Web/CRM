-- Record when an administrator/PDG resets a user's password.
-- The user must set a personal password before entering the CRM.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false;
