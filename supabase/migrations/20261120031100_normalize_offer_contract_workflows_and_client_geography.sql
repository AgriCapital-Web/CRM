CREATE OR REPLACE FUNCTION public.agricapital_strip_legacy_plus_labels(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE v_result jsonb; v_key text; v_value jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL;
  ELSIF jsonb_typeof(p_value)='object' THEN
    v_result:='{}'::jsonb;
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_value) LOOP
      IF v_key IN ('nom','formule_nom','label') AND jsonb_typeof(v_value)='string' THEN
        v_result:=v_result||jsonb_build_object(v_key,regexp_replace(v_value #>> '{}','[[:space:]]*\\(\\+\\)[[:space:]]*$','','g'));
      ELSE
        v_result:=v_result||jsonb_build_object(v_key,public.agricapital_strip_legacy_plus_labels(v_value));
      END IF;
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(p_value)='array' THEN
    SELECT coalesce(jsonb_agg(public.agricapital_strip_legacy_plus_labels(value)),'[]'::jsonb) INTO v_result FROM jsonb_array_elements(p_value);
    RETURN v_result;
  END IF;
  RETURN p_value;
END;
$function$;

UPDATE public.clients
SET region_id='d7738144-14cf-43f6-be4d-500f21a9cee5'::uuid,updated_at=now()
WHERE region_id IS NULL AND coalesce(is_internal,false)=false
  AND type_client IN ('client','avec_terre','sans_terre') AND id_unique IS DISTINCT FROM 'AC_C000012';

UPDATE public.offres SET formules_configuration=public.agricapital_strip_legacy_plus_labels(formules_configuration),updated_at=now()
WHERE formules_configuration IS NOT NULL;
UPDATE public.clients
SET formule_nom=regexp_replace(formule_nom,'[[:space:]]*\\(\\+\\)[[:space:]]*$','','g'),
    offre_snapshot=public.agricapital_strip_legacy_plus_labels(offre_snapshot),updated_at=now()
WHERE formule_nom ~ '\\(\\+\\)[[:space:]]*$' OR offre_snapshot IS NOT NULL;
UPDATE public.notification_templates
SET nom=regexp_replace(nom,'[[:space:]]*\\(\\+\\)','', 'g'),
    sujet=regexp_replace(sujet,'[[:space:]]*\\(\\+\\)','', 'g'),
    contenu=regexp_replace(contenu,'[[:space:]]*\\(\\+\\)','', 'g'),updated_at=now()
WHERE coalesce(nom,'') ~ '\\(\\+\\)' OR coalesce(sujet,'') ~ '\\(\\+\\)' OR coalesce(contenu,'') ~ '\\(\\+\\)';

UPDATE public.offre_formulaire_contrats c SET actif=false,updated_at=now()
FROM public.offres o WHERE o.id=c.offre_id AND o.famille_offre='PALMTERROIR' AND c.type_contrat='contrat_acquisition_client';
UPDATE public.offre_formulaire_contrats c SET actif=true,obligatoire=true,
source_document='docs/AgriCapital_04_Contrat_Accompagnement_Agricole_PalmTerroir (1).docx',updated_at=now()
FROM public.offres o WHERE o.id=c.offre_id AND o.famille_offre='PALMTERROIR' AND c.type_contrat='accompagnement_agricole';

UPDATE public.offre_formulaire_contrats c SET actif=false,updated_at=now()
FROM public.offres o WHERE o.id=c.offre_id AND o.famille_offre IN ('PALMINVEST','TERRAPALM') AND c.type_contrat='accompagnement_agricole';
UPDATE public.offre_formulaire_contrats c SET actif=true,obligatoire=true,
source_document='docs/AgriCapital_Contrat_Acquisition_Personne_Physique.docx',updated_at=now()
FROM public.offres o WHERE o.id=c.offre_id AND o.famille_offre IN ('PALMINVEST','TERRAPALM') AND c.type_contrat='contrat_acquisition_client';

UPDATE public.offre_formulaire_documents d
SET source_contractuelle=CASE
 WHEN o.famille_offre='PALMTERROIR' AND d.code='procuration_representant' THEN 'Mandat de représentation, si applicable'
 WHEN d.code='procuration_representant' THEN 'Contrat d’acquisition — procuration, si mandat'
 ELSE d.source_contractuelle END,updated_at=now()
FROM public.offres o WHERE o.id=d.offre_id AND d.code='procuration_representant'
AND o.famille_offre IN ('PALMINVEST','TERRAPALM','PALMTERROIR');

UPDATE public.offre_formulaire_etapes s
SET titre=CASE
 WHEN s.code='client' AND o.famille_offre='PALMTERROIR' THEN 'Informations du souscripteur'
 WHEN s.code='client' THEN 'Informations de l’acquéreur'
 WHEN s.code='documents' AND o.famille_offre='PALMTERROIR' THEN 'Contrat d’accompagnement agricole'
 WHEN s.code='documents' THEN 'Contrat d’acquisition et annexes' ELSE s.titre END,
description=CASE
 WHEN s.code='client' AND o.famille_offre='PALMTERROIR' THEN 'Identité, coordonnées et informations du souscripteur dans le cadre du contrat d’accompagnement agricole.'
 WHEN s.code='client' THEN 'Identité et coordonnées de l’acquéreur, cotitulaire ou mandataire si nécessaire.'
 WHEN s.code='documents' AND o.famille_offre='PALMTERROIR' THEN 'Téléversement du contrat d’accompagnement agricole signé et des pièces conditionnelles applicables.'
 WHEN s.code='documents' THEN 'Téléversement du contrat d’acquisition signé et des annexes applicables à l’offre.'
 ELSE s.description END,updated_at=now()
FROM public.offres o WHERE o.id=s.offre_id AND o.famille_offre IN ('PALMINVEST','TERRAPALM','PALMTERROIR')
AND s.code IN ('client','documents');

DROP FUNCTION public.agricapital_strip_legacy_plus_labels(jsonb);
