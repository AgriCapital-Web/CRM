begin;
alter table public.lots_hectares add column if not exists part_type text not null default 'agricapital';
alter table public.plantations add column if not exists lot_reference_group text;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lots_hectares'::regclass and conname='lots_hectares_part_type_check') then
    alter table public.lots_hectares add constraint lots_hectares_part_type_check check (part_type in ('agricapital','proprietaire'));
  end if;
end $$;
do $$
declare
  v_parcelle_id uuid; v_emmanuel_id uuid; v_zagble_id uuid; v_emmanuel_creator uuid; v_zagble_creator uuid;
  v_l01 uuid; v_l02 uuid; v_l03 uuid; v_l04 uuid;
begin
  select id into v_parcelle_id from public.parcelles where id_unique='PAR-000001';
  select id,created_by into v_emmanuel_id,v_emmanuel_creator from public.clients where id_unique='AC_B000001';
  select id,created_by into v_zagble_id,v_zagble_creator from public.clients where id_unique='AC_B000002';
  if v_parcelle_id is null or v_emmanuel_id is null or v_zagble_id is null then raise exception 'Les dossiers bénéficiaires ou la parcelle PAR-000001 sont introuvables.'; end if;
  select id into v_l01 from public.lots_hectares where parcelle_id=v_parcelle_id and reference='PAR-000001-L01';
  select id into v_l02 from public.lots_hectares where parcelle_id=v_parcelle_id and reference='PAR-000001-L02';
  if v_l01 is null or v_l02 is null then raise exception 'Les lots L01 et L02 de PAR-000001 sont introuvables.'; end if;

  delete from public.acquisition_lots where lot_id=v_l02 and client_id=v_zagble_id;
  update public.lots_hectares set client_id=v_emmanuel_id,part_type='agricapital',statut='attribue',
    notes='Lot AgriCapital de 1 ha attribué à YAO KONAN EMMANUEL; référence groupée PAR-000001-L01-02 pour ses 2 ha.',
    acquisition_id=null,updated_at=now() where id in (v_l01,v_l02);

  insert into public.lots_hectares(reference,parcelle_id,numero_h,surface_ha,statut,client_id,date_attribution,part_type,notes,created_by,updated_at)
  select 'PAR-000001-L03',v_parcelle_id,3,1,'attribue',v_zagble_id,current_date,'proprietaire',
    'Lot de 1 ha de la quote-part propriétaire de ZAGBLE BOLOU JEAN-JACQUES.',v_zagble_creator,now()
  where not exists(select 1 from public.lots_hectares where parcelle_id=v_parcelle_id and reference='PAR-000001-L03')
  returning id into v_l03;
  if v_l03 is null then select id into v_l03 from public.lots_hectares where parcelle_id=v_parcelle_id and reference='PAR-000001-L03'; end if;

  insert into public.lots_hectares(reference,parcelle_id,numero_h,surface_ha,statut,client_id,date_attribution,part_type,notes,created_by,updated_at)
  select 'PAR-000001-L04',v_parcelle_id,4,1,'attribue',v_zagble_id,current_date,'proprietaire',
    'Lot de 1 ha de la quote-part propriétaire de ZAGBLE BOLOU JEAN-JACQUES.',v_zagble_creator,now()
  where not exists(select 1 from public.lots_hectares where parcelle_id=v_parcelle_id and reference='PAR-000001-L04')
  returning id into v_l04;
  if v_l04 is null then select id into v_l04 from public.lots_hectares where parcelle_id=v_parcelle_id and reference='PAR-000001-L04'; end if;

  update public.lots_hectares set part_type='proprietaire',client_id=v_zagble_id,statut='attribue',
    date_attribution=coalesce(date_attribution,current_date),acquisition_id=null,updated_at=now()
  where id in (v_l03,v_l04);

  insert into public.acquisition_lots(client_id,lot_id,surface_ha,notes,created_by,acquisition_id)
  select v_zagble_id,l.id,1,'Lot de la quote-part propriétaire; hors inventaire de lots AgriCapital.',v_zagble_creator,null
  from public.lots_hectares l where l.id in (v_l03,v_l04)
  on conflict (client_id,lot_id) do update set surface_ha=excluded.surface_ha,notes=excluded.notes,acquisition_id=null;

  update public.plantations set lot_id=v_l01,lot_reference_group='PAR-000001-L01-02',updated_at=now()
  where client_id=v_emmanuel_id and parcelle_id=v_parcelle_id and acquisition_id is null;
  update public.plantations set lot_id=v_l03,lot_reference_group='PAR-000001-L03-04',updated_at=now()
  where client_id=v_zagble_id and parcelle_id=v_parcelle_id and acquisition_id is null;
  update public.parcelles set surface_attribuee_ha=2,surface_disponible_ha=0,statut='saturee',updated_at=now() where id=v_parcelle_id;
end $$;
commit;