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
  v_sub public.acquisitions%rowtype;
  v_plantation_acquisition uuid;
  v_preplant_backfill boolean := false;
begin
  if new.plantation_id is not null then
    select p.client_id,p.parcelle_id,p.date_plantation,coalesce(s.formule_code,c.formule_code),p.acquisition_id
      into v_client_id,new.parcelle_id,v_plantation_date,v_formula,v_plantation_acquisition
    from public.plantations p
    join public.clients c on c.id=p.client_id
    left join public.acquisitions s on s.id=p.acquisition_id
    where p.id=new.plantation_id;
    if v_client_id is null then raise exception 'Plantation introuvable pour l’intervention'; end if;
    if new.client_id is null then new.client_id:=v_client_id; end if;
    if new.client_id is distinct from v_client_id then raise exception 'Le Client de l’intervention ne correspond pas à la plantation sélectionnée'; end if;
    if new.acquisition_id is not null and new.acquisition_id is distinct from v_plantation_acquisition then
      raise exception 'La acquisition ne correspond pas à la plantation sélectionnée';
    end if;
    if new.acquisition_id is null then new.acquisition_id:=v_plantation_acquisition; end if;
    if new.type_intervention in ('validation_parcelle','defrichage','piquetage','trouaison') then
      SELECT
        (coalesce(p.surface_reellement_plantee,0)>0
          OR coalesce(p.nombre_plants_mis_en_terre,0)>0
          OR p.date_plantation is not null)
        OR EXISTS (
          SELECT 1 FROM public.interventions_techniques mi
          WHERE mi.plantation_id=p.id
            AND mi.type_intervention='mise_en_terre'
            AND lower(coalesce(mi.statut,'')) IN
              ('realise','realisee','termine','terminee','valide','validee','complete','complet','acheve','achevee')
        )
      INTO v_preplant_backfill
      FROM public.plantations p
      WHERE p.id=new.plantation_id;
    end if;
  else
    v_client_id:=new.client_id;
    if new.acquisition_id is not null then
      select * into v_sub from public.acquisitions where id=new.acquisition_id;
      if not found then raise exception 'Souscription introuvable pour l’intervention'; end if;
      if v_client_id is null then v_client_id:=v_sub.client_id; new.client_id:=v_client_id; end if;
      if v_client_id is distinct from v_sub.client_id then raise exception 'La acquisition ne correspond pas au client de l’intervention'; end if;
      v_formula:=v_sub.formule_code;
      v_client_parcelle:=v_sub.parcelle_id;
      if new.parcelle_id is null and v_client_parcelle is not null then
        new.parcelle_id:=v_client_parcelle;
      elsif new.parcelle_id is not null and v_client_parcelle is not null and new.parcelle_id is distinct from v_client_parcelle then
        IF new.lot_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.acquisition_lots al
          JOIN public.lots_hectares lh ON lh.id=al.lot_id
          WHERE al.acquisition_id=v_sub.id AND al.client_id=v_sub.client_id
            AND al.lot_id=new.lot_id AND al.surface_ha>0
            AND lh.parcelle_id=new.parcelle_id AND lh.client_id=v_sub.client_id
            AND lh.acquisition_id=v_sub.id
        ) THEN
          raise exception 'La parcelle et le lot de l’intervention doivent être rattachés à l’acquisition sélectionnée';
        END IF;
      end if;
      select p.date_plantation into v_plantation_date from public.plantations p
        where p.acquisition_id=new.acquisition_id
          and (new.parcelle_id is null or p.parcelle_id=new.parcelle_id)
        order by p.date_plantation desc nulls last limit 1;
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

  -- Historical backfill: once planting is evidenced, its prerequisite stages
  -- may be recorded/validated afterwards without being mistaken for new work.
  if coalesce(v_formula,'') like 'PALMTERROIR%' and not v_preplant_backfill
     and v_plantation_date is not null
     and new.date_intervention::date>v_plantation_date
     and new.type_intervention not in ('suivi_mensuel','autre') then
    raise exception 'Intervention non autorisée pour PalmTerroir après la mise en terre : %',new.type_intervention;
  elsif coalesce(v_formula,'') like 'PALMTERROIR%' and not v_preplant_backfill
     and (v_plantation_date is null or new.date_intervention::date<v_plantation_date)
     and new.type_intervention not in ('validation_parcelle','defrichage','piquetage','trouaison','mise_en_terre','autre') then
    raise exception 'Intervention non autorisée pour PalmTerroir avant la mise en terre : %',new.type_intervention;
  end if;
  return new;
end;
$function$;