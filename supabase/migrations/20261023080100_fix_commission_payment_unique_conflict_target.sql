CREATE OR REPLACE FUNCTION public.compute_commission_for_paiement(p_paiement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p record;
  c record;
  pid uuid;
  amount numeric := 0;
  base_amount numeric := 0;
  rate numeric := 0;
  offer text;
  kind text;
  existing_id uuid;
  yr integer := 1;
  rule_key text;
begin
  select * into p from public.paiements where id = p_paiement_id;
  if not found or lower(coalesce(p.statut,'')) <> 'valide' then return; end if;

  select id, commercial_id, formule_code, famille_offre, formule_nom,
         montant_total_contrat, contrat_debut_at
  into c
  from public.clients where id = p.client_id;
  if not found or c.commercial_id is null then return; end if;

  select id into pid from public.profiles where user_id = c.commercial_id and actif = true limit 1;
  if pid is null or not private.is_commercial_assignable(c.commercial_id) then return; end if;

  offer := upper(concat_ws(' ', c.formule_code, c.famille_offre, c.formule_nom));
  if offer like '%FLEXIBLE%' then
    kind := 'flexible';
  elsif offer like '%ESSENTIEL%' or offer like '%PALMTERROIR%' then
    kind := 'essentiel';
  elsif offer like '%PALMINVEST%' or offer like '%TERRAPALM%' or offer like '%TERRA PALM%' then
    kind := 'partenaire';
  else
    kind := 'inconnu';
  end if;

  if coalesce(p.est_paiement_initial,false)
     or upper(coalesce(p.type_paiement,'')) in ('PI','PAIEMENT_INITIAL') then
    select id into existing_id
    from public.commissions
    where client_id = c.id and type_commission = 'acquisition'
    limit 1;

    -- Do not recalculate an existing sale commission; its original amount is a historical snapshot.
    if existing_id is not null then
      perform public.recalculer_portefeuilles_commissions();
      return;
    end if;

    base_amount := coalesce(c.montant_total_contrat,p.montant_theorique,p.montant_paye,p.montant,0);
    rule_key := case kind
      when 'flexible' then 'COMMERCIAL_ACQUISITION_FLEXIBLE'
      when 'essentiel' then 'COMMERCIAL_ACQUISITION_ESSENTIEL'
      when 'partenaire' then 'COMMERCIAL_ACQUISITION_PARTENAIRE'
      else null
    end;
    if rule_key is not null then
      select montant into amount from public.grille_remuneration
      where code_regle = rule_key and actif order by updated_at desc limit 1;
    end if;
    amount := coalesce(amount,0);
    if amount > 0 then
      insert into public.commissions
        (profile_id,plantation_id,type_commission,montant_base,taux_commission,montant_commission,
         periode,statut,valide_par,date_validation,date_calcul,paiement_id,client_id,taux_applique,annee_contrat)
      values
        (pid,p.plantation_id,'acquisition',base_amount,0,amount,
         coalesce(p.date_paiement::date,current_date),'validee',
         coalesce(p.valide_par,auth.uid()),coalesce(p.date_validation,now()),now(),p.id,c.id,0,1)
      on conflict (client_id) where type_commission='acquisition' and client_id is not null do nothing;
    end if;
    perform public.recalculer_portefeuilles_commissions();
    return;
  end if;

  if upper(coalesce(p.type_paiement,'')) <> 'MENSUALITE' or kind = 'inconnu' then return; end if;
  select id into existing_id
  from public.commissions
  where paiement_id = p.id and type_commission = 'recouvrement_mensuel'
  limit 1;

  -- Do not recalculate an existing monthly commission; keep the original rate and amount.
  if existing_id is not null then
    perform public.recalculer_portefeuilles_commissions();
    return;
  end if;

  if kind = 'partenaire' then
    if coalesce(p.numero_echeance,0) > 0 then
      yr := ceil(p.numero_echeance::numeric / 12.0)::integer;
    elsif c.contrat_debut_at is not null then
      yr := greatest(1, extract(year from age(coalesce(p.date_paiement::date,current_date),c.contrat_debut_at))::integer + 1);
    else
      yr := 1;
    end if;
    yr := greatest(1,least(4,yr));
    rule_key := case when yr <= 3 then 'COMMERCIAL_REC_PARTENAIRE_AN' || yr::text else 'COMMERCIAL_REC_PARTENAIRE_AN3' end;
  elsif kind = 'flexible' then
    rule_key := 'COMMERCIAL_REC_FLEXIBLE';
    yr := 1;
  else
    rule_key := 'COMMERCIAL_REC_ESSENTIEL';
    yr := 1;
  end if;

  select coalesce(taux_pourcentage,0) into rate
  from public.grille_remuneration
  where code_regle = rule_key and actif order by updated_at desc limit 1;
  base_amount := coalesce(p.montant_paye,p.montant,0);
  amount := round(base_amount * coalesce(rate,0) / 100.0,2);

  if amount > 0 then
    insert into public.commissions
      (profile_id,plantation_id,type_commission,montant_base,taux_commission,montant_commission,
       periode,statut,date_calcul,paiement_id,client_id,taux_applique,annee_contrat)
    values
      (pid,p.plantation_id,'recouvrement_mensuel',base_amount,rate,amount,
       coalesce(p.date_paiement::date,current_date),'calculee',now(),p.id,c.id,rate,yr)
    on conflict (paiement_id) where paiement_id is not null do nothing;
  end if;
  perform public.recalculer_portefeuilles_commissions();
end;
$function$

