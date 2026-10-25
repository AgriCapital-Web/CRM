-- Reconcile the shared YAO KONAN EMMANUEL / ZAGBLE BOLOU JEAN-JACQUES plantation.
-- Guarded updates preserve unrelated records and can be safely re-applied.
begin;
update public.parcelles
set nom = 'Plantation partagée YAO KONAN EMMANUEL — ZAGBLE BOLOU JEAN-JACQUES',
    updated_at = now()
where id = '6d00d15d-f7aa-4b31-ad6f-2b7d4a14c9e4'
  and surface_totale_ha = 4
  and proprietaire_id = '2702d6e0-3860-45a2-aa55-b1b2d3dbfabc';
update public.plantations
set parcelle_id = '6d00d15d-f7aa-4b31-ad6f-2b7d4a14c9e4',
    updated_at = now()
where id = 'e8b99368-9415-418d-8399-4e0dbfb6df2c'
  and client_id = '06b2d0c3-940a-45e5-981a-f7534e5553c0'
  and superficie_ha = 2
  and surface_reellement_plantee = 2
  and parcelle_id is null;
commit;
