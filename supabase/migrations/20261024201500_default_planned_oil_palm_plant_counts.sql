create or replace function public.set_plantation_planned_plants()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if coalesce(new.densite_cible,0)<=0 then new.densite_cible:=143; end if;
  if coalesce(new.nombre_plants_prevus,0)<=0 and coalesce(new.superficie_ha,0)>0 then
    new.nombre_plants_prevus:=round(new.superficie_ha*new.densite_cible)::integer;
  end if;
  if coalesce(new.densite_plants,0)<=0 then new.densite_plants:=new.densite_cible; end if;
  return new;
end $$;
drop trigger if exists trg_set_plantation_planned_plants on public.plantations;
create trigger trg_set_plantation_planned_plants
before insert or update of superficie_ha,densite_cible,nombre_plants_prevus,densite_plants
on public.plantations for each row execute function public.set_plantation_planned_plants();

create or replace function public.set_intervention_planned_plants()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_area numeric;
  v_density numeric;
  v_plants integer;
begin
  if coalesce(new.densite_plants,0)<=0 then new.densite_plants:=143; end if;
  if coalesce(new.nombre_plants_prevus,0)<=0 and new.plantation_id is not null then
    select p.superficie_ha,p.densite_cible,p.nombre_plants_prevus into v_area,v_density,v_plants
    from public.plantations p where p.id=new.plantation_id;
    new.nombre_plants_prevus:=coalesce(nullif(v_plants,0),round(coalesce(v_area,0)*coalesce(v_density,new.densite_plants,143))::integer);
    if coalesce(new.densite_plants,0)<=0 then new.densite_plants:=coalesce(v_density,143); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_set_intervention_planned_plants on public.interventions_techniques;
create trigger trg_set_intervention_planned_plants
before insert or update of plantation_id,nombre_plants_prevus,densite_plants
on public.interventions_techniques for each row execute function public.set_intervention_planned_plants();

update public.plantations
set densite_cible=coalesce(nullif(densite_cible,0),143),
    nombre_plants_prevus=coalesce(nullif(nombre_plants_prevus,0),round(coalesce(superficie_ha,0)*coalesce(nullif(densite_cible,0),143))::integer),
    densite_plants=coalesce(nullif(densite_plants,0),coalesce(nullif(densite_cible,0),143)),
    updated_at=now()
where coalesce(nombre_plants_prevus,0)<=0 or coalesce(densite_cible,0)<=0 or coalesce(densite_plants,0)<=0;

update public.plantations set densite_cible=143,updated_at=now()
where id_unique='PLT-000016' and coalesce(densite_cible,0)<>143;