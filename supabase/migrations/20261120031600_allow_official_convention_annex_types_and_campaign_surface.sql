ALTER TABLE public.documents_convention
  DROP CONSTRAINT IF EXISTS documents_convention_type_document_check;
ALTER TABLE public.documents_convention
  ADD CONSTRAINT documents_convention_type_document_check
  CHECK (type_document = ANY (ARRAY[
    'annexe_1_pv_delimitation_croquis','annexe_2_pv_consentement_familial',
    'annexe_3_acte_reconnaissance_parts','annexe_4_acte_remise_jouissance',
    'annexe_5_procuration_mandataire','annexe_6_copies_cni_signataires',
    'annexe_7_acte_mariage','annexe_8_guide_villageois_attestation',
    'annexe_1_copies_identite_signataires','annexe_3_procuration_mandataire',
    'annexe_4_attestation_droit_foncier',
    'piece_identite_recto','piece_identite_verso','photo_profil','autre',
    'pv_delimitation','acte_reconnaissance_parts','pv_consentement_familial',
    'acte_remise_plantation','procuration_mandataire','cni_recto','cni_verso',
    'croquis_parcellaire','attestation_villageoise','certificat_foncier'
  ]));
ALTER TABLE public.proprietaires_terres
  DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_campagne_check;
ALTER TABLE public.proprietaires_terres
  ADD CONSTRAINT proprietaires_terres_surface_campagne_check
  CHECK (surface_campagne_ha IS NULL OR (surface_campagne_ha >= 2 AND (surface_totale_declaree_ha IS NULL OR surface_campagne_ha <= surface_totale_declaree_ha)));
ALTER TABLE public.conventions_foncieres
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_campagne_check;
ALTER TABLE public.conventions_foncieres
  ADD CONSTRAINT conventions_foncieres_surface_campagne_check
  CHECK (surface_campagne_ha IS NULL OR (surface_campagne_ha >= 2 AND (surface_totale_ha IS NULL OR surface_campagne_ha <= surface_totale_ha)));
