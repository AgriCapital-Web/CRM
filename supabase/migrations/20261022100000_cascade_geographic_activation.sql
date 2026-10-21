-- The active flag of a parent controls every descendant, in both directions.
-- Triggers propagate one level at a time so that all hierarchy levels remain consistent.
create or replace function public.cascade_geo_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_active boolean;
  v_id uuid;
begin
  if tg_op = 'UPDATE' and new.est_actif is not distinct from old.est_actif then
    return new;
  end if;
  v_active := coalesce(new.est_actif, false);
  v_id := new.id;

  if tg_table_name = 'districts' then
    update public.regions set est_active = v_active where district_id = v_id and est_active is distinct from v_active;
  elsif tg_table_name = 'regions' then
    update public.departements set est_actif = v_active where region_id = v_id and est_actif is distinct from v_active;
  elsif tg_table_name = 'departements' then
    update public.sous_prefectures set est_active = v_active where departement_id = v_id and est_active is distinct from v_active;
  elsif tg_table_name = 'sous_prefectures' then
    update public.villages set est_actif = v_active where sous_prefecture_id = v_id and est_actif is distinct from v_active;
    update public.campements set est_actif = v_active where sous_prefecture_id = v_id and est_actif is distinct from v_active;
  elsif tg_table_name = 'villages' then
    update public.campements set est_actif = v_active where village_noyau_id = v_id and est_actif is distinct from v_active;
  end if;
  return new;
end;
$function$;

-- Keep the function generic while normalizing each table's active-column name.
create or replace function public.cascade_geo_activation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_active boolean;
  v_id uuid;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name in ('regions','sous_prefectures') then
      if new.est_active is not distinct from old.est_active then return new; end if;
      v_active := coalesce(new.est_active,false);
    else
      if new.est_actif is not distinct from old.est_actif then return new; end if;
      v_active := coalesce(new.est_actif,false);
    end if;
  else
    v_active := case when tg_table_name in ('regions','sous_prefectures') then coalesce(new.est_active,false) else coalesce(new.est_actif,false) end;
  end if;
  v_id := new.id;

  if tg_table_name = 'districts' then
    update public.regions set est_active = v_active where district_id = v_id and est_active is distinct from v_active;
  elsif tg_table_name = 'regions' then
    update public.departements set est_actif = v_active where region_id = v_id and est_actif is distinct from v_active;
  elsif tg_table_name = 'departements' then
    update public.sous_prefectures set est_active = v_active where departement_id = v_id and est_active is distinct from v_active;
  elsif tg_table_name = 'sous_prefectures' then
    update public.villages set est_actif = v_active where sous_prefecture_id = v_id and est_actif is distinct from v_active;
    update public.campements set est_actif = v_active where sous_prefecture_id = v_id and est_actif is distinct from v_active;
  elsif tg_table_name = 'villages' then
    update public.campements set est_actif = v_active where village_noyau_id = v_id and est_actif is distinct from v_active;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_geo_activation_cascade on public.districts;
create trigger trg_geo_activation_cascade after insert or update of est_actif on public.districts for each row execute function public.cascade_geo_activation_trigger();
drop trigger if exists trg_geo_activation_cascade on public.regions;
create trigger trg_geo_activation_cascade after insert or update of est_active on public.regions for each row execute function public.cascade_geo_activation_trigger();
drop trigger if exists trg_geo_activation_cascade on public.departements;
create trigger trg_geo_activation_cascade after insert or update of est_actif on public.departements for each row execute function public.cascade_geo_activation_trigger();
drop trigger if exists trg_geo_activation_cascade on public.sous_prefectures;
create trigger trg_geo_activation_cascade after insert or update of est_active on public.sous_prefectures for each row execute function public.cascade_geo_activation_trigger();
drop trigger if exists trg_geo_activation_cascade on public.villages;
create trigger trg_geo_activation_cascade after insert or update of est_actif on public.villages for each row execute function public.cascade_geo_activation_trigger();

-- Normalize active descendants in existing data according to the actual parent state.
update public.regions r set est_active = d.est_actif from public.districts d where d.id=r.district_id and r.est_active is distinct from d.est_actif;
update public.departements dep set est_actif = r.est_active from public.regions r where r.id=dep.region_id and dep.est_actif is distinct from r.est_active;
update public.sous_prefectures sp set est_active = dep.est_actif from public.departements dep where dep.id=sp.departement_id and sp.est_active is distinct from dep.est_actif;
update public.villages v set est_actif = sp.est_active from public.sous_prefectures sp where sp.id=v.sous_prefecture_id and v.est_actif is distinct from sp.est_active;
update public.campements c set est_actif = (sp.est_active and coalesce((select v.est_actif from public.villages v where v.id=c.village_noyau_id),true)) from public.sous_prefectures sp where sp.id=c.sous_prefecture_id and c.est_actif is distinct from (sp.est_active and coalesce((select v.est_actif from public.villages v where v.id=c.village_noyau_id),true));
