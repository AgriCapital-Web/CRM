-- Owner records are distinct from commercial clients. Keep a linked portal mirror
-- for owner access, but never consume the AC_C client identifier sequence.
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

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE proprietaire_id = NEW.id OR id_unique = v_mirror_id
  ORDER BY CASE WHEN proprietaire_id = NEW.id THEN 0 ELSE 1 END
  LIMIT 1;

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

-- Remove only the three exact duplicate Zongo owner/parcelle records previously
-- created within seconds of one another. Preserve the earliest owner and parcel.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.parcelles
    WHERE id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.acquisitions WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.beneficiaire_attributions WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.beneficiaire_documents WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.clients WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.conventions_foncieres WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.documents_convention WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.interventions_techniques WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.lots_hectares WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.plantation_activations WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
      UNION ALL SELECT 1 FROM public.plantations WHERE parcelle_id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12')
    ) THEN
      RAISE EXCEPTION 'Une parcelle dupliquée est référencée; vérifier ses relations avant suppression.';
    END IF;

    UPDATE public.parcelles
       SET proprietaire_id = '42a884da-f5b8-43d3-954c-95ff09b7d3a9', updated_at = now()
     WHERE proprietaire_id IN ('a3ced03d-72a7-420b-b3ca-b624aa0a9565','740717a9-d2e3-495a-8561-b145e2d8d19f');

    DELETE FROM public.parcelles
     WHERE id IN ('2e19a27a-3063-436b-bba6-bc64fa69476c','7405514d-0103-47a3-973c-0e15f7f62a12');

    DELETE FROM public.proprietaires_terres
     WHERE id IN ('a3ced03d-72a7-420b-b3ca-b624aa0a9565','740717a9-d2e3-495a-8561-b145e2d8d19f');
  END IF;
END $$;

-- A linked landowner portal row is not a commercial client and must not consume
-- the AC_C000001... sequence or appear as a client awaiting validation.
UPDATE public.clients c
SET id_unique = 'OWNER-' || COALESCE(NULLIF(TRIM(p.id_unique), ''), p.id::text),
    type_client = 'proprietaire_foncier',
    type_client_foncier = 'EXT',
    validation_statut = 'valide',
    updated_at = now()
FROM public.proprietaires_terres p
WHERE c.proprietaire_id = p.id
  AND c.type_client = 'proprietaire_foncier';

-- Staff can upload/update/delete only landowner profile images in this bucket path.
DROP POLICY IF EXISTS "Staff upload landowner profile photos" ON storage.objects;
CREATE POLICY "Staff upload landowner profile photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos-profils' AND (storage.foldername(name))[1] = 'proprietaires' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update landowner profile photos" ON storage.objects;
CREATE POLICY "Staff update landowner profile photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'photos-profils' AND (storage.foldername(name))[1] = 'proprietaires' AND private.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'photos-profils' AND (storage.foldername(name))[1] = 'proprietaires' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff delete landowner profile photos" ON storage.objects;
CREATE POLICY "Staff delete landowner profile photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos-profils' AND (storage.foldername(name))[1] = 'proprietaires' AND private.is_staff(auth.uid()));
