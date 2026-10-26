-- Break the circular RLS dependency between workspace_projects and workspace_project_members.
-- This migration is already applied to Supabase as version 20261026083503.
create or replace function private.workspace_is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_projects p
    join public.profiles pr on pr.id = p.owner_profile_id
    where p.id = p_project_id
      and pr.user_id = auth.uid()
      and coalesce(pr.actif, false) = true
  );
$$;

create or replace function private.workspace_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_projects p
    join public.profiles pr on pr.id = p.owner_profile_id
    where p.id = p_project_id
      and pr.user_id = auth.uid()
      and coalesce(pr.actif, false) = true
  )
  or exists (
    select 1
    from public.workspace_project_members pm
    join public.profiles pr on pr.id = pm.profile_id
    where pm.project_id = p_project_id
      and pr.user_id = auth.uid()
      and coalesce(pr.actif, false) = true
  );
$$;

revoke all on function private.workspace_is_project_owner(uuid) from public, anon;
revoke all on function private.workspace_can_access_project(uuid) from public, anon;
grant execute on function private.workspace_is_project_owner(uuid) to authenticated;
grant execute on function private.workspace_can_access_project(uuid) to authenticated;

drop policy if exists workspace_projects_read on public.workspace_projects;
create policy workspace_projects_read
on public.workspace_projects
for select
to authenticated
using (private.workspace_can_access_project(id));

drop policy if exists workspace_project_members_manage on public.workspace_project_members;
create policy workspace_project_members_manage
on public.workspace_project_members
for all
to authenticated
using (private.workspace_is_project_owner(project_id))
with check (private.workspace_is_project_owner(project_id));

drop policy if exists workspace_project_members_read on public.workspace_project_members;
create policy workspace_project_members_read
on public.workspace_project_members
for select
to authenticated
using (
  profile_id = public.internal_current_profile_id()
  or private.workspace_is_project_owner(project_id)
);
