create or replace function private.crm_technical_media_can_view(_uid uuid,_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $function$
declare
  parts text[];
  v_report_id uuid;
  v_report public.rapports_visites_techniques%rowtype;
  v_profile_id uuid;
begin
  if _uid is null then return false; end if;
  if private.is_global_admin(_uid) then return true; end if;
  if not private.has_role_permission('rapports.view_technique') then return false; end if;
  parts := storage.foldername(_path);
  if coalesce(parts[1],'') <> 'plantations' or coalesce(parts[3],'') <> 'rapports' then return false; end if;
  begin v_report_id := parts[4]::uuid; exception when others then return false; end;
  select * into v_report from public.rapports_visites_techniques where id=v_report_id;
  if not found then return false; end if;
  if v_report.client_id is not null then
    return private.can_access_client(_uid,v_report.client_id);
  end if;
  select p.id into v_profile_id from public.profiles p where p.user_id=_uid limit 1;
  return v_profile_id is not null
    and (v_report.agent_technique_id=v_profile_id or private.has_role_permission('rapports.manage_technique'));
end
$function$;

create or replace function private.crm_technical_media_can_edit(_uid uuid,_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $function$
declare
  parts text[];
  v_report_id uuid;
  v_report public.rapports_visites_techniques%rowtype;
  v_profile_id uuid;
  v_manager boolean;
begin
  if _uid is null then return false; end if;
  if private.is_global_admin(_uid) then return true; end if;
  if not private.has_role_permission('rapports.view_technique') then return false; end if;
  v_manager := private.has_role_permission('rapports.manage_technique');
  parts := storage.foldername(_path);
  if coalesce(parts[1],'') <> 'plantations' or coalesce(parts[3],'') <> 'rapports' then return false; end if;
  begin v_report_id := parts[4]::uuid; exception when others then return false; end;
  select * into v_report from public.rapports_visites_techniques where id=v_report_id;
  if not found then return false; end if;
  select p.id into v_profile_id from public.profiles p where p.user_id=_uid limit 1;
  if not v_manager and (v_profile_id is null or v_report.agent_technique_id is distinct from v_profile_id) then return false; end if;
  if v_report.client_id is not null then
    return private.can_access_client(_uid,v_report.client_id);
  end if;
  return v_manager or v_report.agent_technique_id=v_profile_id;
end
$function$;

revoke all on function private.crm_technical_media_can_view(uuid,text) from public,anon;
revoke all on function private.crm_technical_media_can_edit(uuid,text) from public,anon;
grant execute on function private.crm_technical_media_can_view(uuid,text) to authenticated,service_role;
grant execute on function private.crm_technical_media_can_edit(uuid,text) to authenticated,service_role;

drop policy if exists "Staff read technical report media" on storage.objects;
create policy "Staff read technical report media" on storage.objects for select to authenticated
using (bucket_id='rapports-techniques' and private.crm_technical_media_can_view(auth.uid(),name));

drop policy if exists "Staff write technical report media" on storage.objects;
create policy "Staff write technical report media" on storage.objects for insert to authenticated
with check (bucket_id='rapports-techniques' and private.crm_technical_media_can_edit(auth.uid(),name));

drop policy if exists "Staff update technical report media" on storage.objects;
create policy "Staff update technical report media" on storage.objects for update to authenticated
using (bucket_id='rapports-techniques' and private.crm_technical_media_can_edit(auth.uid(),name))
with check (bucket_id='rapports-techniques' and private.crm_technical_media_can_edit(auth.uid(),name));

drop policy if exists "Staff delete technical report media" on storage.objects;
create policy "Staff delete technical report media" on storage.objects for delete to authenticated
using (bucket_id='rapports-techniques' and private.crm_technical_media_can_edit(auth.uid(),name));
