update public.app_roles
set niveau_couverture='region', libelle_couverture='Région', updated_at=now()
where code='responsable_operations';