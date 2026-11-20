
CREATE OR REPLACE FUNCTION public.allocate_acquisition_lot(
  p_acquisition_id uuid,p_lot_id uuid,p_surface_ha numeric DEFAULT NULL,p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $function$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_lot public.lots_hectares%ROWTYPE;
  v_surface numeric;
  v_allocated numeric;
  v_contract numeric;
  v_remaining numeric;
  v_family text;
  v_allocation_id uuid;
  v_today date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise pour affecter un lot.'; END IF;
  SELECT * INTO v_acquisition FROM public.acquisitions WHERE id=p_acquisition_id FOR UPDATE;
  IF v_acquisition.id IS NULL THEN RAISE EXCEPTION 'Acquisition introuvable.'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id=v_acquisition.client_id;
  IF v_client.id IS NULL THEN RAISE EXCEPTION 'Client de l’acquisition introuvable.'; END IF;
  SELECT * INTO v_lot FROM public.lots_hectares WHERE id=p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN RAISE EXCEPTION 'Lot foncier introuvable.'; END IF;
  IF NOT (
    private.crm_is_global_admin(auth.uid())
    OR private.has_role(auth.uid(),'responsable_operations')
    OR ((private.has_role(auth.uid(),'chef_equipe_technique') OR private.has_role(auth.uid(),'technicien'))
      AND private.can_access_parcelle(auth.uid(),v_lot.parcelle_id))
  ) THEN RAISE EXCEPTION 'Vous ne pouvez pas affecter un lot hors de votre périmètre technique.'; END IF;
  IF v_acquisition.statut<>'active' OR v_acquisition.validation_statut<>'valide' THEN
    RAISE EXCEPTION 'Seule une acquisition validée et active peut recevoir un lot supplémentaire.';
  END IF;
  IF NOT (
    coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'deferred_land_allocation')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'foncier_convention_en_attente')::boolean,false)
  ) THEN RAISE EXCEPTION 'Cette acquisition ne permet pas encore une affectation foncière progressive.'; END IF;
  v_family:=upper(coalesce(v_acquisition.famille_offre,'')||' '||coalesce(v_acquisition.offre_code,'')||' '||coalesce(v_acquisition.formule_code,''));
  v_contract:=coalesce(v_acquisition.superficie_ha,v_client.total_hectares,v_client.superficie_ha,0);
  v_surface:=coalesce(p_surface_ha,v_lot.surface_disponible_ha,v_lot.surface_ha,0);
  IF v_surface<=0 OR v_surface>coalesce(v_lot.surface_disponible_ha,0)+0.000001 THEN
    RAISE EXCEPTION 'La surface demandée dépasse la surface disponible sur ce lot.';
  END IF;
  IF v_family LIKE '%PALMINVEST%' AND (abs(coalesce(v_lot.surface_ha,0)-1)>0.000001 OR abs(v_surface-1)>0.000001) THEN
    RAISE EXCEPTION 'Un lot PalmInvest doit être attribué en totalité, soit 1 ha.';
  END IF;
  IF coalesce(v_lot.part_type,'agricapital')<>'agricapital' THEN
    RAISE EXCEPTION 'Seule la quote-part foncière AgriCapital peut être affectée à cette acquisition.';
  END IF;
  IF v_lot.client_id IS NOT NULL OR v_lot.acquisition_id IS NOT NULL OR lower(coalesce(v_lot.statut,''))<>'disponible' THEN
    RAISE EXCEPTION 'Ce lot a déjà été affecté ou n’est plus disponible.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf JOIN public.parcelles p ON p.id=cf.parcelle_id
    WHERE cf.id=v_lot.convention_id AND cf.parcelle_id=v_lot.parcelle_id AND cf.statut='active'
      AND p.proprietaire_id=cf.proprietaire_id
  ) THEN RAISE EXCEPTION 'Une convention foncière active et cohérente est requise pour cette nouvelle parcelle.'; END IF;
  SELECT coalesce(sum(al.surface_ha),0) INTO v_allocated FROM public.acquisition_lots al
  WHERE al.acquisition_id=p_acquisition_id AND al.client_id=v_acquisition.client_id;
  IF v_allocated+v_surface>v_contract+0.000001 THEN
    RAISE EXCEPTION 'Cette affectation dépasserait la superficie contractuelle. Il reste % ha à affecter.',greatest(v_contract-v_allocated,0);
  END IF;
  INSERT INTO public.acquisition_lots(client_id,acquisition_id,lot_id,surface_ha,date_attribution,notes,created_by)
  VALUES(v_acquisition.client_id,p_acquisition_id,p_lot_id,v_surface,v_today,
    coalesce(p_notes,'Affectation foncière progressive.'),auth.uid()) RETURNING id INTO v_allocation_id;
  UPDATE public.lots_hectares SET client_id=v_acquisition.client_id,acquisition_id=p_acquisition_id,
    statut='attribue',date_attribution=v_today,surface_attribuee_ha=coalesce(surface_attribuee_ha,0)+v_surface,updated_at=now()
  WHERE id=p_lot_id;
  v_allocated:=v_allocated+v_surface;
  v_remaining:=greatest(v_contract-v_allocated,0);
  UPDATE public.acquisitions SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'surface_contractuelle_ha',v_contract,'surface_fonciere_allouee_ha',v_allocated,
    'surface_fonciere_restante_ha',v_remaining,'foncier_a_attribuer_plus_tard',v_remaining>0.000001,
    'technical_intervention_pending',true,
    'land_allocation_note',format('Contrat de %s ha. %s ha affectés sur plusieurs parcelles; %s ha restent à affecter.',v_contract,v_allocated,v_remaining)
  ),updated_at=now() WHERE id=p_acquisition_id;
  RETURN jsonb_build_object('allocation_id',v_allocation_id,'acquisition_id',p_acquisition_id,'lot_id',p_lot_id,
    'parcelle_id',v_lot.parcelle_id,'surface_attribuee_ha',v_surface,'surface_fonciere_allouee_ha',v_allocated,
    'surface_fonciere_restante_ha',v_remaining,'surface_contractuelle_ha',v_contract);
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_acquisition_lot(uuid,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_acquisition_lot(uuid,uuid,numeric,text) TO authenticated;

DROP POLICY IF EXISTS "Staff read acquisition lots within scope" ON public.acquisition_lots;
CREATE POLICY "Staff read acquisition lots within scope" ON public.acquisition_lots
FOR SELECT TO authenticated
USING (private.crm_is_global_admin(auth.uid()) OR (private.is_staff(auth.uid()) AND private.can_access_client(auth.uid(),client_id)));
