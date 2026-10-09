insert into public.role_permissions(role_code, permission_code)
select distinct rp.role_code, x.p from public.role_permissions rp cross join (values ('messagerie.view'),('messagerie.send')) x(p)
where rp.permission_code='clients.view'
and not exists(select 1 from public.role_permissions r2 where r2.role_code=rp.role_code and r2.permission_code=x.p);

drop policy if exists portail_messages_staff_read on public.portail_messages;
drop policy if exists portail_messages_staff_insert on public.portail_messages;
drop policy if exists portail_messages_staff_update on public.portail_messages;
drop policy if exists portail_messages_staff_delete on public.portail_messages;

create policy portail_messages_staff_read on public.portail_messages for select to authenticated
using (private.is_global_admin((select auth.uid())) or (private.has_role_permission('messagerie.view') and private.can_access_client((select auth.uid()), client_id)));

create policy portail_messages_staff_insert on public.portail_messages for insert to authenticated
with check (auteur_type='staff' and auteur_user_id=(select auth.uid()) and (private.is_global_admin((select auth.uid())) or (private.has_role_permission('messagerie.send') and private.can_access_client((select auth.uid()), client_id))));

create policy portail_messages_staff_update on public.portail_messages for update to authenticated
using (private.is_global_admin((select auth.uid())) or (private.has_role_permission('messagerie.view') and private.can_access_client((select auth.uid()), client_id)))
with check (private.is_global_admin((select auth.uid())) or (private.has_role_permission('messagerie.view') and private.can_access_client((select auth.uid()), client_id)));

create policy portail_messages_staff_delete on public.portail_messages for delete to authenticated
using (private.is_global_admin((select auth.uid())) or (private.has_role_permission('messagerie.delete') and private.can_access_client((select auth.uid()), client_id)));

grant delete on public.portail_messages to authenticated;