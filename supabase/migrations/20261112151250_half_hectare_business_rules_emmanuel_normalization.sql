BEGIN;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.acquisitions a
  JOIN public.clients c ON c.id = a.client_id
  WHERE a.metadata->>'source_personnalisation' = 'emmanuel_camp_bethel_20261024'
    AND a.offre_code = 'EMMANUEL_PERSONNALISEE_20261024'
    AND upper(coalesce(c.nom,'')) = 'YAO'
    AND upper(coalesce(c.prenoms,'')) = 'KONAN EMMANUEL';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Le dossier personnalisé de KONAN EMMANUEL YAO doit être unique (trouvé: %)', v_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_plantation_planned_plants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_default_density numeric;
  v_density numeric;
  v_old_calculated integer;
BEGIN
  SELECT nullif(trim(c.valeur),'')::numeric
    INTO v_default_density
    FROM public.configurations_systeme c
   WHERE c.cle='plantation_densite_defaut'
   LIMIT 1;

  IF coalesce(new.densite_cible,0)<=0 AND coalesce(v_default_density,0)>0 THEN
    new.densite_cible:=v_default_density;
  END IF;

  v_density := coalesce(nullif(new.densite_cible,0), nullif(new.densite_plants,0), v_default_density);

  IF TG_OP='UPDATE'
     AND (new.superficie_ha IS DISTINCT FROM old.superficie_ha
       OR new.densite_cible IS DISTINCT FROM old.densite_cible
       OR new.densite_plants IS DISTINCT FROM old.densite_plants) THEN
    v_old_calculated := CASE
      WHEN coalesce(old.superficie_ha,0)>0 AND coalesce(v_density,0)>0
      THEN round(old.superficie_ha * coalesce(nullif(old.densite_cible,0),nullif(old.densite_plants,0),v_default_density))::integer
      ELSE 0
    END;
    IF new.nombre_plants_prevus IS NOT DISTINCT FROM old.nombre_plants_prevus
       OR coalesce(new.nombre_plants_prevus,0)=0
       OR new.nombre_plants_prevus=v_old_calculated THEN
      IF coalesce(new.superficie_ha,0)>0 AND coalesce(v_density,0)>0 THEN
        new.nombre_plants_prevus:=round(new.superficie_ha*v_density)::integer;
      END IF;
    END IF;
  ELSIF coalesce(new.nombre_plants_prevus,0)<=0
     AND coalesce(new.superficie_ha,0)>0
     AND coalesce(v_density,0)>0 THEN
    new.nombre_plants_prevus:=round(new.superficie_ha*v_density)::integer;
  END IF;

  IF coalesce(new.densite_plants,0)<=0 THEN
    new.densite_plants:=coalesce(nullif(new.densite_cible,0),nullif(v_default_density,0));
  END IF;
  RETURN new;
END
$function$;

DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_plantation_after_mise_en_terre()'::regprocedure)
    INTO v_definition;
  IF position('(v_surface*v_density)::integer' IN v_definition)=0 THEN
    RAISE EXCEPTION 'La formule de plants de create_plantation_after_mise_en_terre a changé; migration interrompue';
  END IF;
  v_definition := replace(v_definition, '(v_surface*v_density)::integer', 'round(v_surface*v_density)::integer');
  EXECUTE v_definition;
END $$;

UPDATE public.parcelles p
   SET surface_totale_ha = 0.5,
       surface_attribuee_ha = 0.5,
       plantation_surface_cible_ha = 0.5,
       plantation_densite_plants = 123,
       updated_at = now()
 WHERE p.id IN (
   SELECT pl.parcelle_id
   FROM public.plantations pl
   JOIN public.acquisitions a ON a.id = pl.acquisition_id
   WHERE a.metadata->>'source_personnalisation' = 'emmanuel_camp_bethel_20261024'
     AND a.offre_code = 'EMMANUEL_PERSONNALISEE_20261024'
 );

