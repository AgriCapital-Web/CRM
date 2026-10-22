-- Enforce explicit formula selection for new and materially changed client offers.
-- Existing signed/custom client contracts are not rewritten.
create or replace function public.validate_client_selected_offer_formula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_formulas jsonb;
begin
  if new.offre_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.offre_id is not distinct from old.offre_id
     and new.formule_code is not distinct from old.formule_code then
    return new;
  end if;

  select formules_configuration
    into v_formulas
    from public.offres
   where id = new.offre_id
     and actif = true;

  if not found then
    raise exception 'L’offre sélectionnée est introuvable ou inactive.'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_formulas) <> 'array'
     or jsonb_array_length(v_formulas) = 0 then
    raise exception 'Aucune formule n’est configurée pour cette offre. Configurez les formules dans Paramètres > Offres.'
      using errcode = '23514';
  end if;

  if coalesce(nullif(btrim(new.formule_code), ''), '') = ''
     or not exists (
       select 1
         from jsonb_array_elements(v_formulas) f(value)
        where f.value->>'code' = new.formule_code
     ) then
    raise exception 'La formule doit être choisie explicitement parmi les formules configurées pour cette offre.'
      using errcode = '23514';
  end if;

  select f.value->>'nom'
    into new.formule_nom
    from jsonb_array_elements(v_formulas) f(value)
   where f.value->>'code' = new.formule_code
   limit 1;

  return new;
end;
$$;

drop trigger if exists trg_validate_client_selected_offer_formula on public.clients;
create trigger trg_validate_client_selected_offer_formula
before insert or update of offre_id, formule_code
on public.clients
for each row
execute function public.validate_client_selected_offer_formula();

-- Do not silently replace a missing/invalid formula with the offer-level shared tariff.
-- The trigger above validates new selections; this check protects all acquisition paths.
create or replace function public.create_acquisition_for_new_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_offre public.offres%rowtype;
  v_formula jsonb;
  v_surface numeric;
  v_pi_par_ha numeric;
  v_total_par_ha numeric;
  v_mensualite_par_ha numeric;
  v_duree integer;
  v_echeancier jsonb;
  v_gestion_type text;
  v_mode text;
begin
  v_surface := coalesce(new.total_hectares, 0);
  if new.offre_id is null or v_surface <= 0 then
    return new;
  end if;
  if coalesce(new.montant_total_contrat, 0) <= 0 then
    raise exception 'Le montant contractuel doit être positif avant de créer une vente.';
  end if;
  if exists (select 1 from public.acquisitions a where a.client_id = new.id) then
    return new;
  end if;

  select * into v_offre from public.offres where id = new.offre_id;
  if not found or v_offre.code is null or v_offre.nom is null then
    raise exception 'Offre absente ou incomplète pour la création de l’acquisition du client %', new.id;
  end if;

  select item.value into v_formula
    from jsonb_array_elements(coalesce(v_offre.formules_configuration, '[]'::jsonb)) item(value)
   where item.value->>'code' = new.formule_code
   limit 1;

  if v_formula is null then
    raise exception 'Formule absente ou non configurée pour l’offre %. Aucune tarification générique ne sera appliquée.', v_offre.nom
      using errcode = '23514';
  end if;

  v_mode := coalesce(new.mode_paiement, 'echeancier');
  v_pi_par_ha := nullif(v_formula->>'montant_pi_par_ha', '')::numeric;
  v_mensualite_par_ha := nullif(v_formula->>'mensualite_par_ha', '')::numeric;
  v_duree := nullif(v_formula->>'duree_paiement_mois', '')::integer;
  v_echeancier := v_formula->'tranches_paiement';
  v_gestion_type := v_formula->>'gestion_type';

  if v_mode = 'comptant' then
    v_pi_par_ha := new.montant_total_contrat / v_surface;
    v_mensualite_par_ha := 0;
    v_duree := 1;
    v_echeancier := '[]'::jsonb;
  end if;

  if v_pi_par_ha is null or v_mensualite_par_ha is null or v_duree is null
     or v_duree <= 0 or v_echeancier is null or jsonb_typeof(v_echeancier) <> 'array' then
    raise exception 'Les paramètres financiers de la formule % sont incomplets.', new.formule_code
      using errcode = '23514';
  end if;

  v_total_par_ha := new.montant_total_contrat / v_surface;

  insert into public.acquisitions (
    client_id, offre_id, offre_code, offre_nom, famille_offre, formule_code, formule_nom, gestion_type,
    necessite_foncier_client, superficie_ha, parcelle_id, lot_id, mode_paiement,
    montant_pi_par_ha, montant_pi_total, montant_total_par_ha, montant_total_contrat,
    mensualite_par_ha, mensualite_montant, duree_paiement_mois, echeancier,
    promotion_id, montant_promo_applique, statut, statut_technique, notes, metadata, created_by, validation_statut
  ) values (
    new.id, v_offre.id, v_offre.code, v_offre.nom, v_offre.famille_offre,
    new.formule_code, v_formula->>'nom', v_gestion_type,
    coalesce(v_offre.necessite_foncier_client, false), v_surface, new.parcelle_id, null, v_mode,
    v_pi_par_ha, coalesce(new.paiement_initial_montant, v_pi_par_ha * v_surface),
    v_total_par_ha, new.montant_total_contrat, v_mensualite_par_ha,
    coalesce(new.mensualite_montant, v_mensualite_par_ha * v_surface), v_duree, v_echeancier,
    new.promotion_id, coalesce(new.montant_promo_applique, 0), 'souscrite', 'en_attente_intervention',
    null, jsonb_build_object('source','clients','client_id',new.id,'created_from_client_workflow',true),
    new.created_by, 'a_valider'
  );

  return new;
end
$function$;
