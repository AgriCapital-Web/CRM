-- RPC authorization is aligned with the effective permission catalogue and row scope.
begin;

CREATE OR REPLACE FUNCTION public.acquisition_current_payment_state(_acquisition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.acquisitions%rowtype;
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
  select * into s from public.acquisitions where id=_acquisition_id;
  if not found then raise exception 'Acquisition introuvable'; end if;
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null
       or not (private.crm_user_has_role_permission(auth.uid(), 'paiements.view')
         or private.crm_user_has_role_permission(auth.uid(), 'clients.view_money')
         or private.crm_user_has_role_permission(auth.uid(), 'finance.view'))
       or not private.can_access_client(auth.uid(),s.client_id)) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;

  v_area:=greatest(0,coalesce(s.superficie_ha,0));
  select
      coalesce((select sum(greatest(coalesce(p.montant_paye,p.montant,0),0))
        from public.paiements p
        where p.acquisition_id=s.id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true),0)
      + coalesce((select sum(greatest(coalesce(al.montant,0),0))
        from public.paiement_acquisition_allocations al
        join public.paiements p on p.id=al.paiement_id
        where al.acquisition_id=s.id and al.type_paiement='PI' and p.statut='valide'),0)
    into v_pi_paid;
  v_pi_balance:=greatest(0,coalesce(s.montant_pi_total,0)-v_pi_paid);

  select
      coalesce((select sum(greatest(coalesce(p.montant_paye,p.montant,0),0))
        from public.paiements p
        where p.acquisition_id=s.id and p.statut='valide' and p.type_paiement='MENSUALITE'),0)
      + coalesce((select sum(greatest(coalesce(al.montant,0),0))
        from public.paiement_acquisition_allocations al
        join public.paiements p on p.id=al.paiement_id
        where al.acquisition_id=s.id and al.type_paiement='MENSUALITE' and p.statut='valide'),0)
    into v_monthly_paid;

  select min(p.created_at::date) into v_month_start
    from public.paiements p
    where p.acquisition_id=s.id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;
  v_month_start:=coalesce(v_month_start,s.created_at::date);

  if s.mode_paiement='echeancier' and v_area>0 and coalesce(s.duree_paiement_mois,0)>0 and v_pi_balance<=0 then
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
    'acquisition_id',s.id,
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
$function$


