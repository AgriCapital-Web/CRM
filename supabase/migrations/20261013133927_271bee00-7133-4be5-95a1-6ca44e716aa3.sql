-- Team membership must not be wiped because the HR department label is empty.
CREATE OR REPLACE FUNCTION public.normalize_profile_org_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text;
BEGIN
  IF NEW.relation_rh IN ('PDG','DG','Associé / Actionnaire') THEN
    NEW.departement=NULL;
    NEW.equipe_id=NULL;
    NEW.district_id=NULL;
    NEW.region_id=NULL;
    NEW.taux_commission=NULL;
    RETURN NEW;
  END IF;

  -- The team decides the department when none is set (team type comes from the DB).
  IF NEW.equipe_id IS NOT NULL AND COALESCE(NEW.departement,'') = '' THEN
    SELECT type_equipe INTO v_type FROM public.equipes WHERE id = NEW.equipe_id;
    IF v_type IS NOT NULL THEN
      NEW.departement := CASE lower(v_type)
        WHEN 'commercial' THEN 'Commercial'
        WHEN 'technique' THEN 'Technique'
        WHEN 'service_client' THEN 'Service client'
        ELSE initcap(replace(v_type,'_',' ')) END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Team managers authorised by role permission may change equipe_id even if not global admin.
CREATE OR REPLACE FUNCTION public.assign_profile_to_equipe(p_profile_id uuid, p_equipe_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (private.has_role_permission('parametres.manage_teams') OR private.is_global_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Permission refusée pour gérer les membres des équipes'
      USING ERRCODE = '42501';
  END IF;

  IF p_equipe_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.equipes WHERE id = p_equipe_id
  ) THEN
    RAISE EXCEPTION 'Équipe introuvable' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.internal_coverage_sync', 'true', true);
  UPDATE public.profiles
     SET equipe_id = p_equipe_id,
         updated_at = now()
   WHERE id = p_profile_id
     AND actif = true;
  IF NOT FOUND THEN
    PERFORM set_config('app.internal_coverage_sync', 'false', true);
    RAISE EXCEPTION 'Profil introuvable ou inactif' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('app.internal_coverage_sync', 'false', true);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND equipe_id IS NOT DISTINCT FROM p_equipe_id) THEN
    RAISE EXCEPTION 'Affectation refusée par une règle du profil' USING ERRCODE = '42501';
  END IF;
END;
$function$;