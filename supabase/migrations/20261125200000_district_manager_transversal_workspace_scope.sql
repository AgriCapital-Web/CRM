-- Le responsable de district supervise tous les services de son district.
-- Cette portée est transversale, mais ne donne pas accès aux dossiers RH confidentiels.

create or replace function private.crm_user_can_access_profile_in_district(
  p_user_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null
    and p_profile_id is not null
    and exists (
      select 1
      from public.profiles actor
      join public.user_roles ur
        on ur.user_id = actor.user_id
       and lower(trim(ur.role)) = 'responsable_district'
      join public.profiles target
        on target.id = p_profile_id
      where actor.user_id = p_user_id
        and actor.actif is distinct from false
        and target.actif is distinct from false
        and actor.district_id is not null
        and actor.district_id = target.district_id
    );
$function$;

revoke all on function private.crm_user_can_access_profile_in_district(uuid,uuid) from public, anon;
grant execute on function private.crm_user_can_access_profile_in_district(uuid,uuid) to authenticated, service_role;

insert into public.app_permissions(code,module,action,libelle,description,actif)
values (
  'system.role_responsable_district',
  'system',
  'role',
  'Responsable de district',
  'Affiche les indicateurs transversaux et l’organigramme du district.',
  true
)
on conflict (code) do update
set module=excluded.module,
    action=excluded.action,
    libelle=excluded.libelle,
    description=excluded.description,
    actif=true,
    updated_at=now();

insert into public.role_permissions(role_code,permission_code)
values ('responsable_district','system.role_responsable_district')
on conflict do nothing;

-- La liste des collaborateurs reste strictement limitée au district du RD.
drop policy if exists "Profiles select by permission" on public.profiles;
create policy "Profiles select by permission"
on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or private.crm_has_role_permission('utilisateurs.view')
  or private.crm_has_role_permission('utilisateurs.update')
  or private.crm_user_can_access_profile_in_district((select auth.uid()), id)
);

-- Les projets dont le propriétaire appartient au district sont visibles par le RD.
create or replace function private.workspace_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.workspace_projects p
    where p.id = p_project_id
      and (
        exists (
          select 1 from public.profiles pr
          where pr.id = p.owner_profile_id
            and pr.user_id = auth.uid()
            and coalesce(pr.actif,false) = true
        )
        or private.crm_user_can_access_profile_in_district(auth.uid(), p.owner_profile_id)
      )
  )
  or exists (
    select 1
    from public.workspace_project_members pm
    join public.profiles pr on pr.id = pm.profile_id
    where pm.project_id = p_project_id
      and (
        (pr.user_id = auth.uid() and coalesce(pr.actif,false) = true)
        or private.crm_user_can_access_profile_in_district(auth.uid(), pm.profile_id)
      )
  );
$function$;

-- Organigramme et rattachements : visibilité de tous les collaborateurs du district.
drop policy if exists workspace_reporting_lines_read on public.workspace_reporting_lines;
create policy workspace_reporting_lines_read
on public.workspace_reporting_lines for select to authenticated
using (
  profile_id = internal_current_profile_id()
  or manager_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), profile_id)
  or private.crm_user_can_access_profile_in_district(auth.uid(), manager_profile_id)
  or exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.user_id = ur.user_id
    where p.id = internal_current_profile_id()
      and lower(ur.role) in ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général')
  )
);

-- Réunions et événements du district.
drop policy if exists workspace_events_read on public.workspace_events;
create policy workspace_events_read
on public.workspace_events for select to authenticated
using (
  created_by_profile_id = internal_current_profile_id()
  or (visibility = 'team' and internal_current_profile_id() is not null)
  or workspace_event_has_participant(id, internal_current_profile_id())
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
);

drop policy if exists workspace_events_update on public.workspace_events;
create policy workspace_events_update
on public.workspace_events for update to authenticated
using (
  created_by_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
)
with check (
  created_by_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
);

drop policy if exists workspace_events_delete on public.workspace_events;
create policy workspace_events_delete
on public.workspace_events for delete to authenticated
using (
  created_by_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
);

