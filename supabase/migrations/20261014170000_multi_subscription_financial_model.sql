-- Multi-subscription model: one client may own multiple offers/formulas without
-- overwriting the original contract, financial terms or hectares.
create table if not exists public.client_souscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  offre_id uuid not null references public.offres(id) on delete restrict,
  offre_code text not null,
  offre_nom text not null,
  famille_offre text,
  formule_code text not null,
  formule_nom text not null,
  gestion_type text,
  necessite_foncier_client boolean not null default false,
  superficie_ha numeric not null check (superficie_ha > 0),
  parcelle_id uuid references public.parcelles(id) on delete restrict,
  lot_id uuid references public.lots_hectares(id) on delete restrict,
  mode_paiement text not null default 'echeancier' check (mode_paiement in ('echeancier','comptant')),
  montant_pi_par_ha numeric not null default 0 check (montant_pi_par_ha >= 0),
  montant_pi_total numeric not null default 0 check (montant_pi_total >= 0),
  montant_total_par_ha numeric not null default 0 check (montant_total_par_ha >= 0),
  montant_total_contrat numeric not null default 0 check (montant_total_contrat >= 0),
  mensualite_par_ha numeric not null default 0 check (mensualite_par_ha >= 0),
  mensualite_montant numeric not null default 0 check (mensualite_montant >= 0),
  duree_paiement_mois integer not null default 0 check (duree_paiement_mois >= 0),
  echeancier jsonb not null default '[]'::jsonb,
  promotion_id uuid references public.promotions(id) on delete set null,
  montant_promo_applique numeric not null default 0,
  statut text not null default 'souscrite',
  statut_technique text not null default 'en_attente_intervention',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_souscriptions_client_created
  on public.client_souscriptions(client_id, created_at desc);
create index if not exists idx_client_souscriptions_lot
  on public.client_souscriptions(lot_id) where lot_id is not null;
create index if not exists idx_client_souscriptions_technique
  on public.client_souscriptions(statut_technique, created_at desc);

alter table public.paiements
  add column if not exists souscription_id uuid references public.client_souscriptions(id) on delete restrict;
alter table public.plantations
  add column if not exists souscription_id uuid references public.client_souscriptions(id) on delete set null;
alter table public.interventions_techniques
  add column if not exists souscription_id uuid references public.client_souscriptions(id) on delete set null;
alter table public.lots_hectares
  add column if not exists souscription_id uuid references public.client_souscriptions(id) on delete set null;
alter table public.acquisition_lots
  add column if not exists souscription_id uuid references public.client_souscriptions(id) on delete set null;

create index if not exists idx_paiements_souscription on public.paiements(souscription_id) where souscription_id is not null;
create unique index if not exists uq_souscription_initial_payment
  on public.paiements(souscription_id) where souscription_id is not null and coalesce(est_paiement_initial,false);
create unique index if not exists uq_lot_souscription
  on public.lots_hectares(souscription_id) where souscription_id is not null;

alter table public.client_souscriptions enable row level security;
drop policy if exists client_souscriptions_staff_select on public.client_souscriptions;
create policy client_souscriptions_staff_select on public.client_souscriptions
  for select to authenticated using (public.is_staff(auth.uid()));
grant select on public.client_souscriptions to authenticated;

