create or replace function public.calculate_parcelle_surfaces()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if coalesce(new.mode_surface,'foncier')='actif_agricole' then
    new.surface_proprietaire_ha:=new.surface_totale_ha;
    new.surface_agricapital_ha:=new.surface_totale_ha;
    new.surface_disponible_ha:=greatest(new.surface_agricapital_ha-coalesce(new.surface_attribuee_ha,0),0);
  elsif lower(coalesce(new.mode_surface,'')) in ('propriete_client','propriete','client') then
    new.surface_proprietaire_ha:=new.surface_totale_ha;
    new.surface_agricapital_ha:=0;
    new.surface_attribuee_ha:=least(coalesce(new.surface_attribuee_ha,0),new.surface_totale_ha);
    new.surface_disponible_ha:=0;
  elsif lower(coalesce(new.mode_surface,'')) in ('plante_partage','achat') then
    new.surface_proprietaire_ha:=greatest(coalesce(new.surface_proprietaire_ha,0),0);
    new.surface_agricapital_ha:=greatest(coalesce(new.surface_agricapital_ha,0),0);
    new.surface_attribuee_ha:=least(coalesce(new.surface_attribuee_ha,0),new.surface_agricapital_ha);
    new.surface_disponible_ha:=greatest(new.surface_agricapital_ha-new.surface_attribuee_ha,0);
  else
    new.surface_proprietaire_ha:=new.surface_totale_ha/2;
    new.surface_agricapital_ha:=new.surface_totale_ha/2;
    new.surface_disponible_ha:=greatest(0,new.surface_agricapital_ha-coalesce(new.surface_attribuee_ha,0));
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_parcelles_calculate_surfaces on public.parcelles;
create trigger trg_parcelles_calculate_surfaces
before insert or update of surface_totale_ha,surface_attribuee_ha,mode_surface,surface_agricapital_ha,surface_proprietaire_ha
on public.parcelles for each row execute function public.calculate_parcelle_surfaces();
update public.parcelles set surface_totale_ha=surface_totale_ha;