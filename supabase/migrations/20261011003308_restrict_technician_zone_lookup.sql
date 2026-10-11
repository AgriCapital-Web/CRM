create or replace function public.resolve_technicien_zone(p_plantation_id uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $function$
 select p.id from public.profiles p join public.zone_assignments za on za.user_id=p.user_id
 where public.is_staff(auth.uid()) and p.actif=true
 and exists(select 1 from public.user_roles ur where ur.user_id=p.user_id and ur.role='technicien')
 and ((za.zone_type='sous_prefecture' and za.zone_id=(select sous_prefecture_id from public.plantations where id=p_plantation_id))
 or (za.zone_type='departement' and za.zone_id=(select departement_id from public.plantations where id=p_plantation_id))
 or (za.zone_type='region' and za.zone_id=(select region_id from public.plantations where id=p_plantation_id))
 or (za.zone_type='district' and za.zone_id=(select district_id from public.plantations where id=p_plantation_id)))
 order by case za.zone_type when 'sous_prefecture' then 1 when 'departement' then 2 when 'region' then 3 when 'district' then 4 else 9 end,p.nom_complet limit 1;
$function$;
