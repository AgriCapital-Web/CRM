-- Message senders must be able to upload and preview their own notification attachments.
-- Keep delete/cleanup restricted to administrators.
drop policy if exists "notification_media_messaging_upload" on storage.objects;
create policy "notification_media_messaging_upload"
on storage.objects for insert to authenticated
with check (bucket_id='notification-media' and private.has_role_permission('messagerie.send'));

drop policy if exists "notification_media_messaging_read" on storage.objects;
create policy "notification_media_messaging_read"
on storage.objects for select to authenticated
using (bucket_id='notification-media'
  and (private.has_role_permission('messagerie.view') or private.has_role_permission('messagerie.send')));
