-- Commercial and technical field roles are assigned at department level.
-- This keeps all subordinate sub-prefectures within the assigned department in scope.
update public.app_roles
set niveau_couverture = 'departement'
where code in ('commercial', 'technicien', 'chef_equipe_commercial', 'chef_equipe_technique');
