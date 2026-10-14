-- Expose only technicians the current operations/technical manager is allowed to assign.
create or replace function public.list_assignable_technicians()
returns table(id uuid, nom_complet text, user_id uuid, equipe_id uuid, region_id uuid)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null then return; end if;
  if not (private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'responsable_operations') or private.has_role(auth.uid(),'chef_equipe_technique')) then return; end if;
  return query
    select p.id,p.nom_complet,p.user_id,p.equipe_id,p.region_id
    from public.profiles p
    where p.actif is true and private.can_assign_technician_to(auth.uid(),p.id)
    order by p.nom_complet;
end; $function$;
revoke all on function public.list_assignable_technicians() from public;
grant execute on function public.list_assignable_technicians() to authenticated;
