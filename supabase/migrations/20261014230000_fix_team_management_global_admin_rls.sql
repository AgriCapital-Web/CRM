-- Team management must honor the same global administrator rule as team membership.
-- The previous equipes ALL policy only checked the permission matrix, which could
-- deny PDG/DG users even though the CRM grants them global administration.
drop policy if exists "CRM equipes manage by parameter permission" on public.equipes;

create policy "CRM equipes manage by parameter permission"
on public.equipes
for all
to authenticated
using (
  private.has_role_permission('parametres.manage_teams')
  or private.is_global_admin(auth.uid())
  or private.has_role(auth.uid(), 'pdg')
  or private.has_role(auth.uid(), 'dg')
)
with check (
  private.has_role_permission('parametres.manage_teams')
  or private.is_global_admin(auth.uid())
  or private.has_role(auth.uid(), 'pdg')
  or private.has_role(auth.uid(), 'dg')
);