create or replace function public.create_client_souscription(
  p_client_id uuid,
  p_offre_id uuid,
  p_formule_code text,
  p_superficie_ha numeric,
  p_mode_paiement text default 'echeancier',
  p_parcelle_id uuid default null,
  p_lot_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
  v_cash_base numeric := 0;
  v_total_base numeric := 0;
  v_monthly_base numeric := 0;
  v_pi_effective numeric := 0;
  v_total_effective numeric := 0;
  v_monthly_effective numeric := 0;
  v_ratio numeric := 1;
  v_first_monthly numeric := 0;
  v_duration integer := 0;
  v_surface numeric := greatest(coalesce(p_superficie_ha,0),0);
  v_mode text := lower(coalesce(p_mode_paiement,'echeancier'));
  v_total_pi numeric := 0;
  v_total_contract numeric := 0;
  v_promo_amount numeric := 0;
  v_subscription_id uuid;
  v_payment_id uuid;
  v_land_required boolean;
begin
  if v_user is null or not public.is_staff(v_user) then
    raise exception 'Accès réservé au personnel AgriCapital' using errcode='42501';
  end if;
  if v_surface <= 0 then raise exception 'La superficie doit être supérieure à zéro'; end if;
  if v_mode not in ('echeancier','comptant') then raise exception 'Mode de paiement invalide'; end if;

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
      if v_client.proprietaire_id is not null and v_parcelle.proprietaire_id is distinct from v_client.proprietaire_id then
        raise exception 'La parcelle choisie ne correspond pas au propriétaire foncier associé au client.';
      end if;
    elsif v_client.parcelle_id is not null then
      p_parcelle_id := v_client.parcelle_id;
    end if;
  else
    if p_lot_id is null then raise exception 'Cette offre nécessite de sélectionner un lot disponible sur une parcelle partenaire.'; end if;
    select * into v_lot from public.lots_hectares where id=p_lot_id for update;
    if v_lot.id is null then raise exception 'Lot introuvable'; end if;
    if v_lot.client_id is not null or lower(coalesce(v_lot.statut,'')) not in ('disponible','libre') or v_lot.souscription_id is not null then
      raise exception 'Ce lot n’est plus disponible. Actualisez la liste et choisissez un autre lot.';
    end if;
    if v_lot.parcelle_id is null then raise exception 'Le lot doit être rattaché à une parcelle.'; end if;
    if abs(coalesce(v_lot.surface_ha,0)-v_surface) > 0.0001 then
      raise exception 'La superficie demandée doit correspondre à la superficie du lot sélectionné.';
    end if;
    select * into v_parcelle from public.parcelles where id=v_lot.parcelle_id for update;
    if v_parcelle.id is null or v_parcelle.proprietaire_id is null then
      raise exception 'Le lot doit appartenir à une parcelle partenaire dont le propriétaire est enregistré.';
    end if;
    if p_parcelle_id is not null and p_parcelle_id is distinct from v_parcelle.id then
      raise exception 'Le lot choisi ne correspond pas à la parcelle sélectionnée.';
    end if;
    p_parcelle_id := v_parcelle.id;
  end if;

  v_pi_base := greatest(0,coalesce(nullif(v_formula->>'montant_pi_par_ha','')::numeric,v_offer.montant_pi_par_ha,0));
  v_cash_base := greatest(0,coalesce(nullif(v_formula->>'montant_cash_par_ha','')::numeric,v_offer.montant_cash_par_ha,0));
  v_total_base := greatest(0,coalesce(nullif(v_formula->>'montant_total_par_ha','')::numeric,v_offer.montant_total_par_ha,0));
  v_monthly_base := greatest(0,coalesce(nullif(v_formula->>'mensualite_par_ha','')::numeric,v_offer.mensualite_par_ha,0));
  v_duration := greatest(0,coalesce(nullif(v_formula->>'duree_paiement_mois','')::integer,v_offer.duree_paiement_mois,0));
  if jsonb_typeof(v_formula->'tranches_paiement')='array' then
    v_tranches := v_formula->'tranches_paiement';
  else
    v_tranches := coalesce(v_offer.tranches_paiement,'[]'::jsonb);
  end if;

  if v_mode='comptant' then
    v_total_base := case when v_cash_base>0 then v_cash_base else v_total_base end;
    v_pi_base := v_total_base;
    v_monthly_base := 0;
  end if;

  select p.* into v_promo
  from public.promotions p
  where p.active=true and p.date_debut<=now() and p.date_fin>=now()
    and (coalesce(p.applique_toutes_offres,false)
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(p.offre_ids,'[]'::jsonb)) x(value)
        where x.value in (v_offer.id::text,v_offer.code)
      ))
  order by coalesce(p.pourcentage_reduction,0) desc,
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
  if v_mode='comptant' then
    if v_promo_target='cout_global' then v_total_effective := greatest(v_total_base*(1-v_pct/100)-v_fixed,0); end if;
    v_pi_effective := v_total_effective;
  elsif v_promo_id is not null and v_promo_target='cout_global' then
    v_total_effective := greatest(v_total_base*(1-v_pct/100)-v_fixed,0);
    v_pi_effective := least(v_pi_base,v_total_effective);
  elsif v_promo_id is not null then
    v_pi_effective := greatest(v_pi_base*(1-v_pct/100)-v_fixed,0);
    v_total_effective := greatest(v_total_base-(v_pi_base-v_pi_effective),0);
  end if;

  if v_mode='echeancier' and v_total_base>v_pi_base then
    v_ratio := greatest(v_total_effective-least(v_pi_effective,v_total_effective),0)/greatest(v_total_base-v_pi_base,0);
  end if;
  if v_mode='comptant' then
    v_schedule := '[]'::jsonb;
  else
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
  end if;

  v_total_pi := round(v_pi_effective*v_surface,2);
  v_total_contract := round(v_total_effective*v_surface,2);
  v_promo_amount := greatest(0,round((v_total_base-v_total_effective)*v_surface,2));

  insert into public.client_souscriptions(
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
    'souscrite','en_attente_intervention',nullif(trim(coalesce(p_notes,'')),''),v_user,
    jsonb_build_object('promotion_nom',v_promo_name,'promotion_cible',v_promo_target,'reduction_pct',v_pct,
      'montant_total_base',v_total_base*v_surface,'montant_pi_base',v_pi_base*v_surface)
  ) returning id into v_subscription_id;

  if p_lot_id is not null then
    update public.lots_hectares set client_id=v_client.id,statut='attribue',
      date_attribution=coalesce(date_attribution,current_date),souscription_id=v_subscription_id,updated_at=now()
    where id=p_lot_id;
    update public.acquisition_lots set souscription_id=v_subscription_id
    where client_id=v_client.id and lot_id=p_lot_id;
  end if;

  if v_total_pi>0 then
    insert into public.paiements(
      client_id,souscription_id,type_paiement,montant,montant_paye,montant_theorique,
      statut,mode_paiement,parcours,est_paiement_initial,phase,date_echeance,metadata,created_by
    ) values (
      v_client.id,v_subscription_id,'PI',v_total_pi,0,v_total_pi,'en_attente',
      v_mode,coalesce(v_offer.famille_offre,v_offer.code),true,'paiement_initial',current_date,
      jsonb_build_object('source','souscription_supplementaire','souscription_id',v_subscription_id,
        'offre_id',v_offer.id,'offre_code',v_offer.code,'formule_code',coalesce(v_formula->>'code',v_offer.formule_code,v_offer.code),
        'superficie_ha',v_surface,'montant_total_contrat',v_total_contract),v_user
    ) returning id into v_payment_id;
  end if;

  return jsonb_build_object(
    'souscription_id',v_subscription_id,'paiement_initial_id',v_payment_id,
    'client_id',v_client.id,'offre_id',v_offer.id,'formule_code',coalesce(v_formula->>'code',v_offer.formule_code,v_offer.code),
    'superficie_ha',v_surface,'montant_pi_total',v_total_pi,'montant_total_contrat',v_total_contract,
    'mensualite_montant',v_first_monthly*v_surface,'mode_paiement',v_mode,
    'parcelle_id',p_parcelle_id,'lot_id',p_lot_id,'statut_technique','en_attente_intervention'
  );
