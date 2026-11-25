-- Autorise les superficies libres dans les parcours bénéficiaires et acquisitions.
-- PalmInvest conserve son unité commerciale de lots entiers de 1 ha.
DO $migrate$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.register_beneficiaire_particulier(jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition,'v_beneficiary_surface < 0.5 or abs(v_beneficiary_surface*2-round(v_beneficiary_surface*2)) > 0.000001','v_beneficiary_surface <= 0');
  v_definition := replace(v_definition,'La quote-part minimale est de 0,50 ha, par pas de 0,50 ha','La quote-part doit être supérieure à 0 ha');
  v_definition := replace(v_definition,'v_physical_surface := ceil(greatest(coalesce(nullif(p_parcelle->>''surface_totale_ha'','''')::numeric,0),2*v_beneficiary_surface)*2)/2;','v_physical_surface := greatest(coalesce(nullif(p_parcelle->>''surface_totale_ha'','''')::numeric,0),2*v_beneficiary_surface);');
  v_definition := replace(v_definition,'v_physical_surface := ceil(greatest(coalesce(v_parcelle.surface_totale_ha,0),2*(v_existing_alloc+v_beneficiary_surface))*2)/2;','v_physical_surface := greatest(coalesce(v_parcelle.surface_totale_ha,0),2*(v_existing_alloc+v_beneficiary_surface));');
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.resubmit_returned_acquisition(uuid,numeric,text)'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition,'p_superficie_ha < 0.5 OR abs(p_superficie_ha*2-round(p_superficie_ha*2)) > 0.000001','p_superficie_ha <= 0');
  v_definition := replace(v_definition,'La superficie minimale est de 0,50 ha, par pas de 0,50 ha','La superficie doit être supérieure à 0 ha');
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.validate_client_acquisition_foncier()'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition,'v_amount<0.5 OR abs(v_amount*2-round(v_amount*2))>0.000001','v_amount<=0');
  v_definition := replace(v_definition,'Chaque quote-part doit être un multiple de 0,50 ha.','Chaque quote-part doit être supérieure à 0 ha.');
  EXECUTE v_definition;
END;
$migrate$;
