-- Keep explicit child activation choices when a geographic parent is re-enabled.
-- Effective visibility remains computed by v_geo_* from the complete parent chain.
begin;

drop trigger if exists trg_geo_activation_cascade on public.districts;
drop trigger if exists trg_geo_activation_cascade on public.regions;
drop trigger if exists trg_geo_activation_cascade on public.departements;
drop trigger if exists trg_geo_activation_cascade on public.sous_prefectures;
drop trigger if exists trg_geo_activation_cascade on public.villages;

create or replace function public.cascade_geo_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_status boolean;
  old_status boolean;
begin
  if tg_table_name = 'districts' then
    new_status := new.est_actif;
    old_status := old.est_actif;
    if new_status is distinct from old_status and new_status = false then
      update public.regions set est_active = false
      where district_id = new.id and est_active = true;
    end if;

  elsif tg_table_name = 'regions' then
    new_status := new.est_active;
    old_status := old.est_active;
    if new_status is distinct from old_status then
      if new_status = false then
        update public.departements set est_actif = false
        where region_id = new.id and est_actif = true;
      elsif exists (
        select 1 from public.districts
        where id = new.district_id and est_actif = false
      ) then
        raise exception 'Impossible d''activer la région : le district parent est désactivé';
      end if;
    end if;

  elsif tg_table_name = 'departements' then
    new_status := new.est_actif;
    old_status := old.est_actif;
    if new_status is distinct from old_status then
      if new_status = false then
        update public.sous_prefectures set est_active = false
        where departement_id = new.id and est_active = true;
      elsif exists (
        select 1 from public.regions
        where id = new.region_id and est_active = false
      ) then
        raise exception 'Impossible d''activer le département : la région parente est désactivée';
      end if;
    end if;

  elsif tg_table_name = 'sous_prefectures' then
    new_status := new.est_active;
    old_status := old.est_active;
    if new_status is distinct from old_status and new_status = false then
      update public.villages set est_actif = false
      where sous_prefecture_id = new.id and est_actif = true;
      update public.campements set est_actif = false
      where sous_prefecture_id = new.id and est_actif = true;
    elsif new_status is distinct from old_status and new_status = true and exists (
      select 1 from public.departements
      where id = new.departement_id and est_actif = false
    ) then
      raise exception 'Impossible d''activer la sous-préfecture : le département parent est désactivé';
    end if;

  elsif tg_table_name = 'villages' then
    new_status := new.est_actif;
    old_status := old.est_actif;
    if new_status is distinct from old_status then
      if new_status = false then
        update public.campements set est_actif = false
        where village_noyau_id = new.id and est_actif = true;
      elsif exists (
        select 1 from public.sous_prefectures
        where id = new.sous_prefecture_id and est_active = false
      ) then
        raise exception 'Impossible d''activer le village : la sous-préfecture parente est désactivée';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

commit;