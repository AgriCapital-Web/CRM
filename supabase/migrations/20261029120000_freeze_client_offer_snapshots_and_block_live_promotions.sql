-- Freeze the offer/formula/contract configuration at client and acquisition registration.
-- Existing client edits must never read today's catalogue prices or apply today's promotions.

alter table public.clients
  add column if not exists offre_snapshot jsonb not null default '{}'::jsonb;
alter table public.acquisitions
  add column if not exists offre_snapshot jsonb not null default '{}'::jsonb;

-- Acquisition contract fields are authoritative for historic sales; catalog data is retained
-- only as descriptive/formula metadata. No active-promotion lookup is performed here.
update public.acquisitions a
set offre_snapshot = jsonb_build_object(
  'schema_version', 1, 'snapshot_at', coalesce(a.created_at, now()), 'source', 'migration_historical_acquisition',
  'offer', jsonb_strip_nulls(jsonb_build_object(
    'id', o.id, 'code', coalesce(a.offre_code,o.code), 'nom', coalesce(a.offre_nom,o.nom),
    'description', o.description, 'famille_offre', coalesce(a.famille_offre,o.famille_offre),
    'parcours_code', coalesce(o.parcours_code,o.code), 'type_offre', o.type_offre, 'couleur', o.couleur,
    'gestion_type', a.gestion_type, 'necessite_foncier_client', a.necessite_foncier_client,
    'necessite_cotitulaire', o.necessite_cotitulaire, 'contrat_acquisition_requis', o.contrat_acquisition_requis,
    'contrat_accompagnement_requis', o.contrat_accompagnement_requis,
    'formules_configuration', coalesce(o.formules_configuration,'[]'::jsonb))),
  'formula', jsonb_build_object('code',a.formule_code,'nom',a.formule_nom,'configuration',coalesce(
    (select f.value from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) f(value)
     where f.value->>'code'=a.formule_code limit 1), jsonb_build_object('code',a.formule_code,'nom',a.formule_nom))),
  'contract', jsonb_build_object('mode_paiement',a.mode_paiement,'superficie_ha',a.superficie_ha,
    'montant_pi_par_ha',a.montant_pi_par_ha,'montant_pi_total',a.montant_pi_total,
    'montant_total_par_ha',a.montant_total_par_ha,'montant_total_contrat',a.montant_total_contrat,
    'mensualite_par_ha',a.mensualite_par_ha,'mensualite_montant',a.mensualite_montant,
    'duree_paiement_mois',a.duree_paiement_mois,'echeancier',coalesce(a.echeancier,'[]'::jsonb),
    'promotion_id',a.promotion_id,'montant_promo_applique',coalesce(a.montant_promo_applique,0)),
  'promotion', case when a.promotion_id is null then null else coalesce(
    (select jsonb_strip_nulls(jsonb_build_object('id',p.id,'nom',p.nom,'code',p.code,'type_promotion',p.type_promotion,
      'cible',p.cible,'pourcentage_reduction',p.pourcentage_reduction,'montant_fixe_reduction',p.montant_fixe_reduction))
     from public.promotions p where p.id=a.promotion_id),
    jsonb_build_object('id',a.promotion_id,'montant_applique',coalesce(a.montant_promo_applique,0))) end
)
from public.offres o
where o.id=a.offre_id and coalesce(a.offre_snapshot,'{}'::jsonb)='{}'::jsonb;

-- Existing clients with an acquisition get a snapshot based on their saved contract,
-- including any promotion explicitly recorded on that acquisition.
update public.clients c
set offre_snapshot = jsonb_set(
  jsonb_set(
    (select a.offre_snapshot from public.acquisitions a where a.client_id=c.id order by a.created_at asc limit 1),
    '{contract}',
    coalesce((select a.offre_snapshot->'contract' from public.acquisitions a where a.client_id=c.id order by a.created_at asc limit 1),'{}'::jsonb)
      || jsonb_build_object('mode_paiement',c.mode_paiement,'superficie_ha',c.total_hectares,
        'paiement_initial_montant',c.paiement_initial_montant,'mensualite_montant',c.mensualite_montant,
        'montant_total_contrat',c.montant_total_contrat,'montant_promo_applique',coalesce(c.montant_promo_applique,0),
        'paiement_personnalise',coalesce(c.paiement_personnalise,'{}'::jsonb)),true),
  '{source}',to_jsonb('migration_existing_client_from_acquisition'::text),true)
