-- Fix internal collaboration RLS and provide complete, safe user/role pickers.
create or replace function public.internal_is_conversation_creator(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.internal_conversations c
    where c.id = p_conversation_id
      and c.created_by_profile_id = public.internal_current_profile_id()
  );
$$;

drop policy if exists internal_members_insert on public.internal_conversation_members;
create policy internal_members_insert on public.internal_conversation_members
for insert to authenticated
with check (
  public.internal_is_conversation_creator(conversation_id)
  and exists (
    select 1 from public.profiles p
    where p.id = internal_conversation_members.profile_id
      and coalesce(p.actif, false) = true
      and p.user_id is not null
  )
);

drop policy if exists internal_members_delete on public.internal_conversation_members;
create policy internal_members_delete on public.internal_conversation_members
for delete to authenticated
using (public.internal_is_conversation_creator(conversation_id));

create or replace function public.workspace_list_collaborators()
returns table(id uuid, nom_complet text, email text, poste text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nom_complet, p.email, p.poste
  from public.profiles p
  where coalesce(p.actif, false) = true
    and p.user_id is not null
    and public.workspace_current_profile_id() is not null
  order by p.nom_complet;
$$;

create or replace function public.workspace_list_roles()
returns table(code text, nom text, court text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select r.code, r.nom, r.court
  from public.app_roles r
  where coalesce(r.actif, true) = true
    and public.workspace_current_profile_id() is not null
  order by r.niveau nulls last, r.nom;
$$;

create or replace function public.workspace_list_collaborators_with_roles()
returns table(id uuid, nom_complet text, email text, poste text, role_codes text[], role_names text[])
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nom_complet, p.email, p.poste,
    coalesce(array_agg(distinct ur.role) filter (where ur.role is not null), '{}'::text[]),
    coalesce(array_agg(distinct ar.nom) filter (where ar.nom is not null), '{}'::text[])
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.user_id
  left join public.app_roles ar on lower(ar.code) = lower(ur.role)
  where coalesce(p.actif, false) = true and p.user_id is not null
    and public.workspace_current_profile_id() is not null
  group by p.id, p.nom_complet, p.email, p.poste
  order by p.nom_complet;
$$;

create or replace function public.internal_create_conversation(
  p_conversation_type text,
  p_title text,
  p_member_profile_ids uuid[]
)
returns table(id uuid, conversation_type text, title text, last_message_at timestamptz, created_by_profile_id uuid)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.internal_current_profile_id();
  v_conversation_id uuid;
  v_targets uuid[];
  v_member_count integer;
begin
  if v_profile_id is null then raise exception 'Profil utilisateur actif introuvable.'; end if;
  if p_conversation_type not in ('direct','group','channel') then raise exception 'Type de conversation invalide.'; end if;
  select array_agg(distinct x) into v_targets
  from unnest(coalesce(p_member_profile_ids, '{}'::uuid[]) || array[v_profile_id]) as x;
  v_member_count := coalesce(array_length(v_targets, 1), 0);
  if p_conversation_type = 'direct' and v_member_count <> 2 then raise exception 'Une conversation privée doit contenir deux utilisateurs.'; end if;
  if p_conversation_type in ('group','channel') and v_member_count < 2 then raise exception 'Ajoutez au moins un autre utilisateur.'; end if;
  if exists (
    select 1 from unnest(v_targets) target_id
    where not exists (select 1 from public.profiles p where p.id = target_id and coalesce(p.actif,false) and p.user_id is not null)
  ) then raise exception 'Un participant sélectionné est inactif ou indisponible.'; end if;

  insert into public.internal_conversations(conversation_type,title,created_by_profile_id)
  values (p_conversation_type, nullif(trim(p_title),''), v_profile_id)
  returning internal_conversations.id into v_conversation_id;

  insert into public.internal_conversation_members(conversation_id,profile_id,member_role)
  select v_conversation_id, target_id, case when target_id = v_profile_id then 'owner' else 'member' end
  from unnest(v_targets) target_id;

  return query select c.id,c.conversation_type,c.title,c.last_message_at,c.created_by_profile_id
    from public.internal_conversations c where c.id = v_conversation_id;
end;
$$;

create table if not exists public.internal_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.internal_messages(id) on delete cascade,
  conversation_id uuid not null references public.internal_conversations(id) on delete cascade,
  uploaded_by_profile_id uuid not null references public.profiles(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);
alter table public.internal_message_attachments enable row level security;
drop policy if exists internal_message_attachments_read on public.internal_message_attachments;
create policy internal_message_attachments_read on public.internal_message_attachments
for select to authenticated using (public.internal_is_conversation_member(conversation_id));
drop policy if exists internal_message_attachments_insert on public.internal_message_attachments;
create policy internal_message_attachments_insert on public.internal_message_attachments
for insert to authenticated with check (
  uploaded_by_profile_id = public.internal_current_profile_id()
  and public.internal_is_conversation_member(conversation_id)
  and exists (select 1 from public.internal_messages m where m.id = message_id and m.conversation_id = internal_message_attachments.conversation_id and m.sender_profile_id = public.internal_current_profile_id())
);

create table if not exists public.internal_meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.internal_meetings(id) on delete cascade,
  uploaded_by_profile_id uuid not null references public.profiles(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);
alter table public.internal_meeting_attachments enable row level security;
drop policy if exists internal_meeting_attachments_read on public.internal_meeting_attachments;
create policy internal_meeting_attachments_read on public.internal_meeting_attachments
for select to authenticated using (public.internal_can_read_meeting(meeting_id));
drop policy if exists internal_meeting_attachments_insert on public.internal_meeting_attachments;
create policy internal_meeting_attachments_insert on public.internal_meeting_attachments
for insert to authenticated with check (
  uploaded_by_profile_id = public.internal_current_profile_id()
  and exists (select 1 from public.internal_meetings m where m.id = meeting_id and m.created_by_profile_id = public.internal_current_profile_id())
);

grant execute on function public.internal_is_conversation_creator(uuid) to authenticated;
grant execute on function public.workspace_list_collaborators() to authenticated;
grant execute on function public.workspace_list_roles() to authenticated;
grant execute on function public.workspace_list_collaborators_with_roles() to authenticated;
grant execute on function public.internal_create_conversation(text,text,uuid[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('workspace-attachments','workspace-attachments',false,52428800,
  array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip'])
on conflict (id) do update set public=false,file_size_limit=52428800,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists workspace_attachments_read on storage.objects;
create policy workspace_attachments_read on storage.objects
for select to authenticated using (bucket_id='workspace-attachments' and exists (
  select 1 from public.internal_message_attachments a
  where a.storage_path = name and public.internal_is_conversation_member(a.conversation_id)
) or (bucket_id='workspace-attachments' and exists (
  select 1 from public.internal_meeting_attachments a
  where a.storage_path = name and public.internal_can_read_meeting(a.meeting_id)
)));
drop policy if exists workspace_attachments_insert on storage.objects;
create policy workspace_attachments_insert on storage.objects
for insert to authenticated with check (
  bucket_id='workspace-attachments'
  and (storage.foldername(name))[1] = public.internal_current_profile_id()::text
);
