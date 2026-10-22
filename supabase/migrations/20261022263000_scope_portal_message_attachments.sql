create or replace function private.crm_client_storage_scope_ok(
  _uid uuid,
  _path text,
  _permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $function$
declare
  parts text[];
  v_client_id uuid;
begin
  if _uid is null then return false; end if;
  if private.is_global_admin(_uid) then return true; end if;
  if not private.has_role_permission(_permission) then return false; end if;

  parts := storage.foldername(_path);
  if coalesce(parts[1], '') = 'clients' and coalesce(parts[2], '') <> '' then
    begin
      v_client_id := parts[2]::uuid;
    exception when others then
      v_client_id := null;
    end;
  elsif coalesce(parts[2], '') = 'clients' and coalesce(parts[3], '') <> '' then
    begin
      v_client_id := parts[3]::uuid;
    exception when others then
      v_client_id := null;
    end;
  end if;

  if v_client_id is null then
    select c.id into v_client_id
      from public.clients c
     where _path = any(array[
       c.fichier_piece_url, c.fichier_piece_recto_url, c.fichier_piece_verso_url, c.photo_profil_url
     ])
     limit 1;
  end if;

  if v_client_id is null then
    select r.client_id into v_client_id
      from public.client_cotitulaires_mandataires r
     where _path = any(array[r.piece_recto_url, r.piece_verso_url, r.procuration_url, r.photo_profil_url])
     limit 1;
  end if;

  return v_client_id is not null and private.can_access_client(_uid, v_client_id);
end
$function$;


revoke all on function private.crm_client_storage_scope_ok(uuid,text,text) from public,anon;
grant execute on function private.crm_client_storage_scope_ok(uuid,text,text) to authenticated,service_role;

-- Portal attachment paths are client-scoped. Staff access requires messaging permission and client scope.
drop policy if exists "Staff can read portal message attachments" on storage.objects;
create policy "Staff can read portal message attachments" on storage.objects for select to authenticated
using (bucket_id='portail-messages'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'messagerie.view'));

drop policy if exists "Staff can upload portal message attachments" on storage.objects;
create policy "Staff can upload portal message attachments" on storage.objects for insert to authenticated
with check (bucket_id='portail-messages'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'messagerie.send'));

drop policy if exists "Staff can delete portal message attachments" on storage.objects;
create policy "Staff can delete portal message attachments" on storage.objects for delete to authenticated
using (bucket_id='portail-messages'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'messagerie.send'));
