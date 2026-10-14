-- Normalize commercial commission rules to the agreed offer-based model.
UPDATE public.grille_remuneration
SET montant = 10000,
    taux_pourcentage = NULL,
    annee_application = 1,
    description = 'Palme Invest / Terra Palm — commission de vente unique',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_ACQUISITION_PARTENAIRE';

UPDATE public.grille_remuneration
SET montant = NULL,
    taux_pourcentage = 2.5,
    annee_application = 1,
    description = 'Palme Invest / Terra Palm — recouvrement mensuel année 1',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_REC_PARTENAIRE_AN1';

UPDATE public.grille_remuneration
SET montant = NULL,
    taux_pourcentage = 2.0,
    annee_application = 2,
    description = 'Palme Invest / Terra Palm — recouvrement mensuel année 2',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_REC_PARTENAIRE_AN2';

UPDATE public.grille_remuneration
SET montant = NULL,
    taux_pourcentage = 1.5,
    annee_application = 3,
    description = 'Palme Invest / Terra Palm — recouvrement mensuel année 3',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_REC_PARTENAIRE_AN3';

UPDATE public.grille_remuneration
SET montant = 15000,
    taux_pourcentage = NULL,
    annee_application = 1,
    description = 'PalmTerroir — formule essentielle, commission de vente unique',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_ACQUISITION_ESSENTIEL';

UPDATE public.grille_remuneration
SET montant = 7000,
    taux_pourcentage = NULL,
    annee_application = 1,
    description = 'PalmTerroir — formule flexible, commission de vente unique',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_ACQUISITION_FLEXIBLE';

INSERT INTO public.grille_remuneration
  (role_cible, type_remuneration, montant, taux_pourcentage, annee_application, description, actif, code_regle)
SELECT 'commercial', 'recouvrement_mensuel', NULL, 2.5, 1,
       'PalmTerroir — formule flexible, commission sur chaque mensualité',
       true, 'COMMERCIAL_REC_FLEXIBLE'
WHERE NOT EXISTS (
  SELECT 1 FROM public.grille_remuneration WHERE code_regle = 'COMMERCIAL_REC_FLEXIBLE'
);

UPDATE public.grille_remuneration
SET montant = NULL,
    taux_pourcentage = 2.5,
    annee_application = 1,
    description = 'PalmTerroir — formule flexible, commission sur chaque mensualité',
    actif = true,
    updated_at = now()
WHERE code_regle = 'COMMERCIAL_REC_FLEXIBLE';

UPDATE public.grille_remuneration
SET actif = false, updated_at = now()
WHERE code_regle IN ('COMMERCIAL_REC_FLEXIBLE_AN1','COMMERCIAL_REC_FLEXIBLE_AN2','COMMERCIAL_REC_FLEXIBLE_AN3');

UPDATE public.grille_remuneration
SET montant = 10000,
    taux_pourcentage = 0,
    description = 'Mobilisateur foncier — prime par hectare après validation du propriétaire',
    actif = true,
    updated_at = now()
WHERE code_regle = 'MOBILISATEUR_FONCIER_PAR_HA';

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
  existing_status text;
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

  -- Commission de vente : une seule commission pour le paiement initial.
  if coalesce(p.est_paiement_initial, false)
     or upper(coalesce(p.type_paiement,'')) in ('PI','PAIEMENT_INITIAL') then
    select id, statut into existing_id, existing_status
    from public.commissions
    where paiement_id = p.id and type_commission = 'acquisition'
    limit 1;

    base_amount := coalesce(c.montant_total_contrat, p.montant_theorique, p.montant_paye, p.montant, 0);
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
    amount := coalesce(amount, 0);

    if existing_id is not null then
      if lower(coalesce(existing_status,'')) <> 'payee' then
        update public.commissions
        set profile_id = pid, client_id = c.id, montant_base = base_amount,
            montant_commission = amount, date_calcul = now(),
            taux_applique = 0, annee_contrat = 1
        where id = existing_id;
      end if;
    elsif amount > 0 then
      insert into public.commissions
        (profile_id, plantation_id, type_commission, montant_base, taux_commission,
         montant_commission, periode, statut, valide_par, date_validation, date_calcul,
         paiement_id, client_id, taux_applique, annee_contrat)
      values
        (pid, p.plantation_id, 'acquisition', base_amount, 0, amount,
         coalesce(p.date_paiement::date, current_date), 'validee',
         coalesce(p.valide_par, auth.uid()), coalesce(p.date_validation, now()),
         now(), p.id, c.id, 0, 1);
    end if;
    perform public.recalculer_portefeuilles_commissions();
    return;
  end if;

  if upper(coalesce(p.type_paiement,'')) <> 'MENSUALITE' or kind in ('essentiel','inconnu') then return; end if;

  select id, statut into existing_id, existing_status
  from public.commissions
  where paiement_id = p.id and type_commission = 'recouvrement_mensuel'
  limit 1;

  if kind = 'partenaire' then
    if coalesce(p.numero_echeance,0) > 0 then
      yr := ceil(p.numero_echeance::numeric / 12.0)::integer;
    elsif c.contrat_debut_at is not null then
      yr := greatest(1, extract(year from age(coalesce(p.date_paiement::date,current_date), c.contrat_debut_at))::integer + 1);
    else
      yr := 1;
    end if;
    yr := greatest(1, least(3, yr));
    rule_key := 'COMMERCIAL_REC_PARTENAIRE_AN' || yr::text;
  else
    -- Formule flexible : taux unique de 2,5 %, sans distinction d'année.
    rule_key := 'COMMERCIAL_REC_FLEXIBLE';
    yr := 1;
  end if;

  select coalesce(taux_pourcentage,0) into rate
  from public.grille_remuneration
  where code_regle = rule_key and actif order by updated_at desc limit 1;

  base_amount := coalesce(p.montant_paye, p.montant, 0);
  amount := round(base_amount * coalesce(rate,0) / 100.0, 2);

  if existing_id is not null then
    if lower(coalesce(existing_status,'')) <> 'payee' then
      update public.commissions
      set profile_id = pid, montant_base = base_amount, taux_commission = rate,
          montant_commission = amount, taux_applique = rate, annee_contrat = yr,
          date_calcul = now()
      where id = existing_id;
    end if;
  elsif amount > 0 then
    insert into public.commissions
      (profile_id, plantation_id, type_commission, montant_base, taux_commission,
       montant_commission, periode, statut, date_calcul, paiement_id, client_id,
       taux_applique, annee_contrat)
    values
      (pid, p.plantation_id, 'recouvrement_mensuel', base_amount, rate, amount,
       coalesce(p.date_paiement::date,current_date), 'calculee', now(), p.id, c.id,
       rate, yr);
  end if;
  perform public.recalculer_portefeuilles_commissions();
end;
$function$;

-- Propagate the revised rules to every eligible payment; paid commissions stay unchanged.
SELECT public.recalculer_commissions_depuis_grille();
