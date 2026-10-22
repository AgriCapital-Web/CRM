-- Allow the PDG and Relation client & Support team to review landowner dossiers
-- through the existing security-definer validation RPC, without weakening table RLS.
CREATE OR REPLACE FUNCTION public.validate_proprietaire_foncier(
  _proprietaire_id uuid,
  _decision text,
  _notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_user
        AND ur.role IN ('pdg', 'service_client', 'chef_equipe_service_client')
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé : le rôle ne permet pas de valider un dossier foncier.' USING errcode='42501';
  END IF;

  IF _decision NOT IN ('valide', 'refuse') THEN
    RAISE EXCEPTION 'Décision de validation invalide.' USING errcode='22023';
  END IF;

  SELECT * INTO v_owner
  FROM public.proprietaires_terres
  WHERE id = _proprietaire_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propriétaire foncier introuvable.' USING errcode='P0002';
  END IF;
  IF v_owner.validation_statut <> 'a_valider' THEN
    RAISE EXCEPTION 'Ce dossier foncier a déjà été traité.' USING errcode='23514';
  END IF;

  UPDATE public.proprietaires_terres
  SET validation_statut = _decision,
      statut = CASE WHEN _decision = 'valide' THEN 'actif' ELSE 'refuse' END,
      validation_notes = NULLIF(BTRIM(COALESCE(_notes,'')),''),
      updated_by = v_user,
      updated_at = now()
  WHERE id = _proprietaire_id;

  IF _decision = 'valide' THEN
    UPDATE public.parcelles SET statut = 'validee', updated_at = now()
    WHERE proprietaire_id = _proprietaire_id AND statut = 'a_valider';
    GET DIAGNOSTICS v_parcelles = ROW_COUNT;
    UPDATE public.conventions_foncieres SET statut = 'active', updated_at = now()
    WHERE proprietaire_id = _proprietaire_id AND statut = 'a_valider';
    GET DIAGNOSTICS v_conventions = ROW_COUNT;
  ELSE
    UPDATE public.parcelles SET statut = 'refusee', updated_at = now()
    WHERE proprietaire_id = _proprietaire_id AND statut = 'a_valider';
    GET DIAGNOSTICS v_parcelles = ROW_COUNT;
    UPDATE public.conventions_foncieres SET statut = 'refusee', updated_at = now()
    WHERE proprietaire_id = _proprietaire_id AND statut = 'a_valider';
    GET DIAGNOSTICS v_conventions = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'proprietaire_id', _proprietaire_id,
    'validation_statut', _decision,
    'parcelles_traitees', v_parcelles,
    'conventions_traitees', v_conventions
  );
END
$function$;

GRANT EXECUTE ON FUNCTION public.validate_proprietaire_foncier(uuid, text, text) TO authenticated;
