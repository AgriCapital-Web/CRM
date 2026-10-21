# Supabase Data API permissions for AgriCapital 360

Effective 2026-10-21, do not rely on automatic Data API grants for newly created tables in `public`.

## Required migration rule

Every migration that creates a table exposed through the Data API must include explicit, least-privilege grants in that same migration. Do not grant `anon` access to private client, payment, identity, finance, or staff tables. Use RLS policies to scope rows for authenticated users; table grants alone do not authorize access to every row.

Examples (adapt to the table's intended audience and existing RLS policies):

```sql
-- Public read-only reference data only, if genuinely intended to be public:
GRANT SELECT ON TABLE public.public_reference_table TO anon;

-- Authenticated CRM data: grant only required operations.
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_table TO authenticated;

-- Backend-only tables should not be granted to anon.
-- Grant service_role only when the table is accessed by trusted server-side code.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backend_table TO service_role;
```

## Required review checklist

- [ ] Identify which roles truly need access to the new object.
- [ ] Add explicit grants in the same migration as the `CREATE TABLE`.
- [ ] Enable RLS on exposed tables and add policies for the intended CRM roles.
- [ ] Check sequences used by identity/serial columns and grant sequence privileges only where needed.
- [ ] For functions/RPCs, explicitly grant `EXECUTE` only to intended callers and validate authorization inside the function.
- [ ] Never expose `service_role` keys in browser code or the PWA.
- [ ] Test anonymous, authenticated, and backend access paths after applying the migration.

## Production audit snapshot — 2026-10-21

Read-only catalog queries against production project `rfzfsmpsuempafhkqhra` found:

- All ordinary and partitioned tables in `public` had RLS enabled at the time of the check.
- 35 public relations had some ACL privilege for `anon`. This includes intentionally public geographic/reference reads and anonymous insert paths, but also ACL entries such as `TRUNCATE`, `REFERENCES`, and `TRIGGER` on several tables that warrant object-by-object review.
- Six geographic views were selectable by `anon`; views do not expose RLS flags like ordinary tables, so their definitions and underlying access/security-invoker behavior must be reviewed separately.
- No ordinary/partitioned table was found with RLS disabled by this query.
- Catalog inspection of policies alone is not a complete authorization test. Test actual requests as `anon`, `authenticated`, and trusted backend roles before declaring the project secure.

These findings are a review queue, not proof that all grants are safe. No existing object grants were changed during this audit because the requested preservation constraint prohibits blanket revocation. Review any excess `anon` privileges individually and remove only after confirming they are unintended and not required by an existing public flow.

## Production default-privilege change

A production attempt to change default privileges was rejected by Supabase with PostgreSQL error `42501: permission denied to change default privileges`, even though the SQL session reports `current_user = postgres`. Do not retry with a broad workaround or alter existing grants. A database owner / Supabase support-approved path is needed if default privileges must be managed centrally. Until then, explicit grants per object migration are the supported project-level control.

This document is guidance and audit notes, not an applied database migration. Do not mark the production project compliant until default privileges are resolved, existing grants have been reviewed, and authorization paths have been tested.
