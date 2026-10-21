-- Backfill acquisition records for already validated clients and keep planting status
-- synchronized with the technical milestone ledger.

insert into public.acquisitions (
  client_id, offre_id, offre_code, offre_nom, famille_offre, formule_code, formule_nom,
  gestion_type, necessite_foncier_client, superficie_ha, parcelle_id, lot_id, mode_paiement,
  montant_pi_par_ha, montant_pi_total, montant_total_par_ha, montant_total_contrat,
  mensualite_par_ha, mensualite_montant, duree_paiement_mois, echeancier, promotion_id,
  montant_promo_applique, statut, statut_technique, notes, metadata, created_by, validation_statut
)
select
  c.id, o.id, o.code, o.nom, o.famille_offre,
  c.formule_code, c.formule_nom,
  coalesce(f.value->>'gestion_type', o.gestion_type),
  coalesce(o.necessite_foncier_client,false),
  c.total_hectares, c.parcelle_id, null, coalesce(c.mode_paiement,'echeancier'),
  c.paiement_initial_montant / nullif(c.total_hectares,0),
  c.paiement_initial_montant,
  c.montant_total_contrat / nullif(c.total_hectares,0),
  c.montant_total_contrat,
  c.mensualite_montant / nullif(c.total_hectares,0),
  c.mensualite_montant,
  coalesce(nullif(f.value->>'duree_paiement_mois','')::integer,o.duree_paiement_mois,36),
  coalesce(f.value->'tranches_paiement',o.tranches_paiement,'[]'::jsonb),
  c.promotion_id,
  coalesce(c.montant_promo_applique,0),
  'souscrite',
  case when exists (
    select 1 from public.interventions_techniques i
    where i.client_id=c.id and i.type_intervention='mise_en_terre'
      and lower(coalesce(i.statut,'')) in ('realisee','valide','validee','terminee','completed')
  ) then 'mise_en_terre_realisee' else 'en_attente_intervention' end,
  'Acquisition régularisée à partir du dossier client validé et de l’offre enregistrée.',
  jsonb_build_object('source','client_validation_backfill','client_id',c.id,'created_from_validated_client',true),
  c.created_by,
  'valide'
from public.clients c
join public.offres o on o.id=c.offre_id
left join lateral (
  select item.value
  from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) item(value)
  where item.value->>'code'=c.formule_code
  limit 1
) f on true
where c.id_unique in ('AGC-000005','AGC-000006','AGC-000007','AGC-000008')
  and c.validation_statut='valide'
  and coalesce(c.total_hectares,0)>0
  and coalesce(c.montant_total_contrat,0)>0
  and not exists (select 1 from public.acquisitions a where a.client_id=c.id);

-- Normalize the existing Guy acquisition to the corrected flexible offer and completed planting.
update public.acquisitions a
set formule_code=c.formule_code,
    formule_nom=c.formule_nom,
    montant_pi_par_ha=c.paiement_initial_montant/nullif(c.total_hectares,0),
    montant_pi_total=c.paiement_initial_montant,
    montant_total_par_ha=c.montant_total_contrat/nullif(c.total_hectares,0),
    montant_total_contrat=c.montant_total_contrat,
    mensualite_par_ha=c.mensualite_montant/nullif(c.total_hectares,0),
    mensualite_montant=c.mensualite_montant,
    statut='souscrite',
    statut_technique='mise_en_terre_realisee',
    validation_statut='valide',
    metadata=coalesce(a.metadata,'{}'::jsonb) || jsonb_build_object('planting_status_synced',true),
    updated_at=now()
from public.clients c
where a.client_id=c.id and c.id_unique='AGC-000008';

-- Every completed planting intervention propagates to the acquisition and plantation.
create or replace function public.sync_planting_to_acquisition()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if lower(coalesce(new.type_intervention,'')) <> 'mise_en_terre'
     or lower(coalesce(new.statut,'')) not in ('realisee','valide','validee','terminee','completed') then
    return new;
  end if;

  update public.acquisitions
  set statut_technique='mise_en_terre_realisee',
      validation_statut='valide',
      updated_at=now()
  where client_id=new.client_id;

  update public.plantations
  set statut='actif',
      statut_global='actif',
      date_plantation=coalesce(date_plantation,new.date_intervention),
      nombre_plants_mis_en_terre=coalesce(nombre_plants_mis_en_terre,nombre_plants),
      updated_at=now()
  where client_id=new.client_id
    and (new.parcelle_id is null or parcelle_id is null or parcelle_id=new.parcelle_id);

  return new;
end;
$function$;

drop trigger if exists trg_sync_planting_to_acquisition on public.interventions_techniques;
create trigger trg_sync_planting_to_acquisition
after insert or update of statut, type_intervention
on public.interventions_techniques
for each row execute function public.sync_planting_to_acquisition();

-- Apply the propagation to already-recorded planting operations.
update public.acquisitions a
set statut_technique='mise_en_terre_realisee',
    validation_statut='valide',
    updated_at=now()
from public.clients c
where a.client_id=c.id
  and c.id_unique in ('AGC-000006','AGC-000008')
  and exists (
    select 1 from public.interventions_techniques i
    where i.client_id=c.id and i.type_intervention='mise_en_terre'
      and lower(coalesce(i.statut,'')) in ('realisee','valide','validee','terminee','completed')
  );

update public.plantations p
set statut='actif',
    statut_global='actif',
    date_plantation=coalesce(date_plantation,current_date),
    nombre_plants_mis_en_terre=coalesce(nombre_plants_mis_en_terre,nombre_plants),
    updated_at=now()
where p.client_id in (select id from public.clients where id_unique in ('AGC-000006','AGC-000008'));
