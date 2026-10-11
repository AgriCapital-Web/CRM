create or replace function public.get_default_commercial_for_client(_current_user uuid)
returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_default uuid;
begin
 if auth.uid() is null or _current_user is distinct from auth.uid() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if _current_user is null then return null; end if;
 if private.has_role(_current_user,'commercial') or private.has_role(_current_user,'chef_equipe_commercial') or private.has_role(_current_user,'responsable_commercial') then
  if private.is_commercial_assignable(_current_user) then return _current_user; end if;
 end if;
 select p.user_id into v_default from public.profiles p
 where p.user_id is not null and p.actif=true
 and exists(select 1 from public.user_roles ur where ur.user_id=p.user_id and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
 order by coalesce((select sum(coalesce(c.montant_total_contrat,0)) from public.clients c where c.commercial_id=p.user_id),0) desc,
 coalesce((select count(*) from public.clients c where c.commercial_id=p.user_id),0) desc,
 coalesce((select count(*) from public.leads l where l.assigned_to=p.user_id and l.statut='converti'),0) desc,p.nom_complet asc limit 1;
 return v_default;
end;
$function$;
