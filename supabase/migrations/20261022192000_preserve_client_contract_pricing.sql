-- Honor the client's selected formula (not the offer family's default rate) in portal financial calculations.
-- This prevents PalmTerroir Flexible clients from being charged/displayed the Essentielle rate.
CREATE OR REPLACE FUNCTION public.portal_current_payment_state(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  c public.clients%rowtype;
  active_ha numeric:=0;
  pi_official numeric:=0;
  pi_paid numeric:=0;
  pi_balance numeric:=0;
  monthly_amount numeric:=0;
  daily_rate numeric:=0;
  monthly_start date;
  elapsed_days integer:=0;
  paid_days integer:=0;
  arrears_days integer:=0;
  arrears_amount numeric:=0;
  current_monthly_due numeric:=0;
  custom jsonb;
  monthly jsonb;
  selected_formula jsonb;
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _client_id)) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;

  select * into c from public.clients where id=_client_id;
  if not found then raise exception 'Client introuvable'; end if;

  select coalesce(sum(greatest(coalesce(p.superficie_activee,0),0)),0)
    into active_ha from public.plantations p
    where p.client_id=_client_id and p.acquisition_id is null;

  pi_official := greatest(coalesce(public.get_client_effective_pi(_client_id),0),0)
    * greatest(coalesce(c.total_hectares,0), active_ha,
      coalesce((select sum(greatest(coalesce(p.superficie_ha,0),0))
        from public.plantations p where p.client_id=_client_id and p.acquisition_id is null),0));

  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0)
    into pi_paid from public.paiements p
    where p.client_id=_client_id and p.acquisition_id is null
      and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;

  pi_balance := greatest(0,pi_official-pi_paid);
  custom := coalesce(c.paiement_personnalise,'{}'::jsonb);
  monthly := coalesce(custom->'mensualite','{}'::jsonb);

  if coalesce((monthly->>'active')::boolean,false)
     and coalesce((monthly->>'montant')::numeric,0)>0 then
    monthly_amount := greatest(0,(monthly->>'montant')::numeric);
    monthly_start := coalesce(nullif(monthly->>'date_debut','')::date,
      case when coalesce((monthly->>'decalage_mois')::integer,0)>0
        then (coalesce(c.contrat_debut_at,current_date)
          +(coalesce((monthly->>'decalage_mois')::integer,0)||' months')::interval)::date
        else c.contrat_debut_at end);
  elsif coalesce(c.mensualite_montant,0)>0 then
    -- Preserve the contract-specific amount already agreed with this client.
    monthly_amount := greatest(0,c.mensualite_montant);
    monthly_start := c.contrat_debut_at;
  elsif c.offre_id is not null then
    select case
      when jsonb_typeof(o.formules_configuration)='array'
        and jsonb_array_length(o.formules_configuration)>0
      then coalesce(
        (select nullif(f.value->>'mensualite_par_ha','')::numeric
          from jsonb_array_elements(o.formules_configuration) f(value)
          where f.value->>'code'=c.formule_code
          limit 1),
        o.mensualite_par_ha,
        0
      )
      else coalesce(o.mensualite_par_ha,0)
    end * greatest(active_ha,coalesce(c.total_hectares,0))
    into monthly_amount from public.offres o where o.id=c.offre_id;
    monthly_start := c.contrat_debut_at;
  end if;

  if monthly_start is not null and current_date>=monthly_start and monthly_amount>0 then
    elapsed_days := greatest(0,current_date-monthly_start);
    paid_days := greatest(0,coalesce(c.jours_payes,0));
    daily_rate := monthly_amount/30;
    arrears_days := greatest(0,elapsed_days-paid_days);
    arrears_amount := round(arrears_days*daily_rate,2);
    current_monthly_due := case when arrears_amount>0 then arrears_amount else monthly_amount end;
  else
    current_monthly_due := 0;
  end if;

  return jsonb_build_object(
    'paiement_initial',jsonb_build_object('montant_officiel',round(pi_official,2),
      'deja_paye',round(pi_paid,2),'solde',round(pi_balance,2),'disponible',pi_balance>0),
    'mensualite',jsonb_build_object('montant',round(monthly_amount,2),
      'montant_a_payer',round(current_monthly_due,2),'disponible',current_monthly_due>0,
      'jours_retard',arrears_days,'montant_arriere',round(arrears_amount,2),
      'hectares_actifs',round(active_ha,4)),
    'total_paye',round(pi_paid+coalesce((select sum(greatest(coalesce(p.montant_paye,p.montant,0),0))
      from public.paiements p where p.client_id=_client_id and p.statut='valide'
      and p.type_paiement='MENSUALITE'),0),2)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_client_daily_rate(_client_id uuid, _at_date date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
 v_client record;
 v_custom jsonb;
 v_monthly jsonb;
 v_start date;
 v_amount numeric;
 v_active boolean;
 v_contract_day integer;
 v_cursor integer:=0;
 v_months integer;
 v_rate numeric:=0;
 v_tranche jsonb;
 v_formula jsonb;
 v_tranches jsonb;
 v_monthly_per_ha numeric:=0;
begin
 if auth.role() is distinct from 'service_role'
    and (auth.uid() is null or not private.can_access_client(auth.uid(),_client_id)) then
   raise exception 'Accès refusé' using errcode='42501';
 end if;

 select c.*,o.tranches_paiement,o.mensualite_par_ha,o.formules_configuration
 into v_client
 from public.clients c left join public.offres o on o.id=c.offre_id
 where c.id=_client_id;
 if v_client is null then return 0; end if;

 v_custom:=coalesce(v_client.paiement_personnalise,'{}'::jsonb);
 if v_custom ? 'mensualite' then
   v_monthly:=coalesce(v_custom->'mensualite','{}'::jsonb);
   v_active:=coalesce((v_monthly->>'active')::boolean,false);
   v_amount:=coalesce((v_monthly->>'montant')::numeric,0);
   if v_monthly ? 'date_debut' and nullif(v_monthly->>'date_debut','') is not null then
     v_start:=(v_monthly->>'date_debut')::date;
   else
     v_start:=(coalesce(v_client.contrat_debut_at,current_date)
       +(greatest(0,coalesce((v_monthly->>'decalage_mois')::integer,0))||' months')::interval)::date;
   end if;
   if not v_active or v_amount<=0 or _at_date<v_start then return 0; end if;
   return greatest(v_amount/coalesce(nullif(v_client.total_hectares,0),1),0)/30;
 end if;

 if coalesce(v_client.mensualite_montant,0)>0 then
   -- Existing signed client contracts take precedence over today's offer defaults.
   return greatest(v_client.mensualite_montant/coalesce(nullif(v_client.total_hectares,0),1),0)/30;
 end if;

 if v_client.contrat_debut_at is null then
   -- A formula-specific daily rate is preferred to the generic client snapshot.
   if jsonb_typeof(v_client.formules_configuration)='array' then
     select value into v_formula from jsonb_array_elements(v_client.formules_configuration)
       where value->>'code'=v_client.formule_code limit 1;
     if v_formula is not null then
       v_tranches:=v_formula->'tranches_paiement';
       v_monthly_per_ha:=coalesce((v_formula->>'mensualite_par_ha')::numeric,0);
       if jsonb_typeof(v_tranches)='array' then
         select value into v_tranche from jsonb_array_elements(v_tranches)
          where coalesce(value->>'type','')<>'paiement_initial'
            and coalesce((value->>'mensualite_par_ha')::numeric,0)>0
          order by coalesce((value->>'mois_debut')::integer,1) limit 1;
         if v_tranche is not null then
           v_monthly_per_ha:=coalesce((v_tranche->>'mensualite_par_ha')::numeric,v_monthly_per_ha);
         end if;
       end if;
       if v_monthly_per_ha>0 then return v_monthly_per_ha/30; end if;
     end if;
   end if;
   return coalesce(v_client.taux_journalier_ha,0);
 end if;

 v_contract_day:=greatest(0,(_at_date-v_client.contrat_debut_at));
 if jsonb_typeof(v_client.formules_configuration)='array' then
   select value into v_formula from jsonb_array_elements(v_client.formules_configuration)
     where value->>'code'=v_client.formule_code limit 1;
   if v_formula is not null then
     v_tranches:=v_formula->'tranches_paiement';
     v_monthly_per_ha:=coalesce((v_formula->>'mensualite_par_ha')::numeric,0);
   end if;
 end if;
 if jsonb_typeof(v_tranches)='array' then
   for v_tranche in select value from jsonb_array_elements(v_tranches) loop
     v_months:=coalesce((v_tranche->>'mois')::integer,0);
     if coalesce(v_tranche->>'type','')='paiement_initial' or v_months<=0 then continue; end if;
     if v_contract_day<v_cursor+v_months*30 then
       v_rate:=coalesce((v_tranche->>'mensualite_par_ha')::numeric,v_monthly_per_ha,0)/30;
       exit;
     end if;
     v_cursor:=v_cursor+v_months*30;
   end loop;
 end if;
 if v_rate<=0 then
   if v_monthly_per_ha>0 then v_rate:=v_monthly_per_ha/30;
   else v_rate:=coalesce(v_client.mensualite_par_ha,0)/30;
   end if;
 end if;
 return greatest(v_rate,0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_client_effective_pi(_client_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.clients%rowtype;
  o public.offres%rowtype;
  formula jsonb;
  base_pi numeric;
  base_total numeric;
  effective_pi numeric;
  promo record;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id=_client_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_staff(auth.uid())
     AND c.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé' USING errcode='42501';
  END IF;

  -- Existing client snapshots are the effective contract price, including any
  -- discount or negotiated amount already agreed. Return per-hectare value
  -- because callers multiply this result by the client's contract area.
  IF coalesce(c.paiement_initial_montant,0)>0 THEN
    RETURN greatest(c.paiement_initial_montant,0)/greatest(coalesce(c.total_hectares,0),1);
  END IF;

  SELECT * INTO o FROM public.offres WHERE id=c.offre_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF jsonb_typeof(o.formules_configuration)='array' THEN
    SELECT value INTO formula FROM jsonb_array_elements(o.formules_configuration)
      WHERE value->>'code'=c.formule_code LIMIT 1;
  END IF;

  IF formula IS NULL THEN
    SELECT COALESCE(p.pi_effectif,0) INTO effective_pi
    FROM public.offre_prix_effectif() p WHERE p.offre_id=o.id LIMIT 1;
    RETURN COALESCE(effective_pi,0);
  END IF;

  base_pi := greatest(0,coalesce(nullif(formula->>'montant_pi_par_ha','')::numeric,o.montant_pi_par_ha,0));
  base_total := greatest(base_pi,coalesce(nullif(formula->>'montant_total_par_ha','')::numeric,
    nullif(formula->>'montant_cash_par_ha','')::numeric,o.montant_total_par_ha,base_pi));

  SELECT p.id,
    CASE WHEN lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) IN ('cout_global','coût_global','total_contrat','cg','special')
      THEN 'cout_global' ELSE 'paiement_initial' END AS cible,
    coalesce(p.pourcentage_reduction,0) AS pct,
    coalesce(p.montant_fixe_reduction,0) AS fixe
  INTO promo
  FROM public.promotions p
  WHERE p.active=true
    AND (p.date_debut IS NULL OR p.date_debut<=now())
    AND (p.date_fin IS NULL OR p.date_fin>=now())
    AND (p.applique_toutes_offres=true OR EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(coalesce(p.offre_ids,'[]'::jsonb)) x
      WHERE x=o.id::text OR x=o.code
    ))
  ORDER BY coalesce(p.pourcentage_reduction,0) DESC,
           coalesce(p.montant_fixe_reduction,0) DESC,p.created_at DESC
  LIMIT 1;

  IF promo.id IS NULL THEN RETURN base_pi; END IF;
  IF promo.cible='cout_global' THEN
    effective_pi := least(base_pi,greatest(base_total*(1-promo.pct/100.0)-promo.fixe,0));
  ELSE
    effective_pi := greatest(base_pi*(1-promo.pct/100.0)-promo.fixe,0);
  END IF;
  RETURN greatest(0,least(base_total,effective_pi));
END;
$function$;
