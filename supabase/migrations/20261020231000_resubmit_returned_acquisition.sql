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

  UPDATE public.acquisitions
  SET superficie_ha = p_superficie_ha,
      montant_pi_total = CASE WHEN v_acquisition.superficie_ha > 0
        THEN round((v_acquisition.montant_pi_total / v_acquisition.superficie_ha) * p_superficie_ha, 2)
        ELSE v_acquisition.montant_pi_total END,
      montant_total_contrat = CASE WHEN v_acquisition.superficie_ha > 0
        THEN round((v_acquisition.montant_total_contrat / v_acquisition.superficie_ha) * p_superficie_ha, 2)
        ELSE v_acquisition.montant_total_contrat END,
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

  RETURN p_acquisition_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_returned_acquisition(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_returned_acquisition(uuid, numeric, text) TO authenticated;