CREATE OR REPLACE FUNCTION public.activate_client_lot_from_lot(p_lot_id uuid, p_client_id uuid, p_date_activation date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lot public.lots_hectares%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_owner public.proprietaires_terres%rowtype;
  v_client public.clients%rowtype;
  v_activation public.plantation_activations%rowtype;
  v_owner_plantation public.plantations%rowtype;
  v_surface numeric;
  v_agri_share numeric;
  v_allocated numeric;
  v_user uuid:=auth.uid();
  v_owner_plantation_id uuid;
begin
  if auth.role() is distinct from 'service_role' and (v_user is null or not private.crm_user_has_role_permission(v_user, 'plantations.update')) then
    raise exception 'Accès réservé au personnel AgriCapital';
  end if;

  select * into v_lot from public.lots_hectares where id=p_lot_id for update;
  if v_lot.id is null then raise exception 'Lot introuvable'; end if;
  if v_lot.client_id is distinct from p_client_id then raise exception 'Le lot n''est pas attribué à ce client'; end if;

  select * into v_client from public.clients where id=p_client_id;
  if v_client.id is null then raise exception 'Client introuvable'; end if;
  if auth.role() is distinct from 'service_role' and (    not private.can_access_client(v_user, p_client_id)    or not private.can_access_parcelle(v_user, v_lot.parcelle_id)  ) then raise exception 'Client ou parcelle hors de votre périmètre.' using errcode='42501'; end if;
  if upper(coalesce(v_client.formule_code,'')) not like 'PALMINVEST%' then
    raise exception 'L’activation d’une part propriétaire est réservée aux souscriptions PalmInvest.';
  end if;

  select * into v_parcelle from public.parcelles where id=v_lot.parcelle_id for update;
  if v_parcelle.id is null then raise exception 'Parcelle du lot introuvable'; end if;

  select * into v_owner from public.proprietaires_terres where id=v_parcelle.proprietaire_id;

  v_surface:=coalesce(v_lot.surface_ha,v_client.total_hectares,1);
  v_agri_share:=greatest(0,coalesce(v_parcelle.surface_agricapital_ha,v_parcelle.surface_totale_ha/2,0));

  select coalesce(sum(l.surface_ha),0) into v_allocated
  from public.lots_hectares l
  where l.parcelle_id=v_parcelle.id and l.id<>v_lot.id
    and l.client_id is not null and l.statut='attribue';

  if v_agri_share>0 and v_allocated+v_surface>v_agri_share then
    raise exception 'La part AgriCapital disponible de la parcelle est insuffisante';
  end if;

  select * into v_activation from public.plantation_activations where lot_id=v_lot.id;
  if v_activation.id is null then
    insert into public.plantation_activations(
      lot_id,parcelle_id,proprietaire_id,client_id,surface_client_ha,surface_proprietaire_ha,
      statut,date_activation,created_by,updated_by
    ) values (
      v_lot.id,v_parcelle.id,v_parcelle.proprietaire_id,p_client_id,v_surface,v_surface,
      'active',coalesce(p_date_activation,current_date),v_user,v_user
    ) returning * into v_activation;
  else
    update public.plantation_activations
    set client_id=p_client_id,proprietaire_id=v_parcelle.proprietaire_id,statut='active',
        surface_client_ha=v_surface,surface_proprietaire_ha=v_surface,
        date_activation=coalesce(p_date_activation,date_activation),
        updated_by=v_user,updated_at=now()
    where id=v_activation.id returning * into v_activation;
  end if;

  update public.lots_hectares
  set statut='attribue',date_attribution=coalesce(date_attribution,p_date_activation)
  where id=v_lot.id;

  update public.parcelles
  set surface_attribuee_ha=(
    select coalesce(sum(l.surface_ha),0) from public.lots_hectares l
    where l.parcelle_id=v_parcelle.id and l.client_id is not null and l.statut='attribue'
  ),updated_at=now()
  where id=v_parcelle.id;

  update public.clients
  set parcelle_id=coalesce(parcelle_id,v_parcelle.id),compte_actif=true,
      statut=case when lower(coalesce(statut,'')) in ('inactif','en_attente_pi','en_attente_paiement') then 'actif' else statut end,
      statut_global=case when lower(coalesce(statut_global,'')) in ('inactif','en_attente_pi','en_attente_paiement') then 'actif' else statut_global end,
      pi_paye_at=coalesce(pi_paye_at,coalesce(p_date_activation,current_date)::timestamptz),
      updated_at=now()
  where id=p_client_id;

  if v_owner.id is not null then
    v_owner_plantation_id := public.sync_owner_plantation_for_shared_parcel(v_parcelle.id, v_owner.id, v_user);
  end if;

  return jsonb_build_object(
    'activation_id',v_activation.id,'lot_id',v_lot.id,'parcelle_id',v_parcelle.id,
    'client_id',p_client_id,'owner_plantation_id',v_owner_plantation_id,
    'surface_client_ha',v_surface,'surface_proprietaire_ha',v_surface
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.allocate_acquisition_lot(p_acquisition_id uuid, p_lot_id uuid, p_surface_ha numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_lot public.lots_hectares%ROWTYPE;
  v_surface numeric;
  v_allocated numeric;
  v_contract numeric;
  v_remaining numeric;
  v_family text;
  v_allocation_id uuid;
  v_today date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour affecter un lot.';
  END IF;

  SELECT * INTO v_acquisition
  FROM public.acquisitions
  WHERE id=p_acquisition_id
  FOR UPDATE;
  IF v_acquisition.id IS NULL THEN
    RAISE EXCEPTION 'Acquisition introuvable.';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id=v_acquisition.client_id;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client de l’acquisition introuvable.';
  END IF;

  SELECT * INTO v_lot FROM public.lots_hectares WHERE id=p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'Lot foncier introuvable.';
  END IF;

  IF NOT (private.crm_is_global_admin(auth.uid()) OR (private.crm_user_has_role_permission(auth.uid(), 'parcelles.update') AND private.can_access_parcelle(auth.uid(),v_lot.parcelle_id) AND private.can_access_client(auth.uid(),v_acquisition.client_id))) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas affecter un lot hors de votre périmètre technique.';
  END IF;

  IF v_acquisition.statut<>'active' OR v_acquisition.validation_statut<>'valide' THEN
    RAISE EXCEPTION 'Seule une acquisition validée et active peut recevoir un lot supplémentaire.';
  END IF;

  IF NOT (
    coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'deferred_land_allocation')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'foncier_convention_en_attente')::boolean,false)
  ) THEN
    RAISE EXCEPTION 'Cette acquisition ne permet pas encore une affectation foncière progressive.';
  END IF;

  v_family:=upper(coalesce(v_acquisition.famille_offre,'')||' '||coalesce(v_acquisition.offre_code,'')||' '||coalesce(v_acquisition.formule_code,''));
  v_contract:=coalesce(v_acquisition.superficie_ha,v_client.total_hectares,v_client.superficie_ha,0);
  v_surface:=coalesce(p_surface_ha,v_lot.surface_disponible_ha,v_lot.surface_ha,0);

  IF v_surface<=0 OR v_surface>coalesce(v_lot.surface_disponible_ha,0)+0.000001 THEN
    RAISE EXCEPTION 'La surface demandée dépasse la surface disponible sur ce lot.';
  END IF;

  IF v_family LIKE '%PALMINVEST%' AND (
    abs(coalesce(v_lot.surface_ha,0)-1)>0.000001 OR abs(v_surface-1)>0.000001
  ) THEN
    RAISE EXCEPTION 'Un lot PalmInvest doit être attribué en totalité, soit 1 ha.';
  END IF;

  IF coalesce(v_lot.part_type,'agricapital')<>'agricapital' THEN
    RAISE EXCEPTION 'Seule la quote-part foncière AgriCapital peut être affectée à cette acquisition.';
  END IF;

  IF v_lot.client_id IS NOT NULL OR v_lot.acquisition_id IS NOT NULL OR lower(coalesce(v_lot.statut,''))<>'disponible' THEN
    RAISE EXCEPTION 'Ce lot a déjà été affecté ou n’est plus disponible.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
    JOIN public.parcelles p ON p.id=cf.parcelle_id
    WHERE cf.id=v_lot.convention_id
      AND cf.parcelle_id=v_lot.parcelle_id
      AND cf.statut='active'
      AND p.proprietaire_id=cf.proprietaire_id
  ) THEN
    RAISE EXCEPTION 'Une convention foncière active et cohérente est requise pour cette nouvelle parcelle.';
  END IF;

  SELECT coalesce(sum(al.surface_ha),0) INTO v_allocated
  FROM public.acquisition_lots al
  WHERE al.acquisition_id=p_acquisition_id AND al.client_id=v_acquisition.client_id;

  IF v_allocated+v_surface>v_contract+0.000001 THEN
    RAISE EXCEPTION 'Cette affectation dépasserait la superficie contractuelle. Il reste % ha à affecter.',greatest(v_contract-v_allocated,0);
  END IF;

  INSERT INTO public.acquisition_lots(client_id,acquisition_id,lot_id,surface_ha,date_attribution,notes,created_by)
  VALUES(v_acquisition.client_id,p_acquisition_id,p_lot_id,v_surface,v_today,
    coalesce(p_notes,'Affectation foncière progressive.'),auth.uid())
  RETURNING id INTO v_allocation_id;

  UPDATE public.lots_hectares
  SET client_id=v_acquisition.client_id,
      acquisition_id=p_acquisition_id,
      statut='attribue',
      date_attribution=v_today,
      surface_attribuee_ha=coalesce(surface_attribuee_ha,0)+v_surface,
      updated_at=now()
  WHERE id=p_lot_id;

  v_allocated:=v_allocated+v_surface;
  v_remaining:=greatest(v_contract-v_allocated,0);

  UPDATE public.acquisitions
  SET lot_id=coalesce(lot_id,p_lot_id),
      parcelle_id=coalesce(parcelle_id,v_lot.parcelle_id),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'surface_contractuelle_ha',v_contract,
        'surface_fonciere_allouee_ha',v_allocated,
        'surface_fonciere_restante_ha',v_remaining,
        'foncier_a_attribuer_plus_tard',v_remaining>0.000001,
        'multi_parcelle_allocation',true,
        'lot_cible_id',coalesce(metadata->>'lot_cible_id',lot_id::text,p_lot_id::text),
        'technical_intervention_pending',true,
        'land_allocation_note',format('Contrat de %s ha. %s ha affectés sur plusieurs parcelles; %s ha restent à affecter.',v_contract,v_allocated,v_remaining)
      ),
      updated_at=now()
  WHERE id=p_acquisition_id;

  UPDATE public.clients
     SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'surface_contractuelle_ha',v_contract,'surface_fonciere_allouee_ha',v_allocated,
       'surface_fonciere_restante_ha',v_remaining,'foncier_a_attribuer_plus_tard',v_remaining>0.000001,
       'deferred_land_allocation',true,'technical_intervention_pending',true
     ),updated_at=now()
   WHERE id=v_acquisition.client_id;

  RETURN jsonb_build_object(
    'allocation_id',v_allocation_id,
    'acquisition_id',p_acquisition_id,
    'lot_id',p_lot_id,
    'parcelle_id',v_lot.parcelle_id,
    'surface_attribuee_ha',v_surface,
    'surface_fonciere_allouee_ha',v_allocated,
    'surface_fonciere_restante_ha',v_remaining,
    'surface_contractuelle_ha',v_contract
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.create_client_acquisition(p_client_id uuid, p_offre_id uuid, p_formule_code text, p_superficie_ha numeric, p_mode_paiement text DEFAULT 'echeancier'::text, p_parcelle_id uuid DEFAULT NULL::uuid, p_lot_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_client public.clients%rowtype;
  v_offer public.offres%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_formula jsonb := '{}'::jsonb;
  v_tranches jsonb := '[]'::jsonb;
  v_schedule jsonb := '[]'::jsonb;
  v_tranche jsonb;
  v_tranche_type text;
  v_promo record;
  v_promo_id uuid;
  v_promo_name text;
  v_promo_target text;
  v_pct numeric := 0;
  v_fixed numeric := 0;
  v_pi_base numeric := 0;
    v_total_base numeric := 0;
  v_monthly_base numeric := 0;
  v_pi_effective numeric := 0;
  v_total_effective numeric := 0;
  v_monthly_effective numeric := 0;
  v_ratio numeric := 1;
  v_first_monthly numeric := 0;
  v_duration integer := 0;
  v_surface numeric := greatest(coalesce(p_superficie_ha,0),0);
  v_mode text := 'echeancier';
  v_total_pi numeric := 0;
  v_total_contract numeric := 0;
  v_promo_amount numeric := 0;
  v_acquisition_id uuid;
  v_payment_id uuid;
  v_land_required boolean;
  v_required_lots integer;
  v_available_lot_ids uuid[];
  v_available_lot_count integer := 0;
  v_first_lot_number integer;
  v_last_lot_number integer;
begin
  if v_user is null or not private.crm_user_has_role_permission(v_user, 'clients.create') then
    raise exception 'Accès réservé au personnel AgriCapital' using errcode='42501';
  end if;
  if not private.can_access_client(v_user, p_client_id) then
    raise exception 'Ce client ne fait pas partie de votre secteur' using errcode='42501';
  end if;
  if v_surface <= 0 then raise exception 'La superficie doit être supérieure à zéro'; end if;
  if lower(coalesce(p_mode_paiement,'echeancier')) <> 'echeancier' then raise exception 'Seul l’échéancier contractuel est autorisé'; end if;

  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'Client introuvable'; end if;
  select * into v_offer from public.offres where id=p_offre_id and actif=true;
  if v_offer.id is null then raise exception 'L’offre choisie n’est plus active'; end if;

  if jsonb_typeof(coalesce(v_offer.formules_configuration,'[]'::jsonb))='array'
     and jsonb_array_length(coalesce(v_offer.formules_configuration,'[]'::jsonb)) > 0 then
    select f.value into v_formula
    from jsonb_array_elements(v_offer.formules_configuration) f(value)
    where f.value->>'code'=p_formule_code
    limit 1;
    if v_formula is null then raise exception 'La formule choisie ne correspond pas à cette offre'; end if;
  else
    if coalesce(p_formule_code,'') not in (coalesce(v_offer.formule_code,''),v_offer.code) then
      raise exception 'La formule choisie ne correspond pas à cette offre';
    end if;
    v_formula := jsonb_build_object(
      'code',coalesce(v_offer.formule_code,v_offer.code),
      'nom',coalesce(v_offer.formule_nom,v_offer.nom),
      'gestion_type',v_offer.gestion_type
    );
  end if;

  v_land_required := coalesce(v_offer.necessite_foncier_client,false);
  if v_land_required then
    if p_lot_id is not null then raise exception 'Cette offre utilise le terrain du client : aucun lot partenaire ne doit être attribué.'; end if;
    if p_parcelle_id is not null then
      select * into v_parcelle from public.parcelles where id=p_parcelle_id;
      if v_parcelle.id is null then raise exception 'Parcelle introuvable'; end if;
      if v_parcelle.proprietaire_id is not null then
        if v_client.proprietaire_id is null or v_parcelle.proprietaire_id is distinct from v_client.proprietaire_id then
          raise exception 'La parcelle choisie appartient à un propriétaire partenaire différent du client.';
        end if;
      elsif lower(coalesce(v_parcelle.mode_surface,'')) not in ('foncier','propriete_client')
        and v_client.parcelle_id is distinct from v_parcelle.id then
        raise exception 'La parcelle choisie doit être identifiée comme propriété du client.';
      end if;
    elsif v_client.parcelle_id is not null then
      select * into v_parcelle from public.parcelles where id=v_client.parcelle_id;
      if v_parcelle.id is not null and (
        (v_client.proprietaire_id is not null and v_parcelle.proprietaire_id=v_client.proprietaire_id)
        or (v_parcelle.proprietaire_id is null and lower(coalesce(v_parcelle.mode_surface,'')) in ('foncier','propriete_client'))
      ) then
        p_parcelle_id:=v_parcelle.id;
      end if;
    end if;
  else
    if p_lot_id is null then raise exception 'Cette offre nécessite de sélectionner le lot de départ sur une parcelle partenaire.'; end if;
    select * into v_lot from public.lots_hectares where id=p_lot_id for update;
    if v_lot.id is null then raise exception 'Lot introuvable'; end if;
    if v_lot.client_id is not null or lower(coalesce(v_lot.statut,'')) not in ('disponible','libre') or v_lot.acquisition_id is not null then
      raise exception 'Ce lot n’est plus disponible. Actualisez la liste et choisissez un autre lot.';
    end if;
    if v_lot.parcelle_id is null then raise exception 'Le lot doit être rattaché à une parcelle.'; end if;
    select * into v_parcelle from public.parcelles where id=v_lot.parcelle_id for update;
    if v_parcelle.id is null or v_parcelle.proprietaire_id is null then
      raise exception 'Le lot doit appartenir à une parcelle partenaire dont le propriétaire est enregistré.';
    end if;
    if p_parcelle_id is not null and p_parcelle_id is distinct from v_parcelle.id then
      raise exception 'Le lot choisi ne correspond pas à la parcelle sélectionnée.';
    end if;
    if upper(coalesce(v_offer.famille_offre,v_offer.code,''))='PALMINVEST' then
      if abs(v_surface-round(v_surface))>0.0001 or v_surface<1 then
        raise exception 'PalmInvest doit être attribué par lots entiers de 1 hectare.';
      end if;
      v_required_lots:=round(v_surface)::integer;
      select array_agg(x.id order by x.numero_h),count(*)::integer,min(x.numero_h),max(x.numero_h)
        into v_available_lot_ids,v_available_lot_count,v_first_lot_number,v_last_lot_number
        from (
          select l.id,l.numero_h
            from public.lots_hectares l
           where l.parcelle_id=v_parcelle.id
             and coalesce(l.part_type,'agricapital')='agricapital'
             and l.client_id is null
             and lower(coalesce(l.statut,'')) in ('disponible','libre')
             and l.acquisition_id is null
             and l.numero_h>=v_lot.numero_h
           order by l.numero_h
           limit v_required_lots
           for update
        ) x;
      if coalesce(v_available_lot_count,0)<>v_required_lots
         or v_first_lot_number is distinct from v_lot.numero_h
         or v_last_lot_number-v_first_lot_number+1<>v_required_lots
         or v_available_lot_ids[1] is distinct from p_lot_id then
        raise exception 'Il faut sélectionner un début de série disposant de % lots contigus de 1 ha. Aucun lot ne sera attribué tant que la série complète n’est pas disponible.',v_required_lots;
      end if;
    else
      if abs(coalesce(v_lot.surface_ha,0)-v_surface)>0.0001 then
        raise exception 'La superficie demandée doit correspondre à la superficie du lot sélectionné.';
      end if;
      v_available_lot_ids:=array[p_lot_id]::uuid[];
      v_available_lot_count:=1;
      v_first_lot_number:=v_lot.numero_h;
      v_last_lot_number:=v_lot.numero_h;
    end if;
    p_parcelle_id:=v_parcelle.id;
  end if;

  v_pi_base := greatest(0,coalesce(nullif(v_formula->>'montant_pi_par_ha','')::numeric,v_offer.montant_pi_par_ha,0));
  v_total_base := greatest(0,coalesce(nullif(v_formula->>'montant_total_par_ha','')::numeric,v_offer.montant_total_par_ha,0));
  v_monthly_base := greatest(0,coalesce(nullif(v_formula->>'mensualite_par_ha','')::numeric,v_offer.mensualite_par_ha,0));
  v_duration := greatest(0,coalesce(nullif(v_formula->>'duree_paiement_mois','')::integer,v_offer.duree_paiement_mois,0));
  if jsonb_typeof(v_formula->'tranches_paiement')='array' then
    v_tranches := v_formula->'tranches_paiement';
  else
    v_tranches := coalesce(v_offer.tranches_paiement,'[]'::jsonb);
  end if;

  select p.* into v_promo
  from public.promotions p
  where p.active=true and p.date_debut<=now() and p.date_fin>=now()
    and (coalesce(p.applique_toutes_offres,false)
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(p.offre_ids,'[]'::jsonb)) x(value)
        where x.value in (v_offer.id::text,v_offer.code)
      ))
  order by
    case
      when lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special')
      then least(v_total_base,greatest(0,v_total_base)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
      else least(v_pi_base,greatest(0,v_pi_base)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
    end desc,
    coalesce(p.pourcentage_reduction,0) desc,
    coalesce(p.montant_fixe_reduction,0) desc,
    p.created_at desc
  limit 1;

  if found then
    v_promo_id := v_promo.id;
    v_promo_name := v_promo.nom;
    v_pct := greatest(0,coalesce(v_promo.pourcentage_reduction,0));
    v_fixed := greatest(0,coalesce(v_promo.montant_fixe_reduction,0));
    v_promo_target := case
      when lower(coalesce(v_promo.cible,v_promo.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special') then 'cout_global'
      else 'paiement_initial' end;
  end if;

  v_total_effective := v_total_base;
  v_pi_effective := v_pi_base;
  if v_promo_id is not null and v_promo_target='cout_global' then
    v_total_effective := greatest(v_total_base*(1-v_pct/100)-v_fixed,0);
    v_pi_effective := least(v_pi_base,v_total_effective);
  elsif v_promo_id is not null then
    v_pi_effective := greatest(v_pi_base*(1-v_pct/100)-v_fixed,0);
    v_total_effective := greatest(v_total_base-(v_pi_base-v_pi_effective),0);
  end if;

  if v_mode='echeancier' and v_total_base>v_pi_base then
    v_ratio := greatest(v_total_effective-least(v_pi_effective,v_total_effective),0)/greatest(v_total_base-v_pi_base,0);
  end if;
  for v_tranche in select value from jsonb_array_elements(v_tranches) as t(value)
      order by coalesce((value->>'mois_debut')::integer,999999)
    loop
      v_tranche_type := lower(coalesce(v_tranche->>'type',''));
      if coalesce(nullif(v_tranche->>'mensualite_par_ha','')::numeric,0)>0
         and v_tranche_type not in ('paiement_initial','apres_trouaison','paiement_apres_trouaison') then
        v_monthly_effective := coalesce(nullif(v_tranche->>'mensualite_par_ha','')::numeric,0)
          * case when v_promo_target='cout_global' and v_promo_id is not null then v_ratio else 1 end;
        if v_first_monthly=0 then v_first_monthly:=v_monthly_effective; end if;
        v_tranche := jsonb_set(v_tranche,'{mensualite_par_ha_effective}',to_jsonb(v_monthly_effective),true);
        v_tranche := jsonb_set(v_tranche,'{total_periode_par_ha_effectif}',to_jsonb(
          v_monthly_effective*coalesce(nullif(v_tranche->>'mois','')::numeric,
            greatest(0,coalesce(nullif(v_tranche->>'mois_fin','')::numeric,0)-coalesce(nullif(v_tranche->>'mois_debut','')::numeric,1)+1))
        ),true);
      end if;
      v_schedule := v_schedule || jsonb_build_array(v_tranche);
    end loop;

  v_total_pi := round(v_pi_effective*v_surface,2);
  v_total_contract := round(v_total_effective*v_surface,2);
  v_promo_amount := greatest(0,round((v_total_base-v_total_effective)*v_surface,2));

  insert into public.acquisitions(
    client_id,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,gestion_type,
    necessite_foncier_client,superficie_ha,parcelle_id,lot_id,mode_paiement,
    montant_pi_par_ha,montant_pi_total,montant_total_par_ha,montant_total_contrat,
    mensualite_par_ha,mensualite_montant,duree_paiement_mois,echeancier,promotion_id,montant_promo_applique,
    statut,statut_technique,notes,created_by,metadata
  ) values (
    v_client.id,v_offer.id,v_offer.code,v_offer.nom,v_offer.famille_offre,
    coalesce(v_formula->>'code',v_offer.formule_code,v_offer.code),
    coalesce(v_formula->>'nom',v_offer.formule_nom,v_offer.nom),
    coalesce(v_formula->>'gestion_type',v_offer.gestion_type),
    v_land_required,v_surface,p_parcelle_id,p_lot_id,v_mode,
    v_pi_effective,v_total_pi,v_total_effective,v_total_contract,
    v_first_monthly,v_first_monthly*v_surface,v_duration,v_schedule,v_promo_id,v_promo_amount,
    'en_attente_activation','en_attente_intervention',nullif(trim(coalesce(p_notes,'')),''),v_user,
    jsonb_build_object('promotion_nom',v_promo_name,'promotion_cible',v_promo_target,'reduction_pct',v_pct,
      'montant_total_base',v_total_base*v_surface,'montant_pi_base',v_pi_base*v_surface,
      'lot_ids',to_jsonb(coalesce(v_available_lot_ids,array[]::uuid[])),
      'lot_references',(select coalesce(jsonb_agg(v_parcelle.id_unique||'-L'||lpad(l.numero_h::text,2,'0') order by l.numero_h),'[]'::jsonb) from public.lots_hectares l where l.id=any(coalesce(v_available_lot_ids,array[]::uuid[]))),
      'lot_reference_group',case when coalesce(v_available_lot_count,0)>1 then v_parcelle.id_unique||'-L'||lpad(v_first_lot_number::text,2,'0')||'-'||lpad(v_last_lot_number::text,2,'0') else null end)
  ) returning id into v_acquisition_id;

  if p_lot_id is not null then
    if v_available_lot_ids is null then
      v_available_lot_ids:=array[p_lot_id]::uuid[];
      v_available_lot_count:=1;
      v_first_lot_number:=v_lot.numero_h;
      v_last_lot_number:=v_lot.numero_h;
    end if;
    update public.lots_hectares set client_id=v_client.id,statut='attribue',
      date_attribution=coalesce(date_attribution,current_date),acquisition_id=v_acquisition_id,updated_at=now()
    where id=any(v_available_lot_ids);
    insert into public.acquisition_lots(client_id,lot_id,surface_ha,notes,created_by,acquisition_id)
    select v_client.id,l.id,coalesce(l.surface_ha,1),'Attribution de lot(s) à la souscription '||v_acquisition_id::text,v_user,v_acquisition_id
      from public.lots_hectares l where l.id=any(v_available_lot_ids)
    on conflict (client_id,lot_id) do update
      set acquisition_id=excluded.acquisition_id,surface_ha=excluded.surface_ha,notes=excluded.notes;
  end if;

  if v_total_pi>0 then
    insert into public.paiements(
      client_id,acquisition_id,type_paiement,montant,montant_paye,montant_theorique,
      statut,mode_paiement,parcours,est_paiement_initial,phase,date_echeance,metadata,created_by
    ) values (
      v_client.id,v_acquisition_id,'PI',v_total_pi,0,v_total_pi,'en_attente',
      v_mode,coalesce(v_offer.famille_offre,v_offer.code),true,'paiement_initial',current_date,
      jsonb_build_object('source','acquisition_supplementaire','acquisition_id',v_acquisition_id,
        'offre_id',v_offer.id,'offre_code',v_offer.code,'formule_code',coalesce(v_formula->>'code',v_offer.formule_code,v_offer.code),
        'superficie_ha',v_surface,'montant_total_contrat',v_total_contract),v_user
    ) returning id into v_payment_id;
  end if;

  update public.clients c
     set montant_total_contrat=coalesce((select sum(a.montant_total_contrat) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         paiement_initial_montant=coalesce((select sum(a.montant_pi_total) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         montant_pi_total=coalesce((select sum(a.montant_pi_total) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         mensualite_montant=coalesce((select sum(a.mensualite_montant) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         duree_paiement_mois=coalesce((select max(a.duree_paiement_mois) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         updated_at=now()
   where c.id=v_client.id;

  return jsonb_build_object(
    'acquisition_id',v_acquisition_id,'paiement_initial_id',v_payment_id,
    'client_id',v_client.id,'offre_id',v_offer.id,'formule_code',coalesce(v_formula->>'code',v_offer.formule_code,v_offer.code),
    'superficie_ha',v_surface,'montant_pi_total',v_total_pi,'montant_total_contrat',v_total_contract,
    'mensualite_montant',v_first_monthly*v_surface,'mode_paiement',v_mode,
    'parcelle_id',p_parcelle_id,'lot_id',p_lot_id,'statut_technique','en_attente_intervention'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.create_paiement_initial(_client_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_existing_plantation uuid;
  v_existing_acquisition uuid;
  v_existing_status text;
  v_rate numeric := 0;
  v_hectares numeric := 0;
  v_amount numeric := 0;
  v_payment_id uuid;
  v_client public.clients%rowtype;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR NOT (       private.crm_user_has_role_permission(auth.uid(), 'clients.validate')       OR private.crm_user_has_role_permission(auth.uid(), 'paiements.create')       OR private.crm_user_has_role_permission(auth.uid(), 'paiements.record')     )) THEN
    RAISE EXCEPTION 'Accès refusé : création du Paiement initial réservée au personnel autorisé'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT private.can_access_client(auth.uid(), _client_id) THEN
    RAISE EXCEPTION 'Client hors de votre périmètre.' USING errcode = '42501';
  END IF;
  IF v_client.validation_statut IS DISTINCT FROM 'valide' THEN
    RAISE EXCEPTION 'Le dossier client doit être validé avant la création du Paiement initial.';
  END IF;
  IF v_client.offre_id IS NULL THEN
    RAISE EXCEPTION 'Une offre doit être définie avant de créer le Paiement initial.';
  END IF;

  SELECT coalesce(o.pi_effectif,0) INTO v_rate
  FROM public.offre_prix_effectif() o
  WHERE o.offre_id = v_client.offre_id;
  v_rate := greatest(coalesce(v_rate,0),0);

  SELECT greatest(
    coalesce(v_client.total_hectares,0),
    coalesce((SELECT sum(greatest(coalesce(p.superficie_ha,0),0))
              FROM public.plantations p
              WHERE p.client_id = _client_id AND p.acquisition_id IS NULL),0)
  ) INTO v_hectares;

  IF coalesce(v_hectares,0) <= 0 THEN
    RAISE EXCEPTION 'La superficie contractuelle doit être renseignée avant le Paiement initial.';
  END IF;

  v_amount := round(v_rate * v_hectares,2);

  SELECT id, plantation_id, acquisition_id, statut
  INTO v_existing, v_existing_plantation, v_existing_acquisition, v_existing_status
  FROM public.paiements
  WHERE client_id = _client_id
    AND type_paiement = 'PI'
    AND coalesce(est_paiement_initial,false) = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    IF v_existing_plantation IS NULL AND v_existing_acquisition IS NULL
       AND v_existing_status = 'en_attente' THEN
      UPDATE public.paiements
      SET montant = v_amount,
          montant_theorique = v_amount,
          montant_paye = CASE WHEN v_amount = 0 THEN 0 ELSE montant_paye END,
          statut = CASE WHEN v_amount = 0 THEN 'valide' ELSE 'en_attente' END,
          mode_paiement = CASE WHEN v_amount = 0 THEN 'Promotion' ELSE mode_paiement END,
          date_paiement = CASE WHEN v_amount = 0 THEN coalesce(date_paiement,now()) ELSE date_paiement END,
          date_validation = CASE WHEN v_amount = 0 THEN coalesce(date_validation,now()) ELSE date_validation END,
          metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
            'source','client_validation','pre_activation',true,'hectares',v_hectares,'pi_par_ha',v_rate,'pi_offert',v_amount=0
          ),
          updated_at = now()
      WHERE id = v_existing;
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.paiements(
    client_id, type_paiement, montant, montant_theorique, montant_paye, statut,
    est_paiement_initial, plantation_id, acquisition_id, mode_paiement,
    date_paiement, date_validation, metadata
  )
  VALUES (
    _client_id, 'PI', v_amount, v_amount,
    CASE WHEN v_amount = 0 THEN 0 ELSE NULL END,
    CASE WHEN v_amount = 0 THEN 'valide' ELSE 'en_attente' END,
    true, NULL, NULL,
    CASE WHEN v_amount = 0 THEN 'Promotion' ELSE NULL END,
    CASE WHEN v_amount = 0 THEN now() ELSE NULL END,
    CASE WHEN v_amount = 0 THEN now() ELSE NULL END,
    jsonb_build_object('source','client_validation','pre_activation',true,'hectares',v_hectares,'pi_par_ha',v_rate,'pi_offert',v_amount=0)
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_client_contracts(_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record;o record;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT (private.crm_user_has_role_permission(auth.uid(), 'clients.create') OR private.crm_user_has_role_permission(auth.uid(), 'clients.update') OR private.crm_user_has_role_permission(auth.uid(), 'clients.validate')) THEN RAISE EXCEPTION 'Accès refusé' USING errcode='42501'; END IF;
 SELECT * INTO s FROM public.clients WHERE id=_client_id; IF s IS NULL THEN RETURN; END IF; IF auth.uid() IS NOT NULL AND NOT private.can_access_client(auth.uid(), _client_id) THEN RAISE EXCEPTION 'Client hors de votre périmètre.' USING errcode='42501'; END IF;
 SELECT * INTO o FROM public.offres WHERE id=s.offre_id; IF o IS NULL THEN RETURN; END IF;
 IF o.contrat_acquisition_requis THEN
  INSERT INTO public.client_contracts(client_id,type_contrat,statut) VALUES(s.id,'acquisition_client','a_preparer') ON CONFLICT(client_id,type_contrat) DO NOTHING;
 END IF;
 IF o.contrat_accompagnement_requis THEN
  INSERT INTO public.client_contracts(client_id,type_contrat,statut) VALUES(s.id,'accompagnement_agricole','a_preparer') ON CONFLICT(client_id,type_contrat) DO NOTHING;
 END IF;
END $function$


CREATE OR REPLACE FUNCTION public.ensure_technical_preceding_steps(p_plantation_id uuid, p_reference_date date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plant public.plantations%rowtype;
  v_family text;
  v_date date;
  v_code text;
  v_codes text[];
  v_existing_id uuid;
  v_added integer:=0;
  v_note text:='[AUTO_PREPLANT] Étape antérieure confirmée réalisée avant la mise en terre. Date exacte non communiquée ; la date affichée correspond à la date connue de mise en terre.';
BEGIN
  SELECT * INTO v_plant FROM public.plantations WHERE id=p_plantation_id;
  IF NOT FOUND OR v_plant.client_id IS NULL THEN RETURN 0; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT (      private.crm_user_has_role_permission(auth.uid(), 'rapports.manage_technique') OR       private.crm_user_has_role_permission(auth.uid(), 'plantations.update')) THEN
      RAISE EXCEPTION 'Permission technique insuffisante.' USING errcode='42501';
    END IF;
    IF NOT private.can_access_client(auth.uid(), v_plant.client_id) THEN
      RAISE EXCEPTION 'Plantation hors de votre périmètre.' USING errcode='42501';
    END IF;
  END IF;

  SELECT upper(coalesce(a.famille_offre,c.famille_offre,a.formule_code,c.formule_code,c.offre_code,''))
    INTO v_family
  FROM public.clients c
  LEFT JOIN public.acquisitions a ON a.id=v_plant.acquisition_id
  WHERE c.id=v_plant.client_id;

  IF coalesce(v_family,'')='' AND v_plant.parcelle_id IS NOT NULL THEN
    SELECT upper(coalesce(a.famille_offre,a.formule_code))
      INTO v_family
    FROM public.acquisitions a
    WHERE a.parcelle_id=v_plant.parcelle_id
      AND lower(coalesce(a.statut,'')) NOT IN ('annule','annulée','rejete','rejetee')
    ORDER BY a.created_at DESC
    LIMIT 1;
  END IF;

  v_date:=coalesce(v_plant.date_plantation,p_reference_date);
  IF v_date IS NULL THEN RETURN 0; END IF;

  v_codes:=ARRAY['validation_parcelle','piquetage','trouaison'];
  IF coalesce(v_family,'') LIKE 'PALMINVEST%' OR coalesce(v_family,'') LIKE 'TERRAPALM%' THEN
    v_codes:=ARRAY['validation_parcelle','defrichage','nettoyage','piquetage','trouaison'];
  END IF;

  FOREACH v_code IN ARRAY v_codes LOOP
    SELECT it.id INTO v_existing_id
    FROM public.interventions_techniques it
    WHERE it.plantation_id=v_plant.id AND it.type_intervention=v_code
    ORDER BY CASE
      WHEN lower(coalesce(it.statut,'')) IN ('realisee','réalisée','realise','réalisé','terminee','terminé','validee','validée','complete','achevee','achevée') THEN 0
      ELSE 1 END,
      it.created_at ASC
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.interventions_techniques(
        plantation_id,client_id,acquisition_id,parcelle_id,type_intervention,
        date_intervention,observations,cout,statut
      ) VALUES (
        v_plant.id,v_plant.client_id,v_plant.acquisition_id,v_plant.parcelle_id,
        v_code,v_date,v_note,0,'realisee'
      );
      v_added:=v_added+1;
    ELSE
      UPDATE public.interventions_techniques
      SET statut='realisee',
          observations=CASE
            WHEN position('[AUTO_PREPLANT]' in coalesce(observations,''))>0 THEN observations
            ELSE concat_ws(E'\n',nullif(observations,''),v_note)
          END,
          updated_at=now()
      WHERE id=v_existing_id
        AND lower(coalesce(statut,'')) NOT IN ('realisee','réalisée','realise','réalisé','terminee','terminé','validee','validée','complete','achevee','achevée');
      IF FOUND THEN v_added:=v_added+1; END IF;
    END IF;
  END LOOP;
  RETURN v_added;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_client_effective_pi(_client_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     and c.user_id is distinct from auth.uid()
     and not (private.crm_user_has_role_permission(auth.uid(), 'clients.view')
       and private.can_access_client(auth.uid(), _client_id)) then
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
  order by
    case
      when lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special')
      then least(base_total,greatest(0,base_total)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
      else least(base_pi,greatest(0,base_pi)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
    end desc,
    coalesce(p.pourcentage_reduction, 0) desc,
    coalesce(p.montant_fixe_reduction, 0) desc,
    p.created_at desc
  limit 1;

  if promo.id is null then return base_pi; end if;
  if promo.cible = 'cout_global' then
    effective_pi := least(base_pi, greatest(base_total * (1 - promo.pct / 100.0) - promo.fixe, 0));
  else
    effective_pi := greatest(base_pi * (1 - promo.pct / 100.0) - promo.fixe, 0);
  end if;
  return greatest(0, least(base_total, effective_pi));
end
$function$


CREATE OR REPLACE FUNCTION public.review_acquisition_validation(p_acquisition_id uuid, p_action text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_acquisition public.acquisitions%rowtype;
  v_user uuid := auth.uid();
  v_pdg boolean := false;
  v_deferred_land boolean := false;
begin
  if v_user is null or not private.crm_user_has_role_permission(v_user, 'acquisitions.validate') then
    raise exception 'Vous n’êtes pas autorisé à valider les ventes.' using errcode='42501';
  end if;
  if p_action not in ('valider','demander_modification') then
    raise exception 'Action de validation inconnue.';
  end if;
  select * into v_acquisition from public.acquisitions where id=p_acquisition_id for update;
  if v_acquisition.id is null then raise exception 'Vente introuvable.'; end if;
  v_pdg:=private.has_role(v_user,'pdg');
  v_deferred_land:=coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'deferred_land_allocation')::boolean,false);
  if p_action='valider' then
    update public.acquisitions
       set validation_statut='valide',
           statut=CASE WHEN NOT coalesce(v_acquisition.necessite_foncier_client,false) OR v_deferred_land THEN 'active' ELSE statut END,
           metadata=CASE
             WHEN NOT coalesce(v_acquisition.necessite_foncier_client,false) OR v_deferred_land
             THEN coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
               'validation_acquisition_sans_foncier',true,
               'validation_pdg_sans_convention_active',v_pdg
             )
             ELSE coalesce(metadata,'{}'::jsonb)
           END,
           validation_commentaire=null,validation_par=v_user,validation_at=now(),
           validation_demande_at=null,updated_at=now()
     where id=p_acquisition_id;
  else
    if nullif(trim(coalesce(p_comment,'')),'') is null then
      raise exception 'Indiquez les corrections à effectuer.';
    end if;
    update public.acquisitions set validation_statut='modification_demandee',
      validation_commentaire=trim(p_comment),validation_demande_at=now(),
      validation_par=v_user,validation_at=null,updated_at=now()
    where id=p_acquisition_id;
  end if;
  return jsonb_build_object('acquisition_id',p_acquisition_id,'validation_statut',case when p_action='valider' then 'valide' else 'modification_demandee' end);
end;
$function$


CREATE OR REPLACE FUNCTION public.review_client_validation(p_client_id uuid, p_action text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client public.clients%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null or not private.crm_user_has_role_permission(v_user, 'clients.validate') then
    raise exception 'Vous n’êtes pas autorisé à valider les dossiers clients.' using errcode='42501';
  end if;
  if p_action not in ('valider','demander_modification') then
    raise exception 'Action de validation inconnue.';
  end if;
  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'Client introuvable.'; end if;

  if p_action='valider' then
    update public.clients set validation_statut='valide',validation_commentaire=null,
      validation_par=v_user,validation_at=now(),validation_demande_at=null,updated_by=v_user,updated_at=now()
    where id=p_client_id;

    -- Auto-created acquisition is the same client dossier, not a second approval queue.
    update public.acquisitions set validation_statut='valide',validation_commentaire=null,
      validation_par=v_user,validation_at=now(),validation_demande_at=null,updated_at=now()
    where client_id=p_client_id
      and (metadata->>'created_from_client_workflow'='true' or metadata->>'source'='clients')
      and validation_statut in ('a_valider','modification_demandee');

    perform public.create_paiement_initial(p_client_id);
  else
    if nullif(trim(coalesce(p_comment,'')),'') is null then
      raise exception 'Indiquez les corrections à effectuer.';
    end if;
    update public.clients set validation_statut='modification_demandee',
      validation_commentaire=trim(p_comment),validation_demande_at=now(),
      validation_par=v_user,validation_at=null,updated_by=v_user,updated_at=now()
    where id=p_client_id;
  end if;
  return jsonb_build_object('client_id',p_client_id,'validation_statut',case when p_action='valider' then 'valide' else 'modification_demandee' end);
end;
$function$


revoke all on function public.allow_deferred_land_acquisition_before_validation() from public, anon, authenticated;
revoke all on function public.restore_deferred_land_offer_requirement() from public, anon, authenticated;
revoke all on function public.ensure_technical_preceding_steps(uuid,date) from public, anon;
grant execute on function public.ensure_technical_preceding_steps(uuid,date) to authenticated, service_role;
revoke all on function public.finance_payroll_mark_paid(uuid,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.finance_payroll_mark_paid(uuid,text,text,text,text,text,boolean) to authenticated, service_role;
revoke all on function public.create_client_acquisition(uuid,uuid,text,numeric,text,uuid,uuid,text) from public, anon;
grant execute on function public.create_client_acquisition(uuid,uuid,text,numeric,text,uuid,uuid,text) to authenticated, service_role;
revoke all on function public.create_paiement_initial(uuid) from public, anon;
grant execute on function public.create_paiement_initial(uuid) to authenticated, service_role;
revoke all on function public.activate_client_lot_from_lot(uuid,uuid,date) from public, anon;
grant execute on function public.activate_client_lot_from_lot(uuid,uuid,date) to authenticated, service_role;
revoke all on function public.allocate_acquisition_lot(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.allocate_acquisition_lot(uuid,uuid,numeric,text) to authenticated, service_role;
revoke all on function public.get_client_effective_pi(uuid) from public, anon;
grant execute on function public.get_client_effective_pi(uuid) to authenticated, service_role;
revoke all on function public.ensure_client_contracts(uuid) from public, anon;
grant execute on function public.ensure_client_contracts(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;