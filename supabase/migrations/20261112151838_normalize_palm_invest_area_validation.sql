ALTER TABLE public.acquisitions
  DROP CONSTRAINT IF EXISTS acquisitions_superficie_half_hectare_check;
ALTER TABLE public.acquisitions
  ADD CONSTRAINT acquisitions_superficie_half_hectare_check
  CHECK (
    superficie_ha IS NULL OR
    CASE
      WHEN regexp_replace(upper(coalesce(famille_offre,'') || ' ' || coalesce(offre_code,'')), '[-_[:space:]]', '', 'g') LIKE '%PALMINVEST%'
        THEN superficie_ha >= 1 AND abs(superficie_ha-round(superficie_ha)) < 0.000001
      ELSE superficie_ha >= 0.5 AND abs(superficie_ha*2-round(superficie_ha*2)) < 0.000001
    END
  );

CREATE OR REPLACE FUNCTION public.resubmit_returned_acquisition(
  p_acquisition_id uuid,
  p_superficie_ha numeric,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_family text;
  v_new_contract numeric;
  v_new_pi numeric;
  v_new_monthly numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
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

  v_family := regexp_replace(
    upper(coalesce(v_acquisition.famille_offre,'') || ' ' || coalesce(v_acquisition.offre_code,'')),
    '[-_[:space:]]', '', 'g'
  );
  IF v_family LIKE '%PALMINVEST%' THEN
    IF p_superficie_ha IS NULL OR p_superficie_ha < 1 OR abs(p_superficie_ha-round(p_superficie_ha)) > 0.000001 THEN
      RAISE EXCEPTION 'PalmInvest exige des lots entiers de 1 ha minimum';
    END IF;
  ELSE
    IF p_superficie_ha IS NULL OR p_superficie_ha < 0.5 OR abs(p_superficie_ha*2-round(p_superficie_ha*2)) > 0.000001 THEN
      RAISE EXCEPTION 'La superficie minimale est de 0,50 ha, par pas de 0,50 ha';
    END IF;
  END IF;

  v_new_contract := CASE WHEN v_acquisition.superficie_ha > 0
    THEN round((v_acquisition.montant_total_contrat / v_acquisition.superficie_ha) * p_superficie_ha, 2)
    ELSE v_acquisition.montant_total_contrat END;
  v_new_pi := CASE WHEN v_acquisition.superficie_ha > 0
    THEN round((v_acquisition.montant_pi_total / v_acquisition.superficie_ha) * p_superficie_ha, 2)
    ELSE v_acquisition.montant_pi_total END;
  v_new_monthly := CASE WHEN v_acquisition.superficie_ha > 0
    THEN round((v_acquisition.mensualite_montant / v_acquisition.superficie_ha) * p_superficie_ha, 2)
    ELSE v_acquisition.mensualite_montant END;

  UPDATE public.acquisitions
     SET superficie_ha = p_superficie_ha,
         montant_pi_total = v_new_pi,
         montant_total_contrat = v_new_contract,
         mensualite_montant = v_new_monthly,
         metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{surface_ha}', to_jsonb(p_superficie_ha), true),
         offre_snapshot = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(offre_snapshot,'{}'::jsonb),
                 '{contract,superficie_ha}', to_jsonb(p_superficie_ha), true),
               '{contract,montant_pi_total}', to_jsonb(v_new_pi), true),
             '{contract,mensualite_montant}', to_jsonb(v_new_monthly), true),
           '{contract,montant_total_contrat}', to_jsonb(v_new_contract), true),
         notes = p_notes,
         validation_statut = 'a_valider',
         validation_commentaire = NULL,
         validation_demande_at = NULL,
         validation_par = NULL,
         validation_at = NULL,
         updated_at = now()
   WHERE id = p_acquisition_id;

  IF COALESCE(v_acquisition.metadata->>'created_from_client_workflow', 'false') = 'true'
     AND (SELECT count(*) FROM public.acquisitions WHERE client_id = v_acquisition.client_id) = 1 THEN
    UPDATE public.clients
       SET total_hectares = p_superficie_ha,
           montant_total_contrat = v_new_contract,
           offre_snapshot = jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(offre_snapshot,'{}'::jsonb),
                 '{contract,superficie_ha}', to_jsonb(p_superficie_ha), true),
               '{contract,montant_total_contrat}', to_jsonb(v_new_contract), true),
             '{contract,montant_pi_total}', to_jsonb(v_new_pi), true),
           updated_at = now()
     WHERE id = v_acquisition.client_id;
  END IF;

  RETURN p_acquisition_id;
END
$function$;
