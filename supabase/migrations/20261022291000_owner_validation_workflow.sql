CREATE OR REPLACE FUNCTION public.review_proprietaire_validation(
  p_proprietaire_id uuid,
  p_action text,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner public.proprietaires_terres%rowtype;
BEGIN
  IF v_user IS NULL OR NOT (
    private.has_role_permission('proprietaires.validate')
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_user
        AND role IN ('pdg','dg','service_client','chef_equipe_service_client')
    )
  ) THEN
    RAISE EXCEPTION 'Vous n’êtes pas autorisé à valider les dossiers fonciers.'
      USING errcode = '42501';
  END IF;

  IF p_action NOT IN ('valider','demander_modification') THEN
    RAISE EXCEPTION 'Action de validation inconnue.';
  END IF;

  IF p_action = 'demander_modification' AND NULLIF(TRIM(COALESCE(p_comment,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Indiquez les corrections à effectuer.';
  END IF;

  SELECT * INTO v_owner
  FROM public.proprietaires_terres
  WHERE id = p_proprietaire_id
  FOR UPDATE;

  IF v_owner.id IS NULL THEN
    RAISE EXCEPTION 'Dossier propriétaire foncier introuvable.';
  END IF;

  UPDATE public.proprietaires_terres
  SET validation_statut = CASE WHEN p_action = 'valider' THEN 'valide' ELSE 'modification_demandee' END,
      validation_notes = CASE WHEN p_action = 'valider' THEN NULL ELSE TRIM(p_comment) END,
      validated_by = v_user,
      validated_at = CASE WHEN p_action = 'valider' THEN now() ELSE NULL END,
      updated_by = v_user,
      updated_at = now()
  WHERE id = p_proprietaire_id;

  RETURN jsonb_build_object(
    'proprietaire_id', p_proprietaire_id,
    'validation_statut', CASE WHEN p_action = 'valider' THEN 'valide' ELSE 'modification_demandee' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_proprietaire_validation(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_proprietaire_validation(uuid,text,text) TO authenticated;
