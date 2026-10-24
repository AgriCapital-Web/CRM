-- Remove unauthorized land-mobilization commissions from AgriCapital CRM.
-- Business rule: compensation is based on eligible sales and completed technical interventions;
-- no land-mobilization commission is authorized.
begin;
drop trigger if exists trg_commission_foncier_client on public.clients;
drop function if exists public.compute_commission_foncier_client();
delete from public.commission_payment_allocations
where commission_id in (
  select id from public.commissions
  where lower(coalesce(type_commission, '')) = 'mobilisation_fonciere'
);
delete from public.portefeuille_versement_lignes
where commission_id in (
  select id from public.commissions
  where lower(coalesce(type_commission, '')) = 'mobilisation_fonciere'
);
delete from public.commissions
where lower(coalesce(type_commission, '')) = 'mobilisation_fonciere';
delete from public.grille_remuneration
where lower(coalesce(type_remuneration, '')) = 'mobilisation_fonciere'
   or code_regle = 'MOBILISATEUR_FONCIER_PAR_HA';
select public.recalculer_portefeuilles_commissions();
commit;
