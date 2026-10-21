# Supabase Data API permissions for AgriCapital 360

Effective 2026-10-30, do not rely on automatic Data API grants for newly created tables in `public`.

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

## Production default-privilege change

A production attempt to change default privileges was rejected by Supabase with PostgreSQL error `42501: permission denied to change default privileges`, even though the SQL session reports `current_user = postgres`. Do not retry with a broad workaround or alter existing grants. A database owner / Supabase support-approved path is needed if default privileges must be managed centrally. Until then, explicit grants per object migration are the supported project-level control.

This document is guidance, not an applied database migration. Do not mark the production project compliant until the permissions and migrations have been audited and tested.
