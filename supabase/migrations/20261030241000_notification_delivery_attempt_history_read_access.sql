grant select on public.notification_delivery_attempts to authenticated;
grant all on public.notification_delivery_attempts to service_role;

drop policy if exists "staff can view notification delivery attempts" on public.notification_delivery_attempts;
create policy "staff can view notification delivery attempts"
on public.notification_delivery_attempts for select to authenticated
using (public.current_user_has_app_permission('messagerie.view'));
