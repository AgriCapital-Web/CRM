create or replace function public.subscription_current_payment_state(_souscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  s public.client_souscriptions%rowtype;
  v_pi_paid numeric:=0;
  v_pi_balance numeric:=0;
  v_monthly_paid numeric:=0;
  v_monthly_due numeric:=0;
  v_monthly_amount numeric:=0;
  v_rate numeric:=0;
  v_month_start date;
  v_months_due integer:=0;
  v_month integer;
  v_area numeric:=0;
  v_total_paid numeric:=0;
begin
  select * into s from public.client_souscriptions where id=_souscription_id;
  if not found then raise exception 'Souscription introuvable'; end if;
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or (not public.is_staff(auth.uid()) and not private.can_access_client(auth.uid(),s.client_id))) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;

  v_area:=greatest(0,coalesce(s.superficie_ha,0));
  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0)
    into v_pi_paid from public.paiements p
    where p.souscription_id=s.id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;
  v_pi_balance:=greatest(0,coalesce(s.montant_pi_total,0)-v_pi_paid);

  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0)
    into v_monthly_paid from public.paiements p
    where p.souscription_id=s.id and p.statut='valide' and p.type_paiement='MENSUALITE';

  select min(p.created_at::date) into v_month_start
    from public.paiements p
    where p.souscription_id=s.id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;
  v_month_start:=coalesce(v_month_start,s.created_at::date);

  if s.mode_paiement<>'comptant' and v_area>0 and coalesce(s.duree_paiement_mois,0)>0 and v_pi_balance<=0 then
    v_months_due:=greatest(0,
      (extract(year from age(current_date,v_month_start))*12 + extract(month from age(current_date,v_month_start)))::integer
    );
    for v_month in 1..v_months_due loop
      v_rate:=0;
      if jsonb_typeof(s.echeancier)='array' then
        select coalesce(
          nullif(tranche.value->>'mensualite_par_ha_effective','')::numeric,
          nullif(tranche.value->>'mensualite_par_ha','')::numeric,
          0
        ) into v_rate
        from jsonb_array_elements(s.echeancier) as tranche(value)
        where coalesce(nullif(tranche.value->>'mois_debut','')::integer,1)<=v_month
          and coalesce(nullif(tranche.value->>'mois_fin','')::integer,s.duree_paiement_mois)>=v_month
        order by coalesce(nullif(tranche.value->>'mois_debut','')::integer,1)
        limit 1;
      end if;
      if coalesce(v_rate,0)<=0 and coalesce(s.mensualite_montant,0)>0 then
        v_rate:=s.mensualite_montant/v_area;
      end if;
      v_monthly_due:=v_monthly_due+greatest(0,coalesce(v_rate,0))*v_area;
    end loop;

    v_month:=greatest(1,v_months_due+1);
    v_rate:=0;
    if jsonb_typeof(s.echeancier)='array' then
      select coalesce(
        nullif(tranche.value->>'mensualite_par_ha_effective','')::numeric,
        nullif(tranche.value->>'mensualite_par_ha','')::numeric,
        0
      ) into v_rate
      from jsonb_array_elements(s.echeancier) as tranche(value)
      where coalesce(nullif(tranche.value->>'mois_debut','')::integer,1)<=v_month
        and coalesce(nullif(tranche.value->>'mois_fin','')::integer,s.duree_paiement_mois)>=v_month
      order by coalesce(nullif(tranche.value->>'mois_debut','')::integer,1)
      limit 1;
    end if;
    if coalesce(v_rate,0)<=0 and coalesce(s.mensualite_montant,0)>0 then
      v_rate:=s.mensualite_montant/v_area;
    end if;
    v_monthly_amount:=greatest(0,coalesce(v_rate,0))*v_area;
  end if;

  v_total_paid:=v_pi_paid+v_monthly_paid;
  return jsonb_build_object(
    'souscription_id',s.id,
    'montant_total_contrat',round(coalesce(s.montant_total_contrat,0),2),
    'paiement_initial',jsonb_build_object(
      'montant_officiel',round(coalesce(s.montant_pi_total,0),2),
      'deja_paye',round(v_pi_paid,2),
      'solde',round(v_pi_balance,2),
      'disponible',v_pi_balance>0
    ),
    'mensualite',jsonb_build_object(
      'montant',round(v_monthly_amount,2),
      'montant_a_payer',round(greatest(0,v_monthly_due-v_monthly_paid),2),
      'disponible',greatest(0,v_monthly_due-v_monthly_paid)>0,
      'mensualites_arrivees',v_months_due,
      'mensualites_payees_montant',round(v_monthly_paid,2),
      'hectares_actifs',round(v_area,4)
    ),
    'total_paye',round(v_total_paid,2),
    'reste_contrat',round(greatest(0,coalesce(s.montant_total_contrat,0)-v_total_paid),2)
  );
end;
$function$;

revoke all on function public.subscription_current_payment_state(uuid) from public;
grant execute on function public.subscription_current_payment_state(uuid) to authenticated, service_role;