UPDATE public.acquisitions a
   SET superficie_ha = 0.5,
       montant_pi_par_ha = 40000,
       montant_pi_total = 20000,
       mensualite_par_ha = 11200,
       mensualite_montant = 5600,
       montant_total_par_ha = 174400,
       montant_total_contrat = 87200,
       metadata = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(a.metadata,'{}'::jsonb),
                 '{surface_ha}', '0.5'::jsonb, true),
               '{surface_geometrique_ha}', '0.4698'::jsonb, true),
             '{plants_prevus}', '72'::jsonb, true),
           '{plants_effectivement_mis_en_terre}', '58'::jsonb, true),
         '{surface_calcul_methode}',
         to_jsonb('Surface contractuelle normalisée à 0,50 ha (minimum CRM). Géométrie initiale : 0,4698 ha (58 plants effectivement mis en terre à 9 × 9 m). Plan technique : 72 plants prévus.'::text),
         true),
       offre_snapshot = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(a.offre_snapshot,'{}'::jsonb),
               '{contract,superficie_ha}', '0.5'::jsonb, true),
             '{contract,montant_pi_par_ha}', '40000'::jsonb, true),
           '{contract,mensualite_par_ha}', '11200'::jsonb, true),
         '{contract,montant_total_par_ha}', '174400'::jsonb, true),
       updated_at = now()
 WHERE a.metadata->>'source_personnalisation' = 'emmanuel_camp_bethel_20261024'
   AND a.offre_code = 'EMMANUEL_PERSONNALISEE_20261024';

UPDATE public.plantations pl
   SET superficie_ha = 0.5,
       superficie_activee = CASE WHEN coalesce(pl.superficie_activee,0)>0 THEN 0.5 ELSE 0 END,
       surface_reellement_plantee = 0.5,
       nombre_plants = 58,
       nombre_plants_prevus = 72,
       nombre_plants_mis_en_terre = 58,
       densite_plants = 123,
       densite_cible = 123,
       notes = 'Deuxième plantation — 58 plants effectivement mis en terre à 9 m × 9 m (géométrie initiale : 4 698 m² = 0,4698 ha). Superficie commerciale et opérationnelle normalisée à 0,50 ha conformément au minimum CRM. Plan technique : 72 plants prévus. Offre personnalisée : paiement initial de 20 000 F CFA puis 5 600 F CFA/mois pendant 12 mois. Hors PalmInvest et hors offre catalogue.',
       updated_at = now()
 WHERE pl.acquisition_id IN (
   SELECT a.id FROM public.acquisitions a
   WHERE a.metadata->>'source_personnalisation' = 'emmanuel_camp_bethel_20261024'
     AND a.offre_code = 'EMMANUEL_PERSONNALISEE_20261024'
 );

UPDATE public.beneficiaire_attributions ba
   SET surface_attribuee_ha = 0.5,
       notes = 'Attribution de la deuxième plantation personnalisée à Kouassikankro — Camp Bethel : superficie commerciale normalisée à 0,50 ha (minimum CRM). Géométrie initiale conservée en historique : 0,4698 ha, 58 plants effectivement mis en terre à 9 × 9 m. Plan technique : 72 plants prévus. Paiement initial 20 000 F CFA puis 5 600 F CFA/mois pendant 12 mois. Hors PalmTerroir, hors PalmInvest et hors offre catalogue.',
       updated_at = now()
 WHERE ba.plantation_id IN (
   SELECT pl.id
   FROM public.plantations pl
   JOIN public.acquisitions a ON a.id = pl.acquisition_id
   WHERE a.metadata->>'source_personnalisation' = 'emmanuel_camp_bethel_20261024'
     AND a.offre_code = 'EMMANUEL_PERSONNALISEE_20261024'
 )
   AND ba.statut = 'active';

UPDATE public.clients c
   SET offre_snapshot = jsonb_set(
     jsonb_set(
       jsonb_set(
         jsonb_set(coalesce(c.offre_snapshot,'{}'::jsonb),
           '{contract,superficie_ha}', '0.5'::jsonb, true),
         '{contract,montant_pi_par_ha}', '40000'::jsonb, true),
       '{contract,mensualite_par_ha}', '11200'::jsonb, true),
     '{contract,montant_total_par_ha}', '174400'::jsonb, true),
       updated_at = now()
 WHERE c.id IN (
   SELECT a.client_id FROM public.acquisitions a
   WHERE a.metadata->>'source_personnalisation' = 'emmanuel_camp_bethel_20261024'
     AND a.offre_code = 'EMMANUEL_PERSONNALISEE_20261024'
 );

