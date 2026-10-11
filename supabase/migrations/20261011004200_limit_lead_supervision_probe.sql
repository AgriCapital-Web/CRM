create or replace function public.can_supervise_leads(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
 select _user_id=auth.uid() and exists(
   select 1 from public.user_roles
   where user_id=auth.uid()
     and role in ('responsable_operations','responsable_commercial','chef_equipe_commercial','service_client','chef_equipe_service_client','pdg')
 );
$function$;
