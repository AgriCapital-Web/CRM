DO $$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.register_beneficiaire_particulier(jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
    INTO v_definition;

  v_old := $old$      domicile,district_id,region_id,departement_id,sous_prefecture_id,village,statut,type_proprietaire,statut_foncier,reference_cadastrale,notes,created_by,updated_by$old$;
  v_new := $new$      lieu_residence,district_id,region_id,departement_id,sous_prefecture_id,village,statut,type_proprietaire,statut_foncier,reference_cadastrale,notes,created_by,updated_by$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Colonne résidence propriétaire introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      nullif(p_proprietaire->>'date_delivrance_piece','')::date,nullif(trim(p_proprietaire->>'domicile'),''),$old$;
  v_new := $new$      nullif(p_proprietaire->>'date_delivrance_piece','')::date,coalesce(nullif(trim(p_proprietaire->>'lieu_residence'),''),nullif(trim(p_proprietaire->>'domicile'),'')),$new$;
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Valeur résidence propriétaire introuvable'; END IF;
  v_definition := replace(v_definition,v_old,v_new);

  EXECUTE v_definition;
END $$;
