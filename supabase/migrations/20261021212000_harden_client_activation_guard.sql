-- Use session_user (not current_user) inside SECURITY DEFINER to preserve caller checks.
create or replace function public.client_should_be_active(_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare v_result boolean;
begin
  if auth.role() is distinct from 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select coalesce(c.validation_statut = 'valide', false)
     and exists (
       select 1 from public.paiements p
       where p.client_id = c.id
         and coalesce(p.est_paiement_initial, false)
         and lower(coalesce(p.statut, '')) in ('valide','paye','paid','success','successful','completed')
         and coalesce(p.montant_paye, p.montant, 0) > 0
     )
    into v_result
  from public.clients c
  where c.id = _id;

  return coalesce(v_result, false);
end;
$function$;
