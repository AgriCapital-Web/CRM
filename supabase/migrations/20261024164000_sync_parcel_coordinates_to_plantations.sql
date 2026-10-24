create or replace function public.sync_parcelle_coordinates_to_plantations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.plantations
     set localisation_gps_lat=new.localisation_gps_lat,
         localisation_gps_lng=new.localisation_gps_lng,
         latitude=new.localisation_gps_lat,
         longitude=new.localisation_gps_lng,
         polygone_gps=new.polygone_gps,
         updated_at=now()
   where parcelle_id=new.id
     and (
       localisation_gps_lat is distinct from new.localisation_gps_lat
       or localisation_gps_lng is distinct from new.localisation_gps_lng
       or polygone_gps is distinct from new.polygone_gps
     );
  return new;
end;
$function$;

drop trigger if exists trg_sync_parcelle_coordinates_to_plantations on public.parcelles;
create trigger trg_sync_parcelle_coordinates_to_plantations
after update of localisation_gps_lat, localisation_gps_lng, polygone_gps
on public.parcelles
for each row execute function public.sync_parcelle_coordinates_to_plantations();