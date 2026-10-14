CREATE OR REPLACE FUNCTION public.validate_formula_technical_intervention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_formula text;
  v_plantation_date date;
  v_client_id uuid;
  v_client_parcelle uuid;
  v_sub public.client_souscriptions%rowtype;
  v_plantation_subscription uuid;
begin
  if new.plantation_id is not null then
    select p.client_id,p.parcelle_id,p.date_plantation,coalesce(s.formule_code,c.formule_code),p.souscription_id
      into v_client_id,new.parcelle_id,v_plantation_date,v_formula,v_plantation_subscription
    from public.plantations p
    join public.clients c on c.id=p.client_id
    left join public.client_souscriptions s on s.id=p.souscription_id
    where p.id=new.plantation_id;
    if v_client_id is null then raise exception 'Plantation introuvable pour l’intervention'; end if;
    if new.client_id is null then new.client_id:=v_client_id; end if;
    if new.client_id is distinct from v_client_id then raise exception 'Le Client de l’intervention ne correspond pas à la plantation sélectionnée'; end if;
    if new.souscription_id is not null and new.souscription_id is distinct from v_plantation_subscription then
      raise exception 'La souscription ne correspond pas à la plantation sélectionnée';
    end if;
    if new.souscription_id is null then new.souscription_id:=v_plantation_subscription; end if;
  else
    v_client_id:=new.client_id;
    if new.souscription_id is not null then
      select * into v_sub from public.client_souscriptions where id=new.souscription_id;
      if not found then raise exception 'Souscription introuvable pour l’intervention'; end if;
      if v_client_id is null then v_client_id:=v_sub.client_id; new.client_id:=v_client_id; end if;
      if v_client_id is distinct from v_sub.client_id then raise exception 'La souscription ne correspond pas au client de l’intervention'; end if;
      v_formula:=v_sub.formule_code;
      v_client_parcelle:=v_sub.parcelle_id;
      if new.parcelle_id is null and v_client_parcelle is not null then new.parcelle_id:=v_client_parcelle;
      elsif new.parcelle_id is not null and v_client_parcelle is not null and new.parcelle_id is distinct from v_client_parcelle then
        raise exception 'La parcelle de l’intervention ne correspond pas à la souscription sélectionnée';
      end if;
      select p.date_plantation into v_plantation_date from public.plantations p
        where p.souscription_id=new.souscription_id order by p.date_plantation desc nulls last limit 1;
    elsif v_client_id is not null then
      select c.formule_code,c.parcelle_id into v_formula,v_client_parcelle from public.clients c where c.id=v_client_id;
      if new.parcelle_id is null and v_client_parcelle is not null then new.parcelle_id:=v_client_parcelle;
      elsif new.parcelle_id is not null and v_client_parcelle is not null and new.parcelle_id is distinct from v_client_parcelle then
        raise exception 'La parcelle de l’intervention ne correspond pas au dossier Client';
      end if;
      select p.date_plantation into v_plantation_date from public.plantations p
        where p.client_id=v_client_id and p.parcelle_id=new.parcelle_id
        order by p.date_plantation desc nulls last limit 1;
    end if;
  end if;

  if new.type_intervention='mise_en_terre' and new.statut='realisee'
     and (new.client_id is null or new.parcelle_id is null) then
    raise exception 'La mise en terre réalisée doit être rattachée à un Client et à une parcelle';
  end if;
  if coalesce(v_formula,'') like 'PALMTERROIR%' and v_plantation_date is not null
     and new.date_intervention::date>v_plantation_date
     and new.type_intervention not in ('suivi_mensuel','autre') then
    raise exception 'Intervention non autorisée pour PalmTerroir après la mise en terre : %',new.type_intervention;
  elsif coalesce(v_formula,'') like 'PALMTERROIR%'
     and (v_plantation_date is null or new.date_intervention::date<v_plantation_date)
     and new.type_intervention not in ('validation_parcelle','piquetage','trouaison','mise_en_terre','autre') then
    raise exception 'Intervention non autorisée pour PalmTerroir avant la mise en terre : %',new.type_intervention;
  end if;
  return new;
end;
$function$
