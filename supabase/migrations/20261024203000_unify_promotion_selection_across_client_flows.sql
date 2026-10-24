-- Use the same monetary-value promotion selection across client acquisition, client PI, and offer schedules.
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
  if v_user is null or not public.is_staff(v_user) then
    raise exception 'Accès réservé au personnel AgriCapital' using errcode='42501';
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
;

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
;

CREATE OR REPLACE FUNCTION public.offre_echeancier_effectif(_offre_id uuid)
 RETURNS TABLE(annee integer, mois_debut integer, mois_fin integer, mois integer, mensualite_par_ha numeric, total_periode_par_ha numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with o as(select * from public.offres where id=_offre_id and actif=true),
p as(select p.id,case when lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special') then 'cout_global' else 'paiement_initial' end cible,coalesce(p.pourcentage_reduction,0) pct,coalesce(p.montant_fixe_reduction,0) fixe from public.promotions p,o where p.active=true and (p.date_debut is null or p.date_debut<=now()) and (p.date_fin is null or p.date_fin>=now()) and (p.applique_toutes_offres=true or p.offre_ids ? o.id::text or p.offre_ids ? o.code) order by case
when lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special')
then least(greatest(coalesce(o.montant_total_par_ha,0),0),greatest(coalesce(o.montant_total_par_ha,0),0)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
else least(greatest(coalesce(o.montant_pi_par_ha,0),0),greatest(coalesce(o.montant_pi_par_ha,0),0)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
end desc,coalesce(p.pourcentage_reduction,0) desc,coalesce(p.montant_fixe_reduction,0) desc,p.created_at desc limit 1),
c as(select o.*,p.cible,p.pct,p.fixe,case when p.id is null then coalesce(o.montant_total_par_ha,0) when p.cible='cout_global' then greatest(coalesce(o.montant_total_par_ha,0)*(1-p.pct/100.0)-p.fixe,0) else greatest(coalesce(o.montant_total_par_ha,0)-(coalesce(o.montant_pi_par_ha,0)-greatest(coalesce(o.montant_pi_par_ha,0)*(1-p.pct/100.0)-p.fixe,0)),0) end total_eff,case when p.id is null then coalesce(o.montant_pi_par_ha,0) when p.cible='paiement_initial' then greatest(coalesce(o.montant_pi_par_ha,0)*(1-p.pct/100.0)-p.fixe,0) else least(coalesce(o.montant_pi_par_ha,0),greatest(coalesce(o.montant_total_par_ha,0)*(1-p.pct/100.0)-p.fixe,0)) end pi_eff from o left join p on true),
r as(select c.*,case when greatest(coalesce(montant_total_par_ha,0)-coalesce(montant_pi_par_ha,0),0)>0 then greatest(total_eff-least(pi_eff,total_eff),0)/greatest(coalesce(montant_total_par_ha,0)-coalesce(montant_pi_par_ha,0),0) else 1 end ratio from c)
select coalesce((t->>'annee')::int,1),coalesce((t->>'mois_debut')::int,1),coalesce((t->>'mois_fin')::int,(t->>'mois')::int),coalesce((t->>'mois')::int,0),
case when r.cible='cout_global' then coalesce((t->>'mensualite_par_ha')::numeric,0)*r.ratio else coalesce((t->>'mensualite_par_ha')::numeric,0) end,
case when r.cible='cout_global' then coalesce((t->>'mensualite_par_ha')::numeric,0)*r.ratio*coalesce((t->>'mois')::int,0) else coalesce((t->>'mensualite_par_ha')::numeric,0)*coalesce((t->>'mois')::int,0) end
from r cross join lateral jsonb_array_elements(r.tranches_paiement) t
where coalesce(t->>'type','') not in ('paiement_initial','apres_trouaison','paiement_apres_trouaison') and coalesce((t->>'mensualite_par_ha')::numeric,0)>0 and coalesce((t->>'mois')::int,0)>0
order by coalesce((t->>'mois_debut')::int,999999);
$function$
;
