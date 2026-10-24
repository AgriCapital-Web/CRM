create or replace function public.portal_current_payment_state(_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.clients%rowtype;
  v_acquisition record;
  v_acquisition_count integer := 0;
  v_state jsonb;
  active_ha numeric := 0;
  pi_official numeric := 0;
  pi_paid numeric := 0;
  pi_balance numeric := 0;
  monthly_amount numeric := 0;
  current_monthly_due numeric := 0;
  arrears_days integer := 0;
  arrears_amount numeric := 0;
  total_paid numeric := 0;
  daily_rate numeric := 0;
  monthly_start date;
  elapsed_days integer := 0;
  paid_days integer := 0;
  custom jsonb;
  monthly jsonb;
  selected_formula jsonb;
  selected_offer public.offres%rowtype;
  use_shared boolean := false;
  formula_monthly numeric;
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _client_id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into c from public.clients where id = _client_id;
  if not found then raise exception 'Client introuvable'; end if;

  select count(*)::integer into v_acquisition_count
    from public.acquisitions a where a.client_id=_client_id
      and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé');

  if v_acquisition_count > 0 then
    for v_acquisition in
      select a.id from public.acquisitions a where a.client_id=_client_id
        and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')
      order by a.created_at,a.id
    loop
      v_state := public.acquisition_current_payment_state(v_acquisition.id);
      pi_official := pi_official + greatest(0,coalesce((v_state#>>'{paiement_initial,montant_officiel}')::numeric,0));
      pi_paid := pi_paid + greatest(0,coalesce((v_state#>>'{paiement_initial,deja_paye}')::numeric,0));
      pi_balance := pi_balance + greatest(0,coalesce((v_state#>>'{paiement_initial,solde}')::numeric,0));
      monthly_amount := monthly_amount + greatest(0,coalesce((v_state#>>'{mensualite,montant}')::numeric,0));
      current_monthly_due := current_monthly_due + greatest(0,coalesce((v_state#>>'{mensualite,montant_a_payer}')::numeric,0));
      arrears_days := greatest(arrears_days,coalesce((v_state#>>'{mensualite,mensualites_arrivees}')::integer,0));
    end loop;
    select coalesce(sum(greatest(coalesce(p.superficie_activee,0),0)),0) into active_ha from public.plantations p where p.client_id=_client_id;
    arrears_amount := greatest(0,current_monthly_due);
    select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0) into total_paid from public.paiements p where p.client_id=_client_id and p.statut='valide';
    return jsonb_build_object(
      'paiement_initial',jsonb_build_object('montant_officiel',round(pi_official,2),'deja_paye',round(pi_paid,2),'solde',round(pi_balance,2),'disponible',pi_balance>0),
      'mensualite',jsonb_build_object('montant',round(monthly_amount,2),'montant_a_payer',round(current_monthly_due,2),'disponible',current_monthly_due>0,'jours_retard',arrears_days,'montant_arriere',round(arrears_amount,2),'hectares_actifs',round(active_ha,4)),
      'total_paye',round(total_paid,2),'souscriptions_actives',v_acquisition_count
    );
  end if;

  select coalesce(sum(greatest(coalesce(p.superficie_activee,0),0)),0) into active_ha
    from public.plantations p where p.client_id=_client_id and p.acquisition_id is null;
  pi_official := greatest(coalesce(public.get_client_effective_pi(_client_id),0),0)
    * greatest(coalesce(c.total_hectares,0),active_ha,
      coalesce((select sum(greatest(coalesce(p.superficie_ha,0),0)) from public.plantations p where p.client_id=_client_id and p.acquisition_id is null),0));
  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0) into pi_paid
    from public.paiements p where p.client_id=_client_id and p.acquisition_id is null and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;
  pi_balance:=greatest(0,pi_official-pi_paid);
  custom:=coalesce(c.paiement_personnalise,'{}'::jsonb);
  monthly:=coalesce(custom->'mensualite','{}'::jsonb);
  if coalesce((monthly->>'active')::boolean,false) and coalesce((monthly->>'montant')::numeric,0)>0 then
    monthly_amount:=greatest(0,(monthly->>'montant')::numeric);
    monthly_start:=coalesce(nullif(monthly->>'date_debut','')::date,
      case when coalesce((monthly->>'decalage_mois')::integer,0)>0
        then (coalesce(c.contrat_debut_at,current_date)+(coalesce((monthly->>'decalage_mois')::integer,0)||' months')::interval)::date
        else c.contrat_debut_at end);
  elsif coalesce(c.mensualite_montant,0)>0 then
    monthly_amount:=greatest(0,c.mensualite_montant); monthly_start:=c.contrat_debut_at;
  elsif c.offre_id is not null then
    select * into selected_offer from public.offres where id=c.offre_id;
    if jsonb_typeof(selected_offer.formules_configuration)='array' then
      select value into selected_formula from jsonb_array_elements(selected_offer.formules_configuration) where value->>'code'=c.formule_code limit 1;
    end if;
    if selected_formula is not null then
      use_shared:=coalesce((selected_formula->>'utilise_tarif_commun')::boolean,false);
      formula_monthly:=coalesce(nullif(selected_formula->>'mensualite_par_ha','')::numeric,case when use_shared then selected_offer.mensualite_par_ha end,0);
      monthly_amount:=greatest(0,formula_monthly)*greatest(active_ha,coalesce(c.total_hectares,0));
    else monthly_amount:=0; end if;
    monthly_start:=c.contrat_debut_at;
  end if;
  if monthly_start is not null and current_date>=monthly_start and monthly_amount>0 then
    elapsed_days:=greatest(0,current_date-monthly_start); paid_days:=greatest(0,coalesce(c.jours_payes,0));
    daily_rate:=monthly_amount/30; arrears_days:=greatest(0,elapsed_days-paid_days);
    arrears_amount:=round(arrears_days*daily_rate,2);
    current_monthly_due:=case when arrears_amount>0 then arrears_amount else monthly_amount end;
  else current_monthly_due:=0; end if;
  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0) into total_paid from public.paiements p where p.client_id=_client_id and p.statut='valide';
  return jsonb_build_object(
    'paiement_initial',jsonb_build_object('montant_officiel',round(pi_official,2),'deja_paye',round(pi_paid,2),'solde',round(pi_balance,2),'disponible',pi_balance>0),
    'mensualite',jsonb_build_object('montant',round(monthly_amount,2),'montant_a_payer',round(current_monthly_due,2),'disponible',current_monthly_due>0,'jours_retard',arrears_days,'montant_arriere',round(arrears_amount,2),'hectares_actifs',round(active_ha,4)),
    'total_paye',round(total_paid,2),'souscriptions_actives',0
  );
end;
$function$;

create or replace function public.portal_plantation_payment_state(_client_id uuid,_plantation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.plantations%rowtype;
  v_acquisition_count integer:=0;
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not private.can_access_client(auth.uid(),_client_id)) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  select * into p from public.plantations where id=_plantation_id and client_id=_client_id;
  if not found then raise exception 'Plantation introuvable'; end if;
  if p.acquisition_id is not null then return public.acquisition_current_payment_state(p.acquisition_id); end if;
  select count(*)::integer into v_acquisition_count from public.acquisitions a
    where a.client_id=_client_id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé');
  if v_acquisition_count=0 then return public.portal_current_payment_state(_client_id); end if;
  return jsonb_build_object(
    'paiement_initial',jsonb_build_object('montant_officiel',0,'deja_paye',0,'solde',0,'disponible',false),
    'mensualite',jsonb_build_object('montant',0,'montant_a_payer',0,'disponible',false,'jours_retard',0,'montant_arriere',0,'hectares_actifs',coalesce(p.superficie_activee,0)),
    'total_paye',0,'souscriptions_actives',0,'sans_contrat_financier',true
  );
end;
$function$;