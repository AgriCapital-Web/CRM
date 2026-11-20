CREATE OR REPLACE FUNCTION public.allow_deferred_land_acquisition_before_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_client_metadata jsonb;
BEGIN
  IF NEW.client_id IS NULL OR NEW.lot_id IS NOT NULL OR NEW.parcelle_id IS NOT NULL
     OR coalesce(NEW.necessite_foncier_client,false) THEN RETURN NEW; END IF;
  SELECT coalesce(metadata,'{}'::jsonb) INTO v_client_metadata
    FROM public.clients WHERE id=NEW.client_id;
  IF NOT coalesce((v_client_metadata->>'deferred_land_allocation')::boolean,false)
     OR upper(regexp_replace(coalesce(NEW.famille_offre,'') || ' ' || coalesce(NEW.offre_code,''),'[-_[:space:]]','','g')) NOT LIKE '%PALMINVEST%' THEN
    RETURN NEW;
  END IF;
  NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb) ||
    jsonb_build_object('foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true);
  IF coalesce((v_client_metadata->>'commercial_validation_sans_foncier')::boolean,false)
     OR coalesce((NEW.metadata->>'validation_acquisition_sans_foncier')::boolean,false)
     OR coalesce((NEW.metadata->>'validation_pdg_sans_convention_active')::boolean,false) THEN
    NEW.statut := 'active'; NEW.validation_statut := 'valide';
    NEW.metadata := NEW.metadata || jsonb_build_object('validation_acquisition_sans_foncier',true);
  ELSE
    NEW.statut := 'souscrite'; NEW.validation_statut := 'a_valider';
  END IF;
  NEW.necessite_foncier_client := true;
  RETURN NEW;
END;
$function$;
