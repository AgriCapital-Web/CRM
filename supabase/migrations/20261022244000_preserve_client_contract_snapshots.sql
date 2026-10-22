-- Preserve all existing client pricing snapshots, including negotiated contracts with a configured formula code.
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
  -- Existing contractual snapshots and negotiated amounts are authoritative.
  -- Formula recalculation is performed by the BEFORE trigger only when the offer/formula is explicitly changed.
  if coalesce(c.paiement_personnalise, '{}'::jsonb) <> '{}'::jsonb
     or coalesce(c.montant_total_contrat, 0) > 0
     or coalesce(c.paiement_initial_montant, 0) > 0
     or coalesce(c.mensualite_montant, 0) > 0 then
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
  daily := case when ha > 0 and total > 0 then total / (greatest(months, 1) * 30 * ha) else 0 end;
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
  -- Never replace an existing client contract snapshot with current offer pricing.
  if coalesce(c.paiement_personnalise, '{}'::jsonb) <> '{}'::jsonb
     or coalesce(c.montant_total_contrat, 0) > 0
     or coalesce(c.paiement_initial_montant, 0) > 0
     or coalesce(c.mensualite_montant, 0) > 0 then
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
  rate := case when ha > 0 then total / days / ha else 0 end;
  update public.clients
     set montant_total_contrat = total, mensualite_montant = monthly,
         jours_contrat_total = days, taux_journalier_ha = rate,
         paiement_initial_montant = pi, updated_at = now()
   where id = _client_id;
end
$function$;