CREATE OR REPLACE FUNCTION public.validate_beneficiaire_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_limit numeric;
  v_mode text;
  v_agricapital numeric;
BEGIN
  SELECT surface_totale_ha, mode_surface, surface_agricapital_ha
    INTO v_total, v_mode, v_agricapital
    FROM public.parcelles
   WHERE id = new.parcelle_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Parcelle introuvable pour cette attribution';
  END IF;

  v_limit := CASE
    WHEN lower(coalesce(v_mode,'')) IN ('propriete_client','propriete','client')
      THEN v_total
    ELSE coalesce(v_agricapital, v_total / 2)
  END;

  SELECT coalesce(sum(surface_attribuee_ha),0)
    INTO v_total
    FROM public.beneficiaire_attributions
   WHERE parcelle_id = new.parcelle_id
     AND id <> new.id
     AND statut = 'active';

  IF v_total + new.surface_attribuee_ha > v_limit + 0.000001 THEN
    RAISE EXCEPTION 'La somme des superficies attribuées dépasse la part disponible pour les bénéficiaires';
  END IF;
  RETURN new;
END
$function$;

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
  SELECT * INTO v_acquisition FROM public.acquisitions WHERE id = p_acquisition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acquisition introuvable'; END IF;
  IF v_acquisition.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Seul le créateur du dossier peut effectuer la correction'; END IF;
  IF v_acquisition.validation_statut <> 'modification_demandee' THEN RAISE EXCEPTION 'Cette acquisition ne nécessite pas de correction'; END IF;

  v_family := upper(coalesce(v_acquisition.famille_offre,'') || ' ' || coalesce(v_acquisition.offre_code,''));
  IF v_family LIKE '%PALMINVEST%' THEN
    IF p_superficie_ha IS NULL OR p_superficie_ha < 1 OR abs(p_superficie_ha-round(p_superficie_ha)) > 0.000001 THEN
      RAISE EXCEPTION 'PalmInvest exige des lots entiers de 1 ha minimum';
    END IF;
  ELSE
    IF p_superficie_ha IS NULL OR p_superficie_ha < 0.5 OR abs(p_superficie_ha*2-round(p_superficie_ha*2)) > 0.000001 THEN
      RAISE EXCEPTION 'La superficie minimale est de 0,50 ha, par pas de 0,50 ha';
    END IF;
  END IF;

  v_new_contract := CASE WHEN v_acquisition.superficie_ha > 0 THEN round((v_acquisition.montant_total_contrat / v_acquisition.superficie_ha) * p_superficie_ha, 2) ELSE v_acquisition.montant_total_contrat END;
  v_new_pi := CASE WHEN v_acquisition.superficie_ha > 0 THEN round((v_acquisition.montant_pi_total / v_acquisition.superficie_ha) * p_superficie_ha, 2) ELSE v_acquisition.montant_pi_total END;
  v_new_monthly := CASE WHEN v_acquisition.superficie_ha > 0 THEN round((v_acquisition.mensualite_montant / v_acquisition.superficie_ha) * p_superficie_ha, 2) ELSE v_acquisition.mensualite_montant END;

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
         notes = p_notes, validation_statut = 'a_valider', validation_commentaire = NULL,
         validation_demande_at = NULL, validation_par = NULL, validation_at = NULL, updated_at = now()
   WHERE id = p_acquisition_id;

  IF COALESCE(v_acquisition.metadata->>'created_from_client_workflow', 'false') = 'true'
     AND (SELECT count(*) FROM public.acquisitions WHERE client_id = v_acquisition.client_id) = 1 THEN
    UPDATE public.clients
       SET total_hectares = p_superficie_ha, montant_total_contrat = v_new_contract,
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
    SELECT coalesce(p.nom_plantation,p.id_unique,'Plantation'), coalesce(p.superficie_ha,0)
      INTO v_plantation, v_surface
      FROM public.plantations p
     WHERE p.id = new.plantation_id;
    PERFORM public.notification_emit_event(
      'intervention_technique',
      jsonb_build_object(
        'client_id',new.client_id,'intervention_id',new.id,'plantation_id',new.plantation_id,
        'plantation',coalesce(v_plantation,'Plantation'),'surface',coalesce(v_surface,0),
        'superficie',coalesce(v_surface,0),'date_intervention',new.date_intervention,
        'type_intervention',new.type_intervention,'recommandations',new.recommandations
      )
    );
  END IF;
  RETURN new;
