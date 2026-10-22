-- Correct the workspace Storage helper to call the existing public membership checks.
-- Run as invoker: the public helpers enforce owner/member access for the current session.
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
