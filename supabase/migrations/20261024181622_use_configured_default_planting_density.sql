create or replace function public.set_plantation_planned_plants()
returns trigger language plpgsql set search_path=public as $$
declare v_default_density numeric;
begin
  select nullif(trim(c.valeur),'')::numeric into v_default_density from public.configurations_systeme c where c.cle='plantation_densite_defaut' limit 1;
  if coalesce(new.densite_cible,0)<=0 and coalesce(v_default_density,0)>0 then new.densite_cible:=v_default_density; end if;
  if coalesce(new.nombre_plants_prevus,0)<=0 and coalesce(new.superficie_ha,0)>0 and coalesce(new.densite_cible,0)>0 then new.nombre_plants_prevus:=round(new.superficie_ha*new.densite_cible)::integer; end if;
  if coalesce(new.densite_plants,0)<=0 then new.densite_plants:=coalesce(nullif(new.densite_cible,0),nullif(v_default_density,0)); end if;
  return new;
end $$;
create or replace function public.set_intervention_planned_plants()
returns trigger language plpgsql set search_path=public as $$
declare v_default_density numeric; v_area numeric; v_density numeric; v_plants integer;
begin
  select nullif(trim(c.valeur),'')::numeric into v_default_density from public.configurations_systeme c where c.cle='plantation_densite_defaut' limit 1;
  if coalesce(new.densite_plants,0)<=0 and coalesce(v_default_density,0)>0 then new.densite_plants:=v_default_density; end if;
  if coalesce(new.nombre_plants_prevus,0)<=0 and new.plantation_id is not null then
    select p.superficie_ha,p.densite_cible,p.nombre_plants_prevus into v_area,v_density,v_plants from public.plantations p where p.id=new.plantation_id;
    v_density:=coalesce(nullif(v_density,0),nullif(new.densite_plants,0),nullif(v_default_density,0));
    if coalesce(v_plants,0)>0 then new.nombre_plants_prevus:=v_plants;
    elsif coalesce(v_area,0)>0 and coalesce(v_density,0)>0 then new.nombre_plants_prevus:=round(v_area*v_density)::integer;
    end if;
    if coalesce(new.densite_plants,0)<=0 then new.densite_plants:=v_density; end if;
  end if;
  return new;
end $$;