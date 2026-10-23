-- Consolidate contract/sale attributes onto the single authoritative clients row.
-- Keep the acquisitions table during the compatibility phase: existing database
-- functions and triggers still reference it and must be migrated before its removal.
begin;

alter table public.clients
  add column if not exists offre_code text,
  add column if not exists offre_nom text,
  add column if not exists gestion_type text,
  add column if not exists necessite_foncier_client boolean,
  add column if not exists superficie_ha numeric,
  add column if not exists lot_id uuid,
  add column if not exists montant_pi_par_ha numeric,
  add column if not exists montant_pi_total numeric,
  add column if not exists montant_total_par_ha numeric,
  add column if not exists mensualite_par_ha numeric,
  add column if not exists duree_paiement_mois integer,
  add column if not exists echeancier jsonb,
  add column if not exists statut_technique text,
  add column if not exists notes text,
  add column if not exists metadata jsonb;

update public.clients c
set offre_id = coalesce(c.offre_id, a.offre_id),
    offre_code = coalesce(c.offre_code, a.offre_code),
    offre_nom = coalesce(c.offre_nom, a.offre_nom),
    famille_offre = coalesce(c.famille_offre, a.famille_offre),
    formule_code = coalesce(c.formule_code, a.formule_code),
    formule_nom = coalesce(c.formule_nom, a.formule_nom),
    gestion_type = coalesce(c.gestion_type, a.gestion_type),
    necessite_foncier_client = coalesce(c.necessite_foncier_client, a.necessite_foncier_client),
    superficie_ha = coalesce(c.superficie_ha, a.superficie_ha),
    parcelle_id = coalesce(c.parcelle_id, a.parcelle_id),
    lot_id = coalesce(c.lot_id, a.lot_id),
    mode_paiement = coalesce(c.mode_paiement, a.mode_paiement),
    montant_pi_par_ha = coalesce(c.montant_pi_par_ha, a.montant_pi_par_ha),
    montant_pi_total = coalesce(c.montant_pi_total, a.montant_pi_total),
    montant_total_par_ha = coalesce(c.montant_total_par_ha, a.montant_total_par_ha),
    montant_total_contrat = coalesce(c.montant_total_contrat, a.montant_total_contrat),
    mensualite_par_ha = coalesce(c.mensualite_par_ha, a.mensualite_par_ha),
    mensualite_montant = coalesce(c.mensualite_montant, a.mensualite_montant),
    duree_paiement_mois = coalesce(c.duree_paiement_mois, a.duree_paiement_mois),
    echeancier = coalesce(c.echeancier, a.echeancier),
    promotion_id = coalesce(c.promotion_id, a.promotion_id),
    montant_promo_applique = coalesce(c.montant_promo_applique, a.montant_promo_applique),
    statut = coalesce(nullif(c.statut,''), a.statut),
    statut_technique = coalesce(c.statut_technique, a.statut_technique),
    notes = coalesce(c.notes, a.notes),
    metadata = coalesce(c.metadata, a.metadata),
    created_by = coalesce(c.created_by, a.created_by),
    validation_statut = coalesce(c.validation_statut, a.validation_statut),
    validation_commentaire = coalesce(c.validation_commentaire, a.validation_commentaire),
    validation_demande_at = coalesce(c.validation_demande_at, a.validation_demande_at),
    validation_par = coalesce(c.validation_par, a.validation_par),
    validation_at = coalesce(c.validation_at, a.validation_at),
    updated_at = greatest(c.updated_at, a.updated_at)
from public.acquisitions a
where c.id = a.client_id;

update public.acquisition_lots x set client_id = a.client_id
from public.acquisitions a where x.acquisition_id = a.id and x.client_id is distinct from a.client_id;
update public.interventions_techniques x set client_id = a.client_id
from public.acquisitions a where x.acquisition_id = a.id and x.client_id is distinct from a.client_id;
update public.lots_hectares x set client_id = a.client_id
from public.acquisitions a where x.acquisition_id = a.id and x.client_id is distinct from a.client_id;
update public.paiements x set client_id = a.client_id
from public.acquisitions a where x.acquisition_id = a.id and x.client_id is distinct from a.client_id;
update public.plantations x set client_id = a.client_id
from public.acquisitions a where x.acquisition_id = a.id and x.client_id is distinct from a.client_id;

commit;