end;
$function$;

revoke all on function public.create_client_souscription(uuid,uuid,text,numeric,text,uuid,uuid,text) from public;
grant execute on function public.create_client_souscription(uuid,uuid,text,numeric,text,uuid,uuid,text) to authenticated;

-- An additional PI activates only the lot belonging to that subscription.
-- Legacy first-acquisition payments retain their previous client-wide behavior.
create or replace function public.trg_activate_client_lot_after_initial_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_lot record;
  v_activation jsonb;
  v_owner_id uuid;
  v_subscription_lot uuid;
begin
  if not coalesce(new.est_paiement_initial,false)
     or lower(coalesce(new.statut,'')) not in ('valide','paye','paid','success','successful','completed')
     or (tg_op='UPDATE' and lower(coalesce(old.statut,'')) in ('valide','paye','paid','success','successful','completed')) then
    return new;
  end if;

  if new.souscription_id is not null then
    select s.lot_id into v_subscription_lot
    from public.client_souscriptions s
    where s.id=new.souscription_id and s.client_id=new.client_id;
    if v_subscription_lot is null then return new; end if;
    select l.id,l.client_id,l.parcelle_id,l.surface_ha,l.reference
      into v_lot from public.lots_hectares l
      where l.id=v_subscription_lot and l.client_id=new.client_id and l.statut='attribue';
    if v_lot.id is null then raise exception 'Le lot de cette souscription n’est plus attribué au client'; end if;
    v_activation:=public.activate_client_lot_from_lot(v_lot.id,v_lot.client_id,coalesce(new.date_paiement::date,current_date));
    select p.proprietaire_id into v_owner_id from public.parcelles p where p.id=v_lot.parcelle_id;
    perform public.notification_emit_event('lot_attribue',jsonb_build_object(
      'lot_id',v_lot.id,'client_id',v_lot.client_id,'parcelle_id',v_lot.parcelle_id,
      'proprietaire_id',v_owner_id,'surface',coalesce(v_lot.surface_ha,1),
      'surface_client',coalesce(v_lot.surface_ha,1),'surface_proprietaire',coalesce(v_lot.surface_ha,1),
      'lot_reference',coalesce(v_lot.reference,v_lot.id::text),
      'date_activation',coalesce(new.date_paiement::date,current_date),
      'souscription_id',new.souscription_id
    ));
    update public.client_souscriptions set statut='active',updated_at=now()
      where id=new.souscription_id and statut='souscrite';
    return new;
  end if;

  for v_lot in
    select l.id,l.client_id,l.parcelle_id,l.surface_ha,l.reference
    from public.lots_hectares l
    where l.client_id=new.client_id and l.statut='attribue'
    order by l.created_at
  loop
    v_activation:=public.activate_client_lot_from_lot(v_lot.id,v_lot.client_id,coalesce(new.date_paiement::date,current_date));
    select p.proprietaire_id into v_owner_id from public.parcelles p where p.id=v_lot.parcelle_id;
    perform public.notification_emit_event('lot_attribue',jsonb_build_object(
      'lot_id',v_lot.id,'client_id',v_lot.client_id,'parcelle_id',v_lot.parcelle_id,
      'proprietaire_id',v_owner_id,'surface',coalesce(v_lot.surface_ha,1),
      'surface_client',coalesce(v_lot.surface_ha,1),'surface_proprietaire',coalesce(v_lot.surface_ha,1),
      'lot_reference',coalesce(v_lot.reference,v_lot.id::text),
      'date_activation',coalesce(new.date_paiement::date,current_date)
    ));
  end loop;
  return new;
