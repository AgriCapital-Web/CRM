create or replace function public.sync_planting_to_acquisition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(new.type_intervention,'')) <> 'mise_en_terre'
     or lower(coalesce(new.statut,'')) not in ('realisee','valide','validee','terminee','completed') then
    return new;
  end if;
  if new.acquisition_id is not null then
    update public.acquisitions
       set statut_technique='mise_en_terre_realisee', validation_statut='valide', updated_at=now()
     where id=new.acquisition_id and client_id=new.client_id;
    update public.plantations
       set statut='actif', statut_global='actif',
           date_plantation=coalesce(date_plantation,new.date_intervention),
           nombre_plants_mis_en_terre=coalesce(new.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     where acquisition_id=new.acquisition_id;
  elsif new.plantation_id is not null then
    update public.plantations
       set statut='actif', statut_global='actif',
           date_plantation=coalesce(date_plantation,new.date_intervention),
           nombre_plants_mis_en_terre=coalesce(new.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     where id=new.plantation_id and client_id=new.client_id;
  else
    update public.plantations
       set statut='actif', statut_global='actif',
           date_plantation=coalesce(date_plantation,new.date_intervention),
           nombre_plants_mis_en_terre=coalesce(new.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     where client_id=new.client_id
       and (new.parcelle_id is null or parcelle_id=new.parcelle_id)
       and acquisition_id is null;
  end if;
  return new;
end;
$function$;

create or replace function public.generer_commission_technique_mise_en_terre()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_plantation_id uuid;
  v_profile_id uuid;
  v_montant numeric;
  v_exoneree boolean := false;
begin
  if new.statut <> 'realisee' or new.type_intervention <> 'mise_en_terre' then return new; end if;
  v_client_id := new.client_id;
  v_profile_id := new.agent_technique_id;
  if v_profile_id is null or v_client_id is null then return new; end if;

  if new.acquisition_id is not null then
    select coalesce((metadata->>'commission_technique_exoneree')::boolean,false)
      into v_exoneree from public.acquisitions where id=new.acquisition_id and client_id=new.client_id;
    if coalesce(v_exoneree,false) then return new; end if;
    select id into v_plantation_id from public.plantations
     where acquisition_id=new.acquisition_id order by created_at desc limit 1;
  end if;
  v_plantation_id := coalesce(v_plantation_id,new.plantation_id);
  if v_plantation_id is null then
    select p.id into v_plantation_id from public.plantations p
     where p.client_id=v_client_id and (new.parcelle_id is null or p.parcelle_id=new.parcelle_id)
       and p.acquisition_id is null
     order by p.date_plantation desc nulls last,p.created_at desc limit 1;
  end if;

  select gr.montant into v_montant from public.grille_remuneration gr
   where gr.code_regle='TECHNIQUE_MISE_EN_TERRE' and gr.actif
   order by gr.updated_at desc limit 1;
  if coalesce(v_montant,0)<=0 then return new; end if;

  if not exists (
    select 1 from public.commissions c
     where c.profile_id=v_profile_id and c.client_id=v_client_id
       and c.type_commission='technique'
       and c.plantation_id is not distinct from v_plantation_id
       and c.statut <> 'annule'
  ) then
    insert into public.commissions(profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,montant_commission,periode,date_calcul,statut)
    values(v_profile_id,v_plantation_id,v_client_id,'technique',v_montant,0,v_montant,coalesce(new.date_intervention,current_date),now(),'validee');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_commission_technique_mise_en_terre on public.interventions_techniques;
create trigger trg_z_commission_technique_mise_en_terre
after insert or update of statut, type_intervention, plantation_id, agent_technique_id
on public.interventions_techniques for each row
execute function public.generer_commission_technique_mise_en_terre();