where coalesce(c.offre_snapshot,'{}'::jsonb)='{}'::jsonb and coalesce(c.is_internal,false)=false
  and exists(select 1 from public.acquisitions a where a.client_id=c.id and coalesce(a.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb);

-- Existing clients without an acquisition are snapshotted from their assigned offer and
-- current saved contract amounts. A live promotion is never selected for backfill.
update public.clients c
set offre_snapshot=jsonb_build_object(
  'schema_version',1,'snapshot_at',coalesce(c.created_at,now()),
  'source',case when coalesce(c.paiement_personnalise,'{}'::jsonb)<>'{}'::jsonb then 'migration_existing_custom_client' else 'migration_existing_client' end,
  'offer',jsonb_strip_nulls(jsonb_build_object('id',o.id,'code',o.code,'nom',o.nom,'description',o.description,
    'famille_offre',coalesce(c.famille_offre,o.famille_offre),'parcours_code',coalesce(c.parcours_code,o.parcours_code,o.code),
    'type_offre',o.type_offre,'couleur',o.couleur,'gestion_type',o.gestion_type,
    'necessite_foncier_client',o.necessite_foncier_client,'necessite_cotitulaire',o.necessite_cotitulaire,
    'contrat_acquisition_requis',o.contrat_acquisition_requis,'contrat_accompagnement_requis',o.contrat_accompagnement_requis,
    'formules_configuration',coalesce(o.formules_configuration,'[]'::jsonb))),
  'formula',jsonb_build_object('code',c.formule_code,'nom',coalesce(c.formule_nom,c.formule_code),
    'configuration',coalesce((select f.value from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) f(value)
      where f.value->>'code'=c.formule_code limit 1),
      jsonb_build_object('code',c.formule_code,'nom',coalesce(c.formule_nom,c.formule_code),
        'montant_pi_par_ha',case when coalesce(c.total_hectares,0)>0 then c.paiement_initial_montant/c.total_hectares end,
        'montant_total_par_ha',case when coalesce(c.total_hectares,0)>0 then c.montant_total_contrat/c.total_hectares end,
        'mensualite_par_ha',case when coalesce(c.total_hectares,0)>0 then c.mensualite_montant/c.total_hectares end))),
  'contract',jsonb_build_object('mode_paiement',c.mode_paiement,'superficie_ha',c.total_hectares,
    'paiement_initial_montant',c.paiement_initial_montant,'mensualite_montant',c.mensualite_montant,
    'montant_total_contrat',c.montant_total_contrat,'jours_contrat_total',c.jours_contrat_total,
    'taux_journalier_ha',c.taux_journalier_ha,'promotion_id',c.promotion_id,
    'montant_promo_applique',coalesce(c.montant_promo_applique,0),'paiement_personnalise',coalesce(c.paiement_personnalise,'{}'::jsonb)),
  'promotion',case when c.promotion_id is null then null else coalesce(
    (select jsonb_strip_nulls(jsonb_build_object('id',p.id,'nom',p.nom,'code',p.code,'type_promotion',p.type_promotion,
      'cible',p.cible,'pourcentage_reduction',p.pourcentage_reduction,'montant_fixe_reduction',p.montant_fixe_reduction))
     from public.promotions p where p.id=c.promotion_id),
    jsonb_build_object('id',c.promotion_id,'montant_applique',coalesce(c.montant_promo_applique,0))) end
)
from public.offres o
where o.id=c.offre_id and coalesce(c.offre_snapshot,'{}'::jsonb)='{}'::jsonb and coalesce(c.is_internal,false)=false;

-- Custom contracts without a catalogue offer keep their own terms; non-commercial records
-- without an offer or contract remain without an offer snapshot.
update public.clients c
set offre_snapshot=jsonb_build_object(
  'schema_version',1,'snapshot_at',coalesce(c.created_at,now()),'source','migration_existing_custom_client_without_catalogue_offer',
  'offer',jsonb_build_object('id',null,'code',coalesce(c.parcours_code,'PERSONNALISEE'),
    'nom',coalesce(c.formule_nom,'Offre personnalisée'),'famille_offre',coalesce(c.famille_offre,'PERSONNALISEE'),
    'parcours_code',c.parcours_code,'type_offre',c.type_client),
  'formula',jsonb_build_object('code',c.formule_code,'nom',coalesce(c.formule_nom,c.formule_code,'Offre personnalisée'),
    'configuration',jsonb_build_object('code',c.formule_code,'nom',coalesce(c.formule_nom,c.formule_code,'Offre personnalisée'))),
  'contract',jsonb_build_object('mode_paiement',c.mode_paiement,'superficie_ha',c.total_hectares,
    'paiement_initial_montant',c.paiement_initial_montant,'mensualite_montant',c.mensualite_montant,
    'montant_total_contrat',c.montant_total_contrat,'jours_contrat_total',c.jours_contrat_total,
    'paiement_personnalise',coalesce(c.paiement_personnalise,'{}'::jsonb)),'promotion',null)
