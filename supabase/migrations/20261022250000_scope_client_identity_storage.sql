-- Resolve staff access to client identity/profile objects by client ownership and permission.
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
  if coalesce(parts[2], '') = 'clients' and coalesce(parts[3], '') <> '' then
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

-- Client identity documents: exclude client folders from personal-ID policies.
drop policy if exists "Users read own id documents" on storage.objects;
create policy "Users read own id documents" on storage.objects for select to authenticated
using (bucket_id='pieces-identite'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce((storage.foldername(name))[2],'') <> 'clients');

drop policy if exists "Users update own id documents" on storage.objects;
create policy "Users update own id documents" on storage.objects for update to authenticated
using (bucket_id='pieces-identite'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce((storage.foldername(name))[2],'') <> 'clients')
with check (bucket_id='pieces-identite'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce((storage.foldername(name))[2],'') <> 'clients');

drop policy if exists "Users upload own id documents" on storage.objects;
create policy "Users upload own id documents" on storage.objects for insert to authenticated
with check (bucket_id='pieces-identite'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce((storage.foldername(name))[2],'') <> 'clients');

-- General staff business-file policies no longer grant unrestricted access to identity files.
drop policy if exists "Staff read business files excluding profile photos" on storage.objects;
create policy "Staff read business files excluding profile photos" on storage.objects for select to authenticated
using (bucket_id=any(array['documents','documents-fonciers','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff upload business files excluding profile photos" on storage.objects;
create policy "Staff upload business files excluding profile photos" on storage.objects for insert to authenticated
with check (bucket_id=any(array['documents','documents-fonciers','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff update business files excluding profile photos" on storage.objects;
create policy "Staff update business files excluding profile photos" on storage.objects for update to authenticated
using (bucket_id=any(array['documents','documents-fonciers','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())))
with check (bucket_id=any(array['documents','documents-fonciers','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff delete business files excluding profile photos" on storage.objects;
create policy "Staff delete business files excluding profile photos" on storage.objects for delete to authenticated
using (bucket_id=any(array['documents','documents-fonciers','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff read private identity docs" on storage.objects;
create policy "Staff read private identity docs" on storage.objects for select to authenticated
using (bucket_id='pieces-identite'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.view'));

drop policy if exists "Staff upload private identity docs" on storage.objects;
create policy "Staff upload private identity docs" on storage.objects for insert to authenticated
with check (bucket_id='pieces-identite'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));

drop policy if exists "Staff update private identity docs" on storage.objects;
create policy "Staff update private identity docs" on storage.objects for update to authenticated
using (bucket_id='pieces-identite'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'))
with check (bucket_id='pieces-identite'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));

drop policy if exists "Staff delete private identity docs" on storage.objects;
create policy "Staff delete private identity docs" on storage.objects for delete to authenticated
using (bucket_id='pieces-identite'
  and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));

-- Profile-photo policies continue to work for personal profile images, but not client subfolders.
drop policy if exists "CRM users read profile photos" on storage.objects;
create policy "CRM users read profile photos" on storage.objects for select to authenticated
using (bucket_id='photos-profils'
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and ((storage.foldername(name))[1]=(select auth.uid())::text or private.can_manage_user_profiles((select auth.uid()))));

drop policy if exists "CRM users upload profile photos" on storage.objects;
create policy "CRM users upload profile photos" on storage.objects for insert to authenticated
with check (bucket_id='photos-profils'
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and ((storage.foldername(name))[1]=(select auth.uid())::text or private.can_manage_user_profiles((select auth.uid()))));

drop policy if exists "CRM users update profile photos" on storage.objects;
create policy "CRM users update profile photos" on storage.objects for update to authenticated
using (bucket_id='photos-profils'
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and ((storage.foldername(name))[1]=(select auth.uid())::text or private.can_manage_user_profiles((select auth.uid()))))
with check (bucket_id='photos-profils'
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and ((storage.foldername(name))[1]=(select auth.uid())::text or private.can_manage_user_profiles((select auth.uid()))));

drop policy if exists "CRM users delete profile photos" on storage.objects;
create policy "CRM users delete profile photos" on storage.objects for delete to authenticated
using (bucket_id='photos-profils'
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and ((storage.foldername(name))[1]=(select auth.uid())::text or private.can_manage_user_profiles((select auth.uid()))));

-- Staff may upload/read/update/delete client profile photos only within clients they can access.
drop policy if exists "Staff read client profile photos" on storage.objects;
create policy "Staff read client profile photos" on storage.objects for select to authenticated
using (bucket_id='photos-profils' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.view'));

drop policy if exists "Staff upload client profile photos" on storage.objects;
create policy "Staff upload client profile photos" on storage.objects for insert to authenticated
with check (bucket_id='photos-profils'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.create')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')));

drop policy if exists "Staff update client profile photos" on storage.objects;
create policy "Staff update client profile photos" on storage.objects for update to authenticated
using (bucket_id='photos-profils' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'))
with check (bucket_id='photos-profils' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));

drop policy if exists "Staff delete client profile photos" on storage.objects;
create policy "Staff delete client profile photos" on storage.objects for delete to authenticated
using (bucket_id='photos-profils' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));
