-- Harden unit validation for transactional independent-service quote editing.
create or replace function public.update_independent_service_quote(
  p_quote_id uuid,p_title text,p_observations text,p_items jsonb
)
returns public.independent_service_proformas
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid(); v_role text;
  v_quote public.independent_service_proformas%rowtype;
  v_total numeric(14,2); v_item_count integer;
begin
  if v_uid is null then raise exception 'Authentification requise'; end if;
  select ur.role into v_role from public.user_roles ur
  where ur.user_id=v_uid and ur.role in ('pdg','dg','service_client','chef_equipe_service_client') limit 1;
  if v_role is null then raise exception 'Accès non autorisé à la modification du devis'; end if;
  if p_title is null or length(trim(p_title))=0 or length(p_title)>180 then raise exception 'Le titre du devis est obligatoire (180 caractères maximum)'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Le devis doit contenir au moins une prestation'; end if;
  select * into v_quote from public.independent_service_proformas where id=p_quote_id for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if v_quote.status not in ('brouillon','emise','modification_demandee','refusee') then raise exception 'Ce devis ne peut plus être modifié dans son état actuel'; end if;
  if exists(select 1 from public.independent_service_invoices where proforma_id=p_quote_id and status<>'cancelled') then raise exception 'Un devis converti en facture ne peut plus être modifié'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(designation text,quantity numeric,unit text,unit_price numeric,annexe_active boolean,annexe_qualite text,annexe_prix numeric)
    where coalesce(trim(x.designation),'')='' or x.quantity is null or x.quantity<=0 or x.unit is null
    or x.unit not in ('hectares','plantes','points','forfait') or x.unit_price is null or x.unit_price<0
    or coalesce(x.annexe_active,false) and (coalesce(trim(x.annexe_qualite),'')='' or x.annexe_prix is null or x.annexe_prix<0))
    then raise exception 'Une ou plusieurs lignes de prestations sont invalides'; end if;
  select coalesce(sum(x.quantity*(x.unit_price+case when coalesce(x.annexe_active,false) then coalesce(x.annexe_prix,0) else 0 end)),0),count(*)
  into v_total,v_item_count from jsonb_to_recordset(p_items) as x(designation text,quantity numeric,unit text,unit_price numeric,annexe_active boolean,annexe_prix numeric);
  if v_item_count=0 then raise exception 'Le devis doit contenir au moins une prestation'; end if;
  update public.independent_service_proformas set title=trim(p_title),observations=nullif(trim(coalesce(p_observations,'')),''),
    subtotal=v_total,tax_amount=0,total_amount=v_total,updated_by=v_uid,updated_at=now()
    where id=p_quote_id returning * into v_quote;
  delete from public.independent_service_items where proforma_id=p_quote_id;
  insert into public.independent_service_items(proforma_id,catalog_id,designation,quantity,unit,unit_price,amount,hectares,annexe_active,annexe_qualite,annexe_prix,sort_order)
  select p_quote_id,nullif(x.catalog_id,'')::uuid,trim(x.designation),x.quantity,x.unit,x.unit_price,
    x.quantity*(x.unit_price+case when coalesce(x.annexe_active,false) then coalesce(x.annexe_prix,0) else 0 end),
    x.hectares,coalesce(x.annexe_active,false),case when coalesce(x.annexe_active,false) then nullif(trim(x.annexe_qualite),'') else null end,
    case when coalesce(x.annexe_active,false) then coalesce(x.annexe_prix,0) else 0 end,x.sort_order
  from jsonb_to_recordset(p_items) as x(catalog_id text,designation text,quantity numeric,unit text,unit_price numeric,hectares numeric,annexe_active boolean,annexe_qualite text,annexe_prix numeric,sort_order integer);
  insert into public.independent_service_events(proforma_id,event_code,actor_type,actor_id,details)
  values(p_quote_id,'reissued','staff',v_uid,jsonb_build_object('total_amount',v_total,'line_count',v_item_count,'title',trim(p_title)));
  return v_quote;
end;
$$;
