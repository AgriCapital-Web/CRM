-- Secure defaults for objects created by the application's postgres migration owner.
-- Existing object grants are intentionally untouched.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke maintain, references, trigger, truncate on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke update on sequences from authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
