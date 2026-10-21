-- Canonicalize the active PalmInvest/TerraPalm monthly schedules,
-- keep recorded cash receipts truthful, and make technical milestones cumulative.
-- This migration intentionally does not make private Storage buckets public.

-- 1) Replace yearly payment bands with one constant monthly payment.
update public.offres o
set mensualite_par_ha = round((o.montant_total_par_ha - o.montant_pi_par_ha) / 40, 2),
    duree_paiement_mois = 40,
    tranches_paiement = jsonb_build_array(jsonb_build_object(
      'mois', 40, 'mois_debut', 1, 'mois_fin', 40,
      'mensualite_par_ha', round((o.montant_total_par_ha - o.montant_pi_par_ha) / 40, 2),
      'total_periode_par_ha', o.montant_total_par_ha - o.montant_pi_par_ha,
      'type', 'mensualite_unique'
    )),
    formules_configuration = (
      select jsonb_agg(
        jsonb_set(
          jsonb_set(
            jsonb_set(f.value, '{mensualite_par_ha}',
              to_jsonb(round((o.montant_total_par_ha - o.montant_pi_par_ha) / 40, 2))),
            '{duree_paiement_mois}', '40'::jsonb),
          '{tranches_paiement}',
          jsonb_build_array(jsonb_build_object(
            'mois', 40, 'mois_debut', 1, 'mois_fin', 40,
            'mensualite_par_ha', round((o.montant_total_par_ha - o.montant_pi_par_ha) / 40, 2),
            'total_periode_par_ha', o.montant_total_par_ha - o.montant_pi_par_ha,
            'type', 'mensualite_unique'
          ))
        ) order by f.ordinality
      )
      from jsonb_array_elements(coalesce(o.formules_configuration, '[]'::jsonb))
        with ordinality as f(value, ordinality)
    ),
    updated_at = now()
where lower(o.code) in ('palm-invest', 'terra-palm')
   or upper(coalesce(o.famille_offre,'')) in ('PALMINVEST','TERRAPALM');

-- 2) Persist the correct PalmTerroir formula per named client.
-- Actual payment records are preserved; unpaid differences are not falsely marked as paid.
update public.clients
set formule_code = 'PALMTERROIR_ESSENTIELLE',
    formule_nom = 'Essentielle',
    montant_total_contrat = 356000,
    paiement_initial_montant = 230000,
    mensualite_montant = 3500,
    jours_contrat_total = 1080,
    updated_at = now()
where id_unique = 'AGC-000005';

update public.clients
set formule_code = 'PALMTERROIR_FLEXIBLE_PLUS',
    formule_nom = 'Flexible',
    montant_total_contrat = 518600,
    paiement_initial_montant = 65000,
    mensualite_montant = 12600,
    jours_contrat_total = 1080,
    updated_at = now()
where id_unique = 'AGC-000006';

update public.clients
set formule_code = 'PALMTERROIR_ESSENTIELLE',
    formule_nom = 'Essentielle',
    montant_total_contrat = 356000,
    paiement_initial_montant = 230000,
    mensualite_montant = 3500,
    jours_contrat_total = 1080,
    updated_at = now()
where id_unique = 'AGC-000007';

update public.clients
set formule_code = 'PALMTERROIR_FLEXIBLE_PLUS',
    formule_nom = 'Flexible',
    montant_total_contrat = 518600,
    paiement_initial_montant = 65000,
    mensualite_montant = 12600,
    jours_contrat_total = 1080,
    updated_at = now()
where id_unique = 'AGC-000008';

-- Guy's confirmed 65,000 FCFA Wave payment replaces the erroneous pending 230,000 PI.
update public.paiements p
set montant = 65000,
    montant_theorique = 65000,
    montant_paye = 65000,
    statut = 'valide',
    est_paiement_initial = true,
    mode_paiement = 'Wave',
    operateur_mobile_money = 'Wave',
    date_paiement = coalesce(p.date_paiement, now()),
    date_validation = coalesce(p.date_validation, now()),
    notes = concat_ws(' — ', nullif(p.notes, ''),
      'Paiement initial de 65 000 FCFA confirmé par la Direction via Wave; référence externe non fournie.'),
    updated_at = now()
from public.clients c
where c.id = p.client_id
  and c.id_unique = 'AGC-000008'
  and p.est_paiement_initial = true
  and p.statut = 'en_attente';

-- Keep the client-facing financial schedule synchronized with the confirmed offer.
update public.clients
set pi_paye_at = coalesce(pi_paye_at, now()),
    paiement_initial_paye_at = coalesce(paiement_initial_paye_at, now()),
    mode_paiement = 'Wave',
    compte_actif = true,
    statut = 'actif',
    statut_global = 'actif',
    phase_actuelle = 'plantation',
    updated_at = now()
where id_unique = 'AGC-000008'
  and validation_statut = 'valide';

