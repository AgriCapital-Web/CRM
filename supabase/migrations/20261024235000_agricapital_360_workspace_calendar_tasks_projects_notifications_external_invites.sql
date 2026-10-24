-- AgriCapital 360: workspace calendar, availability, tasks, projects, notifications and external meeting invite records.
-- Idempotent repository migration aligned with the schema provisioned and verified in Supabase.
create table if not exists public.workspace_events (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 200),
 description text, event_type text not null default 'occupation' check(event_type in ('appointment','field_visit','task','training','travel','leave','absence','meeting','occupation','other')),
 visibility text not null default 'private' check(visibility in ('private','team','participants')), starts_at timestamptz not null, ends_at timestamptz not null,
 all_day boolean not null default false, timezone text not null default 'Africa/Abidjan', location text,
 status text not null default 'scheduled' check(status in ('scheduled','cancelled','completed')),
 created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 linked_meeting_id uuid references public.internal_meetings(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table if not exists public.workspace_event_participants (
 event_id uuid not null references public.workspace_events(id) on delete cascade, profile_id uuid not null references public.profiles(id) on delete cascade,
 response text not null default 'pending' check(response in ('pending','accepted','declined','tentative')), created_at timestamptz not null default now(), primary key(event_id,profile_id)
);
create table if not exists public.workspace_availability (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
 availability_type text not null check(availability_type in ('available','busy','absent','remote','travel','unavailable')),
 starts_at timestamptz not null, ends_at timestamptz not null, note text, visibility text not null default 'busy' check(visibility in ('busy','details')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table if not exists public.workspace_tasks (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 200), description text,
 status text not null default 'todo' check(status in ('todo','in_progress','blocked','done','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')), due_at timestamptz,
 created_by_profile_id uuid not null references public.profiles(id) on delete restrict, assigned_to_profile_id uuid references public.profiles(id) on delete set null,
 linked_event_id uuid references public.workspace_events(id) on delete set null, linked_client_id uuid references public.clients(id) on delete set null,
 completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.workspace_projects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160), description text,
 status text not null default 'active' check(status in ('planned','active','on_hold','completed','cancelled')),
 owner_profile_id uuid not null references public.profiles(id) on delete restrict, starts_on date, due_on date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(due_on is null or starts_on is null or due_on>=starts_on)
);
create table if not exists public.workspace_project_members (
 project_id uuid not null references public.workspace_projects(id) on delete cascade, profile_id uuid not null references public.profiles(id) on delete cascade,
 member_role text not null default 'member' check(member_role in ('owner','manager','member','viewer')), created_at timestamptz not null default now(), primary key(project_id,profile_id)
);
create table if not exists public.workspace_notifications (
 id uuid primary key default gen_random_uuid(), recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
 actor_profile_id uuid references public.profiles(id) on delete set null, notification_type text not null, title text not null, body text, target_path text,
 entity_type text, entity_id uuid, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.internal_external_meeting_invites (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.internal_meetings(id) on delete cascade,
 token_hash text not null unique, invitee_email text, invitee_name text, expires_at timestamptz not null,
 max_uses integer not null default 1 check(max_uses between 1 and 100), use_count integer not null default 0 check(use_count>=0),
 revoked_at timestamptz, created_by_profile_id uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
 check(expires_at>created_at)
);
create index if not exists workspace_events_creator_time_idx on public.workspace_events(created_by_profile_id,starts_at);
create index if not exists workspace_events_time_idx on public.workspace_events(starts_at,ends_at) where status='scheduled';
create index if not exists workspace_event_participants_profile_idx on public.workspace_event_participants(profile_id,event_id);
create index if not exists workspace_availability_profile_time_idx on public.workspace_availability(profile_id,starts_at,ends_at);
create index if not exists workspace_tasks_assignee_status_due_idx on public.workspace_tasks(assigned_to_profile_id,status,due_at);
create index if not exists workspace_projects_owner_status_idx on public.workspace_projects(owner_profile_id,status);
create index if not exists workspace_project_members_profile_idx on public.workspace_project_members(profile_id,project_id);
create index if not exists workspace_notifications_recipient_unread_idx on public.workspace_notifications(recipient_profile_id,created_at desc) where read_at is null;
create index if not exists internal_external_meeting_invites_meeting_idx on public.internal_external_meeting_invites(meeting_id,expires_at) where revoked_at is null;
alter table public.workspace_events enable row level security;
alter table public.workspace_event_participants enable row level security;
alter table public.workspace_availability enable row level security;
alter table public.workspace_tasks enable row level security;
alter table public.workspace_projects enable row level security;
alter table public.workspace_project_members enable row level security;
alter table public.workspace_notifications enable row level security;
alter table public.internal_external_meeting_invites enable row level security;
drop policy if exists workspace_events_read on public.workspace_events;
create policy workspace_events_read on public.workspace_events for select to authenticated using(created_by_profile_id=public.internal_current_profile_id() or (visibility='team' and public.internal_current_profile_id() is not null) or exists(select 1 from public.workspace_event_participants ep where ep.event_id=id and ep.profile_id=public.internal_current_profile_id()));
drop policy if exists workspace_events_insert on public.workspace_events;
create policy workspace_events_insert on public.workspace_events for insert to authenticated with check(created_by_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_events_update on public.workspace_events;
create policy workspace_events_update on public.workspace_events for update to authenticated using(created_by_profile_id=public.internal_current_profile_id()) with check(created_by_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_events_delete on public.workspace_events;
create policy workspace_events_delete on public.workspace_events for delete to authenticated using(created_by_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_event_participants_read on public.workspace_event_participants;
create policy workspace_event_participants_read on public.workspace_event_participants for select to authenticated using(profile_id=public.internal_current_profile_id() or exists(select 1 from public.workspace_events e where e.id=event_id and e.created_by_profile_id=public.internal_current_profile_id()));
drop policy if exists workspace_event_participants_manage on public.workspace_event_participants;
create policy workspace_event_participants_manage on public.workspace_event_participants for all to authenticated using(exists(select 1 from public.workspace_events e where e.id=event_id and e.created_by_profile_id=public.internal_current_profile_id())) with check(exists(select 1 from public.workspace_events e where e.id=event_id and e.created_by_profile_id=public.internal_current_profile_id()));
drop policy if exists workspace_availability_read on public.workspace_availability;
create policy workspace_availability_read on public.workspace_availability for select to authenticated using(profile_id=public.internal_current_profile_id() or visibility='busy');
drop policy if exists workspace_availability_insert on public.workspace_availability;
create policy workspace_availability_insert on public.workspace_availability for insert to authenticated with check(profile_id=public.internal_current_profile_id());
drop policy if exists workspace_availability_update on public.workspace_availability;
create policy workspace_availability_update on public.workspace_availability for update to authenticated using(profile_id=public.internal_current_profile_id()) with check(profile_id=public.internal_current_profile_id());
drop policy if exists workspace_availability_delete on public.workspace_availability;
create policy workspace_availability_delete on public.workspace_availability for delete to authenticated using(profile_id=public.internal_current_profile_id());
drop policy if exists workspace_tasks_read on public.workspace_tasks;
create policy workspace_tasks_read on public.workspace_tasks for select to authenticated using(created_by_profile_id=public.internal_current_profile_id() or assigned_to_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_tasks_insert on public.workspace_tasks;
create policy workspace_tasks_insert on public.workspace_tasks for insert to authenticated with check(created_by_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_tasks_update on public.workspace_tasks;
create policy workspace_tasks_update on public.workspace_tasks for update to authenticated using(created_by_profile_id=public.internal_current_profile_id() or assigned_to_profile_id=public.internal_current_profile_id()) with check(created_by_profile_id=public.internal_current_profile_id() or assigned_to_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_tasks_delete on public.workspace_tasks;
create policy workspace_tasks_delete on public.workspace_tasks for delete to authenticated using(created_by_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_projects_read on public.workspace_projects;
create policy workspace_projects_read on public.workspace_projects for select to authenticated using(owner_profile_id=public.internal_current_profile_id() or exists(select 1 from public.workspace_project_members pm where pm.project_id=id and pm.profile_id=public.internal_current_profile_id()));
drop policy if exists workspace_projects_insert on public.workspace_projects;
create policy workspace_projects_insert on public.workspace_projects for insert to authenticated with check(owner_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_projects_update on public.workspace_projects;
create policy workspace_projects_update on public.workspace_projects for update to authenticated using(owner_profile_id=public.internal_current_profile_id()) with check(owner_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_projects_delete on public.workspace_projects;
create policy workspace_projects_delete on public.workspace_projects for delete to authenticated using(owner_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_project_members_read on public.workspace_project_members;
create policy workspace_project_members_read on public.workspace_project_members for select to authenticated using(profile_id=public.internal_current_profile_id() or exists(select 1 from public.workspace_projects p where p.id=project_id and p.owner_profile_id=public.internal_current_profile_id()));
drop policy if exists workspace_project_members_manage on public.workspace_project_members;
create policy workspace_project_members_manage on public.workspace_project_members for all to authenticated using(exists(select 1 from public.workspace_projects p where p.id=project_id and p.owner_profile_id=public.internal_current_profile_id())) with check(exists(select 1 from public.workspace_projects p where p.id=project_id and p.owner_profile_id=public.internal_current_profile_id()));
drop policy if exists workspace_notifications_read on public.workspace_notifications;
create policy workspace_notifications_read on public.workspace_notifications for select to authenticated using(recipient_profile_id=public.internal_current_profile_id());
drop policy if exists workspace_notifications_update on public.workspace_notifications;
create policy workspace_notifications_update on public.workspace_notifications for update to authenticated using(recipient_profile_id=public.internal_current_profile_id()) with check(recipient_profile_id=public.internal_current_profile_id());
drop policy if exists internal_external_invites_read on public.internal_external_meeting_invites;
create policy internal_external_invites_read on public.internal_external_meeting_invites for select to authenticated using(created_by_profile_id=public.internal_current_profile_id() or exists(select 1 from public.internal_meetings m where m.id=meeting_id and m.created_by_profile_id=public.internal_current_profile_id()));
drop policy if exists internal_external_invites_manage on public.internal_external_meeting_invites;
create policy internal_external_invites_manage on public.internal_external_meeting_invites for all to authenticated using(exists(select 1 from public.internal_meetings m where m.id=meeting_id and m.created_by_profile_id=public.internal_current_profile_id())) with check(created_by_profile_id=public.internal_current_profile_id() and exists(select 1 from public.internal_meetings m where m.id=meeting_id and m.created_by_profile_id=public.internal_current_profile_id()));
grant select,insert,update,delete on public.workspace_events,public.workspace_event_participants,public.workspace_availability,public.workspace_tasks,public.workspace_projects,public.workspace_project_members,public.workspace_notifications,public.internal_external_meeting_invites to authenticated;
revoke all on public.workspace_events,public.workspace_event_participants,public.workspace_availability,public.workspace_tasks,public.workspace_projects,public.workspace_project_members,public.workspace_notifications,public.internal_external_meeting_invites from anon;
do $$ declare t text; begin foreach t in array array['workspace_events','workspace_event_participants','workspace_availability','workspace_tasks','workspace_projects','workspace_project_members','workspace_notifications'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if; end loop; end $$;
