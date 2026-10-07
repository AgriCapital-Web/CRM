update public.plantations p
set district_id = r.district_id
from public.regions r
where p.region_id = r.id and p.district_id is null;

update public.clients c
set region_id=p.region_id,departement_id=p.departement_id,sous_prefecture_id=p.sous_prefecture_id,district_id=p.district_id
from public.plantations p
where p.client_id=c.id and c.region_id is null and p.region_id is not null;

update public.parcelles p
set sous_prefecture_id=sp.id,departement_id=sp.departement_id,region_id=d.region_id,district_id=r.district_id
from public.sous_prefectures sp
join public.departements d on d.id=sp.departement_id
join public.regions r on r.id=d.region_id
where p.id_unique='PAR-000006' and lower(trim(p.village))='gonaté' and lower(trim(sp.nom))='gonate';

create or replace function public.validate_geo_hierarchy()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_region uuid; v_district uuid; v_dept uuid;
begin
  if new.sous_prefecture_id is not null then
    select sp.departement_id,d.region_id into v_dept,v_region
    from public.sous_prefectures sp join public.departements d on d.id=sp.departement_id where sp.id=new.sous_prefecture_id;
    if v_dept is null or v_region is null then raise exception 'Référence géographique invalide'; end if;
    if new.departement_id is not null and new.departement_id<>v_dept then raise exception 'Géographie incohérente: sous-préfecture/département'; end if;
    new.departement_id:=v_dept; new.region_id:=v_region;
  elsif new.departement_id is not null then
    new.region_id:=(select region_id from public.departements where id=new.departement_id);
  end if;
  if new.region_id is not null then
    select district_id into v_district from public.regions where id=new.region_id;
    if v_district is null then raise exception 'Région sans district'; end if;
    if new.district_id is not null and new.district_id<>v_district then raise exception 'Géographie incohérente: région/district'; end if;
    new.district_id:=v_district;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_geo_clients on public.clients;
create trigger trg_validate_geo_clients before insert or update of district_id,region_id,departement_id,sous_prefecture_id on public.clients for each row execute function public.validate_geo_hierarchy();
drop trigger if exists trg_validate_geo_parcelles on public.parcelles;
create trigger trg_validate_geo_parcelles before insert or update of district_id,region_id,departement_id,sous_prefecture_id on public.parcelles for each row execute function public.validate_geo_hierarchy();
drop trigger if exists trg_validate_geo_plantations on public.plantations;
create trigger trg_validate_geo_plantations before insert or update of district_id,region_id,departement_id,sous_prefecture_id on public.plantations for each row execute function public.validate_geo_hierarchy();
