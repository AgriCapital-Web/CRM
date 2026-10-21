-- Cumulative technical milestones: include every predecessor required by the client's offer.
create or replace function public.sync_technical_preceding_steps()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_rank integer;
  v_stage text;
  v_stage_rank integer;
  v_formula text;
  v_stages text[];
begin
  if pg_trigger_depth() > 1
     or new.client_id is null
     or lower(coalesce(new.statut,'')) not in ('realisee','valide','validee','terminee','completed') then
    return new;
  end if;

  select c.formule_code into v_formula
  from public.clients c where c.id=new.client_id;

  if coalesce(v_formula,'') like 'PALMTERROIR%' then
    v_stages := array['validation_parcelle','piquetage','trouaison'];
    v_rank := case lower(coalesce(new.type_intervention,''))
      when 'validation_parcelle' then 1
      when 'piquetage' then 2
      when 'trouaison' then 3
      when 'mise_en_terre' then 4
      else 0
    end;
  else
    v_stages := array['validation_parcelle','defrichage','piquetage','trouaison'];
    v_rank := case lower(coalesce(new.type_intervention,''))
      when 'validation_parcelle' then 1
      when 'defrichage' then 2
      when 'piquetage' then 3
      when 'trouaison' then 4
      when 'mise_en_terre' then 5
      else 0
    end;
  end if;

  if v_rank <= 1 then return new; end if;

  foreach v_stage in array v_stages loop
    v_stage_rank := array_position(v_stages, v_stage);
    exit when v_stage_rank >= v_rank;

    update public.interventions_techniques i
       set statut = 'realisee',
           date_intervention = coalesce(i.date_intervention, new.date_intervention),
           observations = concat_ws(E'\n', nullif(i.observations,''),
             'Étape préalable validée automatiquement à partir d’une étape ultérieure réalisée. Date réelle à confirmer si elle diffère de la date de référence.'),
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
