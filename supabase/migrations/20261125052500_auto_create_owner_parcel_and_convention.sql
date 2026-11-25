CREATE OR REPLACE FUNCTION public.ensure_validated_owner_partnership_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_surface numeric;
  v_parcelle_id uuid;
  v_convention_id uuid;
  v_part_agri numeric;
  v_part_owner numeric;
BEGIN
  IF NEW.statut <> 'actif' OR NEW.validation_statut <> 'valide' THEN RETURN NEW; END IF;
  v_surface := COALESCE(NULLIF(NEW.surface_totale_ha,0),NULLIF(NEW.surface_totale_declaree_ha,0));
  IF v_surface IS NULL OR v_surface <= 0 THEN RETURN NEW; END IF;
  v_part_agri := COALESCE(NEW.part_agricapital_pct,50);
  v_part_owner := COALESCE(NEW.part_proprietaire_pct,100-v_part_agri);

  SELECT p.id INTO v_parcelle_id FROM public.parcelles p
  WHERE p.proprietaire_id=NEW.id
  ORDER BY CASE WHEN p.mode_surface='plante_partage' THEN 0 ELSE 1 END,p.created_at LIMIT 1;

  IF v_parcelle_id IS NULL THEN
    INSERT INTO public.parcelles (
      proprietaire_id,nom,surface_totale_ha,surface_proprietaire_ha,surface_agricapital_ha,
      surface_attribuee_ha,surface_disponible_ha,region_id,district_id,departement_id,
      sous_prefecture_id,village,village_id,statut,mode_surface,plantation_partagee_activee,
      plantation_surface_cible_ha,plantation_type_culture,plantation_densite_plants,
      notes,created_by,updated_by
    ) VALUES (
      NEW.id,'Parcelle de '||COALESCE(NULLIF(NEW.nom_complet,''),NEW.id_unique),
      v_surface,round(v_surface*v_part_owner/100,6),round(v_surface*v_part_agri/100,6),
      0,round(v_surface*v_part_agri/100,6),NEW.region_id,NEW.district_id,NEW.departement_id,
      NEW.sous_prefecture_id,NEW.village,NEW.village_id,'active','plante_partage',true,
      0,'Palmier à huile',143,
      'Parcelle créée automatiquement à la validation du propriétaire. La localisation précise, les limites cadastrales et les pièces foncières restent à compléter.',
      NEW.created_by,NEW.updated_by
    ) RETURNING id INTO v_parcelle_id;
  END IF;

  SELECT c.id INTO v_convention_id FROM public.conventions_foncieres c
  WHERE c.proprietaire_id=NEW.id AND c.parcelle_id=v_parcelle_id LIMIT 1;
  IF v_convention_id IS NULL THEN
    INSERT INTO public.conventions_foncieres (
      proprietaire_id,parcelle_id,type_convention,duree_ans,surface_totale_ha,
      part_proprietaire_pct,part_agricapital_pct,part_proprietaire_ha,part_agricapital_ha,
      nombre_lots_agricapital,surface_campagne_ha,statut,notes,created_by
    ) VALUES (
      NEW.id,v_parcelle_id,'plante_partage',30,v_surface,v_part_owner,v_part_agri,
      round(v_surface*v_part_owner/100,6),round(v_surface*v_part_agri/100,6),
      COALESCE(NEW.nombre_lots_agricapital,0),NEW.surface_campagne_ha,'active',
      'Convention activée automatiquement avec le dossier propriétaire validé. La date de signature, la localisation précise et les pièces justificatives restent à renseigner lorsqu’elles seront disponibles.',
      NEW.created_by
    ) RETURNING id INTO v_convention_id;
  END IF;

  UPDATE public.parcelles SET convention_id=v_convention_id,updated_at=now()
  WHERE id=v_parcelle_id AND convention_id IS DISTINCT FROM v_convention_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ensure_validated_owner_partnership_records ON public.proprietaires_terres;
CREATE TRIGGER trg_ensure_validated_owner_partnership_records
AFTER INSERT OR UPDATE OF statut,validation_statut ON public.proprietaires_terres
FOR EACH ROW EXECUTE FUNCTION public.ensure_validated_owner_partnership_records();

UPDATE public.proprietaires_terres SET statut='actif'
WHERE statut='actif' AND validation_statut='valide'
  AND COALESCE(surface_totale_ha,surface_totale_declaree_ha,0)>0
  AND id IN (
    '84bca104-79be-4a20-bd81-24dfcb423b97',
    'fc2fd931-d408-4ffa-b301-6255f7319b44',
    '9f72e141-9b61-4b3b-abf5-8f9b1bc84ceb',
    '34b431cc-6a80-425d-bda4-2200b5d8628d'
  );
