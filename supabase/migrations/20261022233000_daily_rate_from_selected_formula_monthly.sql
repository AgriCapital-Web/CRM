-- All formula-driven daily rates derive from the configured monthly payment / 30.
-- Existing personalized and contractual snapshots are retained; this changes calculation rules only.
create or replace function public.trg_client_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_di numeric;
  v_total numeric;
  v_base_total numeric;
  v_duree int;
  v_taux numeric;
  v_mens numeric := 0;
  v_ha numeric;
  v_amount numeric;
  v_formula jsonb;
  v_offre public.offres%rowtype;
  v_use_shared boolean := false;
begin
  if coalesce(new.compte_actif, false) = true or new.offre_id is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.offre_id is not distinct from old.offre_id
     and new.promotion_id is not distinct from old.promotion_id
     and new.total_hectares is not distinct from old.total_hectares
     and new.formule_code is not distinct from old.formule_code
     and new.mode_paiement is not distinct from old.mode_paiement then
    return new;
  end if;

  select * into v_offre from public.offres where id = new.offre_id;
  select item.value into v_formula
    from jsonb_array_elements(coalesce(v_offre.formules_configuration, '[]'::jsonb)) item(value)
   where item.value->>'code' = new.formule_code
   limit 1;

  if v_formula is null then
    raise exception 'Formule non configurée pour cette offre. Aucune tarification générique ne sera appliquée.'
      using errcode = '23514';
  end if;

  v_use_shared := coalesce((v_formula->>'utilise_tarif_commun')::boolean, false);
  v_ha := coalesce(new.total_hectares, 0);
  if v_ha <= 0 then return new; end if;
  new.mode_paiement := coalesce(new.mode_paiement, 'echeancier');

  v_di := coalesce(nullif(v_formula->>'montant_pi_par_ha', '')::numeric,
                   case when v_use_shared then coalesce(v_offre.montant_pi_par_ha, v_offre.paiement_signature_par_ha) end);
  v_base_total := coalesce(nullif(v_formula->>'montant_total_par_ha', '')::numeric,
                           nullif(v_formula->>'montant_cash_par_ha', '')::numeric,
                           case when v_use_shared then coalesce(v_offre.montant_total_par_ha, v_offre.montant_cash_par_ha) end);
  v_total := v_base_total;
  v_mens := coalesce(nullif(v_formula->>'mensualite_par_ha', '')::numeric,
                     case when v_use_shared then v_offre.mensualite_par_ha end);
  v_duree := coalesce(nullif(v_formula->>'duree_paiement_mois', '')::int,
                      case when v_use_shared then v_offre.duree_paiement_mois end);

  if new.mode_paiement = 'comptant' then
    v_di := coalesce(nullif(new.montant_total_contrat, 0) / v_ha, v_total);
    v_mens := 0;
    v_duree := 1;
  else
    if coalesce(new.montant_total_contrat, 0) > 0 then v_total := new.montant_total_contrat / v_ha; end if;
    if coalesce(new.paiement_initial_montant, 0) > 0 then v_di := new.paiement_initial_montant / v_ha; end if;
    if coalesce(new.mensualite_montant, 0) > 0 then v_mens := new.mensualite_montant / v_ha; end if;
  end if;

  if v_di is null or v_total is null or v_mens is null or v_duree is null or v_duree <= 0 then
    raise exception 'Les paramètres financiers de la formule % sont incomplets.', new.formule_code
      using errcode = '23514';
  end if;

  v_amount := v_di * v_ha;
  new.paiement_initial_montant := v_amount;
  new.montant_total_contrat := greatest(v_total, 0) * v_ha;
  new.mensualite_montant := greatest(v_mens, 0) * v_ha;
  new.jours_contrat_total := v_duree * 30;
  v_taux := case when v_ha > 0 then greatest(v_mens, 0) / 30 else 0 end;
  new.taux_journalier_ha := v_taux;
  new.montant_promo_applique := greatest(coalesce(v_base_total, 0) * v_ha - new.montant_total_contrat, 0);

  if v_amount <= 0 then
    update public.paiements
       set statut = 'annule', montant = 0, montant_paye = 0, montant_theorique = 0,
           cancelled_at = coalesce(cancelled_at, now()),
           notes = concat_ws(' — ', nullif(notes, ''), 'Paiement Initial annulé automatiquement : tarif à 0 F'),
           updated_at = now()
     where client_id = new.id and est_paiement_initial = true and statut = 'en_attente';
  else
    update public.paiements
       set montant = v_amount, montant_paye = 0, montant_theorique = v_amount, updated_at = now()
     where client_id = new.id and est_paiement_initial = true and statut = 'en_attente';
  end if;
  return new;
end
$function$;

