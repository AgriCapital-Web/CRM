-- Les politiques de stockage et d'équipes s'appuient sur le catalogue de permissions.
begin;

drop policy if exists "notification_media_admin_read" on storage.objects;
drop policy if exists "notification_media_admin_upload" on storage.objects;
drop policy if exists "notification_media_admin_delete" on storage.objects;

create policy "notification_media_admin_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'notification-media' and private.has_role_permission('parametres.manage_system'));

create policy "notification_media_admin_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'notification-media' and private.has_role_permission('parametres.manage_system'));

create policy "notification_media_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'notification-media' and private.has_role_permission('parametres.manage_system'));

drop policy if exists "photos_equipes_insert_managers" on storage.objects;
drop policy if exists "photos_equipes_update_managers" on storage.objects;
drop policy if exists "photos_equipes_delete_managers" on storage.objects;

create policy "photos_equipes_insert_managers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos-equipes' and private.has_role_permission('parametres.manage_teams'));

create policy "photos_equipes_update_managers"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos-equipes' and private.has_role_permission('parametres.manage_teams'))
  with check (bucket_id = 'photos-equipes' and private.has_role_permission('parametres.manage_teams'));

create policy "photos_equipes_delete_managers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos-equipes' and private.has_role_permission('parametres.manage_teams'));

drop policy if exists "CRM equipes manage by parameter permission" on public.equipes;
create policy "CRM equipes manage by parameter permission"
  on public.equipes for all to authenticated
  using (private.has_role_permission('parametres.manage_teams'))
  with check (private.has_role_permission('parametres.manage_teams'));

notify pgrst, 'reload schema';
commit;
