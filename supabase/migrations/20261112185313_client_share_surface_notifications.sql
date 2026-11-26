
CREATE OR REPLACE FUNCTION public.trg_notification_technical_intervention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plantation text;
  v_surface numeric;
BEGIN
  IF lower(coalesce(new.statut,'')) IN ('valide','validé','termine','terminé','realise','réalisé','cloture','clôturé')
     AND (TG_OP='INSERT' OR lower(coalesce(old.statut,'')) IS DISTINCT FROM lower(coalesce(new.statut,''))) THEN
    SELECT coalesce(p.nom_plantation,p.id_unique,'Plantation'),
           coalesce((
             SELECT sum(ba.surface_attribuee_ha)
               FROM public.beneficiaire_attributions ba
              WHERE ba.plantation_id=p.id
                AND ba.client_id=new.client_id
                AND ba.statut='active'
           ),p.superficie_ha,0)
      INTO v_plantation,v_surface
      FROM public.plantations p
     WHERE p.id=new.plantation_id;
    PERFORM public.notification_emit_event(
      'intervention_technique',
      jsonb_build_object(
        'client_id',new.client_id,
        'intervention_id',new.id,
        'plantation_id',new.plantation_id,
        'plantation',coalesce(v_plantation,'Plantation'),
        'surface',coalesce(v_surface,0),
        'superficie',coalesce(v_surface,0),
        'date_intervention',new.date_intervention,
        'type_intervention',new.type_intervention,
        'recommandations',new.recommandations
      )
    );
  END IF;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION public.trg_notification_technical_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plantation text;
  v_surface numeric;
BEGIN
  IF coalesce(new.client_visible,false)=true
     AND lower(coalesce(new.statut,'')) IN ('valide','validé','termine','terminé','realise','réalisé','publie','publié')
     AND (TG_OP='INSERT' OR lower(coalesce(old.statut,'')) IS DISTINCT FROM lower(coalesce(new.statut,'')) OR coalesce(old.client_visible,false)=false) THEN
    SELECT coalesce(p.nom_plantation,p.id_unique,'Plantation'),
           coalesce((
             SELECT sum(ba.surface_attribuee_ha)
               FROM public.beneficiaire_attributions ba
              WHERE ba.plantation_id=p.id
                AND ba.client_id=new.client_id
                AND ba.statut='active'
           ),p.superficie_ha,0)
      INTO v_plantation,v_surface
      FROM public.plantations p
     WHERE p.id=new.plantation_id;
    PERFORM public.notification_emit_event(
      'visite_technique',
      jsonb_build_object(
        'client_id',new.client_id,
        'rapport_id',new.id,
        'plantation_id',new.plantation_id,
        'plantation',coalesce(v_plantation,'Plantation'),
        'surface',coalesce(v_surface,0),
        'superficie',coalesce(v_surface,0),
        'date_visite',new.date_visite,
        'etat',new.etat_plantation,
        'recommandations',new.recommandations
      )
    );
  END IF;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION public.trg_particular_beneficiary_plantation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type_client text;
  v_lot_ref text;
  v_activation public.plantation_activations%rowtype;
  v_surface numeric;
BEGIN
  IF new.role_attribution='beneficiaire' AND new.client_id IS NOT NULL THEN
    SELECT type_client INTO v_type_client FROM public.clients WHERE id=new.client_id;
    IF v_type_client='beneficiaire_particulier' THEN
      SELECT * INTO v_activation FROM public.plantation_activations WHERE id=new.activation_id;
      SELECT reference INTO v_lot_ref FROM public.lots_hectares WHERE id=v_activation.lot_id;
      SELECT coalesce(sum(ba.surface_attribuee_ha),new.superficie_ha)
        INTO v_surface
        FROM public.beneficiaire_attributions ba
       WHERE ba.plantation_id=new.id
         AND ba.client_id=new.client_id
         AND ba.statut='active';
      PERFORM public.notification_emit_event(
        'plantation_activee',
        jsonb_build_object(
          'client_id',new.client_id,
          'plantation_id',new.id,
          'activation_id',new.activation_id,
          'surface',coalesce(v_surface,new.superficie_ha,0),
          'superficie',coalesce(v_surface,new.superficie_ha,0),
          'lot_reference',coalesce(v_lot_ref,''),
          'date_activation',coalesce(new.date_activation,current_date)
        )
      );
    END IF;
  END IF;
  RETURN new;
END
$function$;

UPDATE public.notification_event_outbox
   SET context=jsonb_set(
                jsonb_set(coalesce(context,'{}'::jsonb),'{surface}',to_jsonb(0.5::numeric),true),
                '{superficie}',to_jsonb(0.5::numeric),true)
 WHERE context->>'plantation_id'='86da31b0-9a82-43b3-9aac-78f66aa7701b'
   AND nullif(context->>'surface','') IS NOT NULL
   AND (context->>'surface')::numeric<0.5;
