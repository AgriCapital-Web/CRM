-- Break the mutual RLS recursion between workspace_projects and workspace_project_members.
-- Membership/ownership checks run in a tightly scoped SECURITY DEFINER helper to avoid
-- re-entering the policies of the table currently being evaluated.
create or replace function public.workspace_project_has_member(p_project_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_project_members pm
    where pm.project_id = p_project_id
      and pm.profile_id = p_profile_id
  );
$$;

create or replace function public.workspace_project_is_owner(p_project_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_projects p
    where p.id = p_project_id
      and p.owner_profile_id = p_profile_id
  );
$$;

revoke all on function public.workspace_project_has_member(uuid, uuid) from public, anon;
revoke all on function public.workspace_project_is_owner(uuid, uuid) from public, anon;
grant execute on function public.workspace_project_has_member(uuid, uuid) to authenticated;
grant execute on function public.workspace_project_is_owner(uuid, uuid) to authenticated;

drop policy if exists workspace_projects_read on public.workspace_projects;
create policy workspace_projects_read on public.workspace_projects
for select to authenticated
using (
  owner_profile_id = public.internal_current_profile_id()
  or public.workspace_project_has_member(id, public.internal_current_profile_id())
);

drop policy if exists workspace_projects_insert on public.workspace_projects;
create policy workspace_projects_insert on public.workspace_projects
for insert to authenticated
with check (owner_profile_id = public.internal_current_profile_id());

drop policy if exists workspace_projects_update on public.workspace_projects;
create policy workspace_projects_update on public.workspace_projects
for update to authenticated
using (owner_profile_id = public.internal_current_profile_id())
with check (owner_profile_id = public.internal_current_profile_id());

drop policy if exists workspace_projects_delete on public.workspace_projects;
create policy workspace_projects_delete on public.workspace_projects
for delete to authenticated
using (owner_profile_id = public.internal_current_profile_id());

drop policy if exists workspace_project_members_read on public.workspace_project_members;
create policy workspace_project_members_read on public.workspace_project_members
for select to authenticated
using (
  profile_id = public.internal_current_profile_id()
  or public.workspace_project_is_owner(project_id, public.internal_current_profile_id())
);

drop policy if exists workspace_project_members_manage on public.workspace_project_members;
create policy workspace_project_members_manage on public.workspace_project_members
for all to authenticated
using (public.workspace_project_is_owner(project_id, public.internal_current_profile_id()))
with check (public.workspace_project_is_owner(project_id, public.internal_current_profile_id()));
