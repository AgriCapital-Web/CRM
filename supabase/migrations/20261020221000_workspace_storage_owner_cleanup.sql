-- Allow authenticated users to remove only their own workspace source files.
-- Workspace objects are stored under <auth.uid()>/workspace/<document-id>/...
drop policy if exists "Users delete own workspace source files" on storage.objects;
create policy "Users delete own workspace source files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'workspace'
);
