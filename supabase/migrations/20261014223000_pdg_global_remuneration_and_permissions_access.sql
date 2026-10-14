-- Direction: accès global explicite pour le PDG/DG aux réglages de rémunération,
-- au catalogue des rôles et à la matrice de permissions.
create table if not exists public.app_permissions (
  code text primary key,
  module text not null,
  action text not null,
  libelle text not null,
  description text not null default '',
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_permissions_code_format check (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

alter table public.app_permissions enable row level security;

drop policy if exists app_permissions_select_staff on public.app_permissions;
create policy app_permissions_select_staff on public.app_permissions
for select to authenticated
using (private.is_staff(auth.uid()) or private.is_global_admin(auth.uid()));

drop policy if exists app_permissions_insert_global_admin on public.app_permissions;
create policy app_permissions_insert_global_admin on public.app_permissions
for insert to authenticated
with check (private.is_global_admin(auth.uid()));

drop policy if exists app_permissions_update_global_admin on public.app_permissions;
create policy app_permissions_update_global_admin on public.app_permissions
for update to authenticated
using (private.is_global_admin(auth.uid()))
with check (private.is_global_admin(auth.uid()));

drop policy if exists app_permissions_delete_global_admin on public.app_permissions;
create policy app_permissions_delete_global_admin on public.app_permissions
for delete to authenticated
using (private.is_global_admin(auth.uid()));

drop policy if exists app_roles_insert_global_admin on public.app_roles;
create policy app_roles_insert_global_admin on public.app_roles
for insert to authenticated
with check (private.is_global_admin(auth.uid()));

drop policy if exists app_roles_update_global_admin on public.app_roles;
create policy app_roles_update_global_admin on public.app_roles
for update to authenticated
using (private.is_global_admin(auth.uid()))
with check (private.is_global_admin(auth.uid()));

drop policy if exists app_roles_delete_global_admin on public.app_roles;
create policy app_roles_delete_global_admin on public.app_roles
for delete to authenticated
using (private.is_global_admin(auth.uid()));

drop policy if exists role_permissions_insert_global_admin on public.role_permissions;
create policy role_permissions_insert_global_admin on public.role_permissions
for insert to authenticated
with check (private.is_global_admin(auth.uid()));

drop policy if exists role_permissions_update_global_admin on public.role_permissions;
create policy role_permissions_update_global_admin on public.role_permissions
for update to authenticated
using (private.is_global_admin(auth.uid()))
with check (private.is_global_admin(auth.uid()));

drop policy if exists role_permissions_delete_global_admin on public.role_permissions;
create policy role_permissions_delete_global_admin on public.role_permissions
for delete to authenticated
using (private.is_global_admin(auth.uid()));

drop policy if exists grille_remuneration_insert_global_admin on public.grille_remuneration;
create policy grille_remuneration_insert_global_admin on public.grille_remuneration
for insert to authenticated
with check (private.is_global_admin(auth.uid()));

drop policy if exists grille_remuneration_update_global_admin on public.grille_remuneration;
create policy grille_remuneration_update_global_admin on public.grille_remuneration
for update to authenticated
using (private.is_global_admin(auth.uid()))
with check (private.is_global_admin(auth.uid()));

drop policy if exists grille_remuneration_delete_global_admin on public.grille_remuneration;
create policy grille_remuneration_delete_global_admin on public.grille_remuneration
for delete to authenticated
using (private.is_global_admin(auth.uid()));

update public.grille_remuneration
set description = replace(description, 'commission subvention', 'commission / vente'),
    updated_at = now()
where description ilike '%commission subvention%';

update public.grille_remuneration
set description = 'Commission technique sur réalisation / mise en terre',
    updated_at = now()
where code_regle = 'TECHNIQUE_MISE_EN_TERRE';
