create or replace function public.sync_plantation_gps_coordinates()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    if new.latitude is null then new.latitude:=new.localisation_gps_lat; end if;
    if new.longitude is null then new.longitude:=new.localisation_gps_lng; end if;
    if new.localisation_gps_lat is null then new.localisation_gps_lat:=new.latitude; end if;
    if new.localisation_gps_lng is null then new.localisation_gps_lng:=new.longitude; end if;
  else
    if new.latitude is distinct from old.latitude then new.localisation_gps_lat:=new.latitude;
    elsif new.localisation_gps_lat is distinct from old.localisation_gps_lat then new.latitude:=new.localisation_gps_lat;
    end if;
    if new.longitude is distinct from old.longitude then new.localisation_gps_lng:=new.longitude;
    elsif new.localisation_gps_lng is distinct from old.localisation_gps_lng then new.longitude:=new.localisation_gps_lng;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_plantation_gps_coordinates on public.plantations;
create trigger trg_sync_plantation_gps_coordinates
before insert or update of latitude,longitude,localisation_gps_lat,localisation_gps_lng
on public.plantations for each row execute function public.sync_plantation_gps_coordinates();