-- Tâches des collaborateurs du district, quel que soit leur département.
drop policy if exists workspace_tasks_read on public.workspace_tasks;
create policy workspace_tasks_read
on public.workspace_tasks for select to authenticated
using (
  created_by_profile_id = internal_current_profile_id()
  or assigned_to_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
  or private.crm_user_can_access_profile_in_district(auth.uid(), assigned_to_profile_id)
);

drop policy if exists workspace_tasks_update on public.workspace_tasks;
create policy workspace_tasks_update
on public.workspace_tasks for update to authenticated
using (
  created_by_profile_id = internal_current_profile_id()
  or assigned_to_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
  or private.crm_user_can_access_profile_in_district(auth.uid(), assigned_to_profile_id)
)
with check (
  created_by_profile_id = internal_current_profile_id()
  or assigned_to_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
  or private.crm_user_can_access_profile_in_district(auth.uid(), assigned_to_profile_id)
);

drop policy if exists workspace_tasks_delete on public.workspace_tasks;
create policy workspace_tasks_delete
on public.workspace_tasks for delete to authenticated
using (
  created_by_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), created_by_profile_id)
);

-- Les responsables de district peuvent suivre et gérer les projets de leur périmètre.
drop policy if exists workspace_projects_read on public.workspace_projects;
create policy workspace_projects_read
on public.workspace_projects for select to authenticated
using (private.workspace_can_access_project(id));

drop policy if exists workspace_projects_update on public.workspace_projects;
create policy workspace_projects_update
on public.workspace_projects for update to authenticated
using (
  owner_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), owner_profile_id)
)
with check (
  owner_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), owner_profile_id)
);

drop policy if exists workspace_projects_delete on public.workspace_projects;
create policy workspace_projects_delete
on public.workspace_projects for delete to authenticated
using (
  owner_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), owner_profile_id)
);

drop policy if exists workspace_project_members_read on public.workspace_project_members;
create policy workspace_project_members_read
on public.workspace_project_members for select to authenticated
using (
  profile_id = internal_current_profile_id()
  or private.workspace_can_access_project(project_id)
  or private.crm_user_can_access_profile_in_district(auth.uid(), profile_id)
);

-- Les notifications de travail restent consultables à l'échelle du district.
drop policy if exists workspace_notifications_read on public.workspace_notifications;
create policy workspace_notifications_read
on public.workspace_notifications for select to authenticated
using (
  recipient_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), recipient_profile_id)
);

drop policy if exists workspace_notifications_update on public.workspace_notifications;
create policy workspace_notifications_update
on public.workspace_notifications for update to authenticated
using (
  recipient_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), recipient_profile_id)
)
with check (
  recipient_profile_id = internal_current_profile_id()
  or private.crm_user_can_access_profile_in_district(auth.uid(), recipient_profile_id)
);

-- Les fiches de poste affectées sont visibles à l'échelle du district.
drop policy if exists workspace_job_assignments_read on public.workspace_job_assignments;
create policy workspace_job_assignments_read
on public.workspace_job_assignments for select to authenticated
using (
  profile_id = internal_current_profile_id()
  or exists (
    select 1 from public.workspace_reporting_lines rl
    where rl.profile_id = workspace_job_assignments.profile_id
      and rl.manager_profile_id = internal_current_profile_id()
      and rl.valid_to is null
  )
  or private.crm_user_can_access_profile_in_district(auth.uid(), profile_id)
  or exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.user_id = ur.user_id
    where p.id = internal_current_profile_id()
      and lower(ur.role) in ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général')
  )
);

-- Les objectifs opérationnels du district sont visibles, sans ouvrir les évaluations RH.
drop policy if exists workspace_objectives_read on public.workspace_objectives;
create policy workspace_objectives_read
on public.workspace_objectives for select to authenticated
using (
  profile_id = internal_current_profile_id()
  or created_by_profile_id = internal_current_profile_id()
  or exists (
    select 1 from public.workspace_reporting_lines rl
    where rl.profile_id = workspace_objectives.profile_id
      and rl.manager_profile_id = internal_current_profile_id()
      and rl.valid_to is null
  )
  or private.crm_user_can_access_profile_in_district(auth.uid(), profile_id)
  or exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.user_id = ur.user_id
    where p.id = internal_current_profile_id()
      and lower(ur.role) in ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général')
  )
);
