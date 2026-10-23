-- Repair finance user directory, conversation member RLS, and private attachment access.
create or replace function public.finance_list_active_profiles()
returns table(id uuid, nom_complet text, email text, poste text, relation_rh text, actif boolean, salaire_base numeric)
language sql stable security definer set search_path = public, pg_temp
as $$
 select p.id,p.nom_complet,p.email,p.poste,p.relation_rh,p.actif,p.salaire_base
 from public.profiles p where coalesce(p.actif,false)=true and p.user_id is not null
 and (exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin','finance','comptabilite','comptable','rh','responsable_rh'))
      or public.workspace_current_profile_id() is not null)
 order by p.nom_complet
$$;
revoke all on function public.finance_list_active_profiles() from public, anon;
grant execute on function public.finance_list_active_profiles() to authenticated;

create or replace function public.internal_can_manage_conversation_members(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.internal_conversations c where c.id=p_conversation_id and c.created_by_profile_id=public.internal_current_profile_id()) $$;
revoke all on function public.internal_can_manage_conversation_members(uuid) from public, anon;
grant execute on function public.internal_can_manage_conversation_members(uuid) to authenticated;

drop policy if exists internal_members_insert on public.internal_conversation_members;
create policy internal_members_insert on public.internal_conversation_members for insert to authenticated
with check (public.internal_can_manage_conversation_members(conversation_id) and exists(select 1 from public.profiles p where p.id=profile_id and coalesce(p.actif,false)=true and p.user_id is not null));
drop policy if exists internal_members_delete on public.internal_conversation_members;
create policy internal_members_delete on public.internal_conversation_members for delete to authenticated using (public.internal_can_manage_conversation_members(conversation_id));

drop policy if exists internal_message_attachments_insert on public.internal_message_attachments;
create policy internal_message_attachments_insert on public.internal_message_attachments for insert to authenticated
with check (uploaded_by_profile_id=public.internal_current_profile_id() and public.internal_is_conversation_member(conversation_id)
 and exists(select 1 from public.internal_messages m where m.id=message_id and m.conversation_id=internal_message_attachments.conversation_id and m.sender_profile_id=public.internal_current_profile_id()));
drop policy if exists internal_message_attachments_read on public.internal_message_attachments;
create policy internal_message_attachments_read on public.internal_message_attachments for select to authenticated using (public.internal_is_conversation_member(conversation_id));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('internal-message-attachments','internal-message-attachments',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip'])
on conflict (id) do update set public=false,file_size_limit=26214400;
drop policy if exists internal_message_files_read on storage.objects;
create policy internal_message_files_read on storage.objects for select to authenticated using (bucket_id='internal-message-attachments' and exists(select 1 from public.internal_message_attachments a where a.storage_path=storage.objects.name and public.internal_is_conversation_member(a.conversation_id)));
drop policy if exists internal_message_files_insert on storage.objects;
create policy internal_message_files_insert on storage.objects for insert to authenticated with check (bucket_id='internal-message-attachments' and (storage.foldername(name))[1]=public.internal_current_profile_id()::text);
