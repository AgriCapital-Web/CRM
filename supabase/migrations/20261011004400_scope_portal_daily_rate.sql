create or replace function public.portal_client_daily_rate(_client_id uuid,_at_date date default current_date)
returns numeric language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_client record; v_custom jsonb; v_monthly jsonb; v_start date; v_amount numeric; v_active boolean; v_contract_day integer; v_cursor integer:=0; v_months integer; v_rate numeric:=0; v_tranche jsonb;
begin
 if auth.uid() is null or not private.can_access_client(auth.uid(),_client_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select c.*,o.tranches_paiement,o.mensualite_par_ha into v_client from public.clients c left join public.offres o on o.id=c.offre_id where c.id=_client_id;
 if v_client is null then return 0; end if;
 v_custom:=coalesce(v_client.paiement_personnalise,'{}'::jsonb);
 if v_custom ? 'mensualite' then
  v_monthly:=coalesce(v_custom->'mensualite','{}'::jsonb); v_active:=coalesce((v_monthly->>'active')::boolean,false); v_amount:=coalesce((v_monthly->>'montant')::numeric,0);
  if v_monthly ? 'date_debut' and nullif(v_monthly->>'date_debut','') is not null then v_start:=(v_monthly->>'date_debut')::date;
  else v_start:=(coalesce(v_client.contrat_debut_at,current_date)+(greatest(0,coalesce((v_monthly->>'decalage_mois')::integer,0))||' months')::interval)::date; end if;
  if not v_active or v_amount<=0 or _at_date<v_start then return 0; end if;
  return greatest(v_amount/coalesce(nullif(v_client.total_hectares,0),1),0)/30;
 end if;
 if v_client.contrat_debut_at is null then return coalesce(v_client.taux_journalier_ha,0); end if;
 v_contract_day:=greatest(0,(_at_date-v_client.contrat_debut_at));
 if jsonb_typeof(v_client.tranches_paiement)='array' then
  for v_tranche in select value from jsonb_array_elements(v_client.tranches_paiement) loop
   v_months:=coalesce((v_tranche->>'mois')::integer,0);
   if coalesce(v_tranche->>'type','')='paiement_initial' or v_months<=0 then continue; end if;
   if v_contract_day<v_cursor+v_months*30 then v_rate:=coalesce((v_tranche->>'mensualite_par_ha')::numeric,0)/30; exit; end if;
   v_cursor:=v_cursor+v_months*30;
  end loop;
 end if;
 if v_rate<=0 then v_rate:=coalesce(v_client.mensualite_par_ha,0)/30; end if;
 return greatest(v_rate,0);
end;
$function$;
