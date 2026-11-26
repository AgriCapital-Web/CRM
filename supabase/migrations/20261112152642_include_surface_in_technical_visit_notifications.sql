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
    SELECT coalesce(p.nom_plantation,p.id_unique,'Plantation'), coalesce(p.superficie_ha,0)
      INTO v_plantation, v_surface
      FROM public.plantations p
     WHERE p.id=new.plantation_id;
    PERFORM public.notification_emit_event(
      'visite_technique',
      jsonb_build_object(
        'client_id',new.client_id,'rapport_id',new.id,'plantation_id',new.plantation_id,
        'plantation',coalesce(v_plantation,'Plantation'),'surface',coalesce(v_surface,0),
        'superficie',coalesce(v_surface,0),'date_visite',new.date_visite,
        'etat',new.etat_plantation,'recommandations',new.recommandations
      )
    );
  END IF;
  RETURN new;
END
$function$;

UPDATE public.notification_templates
   SET contenu = replace(contenu,'rapport de visite de votre plantation {{plantation}} est disponible','rapport de visite de votre plantation {{plantation}} ({{surface}} ha) est disponible'),
       variables = CASE WHEN coalesce(variables,'[]'::jsonb) @> '["surface"]'::jsonb THEN coalesce(variables,'[]'::jsonb) ELSE coalesce(variables,'[]'::jsonb) || '["surface"]'::jsonb END,
       updated_at=now()
 WHERE code IN ('visite_technique_email','visite_technique_whatsapp');
