create or replace function public.portal_current_payment_state(_client_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare c public.clients%rowtype; active_ha numeric:=0; pi_official numeric:=0; pi_paid numeric:=0; pi_balance numeric:=0; monthly_amount numeric:=0; daily_rate numeric:=0; monthly_start date; elapsed_days integer:=0; paid_days integer:=0; arrears_days integer:=0; arrears_amount numeric:=0; current_monthly_due numeric:=0; custom jsonb; monthly jsonb;
begin
 if auth.uid() is null or not private.can_access_client(auth.uid(),_client_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into c from public.clients where id=_client_id;
 if not found then raise exception 'Client introuvable'; end if;
 select coalesce(sum(greatest(coalesce(p.superficie_activee,0),0)),0) into active_ha from public.plantations p where p.client_id=_client_id;
 pi_official:=greatest(coalesce(public.get_client_effective_pi(_client_id),0),0);
 select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0) into pi_paid from public.paiements p where p.client_id=_client_id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;
 pi_balance:=greatest(0,pi_official-pi_paid);
 custom:=coalesce(c.paiement_personnalise,'{}'::jsonb); monthly:=coalesce(custom->'mensualite','{}'::jsonb);
 if coalesce((monthly->>'active')::boolean,false) and coalesce((monthly->>'montant')::numeric,0)>0 then
  monthly_amount:=greatest(0,(monthly->>'montant')::numeric);
  monthly_start:=coalesce(nullif(monthly->>'date_debut','')::date,case when coalesce((monthly->>'decalage_mois')::integer,0)>0 then (coalesce(c.contrat_debut_at,current_date)+(coalesce((monthly->>'decalage_mois')::integer,0)||' months')::interval)::date else c.contrat_debut_at end);
 elsif c.offre_id is not null then
  select greatest(0,coalesce(o.mensualite_par_ha,0)*greatest(active_ha,coalesce(c.total_hectares,0))) into monthly_amount from public.offres o where o.id=c.offre_id;
  monthly_start:=c.contrat_debut_at;
 end if;
 if monthly_start is not null and current_date>=monthly_start and monthly_amount>0 then
  elapsed_days:=greatest(0,current_date-monthly_start); paid_days:=greatest(0,coalesce(c.jours_payes,0)); daily_rate:=monthly_amount/30;
  arrears_days:=greatest(0,elapsed_days-paid_days); arrears_amount:=round(arrears_days*daily_rate,2);
  current_monthly_due:=case when arrears_amount>0 then arrears_amount else monthly_amount end;
 else current_monthly_due:=0; end if;
 return jsonb_build_object('paiement_initial',jsonb_build_object('montant_officiel',round(pi_official,2),'deja_paye',round(pi_paid,2),'solde',round(pi_balance,2),'disponible',pi_balance>0),
 'mensualite',jsonb_build_object('montant',round(monthly_amount,2),'montant_a_payer',round(current_monthly_due,2),'disponible',current_monthly_due>0,'jours_retard',arrears_days,'montant_arriere',round(arrears_amount,2),'hectares_actifs',round(active_ha,4)),
 'total_paye',round(pi_paid+coalesce((select sum(greatest(coalesce(p.montant_paye,p.montant,0),0)) from public.paiements p where p.client_id=_client_id and p.statut='valide' and p.type_paiement='MENSUALITE'),0),2));
end;
$function$;
