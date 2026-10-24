begin;
lock table public.interventions_techniques in share row exclusive mode;
alter table public.interventions_techniques disable trigger trg_validate_formula_technical_intervention;
update public.interventions_techniques i
set nombre_plants_prevus=coalesce(nullif(i.nombre_plants_prevus,0),nullif(p.nombre_plants_prevus,0),round(coalesce(p.superficie_ha,0)*coalesce(nullif(p.densite_cible,0),143))::integer),
    densite_plants=coalesce(nullif(i.densite_plants,0),coalesce(nullif(p.densite_cible,0),143))
from public.plantations p
where p.id=i.plantation_id and (coalesce(i.nombre_plants_prevus,0)<=0 or coalesce(i.densite_plants,0)<=0);
alter table public.interventions_techniques enable trigger trg_validate_formula_technical_intervention;
commit;