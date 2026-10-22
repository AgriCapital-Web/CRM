create or replace function private.crm_plantation_storage_scope_ok(_uid uuid,_path text,_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $function$
declare
  parts text[];
  v_plantation_id uuid;
  v_plantation public.plantations%rowtype;
begin
  if _uid is null then return false; end if;
  if private.is_global_admin(_uid) then return true; end if;
  if not private.has_role_permission(_permission) then return false; end if;
  parts := storage.foldername(_path);
  if coalesce(parts[1],'')='plantations' and coalesce(parts[2],'')<>'' then
    begin v_plantation_id:=parts[2]::uuid; exception when others then v_plantation_id:=null; end;
  elsif coalesce(parts[2],'')='plantations' and coalesce(parts[3],'')<>'' then
    begin v_plantation_id:=parts[3]::uuid; exception when others then v_plantation_id:=null; end;
  end if;
  if v_plantation_id is null then return false; end if;
  select * into v_plantation from public.plantations where id=v_plantation_id;
  if not found then return false; end if;
  if v_plantation.client_id is not null then
    return private.can_access_client(_uid,v_plantation.client_id);
  end if;
  return v_plantation.created_by=_uid or private.has_role_permission('plantations.update');
end
$function$;

create or replace function private.crm_payment_storage_scope_ok(_uid uuid,_path text,_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $function$
declare
  parts text[];
  v_client_id uuid;
  v_payment_id uuid;
begin
  if _uid is null then return false; end if;
  if private.is_global_admin(_uid) then return true; end if;
  if not private.has_role_permission(_permission)
     and not private.has_role_permission('finance.manage') then return false; end if;
  parts:=storage.foldername(_path);
  if coalesce(parts[1],'')<>'' then
    begin v_client_id:=parts[1]::uuid; exception when others then v_client_id:=null; end;
    if v_client_id is null then
      begin v_payment_id:=parts[1]::uuid; exception when others then v_payment_id:=null; end;
      if v_payment_id is not null then
        select p.client_id into v_client_id from public.paiements p where p.id=v_payment_id;
      end if;
    end if;
  end if;
  if v_client_id is null and coalesce(parts[1],'')='clients' and coalesce(parts[2],'')<>'' then
    begin v_client_id:=parts[2]::uuid; exception when others then v_client_id:=null; end;
  end if;
  return v_client_id is not null and private.can_access_client(_uid,v_client_id);
end
$function$;

revoke all on function private.crm_plantation_storage_scope_ok(uuid,text,text) from public,anon;
revoke all on function private.crm_payment_storage_scope_ok(uuid,text,text) from public,anon;
grant execute on function private.crm_plantation_storage_scope_ok(uuid,text,text) to authenticated,service_role;
grant execute on function private.crm_payment_storage_scope_ok(uuid,text,text) to authenticated,service_role;

-- Personal documents remain in the user's own folder, but client subfolders use client-scoped policies.
drop policy if exists "Owner manage own documents folder" on storage.objects;
create policy "Owner manage own documents folder" on storage.objects for insert to authenticated
with check (bucket_id='documents'
  and auth.uid() is not null
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and coalesce((storage.foldername(name))[1],'') <> 'account-requests');

drop policy if exists "Owner read own documents folder" on storage.objects;
create policy "Owner read own documents folder" on storage.objects for select to authenticated
using (bucket_id='documents'
  and auth.uid() is not null
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce((storage.foldername(name))[2],'') <> 'clients'
  and coalesce((storage.foldername(name))[1],'') <> 'account-requests');

-- Remove old broad staff policies that bypass client/owner scope.
drop policy if exists "Staff manage documents bucket" on storage.objects;
drop policy if exists "Staff read private land docs" on storage.objects;
drop policy if exists "Staff update private land docs" on storage.objects;
drop policy if exists "Staff delete private land docs" on storage.objects;

drop policy if exists "Staff read business files excluding profile photos" on storage.objects;
create policy "Staff read business files excluding profile photos" on storage.objects for select to authenticated
using (bucket_id='photos-plantations'
  and (private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.view')
       or private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.update')));

drop policy if exists "Staff upload business files excluding profile photos" on storage.objects;
create policy "Staff upload business files excluding profile photos" on storage.objects for insert to authenticated
with check (bucket_id='photos-plantations'
  and (private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.create')
       or private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.update')));

drop policy if exists "Staff update business files excluding profile photos" on storage.objects;
create policy "Staff update business files excluding profile photos" on storage.objects for update to authenticated
using (bucket_id='photos-plantations' and private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.update'))
with check (bucket_id='photos-plantations' and private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.update'));

drop policy if exists "Staff delete business files excluding profile photos" on storage.objects;
create policy "Staff delete business files excluding profile photos" on storage.objects for delete to authenticated
using (bucket_id='photos-plantations' and private.crm_plantation_storage_scope_ok(auth.uid(),name,'plantations.delete'));

-- Client documents use client permissions and the existing client access scope.
drop policy if exists "Staff read client documents" on storage.objects;
create policy "Staff read client documents" on storage.objects for select to authenticated
using (bucket_id='documents' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.view'));

drop policy if exists "Staff upload client documents" on storage.objects;
create policy "Staff upload client documents" on storage.objects for insert to authenticated
with check (bucket_id='documents'
  and (private.crm_client_storage_scope_ok(auth.uid(),name,'clients.create')
       or private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update')));

drop policy if exists "Staff update client documents" on storage.objects;
create policy "Staff update client documents" on storage.objects for update to authenticated
using (bucket_id='documents' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'))
with check (bucket_id='documents' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));

drop policy if exists "Staff delete client documents" on storage.objects;
create policy "Staff delete client documents" on storage.objects for delete to authenticated
using (bucket_id='documents' and private.crm_client_storage_scope_ok(auth.uid(),name,'clients.update'));

-- Payment proofs are private and available only to users with payment/finance permissions for that client.
drop policy if exists "Staff read business files excluding profile photos" on storage.objects;
create policy "Staff read business files excluding profile photos" on storage.objects for select to authenticated
using (bucket_id='preuves-paiement'
  and (private.crm_payment_storage_scope_ok(auth.uid(),name,'paiements.view')
       or private.crm_payment_storage_scope_ok(auth.uid(),name,'finance.manage')));

drop policy if exists "Staff upload business files excluding profile photos" on storage.objects;
create policy "Staff upload business files excluding profile photos" on storage.objects for insert to authenticated
with check (bucket_id='preuves-paiement'
  and (private.crm_payment_storage_scope_ok(auth.uid(),name,'paiements.create')
       or private.crm_payment_storage_scope_ok(auth.uid(),name,'paiements.record')
       or private.crm_payment_storage_scope_ok(auth.uid(),name,'finance.manage')));

drop policy if exists "Staff update business files excluding profile photos" on storage.objects;
create policy "Staff update business files excluding profile photos" on storage.objects for update to authenticated
using (bucket_id='preuves-paiement'
  and (private.crm_payment_storage_scope_ok(auth.uid(),name,'paiements.update')
       or private.crm_payment_storage_scope_ok(auth.uid(),name,'finance.manage')))
with check (bucket_id='preuves-paiement'
  and (private.crm_payment_storage_scope_ok(auth.uid(),name,'paiements.update')
       or private.crm_payment_storage_scope_ok(auth.uid(),name,'finance.manage')));

drop policy if exists "Staff delete business files excluding profile photos" on storage.objects;
create policy "Staff delete business files excluding profile photos" on storage.objects for delete to authenticated
using (bucket_id='preuves-paiement'
  and (private.crm_payment_storage_scope_ok(auth.uid(),name,'paiements.update')
       or private.crm_payment_storage_scope_ok(auth.uid(),name,'finance.manage')));
