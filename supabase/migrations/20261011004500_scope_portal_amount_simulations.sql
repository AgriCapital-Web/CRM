create or replace function public.portal_days_for_amount(_client_id uuid,_plantation_id uuid,_amount numeric)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_client record; v_plantation record; v_offer record; v_remaining numeric:=greatest(coalesce(_amount,0),0); v_offset integer:=0; v_cursor integer:=0; v_days integer:=0; v_day_cost numeric; v_tranche jsonb; v_months integer; v_monthly numeric; v_available integer; v_take integer;
begin
 if auth.uid() is null or not private.can_access_client(auth.uid(),_client_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if v_remaining<=0 then return 0; end if;
 select c.* into v_client from public.clients c where c.id=_client_id;
 if v_client is null then raise exception 'Client introuvable'; end if;
 select p.* into v_plantation from public.plantations p where p.id=_plantation_id and p.client_id=_client_id;
 if v_plantation is null then raise exception 'Plantation introuvable' using errcode='42501'; end if;
 select o.* into v_offer from public.offres o where o.id=v_client.offre_id;
 if v_offer is null then raise exception 'Offre introuvable'; end if;
 v_offset:=greatest(coalesce(v_client.jours_payes,0),0);
 if jsonb_typeof(v_offer.tranches_paiement)='array' then
  for v_tranche in select value from jsonb_array_elements(v_offer.tranches_paiement) loop
   if coalesce(v_tranche->>'type','')='paiement_initial' then continue; end if;
   v_months:=coalesce((v_tranche->>'mois')::integer,0); v_monthly:=coalesce((v_tranche->>'mensualite_par_ha')::numeric,0);
   if v_months<=0 or v_monthly<=0 then continue; end if;
   if v_offset>=v_cursor+v_months*30 then v_cursor:=v_cursor+v_months*30; continue; end if;
   v_available:=(v_cursor+v_months*30)-v_offset; v_day_cost:=(v_monthly/30)*coalesce(v_plantation.superficie_activee,0);
   if v_day_cost<=0 then exit; end if;
   v_take:=least(v_available,ceil(v_remaining/v_day_cost)::integer); v_days:=v_days+v_take; v_remaining:=greatest(0,v_remaining-(v_take*v_day_cost));
   v_offset:=v_offset+v_take; v_cursor:=v_cursor+v_months*30; if v_remaining<=0 then exit; end if;
  end loop;
 end if;
 if v_remaining>0 then v_day_cost:=(coalesce(v_offer.mensualite_par_ha,0)/30)*coalesce(v_plantation.superficie_activee,0); if v_day_cost>0 then v_days:=v_days+ceil(v_remaining/v_day_cost)::integer; end if; end if;
 return greatest(v_days,0);
end;
$function$;

create or replace function public.simuler_paiement_fractionne(_client_id uuid,_montant numeric)
returns table(jours_couverts integer,periode_debut date,periode_fin date,phase text,taux_journalier numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_client record; v_remaining numeric:=greatest(coalesce(_montant,0),0); v_date date; v_end date; v_rate numeric; v_days integer:=0; v_segments integer:=0;
begin
 if auth.uid() is null or not private.can_access_client(auth.uid(),_client_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select c.* into v_client from public.clients c where c.id=_client_id;
 if v_client is null then raise exception 'Client introuvable'; end if;
 if v_remaining<=0 then return; end if;
 v_date:=coalesce(v_client.contrat_debut_at,current_date)+greatest(coalesce(v_client.jours_payes,0),0); v_end:=v_date;
 while v_remaining>0 and v_segments<200 loop
  v_rate:=public.portal_client_daily_rate(_client_id,v_date); if v_rate<=0 then exit; end if;
  v_remaining:=v_remaining-v_rate*coalesce(v_client.total_hectares,0); v_days:=v_days+1; v_end:=v_date; v_date:=v_date+1; v_segments:=v_segments+1;
 end loop;
 return query select v_days,(coalesce(v_client.contrat_debut_at,current_date)+greatest(coalesce(v_client.jours_payes,0),0))::date,v_end::date,coalesce(v_client.phase_actuelle,'installation'),public.portal_client_daily_rate(_client_id,(coalesce(v_client.contrat_debut_at,current_date)+greatest(coalesce(v_client.jours_payes,0),0))::date);
end;
$function$;
