create table if not exists public.imported_phone_contacts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 contact_key text not null,
 first_name text,
 last_name text,
 phone text,
 secondary_phone text,
 email text,
 whatsapp_primary boolean not null default false,
 whatsapp_secondary boolean not null default false,
 selected boolean not null default false,
 source text not null default 'import',
 status text not null default 'pending' check (status in ('pending','created','duplicate','invalid')),
 lead_id uuid,
 last_error text,
 imported_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, contact_key)
);
alter table public.imported_phone_contacts enable row level security;
drop policy if exists "Users manage own imported phone contacts" on public.imported_phone_contacts;
create policy "Users manage own imported phone contacts" on public.imported_phone_contacts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.imported_phone_contacts to authenticated;