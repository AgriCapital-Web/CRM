-- Configuration des niveaux de couverture des rôles depuis la base de données.
alter table public.app_roles
  add column if not exists niveau_couverture text not null default 'global',
  add column if not exists libelle_couverture text not null default 'Périmètre';

alter table public.app_roles
  drop constraint if exists app_roles_niveau_couverture_check;

alter table public.app_roles
  add constraint app_roles_niveau_couverture_check
  check (niveau_couverture in ('global','region','departement','sous_prefecture'));

-- Hiérarchie de couverture demandée : le rôle détermine le niveau, la zone
-- affichée est ensuite résolue à partir des affectations géographiques en base.
update public.app_roles
set niveau_couverture='sous_prefecture', libelle_couverture='Zone d’intervention', updated_at=now()
where code in ('commercial','technicien','mobilisateur_foncier');

update public.app_roles
set niveau_couverture='departement', libelle_couverture='Département', updated_at=now()
where code in ('chef_equipe_commercial','chef_equipe_technique');

update public.app_roles
set niveau_couverture='region', libelle_couverture='Région', updated_at=now()
where code in ('responsable_commercial','superviseur_mobilisation_fonciere');

update public.app_roles
set niveau_couverture='global', libelle_couverture='Périmètre', updated_at=now()
where code not in ('commercial','technicien','mobilisateur_foncier','chef_equipe_commercial','chef_equipe_technique','responsable_commercial','superviseur_mobilisation_fonciere');

-- Les agents doivent pouvoir lire les paramètres de couverture des rôles.
drop policy if exists app_roles_select_staff on public.app_roles;
create policy app_roles_select_staff on public.app_roles
for select to authenticated
using (private.is_staff(auth.uid()) or private.is_global_admin(auth.uid()));
