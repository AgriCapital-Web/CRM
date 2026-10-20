CREATE OR REPLACE FUNCTION public.create_acquisition_for_new_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offre public.offres%ROWTYPE;
  v_surface numeric;
  v_pi_par_ha numeric;
  v_total_par_ha numeric;
  v_mensualite_par_ha numeric;
BEGIN
  v_surface := COALESCE(NEW.total_hectares, 0);
  IF NEW.offre_id IS NULL OR v_surface <= 0 THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.montant_total_contrat, 0) <= 0 THEN
    RAISE EXCEPTION 'Le montant contractuel doit être positif avant de créer une vente.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.acquisitions a WHERE a.client_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_offre FROM public.offres WHERE id = NEW.offre_id;
  IF NOT FOUND OR v_offre.code IS NULL OR v_offre.nom IS NULL THEN
    RAISE EXCEPTION 'Offre absente ou incomplète pour la création de l’acquisition du client %', NEW.id;
  END IF;

  v_pi_par_ha := COALESCE(v_offre.montant_pi_par_ha, v_offre.paiement_signature_par_ha);
  v_mensualite_par_ha := v_offre.mensualite_par_ha;
  IF v_pi_par_ha IS NULL OR v_mensualite_par_ha IS NULL OR v_offre.duree_paiement_mois IS NULL THEN
    RAISE EXCEPTION 'Les conditions de paiement de l’offre % sont incomplètes.', v_offre.code;
  END IF;
  v_total_par_ha := NEW.montant_total_contrat / v_surface;

  INSERT INTO public.acquisitions (
    client_id, offre_id, offre_code, offre_nom, famille_offre,
    formule_code, formule_nom, gestion_type, necessite_foncier_client,
    superficie_ha, parcelle_id, lot_id, mode_paiement,
    montant_pi_par_ha, montant_pi_total, montant_total_par_ha, montant_total_contrat,
    mensualite_par_ha, mensualite_montant, duree_paiement_mois, echeancier,
    promotion_id, montant_promo_applique, statut, statut_technique,
    notes, metadata, created_by, validation_statut
  ) VALUES (
    NEW.id, v_offre.id, v_offre.code, v_offre.nom, v_offre.famille_offre,
    COALESCE(NEW.formule_code, v_offre.formule_code, v_offre.code),
    COALESCE(NEW.formule_nom, v_offre.formule_nom, v_offre.nom),
    v_offre.gestion_type, COALESCE(v_offre.necessite_foncier_client, false),
    v_surface, NEW.parcelle_id, NULL, 'echeancier',
    v_pi_par_ha, v_pi_par_ha * v_surface, v_total_par_ha, NEW.montant_total_contrat,
    v_mensualite_par_ha, v_mensualite_par_ha * v_surface,
    v_offre.duree_paiement_mois, '[]'::jsonb,
    NULL, 0, 'souscrite', 'en_attente_intervention',
    NULL,
    jsonb_build_object('source', 'clients', 'client_id', NEW.id, 'created_from_client_workflow', true),
    NEW.created_by, 'a_valider'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_acquisition_for_new_client ON public.clients;
CREATE TRIGGER trg_create_acquisition_for_new_client
AFTER INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.create_acquisition_for_new_client();