create or replace function public.recalculer_parametres_financiers_client(_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c record;
  o record;
  f jsonb;
  months integer;
  total numeric;
  initial numeric;
  monthly numeric;
  daily numeric;
  ha numeric;
  formula_total numeric;
  v_use_shared boolean := false;
begin
  select * into c from public.clients where id = _client_id;
  if not found then return; end if;
  select * into o from public.offres where id = c.offre_id;
  if o.id is null then return; end if;

  -- Personalized and legacy contract snapshots are authoritative; never recalculate them from offer defaults.
  if coalesce(c.paiement_personnalise, '{}'::jsonb) <> '{}'::jsonb
     or (coalesce(c.montant_total_contrat, 0) > 0
         and coalesce(c.paiement_initial_montant, 0) > 0
         and coalesce(c.formule_code, '') = '') then
    return;
  end if;

  ha := coalesce(c.total_hectares, 0);
  select item.value into f
    from jsonb_array_elements(coalesce(o.formules_configuration, '[]'::jsonb)) item(value)
   where item.value->>'code' = c.formule_code limit 1;

  if f is null then
    if coalesce(c.montant_total_contrat, 0) > 0
       or coalesce(c.paiement_initial_montant, 0) > 0
       or coalesce(c.mensualite_montant, 0) > 0 then
      return;
    end if;
    raise exception 'Formule absente ou non configurée pour le client %. Aucun tarif générique ne sera utilisé.', _client_id
      using errcode = '23514';
  end if;
  if ha <= 0 then return; end if;

  v_use_shared := coalesce((f->>'utilise_tarif_commun')::boolean, false);
  months := coalesce(nullif(f->>'duree_paiement_mois', '')::integer,
                     case when v_use_shared then o.duree_paiement_mois end);
  formula_total := coalesce(nullif(f->>'montant_total_par_ha', '')::numeric,
                            nullif(f->>'montant_cash_par_ha', '')::numeric,
                            case when v_use_shared then coalesce(o.montant_total_par_ha, o.montant_cash_par_ha) end) * ha;
  if c.mode_paiement = 'comptant' then
    months := 1;
    total := coalesce(nullif(c.montant_total_contrat, 0), formula_total);
    initial := total;
    monthly := 0;
  else
    initial := coalesce(nullif(c.paiement_initial_montant, 0),
                        coalesce(nullif(f->>'montant_pi_par_ha', '')::numeric,
                                 case when v_use_shared then coalesce(o.montant_pi_par_ha, o.paiement_signature_par_ha) end) * ha);
    monthly := coalesce(nullif(c.mensualite_montant, 0),
                        coalesce(nullif(f->>'mensualite_par_ha', '')::numeric,
                                 case when v_use_shared then o.mensualite_par_ha end) * ha);
    total := case
      when coalesce(c.montant_promo_applique, 0) > 0 and coalesce(c.montant_total_contrat, 0) > 0 then c.montant_total_contrat
      else coalesce(nullif(c.montant_total_contrat, 0), formula_total)
    end;
  end if;

  if months is null or months <= 0 or total is null or initial is null or monthly is null then
    raise exception 'Les paramètres financiers de la formule % sont incomplets.', c.formule_code
      using errcode = '23514';
  end if;
  daily := case when ha > 0 then greatest(monthly, 0) / ha / 30 else 0 end;
  update public.clients
     set paiement_initial_montant = initial,
         mensualite_montant = monthly,
         montant_total_contrat = round(total, 2),
         taux_journalier_ha = round(daily, 6),
         jours_contrat_total = greatest(months, 1) * 30,
         updated_at = now()
   where id = _client_id;
end
$function$;

create or replace function public.recompute_contrat_totaux(_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  c record;
  o record;
  f jsonb;
  v_use_shared boolean := false;
  total numeric;
  pi numeric;
  days int;
  rate numeric;
  monthly numeric;
  ha numeric;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then
    raise exception 'Accès refusé';
  end if;
  select * into c from public.clients where id = _client_id;
  if not found or c.offre_id is null then return; end if;
  select * into o from public.offres where id = c.offre_id;
  ha := coalesce(c.total_hectares, 0);

  -- Existing contractual values, including negotiated prices, remain authoritative.
  if coalesce(c.paiement_personnalise, '{}'::jsonb) <> '{}'::jsonb
     or (coalesce(c.montant_total_contrat, 0) > 0 and coalesce(c.paiement_initial_montant, 0) > 0
         and coalesce(c.formule_code, '') = '') then
    return;
  end if;

  select item.value into f
    from jsonb_array_elements(coalesce(o.formules_configuration, '[]'::jsonb)) item(value)
   where item.value->>'code' = c.formule_code limit 1;
  if f is null then
    if coalesce(c.montant_total_contrat, 0) > 0 or coalesce(c.paiement_initial_montant, 0) > 0 then return; end if;
    raise exception 'Formule absente ou non configurée. Aucun tarif générique ne sera utilisé.'
      using errcode = '23514';
  end if;
  if ha <= 0 then return; end if;

  v_use_shared := coalesce((f->>'utilise_tarif_commun')::boolean, false);
  days := coalesce(nullif(f->>'duree_paiement_mois', '')::int,
                   case when v_use_shared then o.duree_paiement_mois end) * 30;
  if c.mode_paiement = 'comptant' then
    total := coalesce(nullif(c.montant_total_contrat, 0),
      coalesce(nullif(f->>'montant_cash_par_ha', '')::numeric, nullif(f->>'montant_total_par_ha', '')::numeric,
               case when v_use_shared then coalesce(o.montant_cash_par_ha, o.montant_total_par_ha) end) * ha);
    pi := total;
    monthly := 0;
    days := 30;
  else
    pi := coalesce(nullif(c.paiement_initial_montant, 0),
                   coalesce(nullif(f->>'montant_pi_par_ha', '')::numeric,
                            case when v_use_shared then coalesce(o.montant_pi_par_ha, o.paiement_signature_par_ha) end) * ha);
    monthly := coalesce(nullif(c.mensualite_montant, 0),
                        coalesce(nullif(f->>'mensualite_par_ha', '')::numeric,
                                 case when v_use_shared then o.mensualite_par_ha end) * ha);
    total := case when coalesce(c.montant_promo_applique, 0) > 0 and coalesce(c.montant_total_contrat, 0) > 0
      then c.montant_total_contrat
      else coalesce(nullif(f->>'montant_total_par_ha', '')::numeric, nullif(f->>'montant_cash_par_ha', '')::numeric,
                    case when v_use_shared then coalesce(o.montant_total_par_ha, o.montant_cash_par_ha) end) * ha end;
  end if;

  if total is null or pi is null or monthly is null or days is null or days <= 0 then
    raise exception 'Les paramètres financiers de la formule % sont incomplets.', c.formule_code
      using errcode = '23514';
  end if;
  rate := case when ha > 0 then greatest(monthly, 0) / ha / 30 else 0 end;
  update public.clients
     set montant_total_contrat = total, mensualite_montant = monthly,
         jours_contrat_total = days, taux_journalier_ha = rate,
         paiement_initial_montant = pi, updated_at = now()
   where id = _client_id;
end
$function$;

create or replace function public.portal_client_daily_rate(_client_id uuid, _at_date date default current_date)
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
  custom jsonb;
  monthly jsonb;
  monthly_per_ha numeric := 0;
  use_shared boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _client_id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select * into c from public.clients where id = _client_id;
  if not found then return 0; end if;

  custom := coalesce(c.paiement_personnalise, '{}'::jsonb);
  if custom ? 'mensualite' then
    monthly := coalesce(custom->'mensualite', '{}'::jsonb);
    if not coalesce((monthly->>'active')::boolean, false) then return 0; end if;
    if coalesce((monthly->>'montant')::numeric, 0) <= 0 then return 0; end if;
    if nullif(monthly->>'date_debut','') is not null and _at_date < (monthly->>'date_debut')::date then return 0; end if;
    if nullif(monthly->>'date_debut','') is null
       and c.contrat_debut_at is not null
       and _at_date < (c.contrat_debut_at + (greatest(0,coalesce((monthly->>'decalage_mois')::integer,0)) || ' months')::interval)::date then
      return 0;
    end if;
    return greatest((monthly->>'montant')::numeric / coalesce(nullif(c.total_hectares,0),1) / 30, 0);
  end if;

  -- The saved contractual monthly amount is authoritative for existing clients.
  if coalesce(c.mensualite_montant,0) > 0 then
    return greatest(c.mensualite_montant / coalesce(nullif(c.total_hectares,0),1) / 30, 0);
  end if;

  select * into o from public.offres where id = c.offre_id;
  if not found then return greatest(coalesce(c.taux_journalier_ha,0),0); end if;

  if jsonb_typeof(o.formules_configuration) = 'array' then
    select value into formula from jsonb_array_elements(o.formules_configuration)
      where value->>'code' = c.formule_code limit 1;
  end if;
  if formula is null then
    -- Preserve only a stored historical daily-rate snapshot; never use offer defaults.
    return greatest(coalesce(c.taux_journalier_ha,0),0);
  end if;

  use_shared := coalesce((formula->>'utilise_tarif_commun')::boolean,false);
  monthly_per_ha := coalesce(
    nullif(formula->>'mensualite_par_ha','')::numeric,
    case when use_shared then o.mensualite_par_ha end,
    0
  );
  return greatest(monthly_per_ha / 30, 0);
end
$function$;