where coalesce(c.offre_snapshot,'{}'::jsonb)='{}'::jsonb and coalesce(c.is_internal,false)=false
  and (coalesce(c.paiement_personnalise,'{}'::jsonb)<>'{}'::jsonb or coalesce(c.montant_total_contrat,0)>0
    or coalesce(c.paiement_initial_montant,0)>0 or coalesce(c.mensualite_montant,0)>0);

create or replace function public.sync_offre_fields_on_client()
returns trigger language plpgsql security definer set search_path=public as $function$
declare o record; f jsonb;
begin
  if tg_op='UPDATE' and new.offre_id is not distinct from old.offre_id
     and new.formule_code is not distinct from old.formule_code then return new; end if;
  if new.offre_id is null then return new; end if;
  select * into o from public.offres where id=new.offre_id;
  if not found then
    if tg_op='UPDATE' and coalesce(new.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb then return new; end if;
    raise exception 'Offre % introuvable',new.offre_id;
  end if;
  new.famille_offre:=coalesce(new.famille_offre,o.famille_offre);
  new.parcours_code:=coalesce(new.parcours_code,o.parcours_code,o.code);
  select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) with ordinality item(value,ord)
    where item.value->>'code'=new.formule_code order by item.ord limit 1;
  if f is not null then new.formule_code:=f->>'code'; new.formule_nom:=coalesce(new.formule_nom,f->>'nom');
  elsif coalesce(nullif(btrim(new.formule_code),''),'')='' then new.formule_nom:=null; end if;
  return new;
end $function$;

