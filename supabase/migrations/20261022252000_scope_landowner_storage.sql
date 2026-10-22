create or replace function private.crm_owner_storage_scope_ok(
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
  v_owner_id uuid;
  v_owner public.proprietaires_terres%rowtype;
  v_profile_region uuid;
begin
  if _uid is null then return false; end if;
  if private.is_global_admin(_uid) then return true; end if;
  if not private.has_role_permission(_permission) then return false; end if;

  parts := storage.foldername(_path);
  if coalesce(parts[1],'')='proprietaires' and coalesce(parts[2],'')<>'' then
    begin v_owner_id := parts[2]::uuid; exception when others then v_owner_id := null; end;
  elsif coalesce(parts[1],'')='conventions' and coalesce(parts[2],'')=_uid::text
        and _permission in ('proprietaires.create','documents.upload') then
    select p.id into v_owner_id from public.proprietaires_terres p
      where _path = any(array[p.photo_profil_url,p.fichier_piece_recto_url,p.fichier_piece_verso_url])
      limit 1;
    if v_owner_id is null then
      select d.proprietaire_id into v_owner_id from public.documents_convention d where d.fichier_url=_path limit 1;
    end if;
    if v_owner_id is null then return true; end if;
  end if;

  if v_owner_id is null then
    select p.id into v_owner_id
      from public.proprietaires_terres p
     where _path = any(array[p.photo_profil_url,p.fichier_piece_recto_url,p.fichier_piece_verso_url])
     limit 1;
  end if;
  if v_owner_id is null then
    select d.proprietaire_id into v_owner_id
      from public.documents_convention d
     where d.fichier_url=_path and d.proprietaire_id is not null
     limit 1;
  end if;

  if v_owner_id is null then
    -- During initial registration, temporary upload folders are owned by the registering user.
    if coalesce(parts[1],'')='proprietaires' and coalesce(parts[2],'')=_uid::text
       and _permission in ('proprietaires.create','documents.upload') then
      return true;
    end if;
    return false;
  end if;

  select * into v_owner from public.proprietaires_terres where id=v_owner_id;
  if not found then return false; end if;

  if private.has_role(_uid,'mobilisateur_foncier') then
    return v_owner.created_by=_uid;
  end if;
  if private.has_role(_uid,'superviseur_mobilisation_fonciere') then
    select p.region_id into v_profile_region from public.profiles p where p.user_id=_uid limit 1;
    return v_profile_region is not null and v_profile_region=v_owner.region_id;
  end if;
  -- Other roles must still have the requested permission, checked above.
  return true;
end
$function$;

revoke all on function private.crm_owner_storage_scope_ok(uuid,text,text) from public,anon;
grant execute on function private.crm_owner_storage_scope_ok(uuid,text,text) to authenticated,service_role;

-- Owner identity documents are governed by owner permissions and owner scope.
drop policy if exists "Staff read private identity docs" on storage.objects;
create policy "Staff read private identity docs" on storage.objects for select to authenticated
using (bucket_id='pieces-identite'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.view')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.view')));

drop policy if exists "Staff upload private identity docs" on storage.objects;
create policy "Staff upload private identity docs" on storage.objects for insert to authenticated
with check (bucket_id='pieces-identite'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.create')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.create')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')));

drop policy if exists "Staff update private identity docs" on storage.objects;
create policy "Staff update private identity docs" on storage.objects for update to authenticated
using (bucket_id='pieces-identite'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')))
with check (bucket_id='pieces-identite'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')));

drop policy if exists "Staff delete private identity docs" on storage.objects;
create policy "Staff delete private identity docs" on storage.objects for delete to authenticated
using (bucket_id='pieces-identite'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')));

-- Owner profile photos are similarly scoped; personal profile paths remain governed by personal-profile policies.
drop policy if exists "Staff read client profile photos" on storage.objects;
create policy "Staff read client profile photos" on storage.objects for select to authenticated
using (bucket_id='photos-profils'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.view')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.view')));

drop policy if exists "Staff upload client profile photos" on storage.objects;
create policy "Staff upload client profile photos" on storage.objects for insert to authenticated
with check (bucket_id='photos-profils'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.create')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.create')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')));

drop policy if exists "Staff update client profile photos" on storage.objects;
create policy "Staff update client profile photos" on storage.objects for update to authenticated
using (bucket_id='photos-profils'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')))
with check (bucket_id='photos-profils'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')));

drop policy if exists "Staff delete client profile photos" on storage.objects;
create policy "Staff delete client profile photos" on storage.objects for delete to authenticated
using (bucket_id='photos-profils'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')));

-- Landowner/convention documents must not be globally readable or writable by every staff role.
drop policy if exists "Staff read business files excluding profile photos" on storage.objects;
create policy "Staff read business files excluding profile photos" on storage.objects for select to authenticated
using (bucket_id=any(array['documents','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff upload business files excluding profile photos" on storage.objects;
create policy "Staff upload business files excluding profile photos" on storage.objects for insert to authenticated
with check (bucket_id=any(array['documents','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff update business files excluding profile photos" on storage.objects;
create policy "Staff update business files excluding profile photos" on storage.objects for update to authenticated
using (bucket_id=any(array['documents','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())))
with check (bucket_id=any(array['documents','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff delete business files excluding profile photos" on storage.objects;
create policy "Staff delete business files excluding profile photos" on storage.objects for delete to authenticated
using (bucket_id=any(array['documents','photos-plantations','preuves-paiement'])
  and private.is_staff((select auth.uid())));

drop policy if exists "Staff read owner and convention files" on storage.objects;
create policy "Staff read owner and convention files" on storage.objects for select to authenticated
using (bucket_id='documents-fonciers'
  and (private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.view')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.view')));

drop policy if exists "Staff upload owner and convention files" on storage.objects;
create policy "Staff upload owner and convention files" on storage.objects for insert to authenticated
with check (bucket_id='documents-fonciers'
  and (private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.create')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'documents.upload')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.create')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')));

drop policy if exists "Staff update owner and convention files" on storage.objects;
create policy "Staff update owner and convention files" on storage.objects for update to authenticated
using (bucket_id='documents-fonciers'
  and (private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'documents.upload')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')))
with check (bucket_id='documents-fonciers'
  and (private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'documents.upload')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')));

drop policy if exists "Staff delete owner and convention files" on storage.objects;
create policy "Staff delete owner and convention files" on storage.objects for delete to authenticated
using (bucket_id='documents-fonciers'
  and (private.crm_owner_storage_scope_ok(auth.uid(),name,'proprietaires.update')
       or private.crm_owner_storage_scope_ok(auth.uid(),name,'documents.upload')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')));