end;
$function$;

-- Disable Marahoue without deleting it; an authorized user can reactivate it
-- from Paramètres > Géographie.
update public.regions set est_active=false,updated_at=now()
where id='717529b6-6133-41f4-b247-7c782d300885' and lower(nom)='marahoue';

-- Extend the existing client synthesis with additional subscription totals while
-- preserving the original client acquisition fields as the original contract.
create or replace view public.v_client_synthese as
with client_totals as (
  select c.*,coalesce(sum(s.montant_total_contrat),0)::numeric as additional_contract_total
  from public.clients c
  left join public.client_souscriptions s on s.client_id=c.id
  group by c.id
)
select
  c.id as client_id,
  c.id_unique,
  c.nom_complet,
  c.offre_id,
  o.nom as offre_nom,
  o.gestion_type,
  o.pourcentage_revenus_reverses,
  c.total_hectares,
  case
    when c.total_hectares=1 then '1 ha'
    when c.total_hectares=2 then '2 ha'
    when c.total_hectares=3 then '3 ha'
    when c.total_hectares>=5 and c.total_hectares<10 then '5–10 ha'
    when c.total_hectares>=10 and c.total_hectares<50 then '10–50 ha'
    when c.total_hectares>=50 and c.total_hectares<100 then '50–100 ha'
    when c.total_hectares>=100 then '100+ ha'
    else null
  end as tranche_superficie,
  c.compte_actif,
  c.phase_actuelle,
  c.contrat_debut_at,
  c.contrat_fin_at,
  (coalesce(c.montant_total_contrat,0)+c.additional_contract_total) as montant_total_contrat,
  c.taux_journalier_ha,
  c.prochaine_echeance,
  c.jours_retard,
  coalesce(o.duree_paiement_mois,34) as duree_paiement_mois,
  (select count(*) from public.paiements p where p.client_id=c.id and upper(p.type_paiement)='MENSUALITE' and p.statut='valide') as mois_payes,
  (select count(*) from public.paiements p where p.client_id=c.id and upper(p.type_paiement)='MENSUALITE' and p.statut<>'valide') as mois_restants,
  coalesce((select sum(coalesce(p.montant_paye,p.montant)) from public.paiements p where p.client_id=c.id and p.statut='valide'),0) as total_paye,
  greatest(0,(coalesce(c.montant_total_contrat,0)+c.additional_contract_total)-coalesce((select sum(coalesce(p.montant_paye,p.montant)) from public.paiements p where p.client_id=c.id and p.statut='valide'),0)) as reste_a_payer,
  case when coalesce(c.montant_total_contrat,0)+c.additional_contract_total>0
    then round(coalesce((select sum(coalesce(p.montant_paye,p.montant)) from public.paiements p where p.client_id=c.id and p.statut='valide'),0)*100.0/(coalesce(c.montant_total_contrat,0)+c.additional_contract_total),2)
    else 0 end as pourcentage_avancement
from client_totals c
left join public.offres o on o.id=c.offre_id;

