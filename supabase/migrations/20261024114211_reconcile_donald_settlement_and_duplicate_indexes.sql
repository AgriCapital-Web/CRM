begin;

-- La Direction a confirmé que Donald a payé 100 000 FCFA et ne doit plus rien.
do $$
declare
  v_client_id uuid;
  v_acquisition_count integer;
begin
  select id into v_client_id
  from public.clients
  where id_unique = 'AC_C000005'
    and upper(nom_complet) = 'KOUAKOU KONAN DONALD'
  for update;
  if v_client_id is null then raise exception 'Client Donald introuvable'; end if;
  select count(*) into v_acquisition_count from public.acquisitions where client_id = v_client_id;
  if v_acquisition_count <> 1 then raise exception 'Le dossier Donald doit avoir exactement une acquisition'; end if;

  update public.acquisitions
  set montant_pi_par_ha = 100000,
      montant_pi_total = 100000,
      montant_total_par_ha = 100000,
      montant_total_contrat = 100000,
      mensualite_par_ha = 0,
      mensualite_montant = 0,
      echeancier = '[]'::jsonb,
      updated_at = now()
  where client_id = v_client_id;

  update public.clients
  set montant_pi_par_ha = 100000,
      montant_pi_total = 100000,
      montant_total_par_ha = 100000,
      montant_total_contrat = 100000,
      paiement_initial_montant = 100000,
      mensualite_montant = 0,
      contrat_solde_at = coalesce(contrat_solde_at, now()),
      updated_at = now()
  where id = v_client_id;
end $$;

-- Supprimer uniquement les index identiques vérifiés par l'advisor Supabase.
drop index if exists public.idx_clients_departement_id;
drop index if exists public.idx_parcelles_departement_id;
drop index if exists public.idx_proprietaires_terres_departement_id;

notify pgrst, 'reload schema';
commit;