create or replace function public.sync_client_foncier_from_offer()
returns trigger language plpgsql security definer set search_path=public as $function$
declare v_need_client_land boolean;
begin
  if tg_op='UPDATE' and new.offre_id is not distinct from old.offre_id then return new; end if;
  if new.offre_id is null then return new; end if;
  select coalesce(o.necessite_foncier_client,false) into v_need_client_land from public.offres o where o.id=new.offre_id;
  if not found then
    if tg_op='UPDATE' and coalesce(new.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb then return new; end if;
    raise exception 'Offre % introuvable',new.offre_id;
  end if;
  new.type_client_foncier:=case when v_need_client_land then 'OWN' else 'EXT' end;
  new.type_client:=case when coalesce(new.type_client,'') in ('sans_terre','avec_terre')
    then case when v_need_client_land then 'avec_terre' else 'sans_terre' end else new.type_client end;
  return new;
end $function$;

create or replace function public.snapshot_client_offer_contract()
returns trigger language plpgsql security definer set search_path=public as $function$
declare o public.offres%rowtype; f jsonb; promo jsonb;
begin
  if coalesce(new.is_internal,false) then return new; end if;
  if tg_op='UPDATE' and new.offre_id is not distinct from old.offre_id
     and new.formule_code is not distinct from old.formule_code and coalesce(old.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb then
    new.offre_snapshot:=old.offre_snapshot; return new;
  end if;
  if new.offre_id is not null then
    select * into o from public.offres where id=new.offre_id;
    if found then
      select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) item(value)
        where item.value->>'code'=new.formule_code limit 1;
      if f is null then f:=jsonb_build_object('code',new.formule_code,'nom',coalesce(new.formule_nom,new.formule_code)); end if;
      if new.promotion_id is not null then
        select jsonb_strip_nulls(jsonb_build_object('id',p.id,'nom',p.nom,'code',p.code,'type_promotion',p.type_promotion,
          'cible',p.cible,'pourcentage_reduction',p.pourcentage_reduction,'montant_fixe_reduction',p.montant_fixe_reduction))
          into promo from public.promotions p where p.id=new.promotion_id;
      end if;
      new.offre_snapshot:=jsonb_build_object('schema_version',1,'snapshot_at',now(),
        'source',case when tg_op='INSERT' then 'client_registration' else 'explicit_offer_change' end,
        'offer',jsonb_strip_nulls(jsonb_build_object('id',o.id,'code',o.code,'nom',o.nom,'description',o.description,
          'famille_offre',o.famille_offre,'parcours_code',coalesce(o.parcours_code,o.code),'type_offre',o.type_offre,
          'couleur',o.couleur,'gestion_type',o.gestion_type,'necessite_foncier_client',o.necessite_foncier_client,
          'necessite_cotitulaire',o.necessite_cotitulaire,'contrat_acquisition_requis',o.contrat_acquisition_requis,
          'contrat_accompagnement_requis',o.contrat_accompagnement_requis,'formules_configuration',coalesce(o.formules_configuration,'[]'::jsonb))),
        'formula',jsonb_build_object('code',new.formule_code,'nom',coalesce(new.formule_nom,f->>'nom',new.formule_code),'configuration',f),
        'contract',jsonb_build_object('mode_paiement',new.mode_paiement,'superficie_ha',new.total_hectares,
          'paiement_initial_montant',new.paiement_initial_montant,'mensualite_montant',new.mensualite_montant,
          'montant_total_contrat',new.montant_total_contrat,'jours_contrat_total',new.jours_contrat_total,
          'taux_journalier_ha',new.taux_journalier_ha,'promotion_id',new.promotion_id,
          'montant_promo_applique',coalesce(new.montant_promo_applique,0),'paiement_personnalise',coalesce(new.paiement_personnalise,'{}'::jsonb)),
        'promotion',promo);
    elsif coalesce(new.offre_snapshot,'{}'::jsonb)='{}'::jsonb then raise exception 'Offre % introuvable',new.offre_id; end if;
  elsif coalesce(new.paiement_personnalise,'{}'::jsonb)<>'{}'::jsonb then
    new.offre_snapshot:=jsonb_build_object('schema_version',1,'snapshot_at',now(),'source','client_registration_custom_offer',
      'offer',jsonb_build_object('id',null,'code',coalesce(new.parcours_code,'PERSONNALISEE'),'nom',coalesce(new.formule_nom,'Offre personnalisée'),
        'famille_offre',coalesce(new.famille_offre,'PERSONNALISEE'),'parcours_code',new.parcours_code,'type_offre',new.type_client),
      'formula',jsonb_build_object('code',new.formule_code,'nom',coalesce(new.formule_nom,new.formule_code,'Offre personnalisée'),
        'configuration',jsonb_build_object('code',new.formule_code,'nom',coalesce(new.formule_nom,new.formule_code,'Offre personnalisée'))),
      'contract',jsonb_build_object('mode_paiement',new.mode_paiement,'superficie_ha',new.total_hectares,
        'paiement_initial_montant',new.paiement_initial_montant,'mensualite_montant',new.mensualite_montant,
        'montant_total_contrat',new.montant_total_contrat,'jours_contrat_total',new.jours_contrat_total,
        'paiement_personnalise',new.paiement_personnalise),'promotion',null);
  end if;
  return new;
end $function$;

create or replace function public.snapshot_acquisition_offer_contract()
returns trigger language plpgsql security definer set search_path=public as $function$
declare o public.offres%rowtype; f jsonb; promo jsonb;
begin
  if coalesce(new.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb then return new; end if;
  select * into o from public.offres where id=new.offre_id;
  if not found then
    new.offre_snapshot:=jsonb_build_object('schema_version',1,'snapshot_at',now(),'source','acquisition_without_catalogue_offer',
      'offer',jsonb_build_object('id',new.offre_id,'code',new.offre_code,'nom',new.offre_nom,'famille_offre',new.famille_offre),
      'formula',jsonb_build_object('code',new.formule_code,'nom',new.formule_nom),
      'contract',jsonb_build_object('mode_paiement',new.mode_paiement,'superficie_ha',new.superficie_ha,
        'montant_pi_total',new.montant_pi_total,'montant_total_contrat',new.montant_total_contrat,
        'mensualite_montant',new.mensualite_montant,'duree_paiement_mois',new.duree_paiement_mois,
        'echeancier',coalesce(new.echeancier,'[]'::jsonb),'promotion_id',new.promotion_id,
        'montant_promo_applique',coalesce(new.montant_promo_applique,0)),'promotion',null);
    return new;
  end if;
  select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) item(value)
    where item.value->>'code'=new.formule_code limit 1;
  if f is null then f:=jsonb_build_object('code',new.formule_code,'nom',new.formule_nom); end if;
  if new.promotion_id is not null then
    select jsonb_strip_nulls(jsonb_build_object('id',p.id,'nom',p.nom,'code',p.code,'type_promotion',p.type_promotion,
      'cible',p.cible,'pourcentage_reduction',p.pourcentage_reduction,'montant_fixe_reduction',p.montant_fixe_reduction))
      into promo from public.promotions p where p.id=new.promotion_id;
  end if;
  new.offre_snapshot:=jsonb_build_object('schema_version',1,'snapshot_at',now(),'source','acquisition_registration',
    'offer',jsonb_strip_nulls(jsonb_build_object('id',o.id,'code',coalesce(new.offre_code,o.code),'nom',coalesce(new.offre_nom,o.nom),
      'description',o.description,'famille_offre',coalesce(new.famille_offre,o.famille_offre),'parcours_code',coalesce(o.parcours_code,o.code),
      'type_offre',o.type_offre,'couleur',o.couleur,'gestion_type',new.gestion_type,
      'necessite_foncier_client',new.necessite_foncier_client,'formules_configuration',coalesce(o.formules_configuration,'[]'::jsonb))),
    'formula',jsonb_build_object('code',new.formule_code,'nom',new.formule_nom,'configuration',f),
    'contract',jsonb_build_object('mode_paiement',new.mode_paiement,'superficie_ha',new.superficie_ha,
      'montant_pi_par_ha',new.montant_pi_par_ha,'montant_pi_total',new.montant_pi_total,
      'montant_total_par_ha',new.montant_total_par_ha,'montant_total_contrat',new.montant_total_contrat,
      'mensualite_par_ha',new.mensualite_par_ha,'mensualite_montant',new.mensualite_montant,
      'duree_paiement_mois',new.duree_paiement_mois,'echeancier',coalesce(new.echeancier,'[]'::jsonb),
      'promotion_id',new.promotion_id,'montant_promo_applique',coalesce(new.montant_promo_applique,0)),'promotion',promo);
  return new;
end $function$;

drop trigger if exists trg_snapshot_client_offer_contract on public.clients;
create trigger trg_snapshot_client_offer_contract
before insert or update of offre_id,formule_code on public.clients
for each row execute function public.snapshot_client_offer_contract();
drop trigger if exists trg_snapshot_acquisition_offer_contract on public.acquisitions;
create trigger trg_snapshot_acquisition_offer_contract
before insert on public.acquisitions
for each row execute function public.snapshot_acquisition_offer_contract();

-- Financial defaults may be computed when the client is registered. Updates to an existing
-- client never invoke live-offer repricing.
create or replace function public.trg_recalculer_parametres_financiers_client()
returns trigger language plpgsql security definer set search_path=public as $function$
begin
  if tg_op='UPDATE' then return new; end if;
  if pg_trigger_depth()>1 then return new; end if;
  perform public.recalculer_parametres_financiers_client(new.id);
  return new;
end $function$;

-- The additional-acquisition RPC is for an already registered client. It must not auto-apply
-- a promotion that is active today. Only an explicitly saved first-sale contract may carry one.
do $migration$
declare v_definition text; v_updated text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_client_acquisition'
    and pg_get_function_identity_arguments(p.oid) like 'p_client_id uuid, p_offre_id uuid, p_formule_code text, p_superficie_ha numeric%';
  if v_definition is null then return; end if;
  if position('select p.* into v_promo' in v_definition)>0 then
    v_updated := regexp_replace(v_definition,
      '(?s)  select p\.\* into v_promo.*?  limit 1;',
      '  -- No current promotion is applied to an existing client acquisition.' || chr(10) ||
      '  v_promo_id := null;' || chr(10) ||
      '  v_promo_name := null;' || chr(10) ||
      '  v_pct := 0;' || chr(10) ||
      '  v_fixed := 0;' || chr(10) ||
      '  v_promo_target := ''paiement_initial''',
      'g');
    if v_updated = v_definition then raise exception 'Could not safely remove dynamic promotion selection from create_client_acquisition'; end if;
    execute v_updated;
  end if;
end $migration$;
