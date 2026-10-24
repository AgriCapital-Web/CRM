do $$
declare
  v_definition text;
  v_updated text;
  v_find text;
  v_replace text;
begin
  select pg_get_functiondef('public.create_client_acquisition(uuid,uuid,text,numeric,text,uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_updated := replace(v_definition,
    $find$v_land_required boolean;$find$,
    $replace$v_land_required boolean;
  v_required_lots integer;
  v_available_lot_ids uuid[];
  v_available_lot_count integer := 0;
  v_first_lot_number integer;
  v_last_lot_number integer;$replace$);

  v_find := $find$  else
    if p_lot_id is null then raise exception 'Cette offre nécessite de sélectionner un lot disponible sur une parcelle partenaire.'; end if;
    select * into v_lot from public.lots_hectares where id=p_lot_id for update;
    if v_lot.id is null then raise exception 'Lot introuvable'; end if;
    if v_lot.client_id is not null or lower(coalesce(v_lot.statut,'')) not in ('disponible','libre') or v_lot.acquisition_id is not null then
      raise exception 'Ce lot n’est plus disponible. Actualisez la liste et choisissez un autre lot.';
    end if;
    if v_lot.parcelle_id is null then raise exception 'Le lot doit être rattaché à une parcelle.'; end if;
    if abs(coalesce(v_lot.surface_ha,0)-v_surface) > 0.0001 then
      raise exception 'La superficie demandée doit correspondre à la superficie du lot sélectionné.';
    end if;
    select * into v_parcelle from public.parcelles where id=v_lot.parcelle_id for update;
    if v_parcelle.id is null or v_parcelle.proprietaire_id is null then
      raise exception 'Le lot doit appartenir à une parcelle partenaire dont le propriétaire est enregistré.';
    end if;
    if p_parcelle_id is not null and p_parcelle_id is distinct from v_parcelle.id then
      raise exception 'Le lot choisi ne correspond pas à la parcelle sélectionnée.';
    end if;
    p_parcelle_id := v_parcelle.id;
  end if;$find$;
  v_replace := $replace$  else
    if p_lot_id is null then raise exception 'Cette offre nécessite de sélectionner le lot de départ sur une parcelle partenaire.'; end if;
    select * into v_lot from public.lots_hectares where id=p_lot_id for update;
    if v_lot.id is null then raise exception 'Lot introuvable'; end if;
    if v_lot.client_id is not null or lower(coalesce(v_lot.statut,'')) not in ('disponible','libre') or v_lot.acquisition_id is not null then
      raise exception 'Ce lot n’est plus disponible. Actualisez la liste et choisissez un autre lot.';
    end if;
    if v_lot.parcelle_id is null then raise exception 'Le lot doit être rattaché à une parcelle.'; end if;
    select * into v_parcelle from public.parcelles where id=v_lot.parcelle_id for update;
    if v_parcelle.id is null or v_parcelle.proprietaire_id is null then
      raise exception 'Le lot doit appartenir à une parcelle partenaire dont le propriétaire est enregistré.';
    end if;
    if p_parcelle_id is not null and p_parcelle_id is distinct from v_parcelle.id then
      raise exception 'Le lot choisi ne correspond pas à la parcelle sélectionnée.';
    end if;
    if upper(coalesce(v_offer.famille_offre,v_offer.code,''))='PALMINVEST' then
      if abs(v_surface-round(v_surface))>0.0001 or v_surface<1 then
        raise exception 'PalmInvest doit être attribué par lots entiers de 1 hectare.';
      end if;
      v_required_lots:=round(v_surface)::integer;
      select array_agg(x.id order by x.numero_h),count(*)::integer,min(x.numero_h),max(x.numero_h)
        into v_available_lot_ids,v_available_lot_count,v_first_lot_number,v_last_lot_number
        from (
          select l.id,l.numero_h
            from public.lots_hectares l
           where l.parcelle_id=v_parcelle.id
             and l.client_id is null
             and lower(coalesce(l.statut,'')) in ('disponible','libre')
             and l.acquisition_id is null
             and l.numero_h>=v_lot.numero_h
           order by l.numero_h
           limit v_required_lots
           for update
        ) x;
      if coalesce(v_available_lot_count,0)<>v_required_lots
         or v_first_lot_number is distinct from v_lot.numero_h
         or v_last_lot_number-v_first_lot_number+1<>v_required_lots
         or v_available_lot_ids[1] is distinct from p_lot_id then
        raise exception 'Il faut sélectionner un début de série disposant de % lots contigus de 1 ha. Aucun lot ne sera attribué tant que la série complète n’est pas disponible.',v_required_lots;
      end if;
    else
      if abs(coalesce(v_lot.surface_ha,0)-v_surface)>0.0001 then
        raise exception 'La superficie demandée doit correspondre à la superficie du lot sélectionné.';
      end if;
      v_available_lot_ids:=array[p_lot_id]::uuid[];
      v_available_lot_count:=1;
      v_first_lot_number:=v_lot.numero_h;
      v_last_lot_number:=v_lot.numero_h;
    end if;
    p_parcelle_id:=v_parcelle.id;
  end if;$replace$;
  v_updated := replace(v_updated,v_find,v_replace);
  if v_updated = v_definition then raise exception 'Le bloc de validation des lots a changé; migration annulée.'; end if;

  v_find := $find$      'montant_total_base',v_total_base*v_surface,'montant_pi_base',v_pi_base*v_surface)$find$;
  v_replace := $replace$      'montant_total_base',v_total_base*v_surface,'montant_pi_base',v_pi_base*v_surface,
      'lot_ids',to_jsonb(coalesce(v_available_lot_ids,array[]::uuid[])),
      'lot_references',(select coalesce(jsonb_agg(v_parcelle.id_unique||'-L'||lpad(l.numero_h::text,2,'0') order by l.numero_h),'[]'::jsonb) from public.lots_hectares l where l.id=any(coalesce(v_available_lot_ids,array[]::uuid[]))),
      'lot_reference_group',case when coalesce(v_available_lot_count,0)>1 then v_parcelle.id_unique||'-L'||lpad(v_first_lot_number::text,2,'0')||'-'||lpad(v_last_lot_number::text,2,'0') else null end)$replace$;
  v_updated := replace(v_updated,v_find,v_replace);

  v_find := $find$  if p_lot_id is not null then
    update public.lots_hectares set client_id=v_client.id,statut='attribue',
      date_attribution=coalesce(date_attribution,current_date),acquisition_id=v_acquisition_id,updated_at=now()
    where id=p_lot_id;
    update public.acquisition_lots set acquisition_id=v_acquisition_id
    where client_id=v_client.id and lot_id=p_lot_id;
  end if;$find$;
  v_replace := $replace$  if p_lot_id is not null then
    if v_available_lot_ids is null then
      v_available_lot_ids:=array[p_lot_id]::uuid[];
      v_available_lot_count:=1;
      v_first_lot_number:=v_lot.numero_h;
      v_last_lot_number:=v_lot.numero_h;
    end if;
    update public.lots_hectares set client_id=v_client.id,statut='attribue',
      date_attribution=coalesce(date_attribution,current_date),acquisition_id=v_acquisition_id,updated_at=now()
    where id=any(v_available_lot_ids);
    insert into public.acquisition_lots(client_id,lot_id,surface_ha,notes,created_by,acquisition_id)
    select v_client.id,l.id,coalesce(l.surface_ha,1),'Attribution de lot(s) à la souscription '||v_acquisition_id::text,v_user,v_acquisition_id
      from public.lots_hectares l where l.id=any(v_available_lot_ids)
    on conflict (client_id,lot_id) do update
      set acquisition_id=excluded.acquisition_id,surface_ha=excluded.surface_ha,notes=excluded.notes;
  end if;$replace$;
  v_updated := replace(v_updated,v_find,v_replace);
  execute v_updated;
end $$;