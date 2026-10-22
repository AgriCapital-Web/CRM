create or replace function private.crm_workspace_storage_access(_path text, _permission text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, private, storage
as $function$
declare
  parts text[];
  v_document_id uuid;
begin
  if auth.uid() is null then return false; end if;
  parts := storage.foldername(_path);
  if coalesce(parts[2],'') <> 'workspace' or coalesce(parts[3],'') = '' then return false; end if;
  begin
    v_document_id := parts[3]::uuid;
  exception when others then
    return false;
  end;
  if _permission = 'view' then
    return public.workspace_can_read_document(v_document_id);
  elsif _permission = 'edit' then
    return public.workspace_can_edit_document(v_document_id);
  end if;
  return false;
end
$function$;

revoke all on function private.crm_workspace_storage_access(text,text) from public,anon;
grant execute on function private.crm_workspace_storage_access(text,text) to authenticated,service_role;

drop policy if exists "Workspace members read shared attachments" on storage.objects;
create policy "Workspace members read shared attachments"
on storage.objects for select to authenticated
using (bucket_id='documents'
  and (storage.foldername(name))[2]='workspace'
  and private.crm_workspace_storage_access(name,'view'));

drop policy if exists "Workspace editors upload shared attachments" on storage.objects;
create policy "Workspace editors upload shared attachments"
on storage.objects for insert to authenticated
with check (bucket_id='documents'
  and (storage.foldername(name))[2]='workspace'
  and private.crm_workspace_storage_access(name,'edit'));

drop policy if exists "Workspace editors update shared attachments" on storage.objects;
create policy "Workspace editors update shared attachments"
on storage.objects for update to authenticated
using (bucket_id='documents'
  and (storage.foldername(name))[2]='workspace'
  and private.crm_workspace_storage_access(name,'edit'))
with check (bucket_id='documents'
  and (storage.foldername(name))[2]='workspace'
  and private.crm_workspace_storage_access(name,'edit'));

drop policy if exists "Workspace editors delete shared attachments" on storage.objects;
create policy "Workspace editors delete shared attachments"
on storage.objects for delete to authenticated
using (bucket_id='documents'
  and (storage.foldername(name))[2]='workspace'
  and private.crm_workspace_storage_access(name,'edit'));
