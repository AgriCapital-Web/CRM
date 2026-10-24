-- Restore permission-based CRUD for promotions without bypassing RLS.
-- The table previously had SELECT and DELETE policies only; INSERT/UPDATE were
-- denied even for PDG/DG accounts that already carry the corresponding permissions.

drop policy if exists "Promotions create by permission" on public.promotions;
create policy "Promotions create by permission"
on public.promotions
for insert
to authenticated
with check (
  private.has_role_permission('promotions.create')
  or private.has_role_permission('offres.manage_promotions')
);

drop policy if exists "Promotions update by permission" on public.promotions;
create policy "Promotions update by permission"
on public.promotions
for update
to authenticated
using (
  private.has_role_permission('promotions.update')
  or private.has_role_permission('offres.manage_promotions')
)
with check (
  private.has_role_permission('promotions.update')
  or private.has_role_permission('offres.manage_promotions')
);

drop policy if exists "Admins delete promotions" on public.promotions;
create policy "Promotions delete by permission"
on public.promotions
for delete
to authenticated
using (
  private.has_role_permission('promotions.delete')
  or private.has_role_permission('offres.manage_promotions')
);

-- Keep PostgreSQL table privileges explicit; RLS remains the authorization boundary.
grant select, insert, update, delete on public.promotions to authenticated;