-- 3) Activation condition: dossier validated + a real, validated initial payment.
-- Contract completeness must not prevent the customer from accessing their own portal.
create or replace function public.client_should_be_active(_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare v_result boolean;
begin
  if auth.role() is distinct from 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and (auth.uid() is null or not private.can_access_client(auth.uid(), _id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select coalesce(c.validation_statut = 'valide', false)
     and exists (
       select 1
       from public.paiements p
       where p.client_id = c.id
         and coalesce(p.est_paiement_initial, false)
         and lower(coalesce(p.statut, '')) in
           ('valide','paye','paid','success','successful','completed')
         and coalesce(p.montant_paye, p.montant, 0) > 0
     )
    into v_result
  from public.clients c
  where c.id = _id;

  return coalesce(v_result, false);
end;
$function$;

-- 4) When a later technical milestone is completed, ensure all its predecessors
-- exist and are marked completed. Administrative dates are explicitly identified
-- as such rather than pretending the real dates were supplied.
create or replace function public.sync_technical_preceding_steps()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_rank integer;
  v_stage text;
begin
  if pg_trigger_depth() > 1
     or new.client_id is null
     or lower(coalesce(new.statut,'')) not in ('realisee','valide','validee','terminee','completed') then
    return new;
  end if;

  v_rank := case lower(coalesce(new.type_intervention,''))
    when 'validation_parcelle' then 1
    when 'defrichage' then 2
    when 'piquetage' then 3
    when 'trouaison' then 4
    when 'mise_en_terre' then 5
    else 0
  end;

  if v_rank <= 1 then return new; end if;

  foreach v_stage in array array['validation_parcelle','defrichage','piquetage','trouaison'] loop
    exit when (case v_stage
      when 'validation_parcelle' then 1
      when 'defrichage' then 2
      when 'piquetage' then 3
      when 'trouaison' then 4
      else 0 end) >= v_rank;

    update public.interventions_techniques i
       set statut = 'realisee',
           date_intervention = coalesce(i.date_intervention, new.date_intervention),
           observations = concat_ws(E'\n', nullif(i.observations,''),
             'Étape préalable régularisée automatiquement car une étape ultérieure est enregistrée comme réalisée. Date réelle à confirmer si elle diffère de la date de référence.'),
           updated_at = now()
     where i.client_id = new.client_id
       and i.type_intervention = v_stage
       and (new.parcelle_id is null or i.parcelle_id is null or i.parcelle_id = new.parcelle_id)
       and lower(coalesce(i.statut,'')) not in ('realisee','valide','validee','terminee','completed');

    if not exists (
      select 1 from public.interventions_techniques i
      where i.client_id = new.client_id
        and i.type_intervention = v_stage
        and (new.parcelle_id is null or i.parcelle_id is null or i.parcelle_id = new.parcelle_id)
    ) then
      insert into public.interventions_techniques(
        client_id, plantation_id, parcelle_id, type_intervention,
        date_intervention, statut, agent_technique_id, observations
      ) values (
        new.client_id, new.plantation_id, new.parcelle_id, v_stage,
        coalesce(new.date_intervention, current_date), 'realisee',
        new.agent_technique_id,
        'Étape préalable régularisée automatiquement à partir d’une étape ultérieure réalisée. Date réelle non fournie; date de référence administrative à confirmer.'
      );
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_00_sync_technical_preceding_steps on public.interventions_techniques;
create trigger trg_00_sync_technical_preceding_steps
after insert or update of statut, type_intervention
on public.interventions_techniques
for each row execute function public.sync_technical_preceding_steps();

-- 5) Record the two planting operations reported by the Direction.
-- The date below is the date of administrative registration, not a claim that
-- it is the exact fieldwork date.
insert into public.interventions_techniques(
  client_id, plantation_id, parcelle_id, type_intervention,
  date_intervention, statut, agent_technique_id, observations
)
select c.id, null, c.parcelle_id, 'mise_en_terre',
       current_date, 'realisee', '50b7a48e-59a5-46d8-9980-9aad88c6c3a5'::uuid,
       'Mise en terre confirmée par la Direction; réalisée par YAO KONAN JEAN-MARIE. Date exacte de terrain non fournie; date affichée = régularisation administrative.'
from public.clients c
where c.id_unique in ('AGC-000006','AGC-000008')
  and c.parcelle_id is not null
  and not exists (
    select 1 from public.interventions_techniques i
    where i.client_id = c.id and i.type_intervention = 'mise_en_terre'
      and lower(coalesce(i.statut,'')) in ('realisee','valide','validee','terminee','completed')
  );

-- Link all recorded predecessor steps to the resulting plantation record.
update public.interventions_techniques i
set plantation_id = p.id, updated_at = now()
from public.plantations p
where i.client_id = p.client_id
  and i.plantation_id is null
  and i.type_intervention in ('validation_parcelle','defrichage','piquetage','trouaison','mise_en_terre')
  and i.parcelle_id = p.parcelle_id
  and p.client_id in (
    select id from public.clients where id_unique in ('AGC-000006','AGC-000008')
  );

-- Normalize the client operational phase and activation after the planting evidence exists.
update public.clients c
set phase_actuelle = 'plantation',
    compte_actif = case when c.validation_statut='valide' and exists (
      select 1 from public.paiements p where p.client_id=c.id
        and coalesce(p.est_paiement_initial,false)
        and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed')
        and coalesce(p.montant_paye,p.montant,0)>0
    ) then true else c.compte_actif end,
    statut_global = case when c.validation_statut='valide' and exists (
      select 1 from public.paiements p where p.client_id=c.id
        and coalesce(p.est_paiement_initial,false)
        and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed')
        and coalesce(p.montant_paye,p.montant,0)>0
    ) then 'actif' else c.statut_global end,
    updated_at = now()
where c.id_unique in ('AGC-000006','AGC-000008');

-- Update the uncompleted monthly instalment created under the previous Tionon formula.
update public.paiements p
set montant = 3500, montant_theorique = 3500,
    updated_at = now(),
    notes = concat_ws(' — ', nullif(p.notes,''),
      'Échéance recalculée selon PalmTerroir Essentielle: mensualité unique de 3 500 FCFA.')
from public.clients c
where c.id = p.client_id and c.id_unique = 'AGC-000005'
  and p.type_paiement = 'MENSUALITE'
  and p.statut = 'en_attente';
