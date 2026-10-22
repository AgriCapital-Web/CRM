-- Portal calculations must use the selected formula. Shared offer prices are permitted only
-- when the selected formula explicitly sets utilise_tarif_commun=true.
create or replace function public.get_client_effective_pi(_client_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  c public.clients%rowtype;
  o public.offres%rowtype;
  formula jsonb;
  base_pi numeric;
  base_total numeric;
  effective_pi numeric;
  promo record;
  use_shared boolean := false;
begin
  select * into c from public.clients where id = _client_id;
  if not found then return 0; end if;

  if auth.role() is distinct from 'service_role'
     and not public.is_staff(auth.uid())
     and c.user_id is distinct from auth.uid() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  -- Existing client snapshots remain authoritative, including personalized contracts.
  if coalesce(c.paiement_initial_montant, 0) > 0 then
    return greatest(c.paiement_initial_montant, 0) / greatest(coalesce(c.total_hectares, 0), 1);
  end if;

  select * into o from public.offres where id = c.offre_id;
  if not found then return 0; end if;

  if jsonb_typeof(o.formules_configuration) = 'array' then
    select value into formula
      from jsonb_array_elements(o.formules_configuration)
     where value->>'code' = c.formule_code
     limit 1;
  end if;
  if formula is null then
    -- No silent fallback to the offer-level tariff.
    return 0;
  end if;

  use_shared := coalesce((formula->>'utilise_tarif_commun')::boolean, false);
  base_pi := greatest(0, coalesce(
    nullif(formula->>'montant_pi_par_ha', '')::numeric,
    case when use_shared then coalesce(o.montant_pi_par_ha, o.paiement_signature_par_ha) end,
    0
  ));
  base_total := greatest(base_pi, coalesce(
    nullif(formula->>'montant_total_par_ha', '')::numeric,
    nullif(formula->>'montant_cash_par_ha', '')::numeric,
    case when use_shared then coalesce(o.montant_total_par_ha, o.montant_cash_par_ha) end,
    base_pi
  ));

  select p.id,
    case when lower(coalesce(p.cible, p.type_promotion, 'paiement_initial'))
      in ('cout_global','coût_global','total_contrat','cg','special')
      then 'cout_global' else 'paiement_initial' end as cible,
    coalesce(p.pourcentage_reduction, 0) as pct,
    coalesce(p.montant_fixe_reduction, 0) as fixe
  into promo
  from public.promotions p
  where p.active = true
    and (p.date_debut is null or p.date_debut <= now())
    and (p.date_fin is null or p.date_fin >= now())
    and (p.applique_toutes_offres = true or exists (
      select 1 from jsonb_array_elements_text(coalesce(p.offre_ids, '[]'::jsonb)) x
      where x = o.id::text or x = o.code
    ))
  order by coalesce(p.pourcentage_reduction, 0) desc,
           coalesce(p.montant_fixe_reduction, 0) desc, p.created_at desc
  limit 1;

  if promo.id is null then return base_pi; end if;
  if promo.cible = 'cout_global' then
    effective_pi := least(base_pi, greatest(base_total * (1 - promo.pct / 100.0) - promo.fixe, 0));
  else
    effective_pi := greatest(base_pi * (1 - promo.pct / 100.0) - promo.fixe, 0);
  end if;
  return greatest(0, least(base_total, effective_pi));
end
$function$;

create or replace function public.portal_current_payment_state(_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  c public.clients%rowtype;
  active_ha numeric := 0;
  pi_official numeric := 0;
  pi_paid numeric := 0;
  pi_balance numeric := 0;
  monthly_amount numeric := 0;
  daily_rate numeric := 0;
  monthly_start date;
  elapsed_days integer := 0;
  paid_days integer := 0;
  arrears_days integer := 0;
  arrears_amount numeric := 0;
  current_monthly_due numeric := 0;
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

  select coalesce(sum(greatest(coalesce(p.superficie_activee, 0), 0)), 0)
    into active_ha from public.plantations p
   where p.client_id = _client_id and p.acquisition_id is null;

  pi_official := greatest(coalesce(public.get_client_effective_pi(_client_id), 0), 0)
    * greatest(coalesce(c.total_hectares, 0), active_ha,
      coalesce((select sum(greatest(coalesce(p.superficie_ha, 0), 0))
        from public.plantations p where p.client_id = _client_id and p.acquisition_id is null), 0));

  select coalesce(sum(greatest(coalesce(p.montant_paye, p.montant, 0), 0)), 0)
    into pi_paid from public.paiements p
   where p.client_id = _client_id and p.acquisition_id is null
     and p.statut = 'valide' and coalesce(p.est_paiement_initial, false) = true;

  pi_balance := greatest(0, pi_official - pi_paid);
  custom := coalesce(c.paiement_personnalise, '{}'::jsonb);
  monthly := coalesce(custom->'mensualite', '{}'::jsonb);

  if coalesce((monthly->>'active')::boolean, false)
     and coalesce((monthly->>'montant')::numeric, 0) > 0 then
    monthly_amount := greatest(0, (monthly->>'montant')::numeric);
    monthly_start := coalesce(nullif(monthly->>'date_debut', '')::date,
      case when coalesce((monthly->>'decalage_mois')::integer, 0) > 0
        then (coalesce(c.contrat_debut_at, current_date)
          + (coalesce((monthly->>'decalage_mois')::integer, 0) || ' months')::interval)::date
        else c.contrat_debut_at end);
  elsif coalesce(c.mensualite_montant, 0) > 0 then
    -- Existing contract snapshot wins over the current offer settings.
    monthly_amount := greatest(0, c.mensualite_montant);
    monthly_start := c.contrat_debut_at;
  elsif c.offre_id is not null then
    select * into selected_offer from public.offres where id = c.offre_id;
    if jsonb_typeof(selected_offer.formules_configuration) = 'array' then
      select value into selected_formula
        from jsonb_array_elements(selected_offer.formules_configuration)
       where value->>'code' = c.formule_code limit 1;
    end if;
    if selected_formula is not null then
      use_shared := coalesce((selected_formula->>'utilise_tarif_commun')::boolean, false);
      formula_monthly := coalesce(
        nullif(selected_formula->>'mensualite_par_ha', '')::numeric,
        case when use_shared then selected_offer.mensualite_par_ha end,
        0
      );
      monthly_amount := greatest(0, formula_monthly) * greatest(active_ha, coalesce(c.total_hectares, 0));
    else
      -- No configured formula means no offer-default amount is shown.
      monthly_amount := 0;
    end if;
    monthly_start := c.contrat_debut_at;
  end if;

  if monthly_start is not null and current_date >= monthly_start and monthly_amount > 0 then
    elapsed_days := greatest(0, current_date - monthly_start);
    paid_days := greatest(0, coalesce(c.jours_payes, 0));
    daily_rate := monthly_amount / 30;
    arrears_days := greatest(0, elapsed_days - paid_days);
    arrears_amount := round(arrears_days * daily_rate, 2);
    current_monthly_due := case when arrears_amount > 0 then arrears_amount else monthly_amount end;
  else
    current_monthly_due := 0;
  end if;

  return jsonb_build_object(
    'paiement_initial', jsonb_build_object('montant_officiel', round(pi_official, 2),
      'deja_paye', round(pi_paid, 2), 'solde', round(pi_balance, 2), 'disponible', pi_balance > 0),
    'mensualite', jsonb_build_object('montant', round(monthly_amount, 2),
      'montant_a_payer', round(current_monthly_due, 2), 'disponible', current_monthly_due > 0,
      'jours_retard', arrears_days, 'montant_arriere', round(arrears_amount, 2),
      'hectares_actifs', round(active_ha, 4)),
    'total_paye', round(pi_paid + coalesce((select sum(greatest(coalesce(p.montant_paye, p.montant, 0), 0))
      from public.paiements p where p.client_id = _client_id and p.statut = 'valide'
      and p.type_paiement = 'MENSUALITE'), 0), 2)
  );
end;
$function$;

create or replace function public.portal_client_daily_rate(_client_id uuid, _at_date date default current_date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_client record;
  v_custom jsonb;
  v_monthly jsonb;
  v_start date;
  v_amount numeric;
  v_active boolean;
  v_contract_day integer;
  v_cursor integer := 0;
  v_months integer;
  v_rate numeric := 0;
  v_tranche jsonb;
  v_formula jsonb;
  v_tranches jsonb;
  v_monthly_per_ha numeric := 0;
  v_use_shared boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _client_id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select c.*, o.tranches_paiement, o.mensualite_par_ha, o.formules_configuration
    into v_client
    from public.clients c left join public.offres o on o.id = c.offre_id
   where c.id = _client_id;
  if v_client is null then return 0; end if;

  v_custom := coalesce(v_client.paiement_personnalise, '{}'::jsonb);
  if v_custom ? 'mensualite' then
    v_monthly := coalesce(v_custom->'mensualite', '{}'::jsonb);
    v_active := coalesce((v_monthly->>'active')::boolean, false);
    v_amount := coalesce((v_monthly->>'montant')::numeric, 0);
    if v_monthly ? 'date_debut' and nullif(v_monthly->>'date_debut', '') is not null then
      v_start := (v_monthly->>'date_debut')::date;
    else
      v_start := (coalesce(v_client.contrat_debut_at, current_date)
        + (greatest(0, coalesce((v_monthly->>'decalage_mois')::integer, 0)) || ' months')::interval)::date;
    end if;
    if not v_active or v_amount <= 0 or _at_date < v_start then return 0; end if;
    return greatest(v_amount / coalesce(nullif(v_client.total_hectares, 0), 1), 0) / 30;
  end if;

  if coalesce(v_client.mensualite_montant, 0) > 0 then
    return greatest(v_client.mensualite_montant / coalesce(nullif(v_client.total_hectares, 0), 1), 0) / 30;
  end if;

  if jsonb_typeof(v_client.formules_configuration) = 'array' then
    select value into v_formula
      from jsonb_array_elements(v_client.formules_configuration)
     where value->>'code' = v_client.formule_code limit 1;
  end if;
  if v_formula is null then
    return greatest(coalesce(v_client.taux_journalier_ha, 0), 0);
  end if;

  v_use_shared := coalesce((v_formula->>'utilise_tarif_commun')::boolean, false);
  v_tranches := v_formula->'tranches_paiement';
  v_monthly_per_ha := coalesce(nullif(v_formula->>'mensualite_par_ha', '')::numeric,
    case when v_use_shared then v_client.mensualite_par_ha end, 0);

  if v_client.contrat_debut_at is null then
    if v_monthly_per_ha > 0 then return v_monthly_per_ha / 30; end if;
    return greatest(coalesce(v_client.taux_journalier_ha, 0), 0);
  end if;

  v_contract_day := greatest(0, (_at_date - v_client.contrat_debut_at));
  if jsonb_typeof(v_tranches) = 'array' then
    for v_tranche in select value from jsonb_array_elements(v_tranches) loop
      v_months := coalesce((v_tranche->>'mois')::integer, 0);
      if coalesce(v_tranche->>'type', '') = 'paiement_initial' or v_months <= 0 then continue; end if;
      if v_contract_day < v_cursor + v_months * 30 then
        v_rate := coalesce(nullif(v_tranche->>'mensualite_par_ha', '')::numeric, v_monthly_per_ha, 0) / 30;
        exit;
      end if;
      v_cursor := v_cursor + v_months * 30;
    end loop;
  end if;
  if v_rate <= 0 and v_monthly_per_ha > 0 then v_rate := v_monthly_per_ha / 30; end if;
  return greatest(v_rate, 0);
end
$function$;
