-- Synchronise les validations foncières et supprime les paliers artificiels de superficie.
-- Les contrôles de non-négativité et de cohérence des attributions sont conservés.

CREATE OR REPLACE FUNCTION public.review_proprietaire_validation(
  p_proprietaire_id uuid, p_action text, p_comment text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owner public.proprietaires_terres%rowtype;
  v_parcelles integer := 0;
  v_conventions integer := 0;
BEGIN
  IF v_user IS NULL OR NOT (
    private.has_role_permission('proprietaires.validate')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_user
      AND role IN ('pdg','dg','service_client','chef_equipe_service_client'))
  ) THEN
    RAISE EXCEPTION 'Vous n’êtes pas autorisé à valider les dossiers fonciers.' USING errcode='42501';
  END IF;
  IF p_action NOT IN ('valider','demander_modification') THEN
    RAISE EXCEPTION 'Action de validation inconnue.';
  END IF;
  IF p_action='demander_modification' AND NULLIF(TRIM(COALESCE(p_comment,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Indiquez les corrections à effectuer.';
  END IF;
  SELECT * INTO v_owner FROM public.proprietaires_terres WHERE id=p_proprietaire_id FOR UPDATE;
  IF v_owner.id IS NULL THEN RAISE EXCEPTION 'Dossier propriétaire foncier introuvable.'; END IF;

  UPDATE public.proprietaires_terres
  SET validation_statut=CASE WHEN p_action='valider' THEN 'valide' ELSE 'modification_demandee' END,
      statut=CASE WHEN p_action='valider' THEN 'actif' ELSE statut END,
      validation_notes=CASE WHEN p_action='valider' THEN NULL ELSE TRIM(p_comment) END,
      validated_by=CASE WHEN p_action='valider' THEN v_user ELSE NULL END,
      validated_at=CASE WHEN p_action='valider' THEN now() ELSE NULL END,
      updated_by=v_user, updated_at=now()
  WHERE id=p_proprietaire_id;

  IF p_action='valider' THEN
    UPDATE public.parcelles SET statut='validee',updated_at=now()
    WHERE proprietaire_id=p_proprietaire_id AND statut IN ('a_valider','en_attente_validation','en_attente');
    GET DIAGNOSTICS v_parcelles=ROW_COUNT;
    UPDATE public.conventions_foncieres SET statut='active',updated_at=now()
    WHERE proprietaire_id=p_proprietaire_id AND statut IN ('a_valider','en_attente_validation','en_attente','brouillon');
    GET DIAGNOSTICS v_conventions=ROW_COUNT;
    UPDATE public.parcelles p SET convention_id=c.id,updated_at=now()
    FROM public.conventions_foncieres c
    WHERE c.proprietaire_id=p_proprietaire_id AND c.parcelle_id=p.id
      AND p.proprietaire_id=p_proprietaire_id AND p.convention_id IS DISTINCT FROM c.id;
  END IF;
  RETURN jsonb_build_object('proprietaire_id',p_proprietaire_id,
    'validation_statut',CASE WHEN p_action='valider' THEN 'valide' ELSE 'modification_demandee' END,
    'statut',CASE WHEN p_action='valider' THEN 'actif' ELSE v_owner.statut END,
    'parcelles_traitees',v_parcelles,'conventions_traitees',v_conventions);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_proprietaire_foncier(
  _proprietaire_id uuid, _decision text, _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner public.proprietaires_terres%rowtype;
  v_parcelles integer := 0;
  v_conventions integer := 0;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT (
    private.has_role_permission('proprietaires.validate')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_user
      AND ur.role IN ('pdg','dg','service_client','chef_equipe_service_client'))
  ) THEN
    RAISE EXCEPTION 'Accès refusé : le rôle ne permet pas de valider un dossier foncier.' USING errcode='42501';
  END IF;
  IF _decision NOT IN ('valide','refuse') THEN RAISE EXCEPTION 'Décision de validation invalide.' USING errcode='22023'; END IF;
  SELECT * INTO v_owner FROM public.proprietaires_terres WHERE id=_proprietaire_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Propriétaire foncier introuvable.' USING errcode='P0002'; END IF;
  IF v_owner.validation_statut<>'a_valider' THEN RAISE EXCEPTION 'Ce dossier foncier a déjà été traité.' USING errcode='23514'; END IF;

  UPDATE public.proprietaires_terres
  SET validation_statut=_decision,statut=CASE WHEN _decision='valide' THEN 'actif' ELSE 'refuse' END,
      validation_notes=NULLIF(BTRIM(COALESCE(_notes,'')),''),
      validated_by=v_user,validated_at=now(),updated_by=v_user,updated_at=now()
  WHERE id=_proprietaire_id;

  IF _decision='valide' THEN
    UPDATE public.parcelles SET statut='validee',updated_at=now()
    WHERE proprietaire_id=_proprietaire_id AND statut IN ('a_valider','en_attente_validation','en_attente');
    GET DIAGNOSTICS v_parcelles=ROW_COUNT;
    UPDATE public.conventions_foncieres SET statut='active',updated_at=now()
    WHERE proprietaire_id=_proprietaire_id AND statut IN ('a_valider','en_attente_validation','en_attente','brouillon');
    GET DIAGNOSTICS v_conventions=ROW_COUNT;
    UPDATE public.parcelles p SET convention_id=c.id,updated_at=now()
    FROM public.conventions_foncieres c
    WHERE c.proprietaire_id=_proprietaire_id AND c.parcelle_id=p.id
      AND p.proprietaire_id=_proprietaire_id AND p.convention_id IS DISTINCT FROM c.id;
  ELSE
    UPDATE public.parcelles SET statut='refusee',updated_at=now()
    WHERE proprietaire_id=_proprietaire_id AND statut IN ('a_valider','en_attente_validation','en_attente');
    GET DIAGNOSTICS v_parcelles=ROW_COUNT;
    UPDATE public.conventions_foncieres SET statut='refusee',updated_at=now()
    WHERE proprietaire_id=_proprietaire_id AND statut IN ('a_valider','en_attente_validation','en_attente','brouillon');
    GET DIAGNOSTICS v_conventions=ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('proprietaire_id',_proprietaire_id,'validation_statut',_decision,
    'statut',CASE WHEN _decision='valide' THEN 'actif' ELSE 'refuse' END,
    'parcelles_traitees',v_parcelles,'conventions_traitees',v_conventions);
END;
$function$;

DROP POLICY IF EXISTS "Conventions read by permission and owner scope" ON public.conventions_foncieres;
CREATE POLICY "Conventions read by permission and owner scope" ON public.conventions_foncieres
FOR SELECT TO authenticated USING (
  private.crm_has_role_permission('proprietaires.view')
  AND EXISTS (SELECT 1 FROM public.proprietaires_terres o WHERE o.id=conventions_foncieres.proprietaire_id
    AND (o.created_by=(SELECT auth.uid()) OR private.crm_user_can_access_geo((SELECT auth.uid()),
      o.region_id,o.district_id,o.departement_id,o.sous_prefecture_id)))
);

DROP POLICY IF EXISTS "Conventions insert by permission and owner scope" ON public.conventions_foncieres;
CREATE POLICY "Conventions insert by permission and owner scope" ON public.conventions_foncieres
FOR INSERT TO authenticated WITH CHECK (
  private.crm_has_role_permission('proprietaires.create') AND created_by=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.proprietaires_terres o WHERE o.id=conventions_foncieres.proprietaire_id
    AND (o.created_by=(SELECT auth.uid()) OR private.crm_user_can_access_geo((SELECT auth.uid()),
      o.region_id,o.district_id,o.departement_id,o.sous_prefecture_id)))
);

DROP POLICY IF EXISTS "Conventions update by permission and owner scope" ON public.conventions_foncieres;
CREATE POLICY "Conventions update by permission and owner scope" ON public.conventions_foncieres
FOR UPDATE TO authenticated USING (
  private.crm_has_role_permission('proprietaires.update')
  AND EXISTS (SELECT 1 FROM public.proprietaires_terres o WHERE o.id=conventions_foncieres.proprietaire_id
    AND (o.created_by=(SELECT auth.uid()) OR private.crm_user_can_access_geo((SELECT auth.uid()),
      o.region_id,o.district_id,o.departement_id,o.sous_prefecture_id)))
) WITH CHECK (
  private.crm_has_role_permission('proprietaires.update')
  AND EXISTS (SELECT 1 FROM public.proprietaires_terres o WHERE o.id=conventions_foncieres.proprietaire_id
    AND (o.created_by=(SELECT auth.uid()) OR private.crm_user_can_access_geo((SELECT auth.uid()),
      o.region_id,o.district_id,o.departement_id,o.sous_prefecture_id)))
);

ALTER TABLE public.proprietaires_terres
  DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_campagne_check,
  DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_two_hectare_check,
  DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_nonnegative_check,
  DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_campagne_bounds_check;
ALTER TABLE public.proprietaires_terres
  ADD CONSTRAINT proprietaires_terres_surface_nonnegative_check CHECK (
    (surface_totale_ha IS NULL OR surface_totale_ha>=0)
    AND (surface_totale_declaree_ha IS NULL OR surface_totale_declaree_ha>=0)),
  ADD CONSTRAINT proprietaires_terres_surface_campagne_bounds_check CHECK (
    surface_campagne_ha IS NULL OR (surface_campagne_ha>=0
      AND (surface_totale_declaree_ha IS NULL OR surface_campagne_ha<=surface_totale_declaree_ha)));

ALTER TABLE public.parcelles
  DROP CONSTRAINT IF EXISTS parcelles_surface_components_half_check,
  DROP CONSTRAINT IF EXISTS parcelles_surface_totale_half_check,
  DROP CONSTRAINT IF EXISTS parcelles_surface_nonnegative_check;
ALTER TABLE public.parcelles ADD CONSTRAINT parcelles_surface_nonnegative_check CHECK (
  (surface_totale_ha IS NULL OR surface_totale_ha>=0)
  AND (surface_proprietaire_ha IS NULL OR surface_proprietaire_ha>=0)
  AND (surface_agricapital_ha IS NULL OR surface_agricapital_ha>=0)
  AND (surface_attribuee_ha IS NULL OR surface_attribuee_ha>=0)
  AND (surface_disponible_ha IS NULL OR surface_disponible_ha>=0)
  AND (plantation_surface_cible_ha IS NULL OR plantation_surface_cible_ha>=0));

ALTER TABLE public.conventions_foncieres
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_campagne_check,
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_two_hectare_steps_check,
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_nonnegative_check,
  DROP CONSTRAINT IF EXISTS conventions_foncieres_surface_campagne_bounds_check;
ALTER TABLE public.conventions_foncieres
  ADD CONSTRAINT conventions_foncieres_surface_nonnegative_check CHECK (
    surface_totale_ha IS NULL OR surface_totale_ha>=0),
  ADD CONSTRAINT conventions_foncieres_surface_campagne_bounds_check CHECK (
    surface_campagne_ha IS NULL OR (surface_campagne_ha>=0
      AND (surface_totale_ha IS NULL OR surface_campagne_ha<=surface_totale_ha)));

ALTER TABLE public.lots_hectares
  DROP CONSTRAINT IF EXISTS lots_hectares_surface_half_check,
  DROP CONSTRAINT IF EXISTS lots_hectares_surface_attribuee_check,
  DROP CONSTRAINT IF EXISTS lots_hectares_surface_nonnegative_check,
  DROP CONSTRAINT IF EXISTS lots_hectares_surface_attribuee_bounds_check;
ALTER TABLE public.lots_hectares
  ADD CONSTRAINT lots_hectares_surface_nonnegative_check CHECK (surface_ha IS NULL OR surface_ha>=0),
  ADD CONSTRAINT lots_hectares_surface_attribuee_bounds_check CHECK (
    COALESCE(surface_attribuee_ha,0)>=0
    AND COALESCE(surface_attribuee_ha,0)<=COALESCE(surface_ha,0)+0.000001);

ALTER TABLE public.acquisition_lots
  DROP CONSTRAINT IF EXISTS acquisition_lots_surface_half_check,
  DROP CONSTRAINT IF EXISTS acquisition_lots_surface_nonnegative_check;
ALTER TABLE public.acquisition_lots ADD CONSTRAINT acquisition_lots_surface_nonnegative_check
  CHECK (surface_ha IS NULL OR surface_ha>=0);

ALTER TABLE public.plantation_activations
  DROP CONSTRAINT IF EXISTS plantation_activations_surface_half_check,
  DROP CONSTRAINT IF EXISTS plantation_activations_surface_nonnegative_check;
ALTER TABLE public.plantation_activations ADD CONSTRAINT plantation_activations_surface_nonnegative_check
  CHECK ((surface_client_ha IS NULL OR surface_client_ha>=0)
    AND (surface_proprietaire_ha IS NULL OR surface_proprietaire_ha>=0));

ALTER TABLE public.beneficiaire_attributions
  DROP CONSTRAINT IF EXISTS beneficiaire_attributions_surface_half_hectare_check,
  DROP CONSTRAINT IF EXISTS beneficiaire_attributions_surface_nonnegative_check;
ALTER TABLE public.beneficiaire_attributions ADD CONSTRAINT beneficiaire_attributions_surface_nonnegative_check
  CHECK (surface_attribuee_ha IS NULL OR surface_attribuee_ha>=0);

-- Reconstitue le lien manquant uniquement si les deux enregistrements historiques sont présents.
DO $repair$
DECLARE
  v_owner public.proprietaires_terres%rowtype;
  v_parcel public.parcelles%rowtype;
  v_convention_id uuid;
BEGIN
  SELECT * INTO v_owner FROM public.proprietaires_terres WHERE id_unique='AC-P000002';
  SELECT * INTO v_parcel FROM public.parcelles WHERE id_unique='PAR-000008';
  IF v_owner.id IS NULL OR v_parcel.id IS NULL THEN RETURN; END IF;
  IF v_owner.validation_statut<>'valide' OR v_owner.statut<>'actif'
     OR v_parcel.statut<>'active' OR v_parcel.mode_surface<>'plante_partage'
     OR v_parcel.plantation_partagee_activee IS DISTINCT FROM true THEN RETURN; END IF;

  SELECT id INTO v_convention_id FROM public.conventions_foncieres
  WHERE proprietaire_id=v_owner.id OR parcelle_id=v_parcel.id ORDER BY created_at LIMIT 1;
  IF v_convention_id IS NULL THEN
    INSERT INTO public.conventions_foncieres (
      proprietaire_id,parcelle_id,type_convention,duree_ans,surface_totale_ha,surface_campagne_ha,
      part_proprietaire_pct,part_agricapital_pct,part_proprietaire_ha,part_agricapital_ha,
      caution_par_ha,caution_totale,nombre_lots_agricapital,statut,notes,created_by
    ) VALUES (
      v_owner.id,v_parcel.id,'plante_partage',30,v_parcel.surface_totale_ha,v_parcel.plantation_surface_cible_ha,
      v_owner.part_proprietaire_pct,v_owner.part_agricapital_pct,v_owner.part_proprietaire_ha,v_owner.part_agricapital_ha,
      v_owner.caution_par_ha,v_owner.caution_totale,0,'active',
      'Enregistrement reconstitué à partir des données déjà présentes du propriétaire et de la parcelle active. Date de signature et fichier signé non renseignés dans les données historiques.',
      v_owner.created_by
    ) RETURNING id INTO v_convention_id;
  END IF;
  UPDATE public.parcelles SET convention_id=v_convention_id,updated_at=now()
  WHERE id=v_parcel.id AND convention_id IS DISTINCT FROM v_convention_id;
  UPDATE public.lots_hectares SET convention_id=v_convention_id
  WHERE parcelle_id=v_parcel.id AND convention_id IS NULL;
  UPDATE public.conventions_foncieres SET statut='active',
    nombre_lots_agricapital=COALESCE(v_owner.nombre_lots_agricapital,0),updated_at=now()
  WHERE id=v_convention_id;
END;
$repair$;

UPDATE public.parcelles p SET convention_id=c.id,updated_at=now()
FROM public.conventions_foncieres c
WHERE c.parcelle_id=p.id AND p.proprietaire_id=c.proprietaire_id
  AND p.convention_id IS DISTINCT FROM c.id;
