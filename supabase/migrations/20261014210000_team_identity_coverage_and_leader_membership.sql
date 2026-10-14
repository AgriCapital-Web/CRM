-- Team identity, coverage, and automatic team-leader membership.
alter table public.equipes
  add column if not exists photo_url text,
  add column if not exists zone_couverture text;

insert into public.equipe_membres (equipe_id, profile_id)
select e.id, e.responsable_id
from public.equipes e
where e.responsable_id is not null
on conflict (equipe_id, profile_id) do nothing;

create or replace function public.sync_equipe_responsable_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsable_id is not null then
    insert into public.equipe_membres (equipe_id, profile_id, created_by)
    values (new.id, new.responsable_id, auth.uid())
    on conflict (equipe_id, profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_equipe_responsable_membership on public.equipes;
create trigger trg_sync_equipe_responsable_membership
after insert or update of responsable_id on public.equipes
for each row
execute function public.sync_equipe_responsable_membership();

-- Team logos are public for display in tables, while writes remain staff-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-equipes', 'photos-equipes', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = true, file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Team logo upload managers" on storage.objects;
create policy "Team logo upload managers" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'photos-equipes'
  and (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()))
);

drop policy if exists "Team logo update managers" on storage.objects;
create policy "Team logo update managers" on storage.objects
for update to authenticated
using (
  bucket_id = 'photos-equipes'
  and (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()))
)
with check (
  bucket_id = 'photos-equipes'
  and (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()))
);

drop policy if exists "Team logo delete managers" on storage.objects;
create policy "Team logo delete managers" on storage.objects
for delete to authenticated
using (
  bucket_id = 'photos-equipes'
  and (private.has_role_permission('parametres.manage_teams') or private.is_global_admin(auth.uid()))
);
