
CREATE OR REPLACE FUNCTION public.sync_proprietaire_portal_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_client_id uuid;
  v_phone text;
  v_name text;
  v_mirror_id text;
BEGIN
  v_phone := NULLIF(TRIM(COALESCE(NEW.telephone, NEW.whatsapp, '')), '');
  v_name := COALESCE(NULLIF(TRIM(NEW.nom_complet), ''), NULLIF(TRIM(CONCAT_WS(' ', NEW.nom, NEW.prenoms)), ''), 'Propriétaire foncier');
  v_mirror_id := 'OWNER-' || COALESCE(NULLIF(TRIM(NEW.id_unique), ''), NEW.id::text);

  -- Find only the dedicated owner mirror. Never convert a beneficiary or a
  -- commercial client into a landowner mirror just because it shares a phone.
  SELECT id INTO v_client_id
  FROM public.clients
  WHERE type_client = 'proprietaire_foncier'
    AND (proprietaire_id = NEW.id OR id_unique = v_mirror_id)
  ORDER BY CASE WHEN proprietaire_id = NEW.id THEN 0 ELSE 1 END
  LIMIT 1;

  -- A person can be both beneficiary and landowner. Preserve that distinct
  -- client/beneficiary record if it is already linked to this owner.
  IF v_client_id IS NULL AND EXISTS (
    SELECT 1 FROM public.clients WHERE proprietaire_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  IF v_phone IS NULL THEN
    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients
      SET proprietaire_id = NEW.id,
          type_client = 'proprietaire_foncier',
          type_client_foncier = 'EXT',
          id_unique = v_mirror_id,
          validation_statut = 'valide',
          updated_by = NEW.updated_by,
          updated_at = now()
      WHERE id = v_client_id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients(
      id_unique, user_id, civilite, nom_famille, prenoms, nom_complet, nom,
      type_client, type_client_foncier, telephone, whatsapp, email,
      statut, statut_global, compte_actif, total_hectares, nombre_plantations,
      parcours_code, contrat_acquisition_statut, contrat_accompagnement_statut,
      proprietaire_id, validation_statut, created_by, updated_by
    )
    VALUES(
      v_mirror_id, NULL, NEW.civilite, NEW.nom, NEW.prenoms, v_name, NEW.nom,
      'proprietaire_foncier', 'EXT', v_phone, NEW.whatsapp, NEW.email,
      'actif', 'actif', true, COALESCE(NEW.surface_totale_ha,0), COALESCE(NEW.nombre_parcelles,0),
      'proprietaire_foncier', 'non_requis', 'non_requis',
      NEW.id, 'valide', NEW.created_by, NEW.updated_by
    )
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients
    SET id_unique = v_mirror_id,
        civilite = COALESCE(NEW.civilite,civilite),
        nom_famille = COALESCE(NEW.nom,nom_famille),
        prenoms = COALESCE(NEW.prenoms,prenoms),
        nom_complet = v_name,
        nom = COALESCE(NEW.nom,nom),
        type_client = 'proprietaire_foncier',
        type_client_foncier = 'EXT',
        telephone = v_phone,
        whatsapp = COALESCE(NEW.whatsapp,whatsapp),
        email = COALESCE(NEW.email,email),
        statut_global = 'actif',
        compte_actif = true,
        validation_statut = 'valide',
        proprietaire_id = NEW.id,
        updated_by = NEW.updated_by,
        updated_at = now()
    WHERE id = v_client_id;
  END IF;

  RETURN NEW;
END;
$function$;
