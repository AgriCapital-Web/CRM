create or replace function public.client_should_be_active(_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_result boolean;
begin
 if auth.uid() is null or not private.can_access_client(auth.uid(),_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 with s as (select c.*,o.contrat_acquisition_requis,o.contrat_accompagnement_requis from public.clients c left join public.offres o on o.id=c.offre_id where c.id=_id),
 contracts as (select bool_and(type_contrat='acquisition_client' and statut='valide') filter(where type_contrat='acquisition_client') as acquisition_ok,bool_and(type_contrat='accompagnement_agricole' and statut='valide') filter(where type_contrat='accompagnement_agricole') as accompagnement_ok from public.client_contracts where client_id=_id),
 pi as (select exists(select 1 from public.paiements p where p.client_id=_id and coalesce(p.est_paiement_initial,false)=true and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed')) as payment_ok)
 select coalesce((s.contrat_acquisition_requis=false or c.acquisition_ok=true),false) and coalesce((s.contrat_accompagnement_requis=false or c.accompagnement_ok=true),false) and coalesce(pi.payment_ok,false) into v_result from s cross join contracts c cross join pi;
 return coalesce(v_result,false);
end;
$function$;
