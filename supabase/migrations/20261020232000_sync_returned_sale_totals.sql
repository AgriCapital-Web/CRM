CREATE OR REPLACE FUNCTION public.resubmit_returned_acquisition(
  p_acquisition_id uuid,
  p_superficie_ha numeric,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_new_contract numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  IF p_superficie_ha IS NULL OR p_superficie_ha <= 0 THEN
    RAISE EXCEPTION 'La superficie doit être strictement positive';
  END IF;

  SELECT * INTO v_acquisition
  FROM public.acquisitions
  WHERE id = p_acquisition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acquisition introuvable';
  END IF;
  IF v_acquisition.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Seul le créateur du dossier peut effectuer la correction';
  END IF;
  IF v_acquisition.validation_statut <> 'modification_demandee' THEN
    RAISE EXCEPTION 'Cette acquisition ne nécessite pas de correction';
  END IF;

  v_new_contract := CASE WHEN v_acquisition.superficie_ha > 0
    THEN round((v_acquisition.montant_total_contrat / v_acquisition.superficie_ha) * p_superficie_ha, 2)
    ELSE v_acquisition.montant_total_contrat END;

  UPDATE public.acquisitions
  SET superficie_ha = p_superficie_ha,
      montant_pi_total = CASE WHEN v_acquisition.superficie_ha > 0
        THEN round((v_acquisition.montant_pi_total / v_acquisition.superficie_ha) * p_superficie_ha, 2)
        ELSE v_acquisition.montant_pi_total END,
      montant_total_contrat = v_new_contract,
      mensualite_montant = CASE WHEN v_acquisition.superficie_ha > 0
        THEN round((v_acquisition.mensualite_montant / v_acquisition.superficie_ha) * p_superficie_ha, 2)
        ELSE v_acquisition.mensualite_montant END,
      notes = p_notes,
      validation_statut = 'a_valider',
      validation_commentaire = NULL,
      validation_demande_at = NULL,
      validation_par = NULL,
      validation_at = NULL,
      updated_at = now()
  WHERE id = p_acquisition_id;

  -- Pour la première acquisition issue de l'inscription client, garder la fiche
  -- client et son contrat synchronisés. Ne pas écraser le total d'un client
  -- qui possède plusieurs acquisitions distinctes.
  IF COALESCE(v_acquisition.metadata->>'created_from_client_workflow', 'false') = 'true'
     AND (SELECT count(*) FROM public.acquisitions WHERE client_id = v_acquisition.client_id) = 1 THEN
    UPDATE public.clients
    SET total_hectares = p_superficie_ha,
        montant_total_contrat = v_new_contract
    WHERE id = v_acquisition.client_id;
  END IF;

  RETURN p_acquisition_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_returned_acquisition(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_returned_acquisition(uuid, numeric, text) TO authenticated;
