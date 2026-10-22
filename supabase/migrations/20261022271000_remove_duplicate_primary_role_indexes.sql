-- Keep one canonical partial unique index enforcing at most one primary role per user.
-- The two redundant indexes have identical predicates and add write overhead without improving enforcement.
drop index if exists public.user_roles_one_primary_per_user_idx;
drop index if exists public.user_roles_single_primary_per_user;
