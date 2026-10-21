-- Rename the obsolete role to Responsable de district (RD) and align geographic scope.
insert into public.app_roles(code,nom,court,description,niveau,niveau_label,actif,niveau_couverture,libelle_couverture)
values ('responsable_district','Responsable de district','RD','Responsable du périmètre de district',4,'Encadrement territorial',true,'district','District')
on conflict (code) do update set nom=excluded.nom,court=excluded.court,description=excluded.description,actif=true,niveau_couverture='district',libelle_couverture='District',updated_at=now();

-- Preserve permissions attached to the legacy code if any existed.
insert into public.role_permissions(role_code,permission_code)
select 'responsable_district', permission_code
from public.role_permissions
where role_code='responsable_zone'
on conflict do nothing;

delete from public.user_roles old_role
where old_role.role='responsable_zone'
and exists(select 1 from public.user_roles new_role where new_role.user_id=old_role.user_id and new_role.role='responsable_district');

update public.user_roles set role='responsable_district' where role='responsable_zone';
update public.role_permissions set role_code='responsable_district' where role_code='responsable_zone';
update public.account_requests
set role_souhaite='responsable_district',
    poste_souhaite='Responsable de district (RD)',
    updated_at=now()
where role_souhaite='responsable_zone' or lower(coalesce(poste_souhaite,'')) in ('responsable de zone','responsable de zone (rd)');

update public.app_roles set niveau_couverture='region',libelle_couverture='Région',updated_at=now()
where code in ('responsable_commercial','chef_equipe_technique','superviseur_mobilisation_fonciere','responsable_technique_agronomique');
update public.app_roles set niveau_couverture='departement',libelle_couverture='Département',updated_at=now()
where code in ('chef_equipe_commercial','technicien','mobilisateur_foncier');
update public.app_roles set niveau_couverture='sous_prefecture',libelle_couverture='Sous-préfecture',updated_at=now()
where code='commercial';