END
$function$;

UPDATE public.notification_templates
   SET contenu = replace(contenu,'votre plantation {{plantation}} est activée','votre plantation {{plantation}} de {{surface}} ha est activée'),
       variables = CASE WHEN coalesce(variables,'[]'::jsonb) @> '["surface"]'::jsonb THEN coalesce(variables,'[]'::jsonb) ELSE coalesce(variables,'[]'::jsonb) || '["surface"]'::jsonb END,
       updated_at = now()
 WHERE code = 'plantation_activee_whatsapp';

UPDATE public.notification_templates
   SET contenu = replace(contenu,'sur {{plantation}}.','sur {{plantation}} ({{surface}} ha).'),
       variables = CASE WHEN coalesce(variables,'[]'::jsonb) @> '["surface"]'::jsonb THEN coalesce(variables,'[]'::jsonb) ELSE coalesce(variables,'[]'::jsonb) || '["surface"]'::jsonb END,
       updated_at = now()
 WHERE code = 'intervention_technique_sms';

UPDATE public.notification_templates
   SET contenu = replace(contenu,'pour votre plantation {{plantation}}.','pour votre plantation {{plantation}} ({{surface}} ha).'),
       variables = CASE WHEN coalesce(variables,'[]'::jsonb) @> '["surface"]'::jsonb THEN coalesce(variables,'[]'::jsonb) ELSE coalesce(variables,'[]'::jsonb) || '["surface"]'::jsonb END,
       updated_at = now()
 WHERE code = 'intervention_technique_whatsapp';

ALTER TABLE public.acquisitions
  DROP CONSTRAINT IF EXISTS acquisitions_superficie_half_hectare_check;
ALTER TABLE public.acquisitions
  ADD CONSTRAINT acquisitions_superficie_half_hectare_check
  CHECK (
    superficie_ha IS NULL OR
    CASE
      WHEN upper(coalesce(famille_offre,'') || ' ' || coalesce(offre_code,'')) LIKE '%PALMINVEST%'
        THEN superficie_ha >= 1 AND abs(superficie_ha-round(superficie_ha)) < 0.000001
      ELSE superficie_ha >= 0.5 AND abs(superficie_ha*2-round(superficie_ha*2)) < 0.000001
    END
  );

ALTER TABLE public.plantations
  DROP CONSTRAINT IF EXISTS plantations_superficie_half_hectare_check;
ALTER TABLE public.plantations
  ADD CONSTRAINT plantations_superficie_half_hectare_check
  CHECK (superficie_ha IS NULL OR superficie_ha = 0 OR (superficie_ha >= 0.5 AND abs(superficie_ha*2-round(superficie_ha*2)) < 0.000001));

ALTER TABLE public.beneficiaire_attributions
  DROP CONSTRAINT IF EXISTS beneficiaire_attributions_surface_half_hectare_check;
ALTER TABLE public.beneficiaire_attributions
  ADD CONSTRAINT beneficiaire_attributions_surface_half_hectare_check
  CHECK (surface_attribuee_ha IS NULL OR surface_attribuee_ha = 0 OR (surface_attribuee_ha >= 0.5 AND abs(surface_attribuee_ha*2-round(surface_attribuee_ha*2)) < 0.000001));

ALTER TABLE public.conventions_foncieres
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_two_hectare_steps_check;
ALTER TABLE public.conventions_foncieres
  ADD CONSTRAINT conventions_foncieres_surface_two_hectare_steps_check
  CHECK (surface_totale_ha IS NULL OR (surface_totale_ha >= 2 AND abs(surface_totale_ha/2-round(surface_totale_ha/2)) < 0.000001));

COMMIT;
