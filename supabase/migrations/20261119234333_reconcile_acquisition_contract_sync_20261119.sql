
ALTER TABLE public.finance_associates
  ADD COLUMN IF NOT EXISTS superficie_beneficiaire_ha numeric(10,2),
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7);

COMMENT ON COLUMN public.finance_associates.superficie_beneficiaire_ha IS
  'Surface beneficiaire declaree pour un associe; ne cree pas une acquisition client facturable.';
COMMENT ON COLUMN public.finance_associates.latitude IS 'Latitude GPS de reference du beneficiaire associe.';
COMMENT ON COLUMN public.finance_associates.longitude IS 'Longitude GPS de reference du beneficiaire associe.';

CREATE OR REPLACE FUNCTION public.validate_client_acquisition_foncier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lot public.lots_hectares%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_allocation jsonb;
  v_allocation_lot public.lots_hectares%rowtype;
  v_amount numeric;
  v_total numeric := 0;
  v_first_lot_id uuid;
  v_first_convention_id uuid;
  v_expected_lot_number integer;
  v_allocation_count integer := 0;
  v_family text;
  v_target_lot_id uuid;
  v_preassigned boolean := false;
  v_allocated_surface numeric;
  v_allocated_surface_actual numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.client_id IS NOT DISTINCT FROM NEW.client_id
       AND OLD.lot_id IS NOT DISTINCT FROM NEW.lot_id
       AND OLD.parcelle_id IS NOT DISTINCT FROM NEW.parcelle_id
       AND OLD.necessite_foncier_client IS NOT DISTINCT FROM NEW.necessite_foncier_client
       AND OLD.superficie_ha IS NOT DISTINCT FROM NEW.superficie_ha
       AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
       AND OLD.statut IS NOT DISTINCT FROM NEW.statut
       AND OLD.validation_statut IS NOT DISTINCT FROM NEW.validation_statut THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.necessite_foncier_client THEN
    IF NEW.lot_id IS NOT NULL THEN
      RAISE EXCEPTION 'Une offre sur terrain propre ne peut pas réserver un lot partenaire.';
    END IF;
    RETURN NEW;
  END IF;

  v_family := regexp_replace(
    upper(coalesce(NEW.famille_offre,'') || ' ' || coalesce(NEW.offre_code,'')),
    '[-_[:space:]]','','g'
  );

  -- La direction autorise la validation métier même si la convention active est encore à rattacher.
  -- Le lot, la parcelle, le propriétaire et la quote-part restent contrôlés.
  IF coalesce((NEW.metadata->>'foncier_convention_en_attente')::boolean,false) THEN
    v_target_lot_id := nullif(NEW.metadata->>'lot_cible_id','')::uuid;
    IF v_target_lot_id IS NULL OR NEW.lot_id IS DISTINCT FROM v_target_lot_id THEN
      RAISE EXCEPTION 'Le lot cible de l’acquisition foncière en attente est absent ou incohérent.';
    END IF;
    SELECT * INTO v_lot FROM public.lots_hectares WHERE id = v_target_lot_id FOR UPDATE;
    IF v_lot.id IS NULL OR v_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id THEN
      RAISE EXCEPTION 'Le lot cible ne correspond pas à la parcelle de l’acquisition.';
    END IF;
    IF coalesce(v_lot.part_type,'agricapital') <> 'agricapital' THEN
      RAISE EXCEPTION 'Le lot cible doit appartenir à la quote-part AgriCapital.';
    END IF;
    IF v_lot.client_id IS NULL THEN
      IF v_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
         OR coalesce(v_lot.surface_disponible_ha,0) + 0.000001 < NEW.superficie_ha THEN
        RAISE EXCEPTION 'Le lot cible n’est plus libre pour cette acquisition en attente.';
      END IF;
    ELSE
      IF v_lot.client_id IS DISTINCT FROM NEW.client_id
         OR v_lot.acquisition_id IS DISTINCT FROM NEW.id
         OR lower(coalesce(v_lot.statut,'')) <> 'attribue' THEN
        RAISE EXCEPTION 'Le lot déjà affecté ne correspond pas à cette acquisition en attente.';
      END IF;
    END IF;
    SELECT * INTO v_parcelle FROM public.parcelles WHERE id = v_lot.parcelle_id;
    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
    END IF;
    IF v_family LIKE '%PALMINVEST%' THEN
      SELECT COALESCE(SUM(al.surface_ha), 0)
      INTO v_allocated_surface_actual
      FROM public.acquisition_lots al
      WHERE al.acquisition_id = NEW.id;

      v_allocated_surface := COALESCE(
        NULLIF(NEW.metadata->>'surface_fonciere_allouee_ha', '')::numeric,
        NULLIF(v_allocated_surface_actual, 0),
        COALESCE(v_lot.surface_attribuee_ha, v_lot.surface_ha, 0)
      );

      IF v_allocated_surface_actual > 0
         AND abs(v_allocated_surface_actual - v_allocated_surface) > 0.000001 THEN
        RAISE EXCEPTION 'La surface fonciere allouee ne correspond pas aux lots affectes.';
      END IF;

      IF abs(coalesce(v_lot.surface_ha, 0) - 1) > 0.000001
         OR abs(coalesce(v_allocated_surface, 0) - 1) > 0.000001
         OR coalesce(NEW.superficie_ha, 0) + 0.000001 < coalesce(v_allocated_surface, 0)
         OR (
           coalesce(NEW.superficie_ha, 0) > coalesce(v_allocated_surface, 0) + 0.000001
           AND NOT coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean, false)
         ) THEN
        RAISE EXCEPTION 'PalmInvest exige un lot attribue de 1 ha. Toute superficie contractuelle supplementaire doit etre explicitement differee.';
      END IF;
    END IF;
    IF NEW.validation_statut = 'valide' THEN
      NEW.statut := 'active';
      RETURN NEW;
    END IF;
    IF NEW.statut <> 'souscrite' OR NEW.validation_statut <> 'a_valider' THEN
      RAISE EXCEPTION 'Une acquisition sans convention active doit rester souscrite tant qu’elle n’est pas validée.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'Une offre partenaire doit être liée à un lot disponible.';
  END IF;

  IF jsonb_typeof(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))='array'
     AND jsonb_array_length(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))>0 THEN
    FOR v_allocation IN
      SELECT value FROM jsonb_array_elements(NEW.metadata->'lot_allocations')
    LOOP
      SELECT * INTO v_allocation_lot
        FROM public.lots_hectares
       WHERE id=(v_allocation->>'lot_id')::uuid
       FOR UPDATE;

      IF v_allocation_lot.id IS NULL THEN
        RAISE EXCEPTION 'Un des lots de la série est introuvable.';
      END IF;

      IF v_allocation_count=0 THEN
        v_first_lot_id:=v_allocation_lot.id;
        v_first_convention_id:=v_allocation_lot.convention_id;
      ELSIF v_allocation_lot.convention_id IS DISTINCT FROM v_first_convention_id
         OR v_allocation_lot.numero_h<>v_expected_lot_number THEN
        RAISE EXCEPTION 'Les lots sélectionnés doivent être contigus et appartenir à la même convention foncière.';
      END IF;

      IF v_allocation_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id
         OR coalesce(v_allocation_lot.part_type,'agricapital')<>'agricapital'
         OR v_allocation_lot.client_id IS NOT NULL
         OR v_allocation_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_allocation_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue') THEN
        RAISE EXCEPTION 'Un des lots de la série n’est plus disponible pour cette acquisition.';
      END IF;

      v_amount:=coalesce((v_allocation->>'surface_ha')::numeric,0);
      IF v_family LIKE '%PALMINVEST%' THEN
        IF abs(v_amount-1)>0.000001 THEN
          RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
        END IF;
      ELSIF v_amount<0.5 OR abs(v_amount*2-round(v_amount*2))>0.000001 THEN
        RAISE EXCEPTION 'Chaque quote-part doit être un multiple de 0,50 ha.';
      END IF;

      IF v_amount>coalesce(v_allocation_lot.surface_disponible_ha,0)+0.000001 THEN
        RAISE EXCEPTION 'La quote-part demandée dépasse la superficie encore disponible du lot %.',v_allocation_lot.reference;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.conventions_foncieres cf
         WHERE cf.id=v_allocation_lot.convention_id
           AND cf.parcelle_id=v_allocation_lot.parcelle_id
           AND cf.statut='active'
      ) THEN
        RAISE EXCEPTION 'Chaque lot doit dépendre d’une convention foncière active.';
      END IF;

      v_total:=v_total+v_amount;
      v_expected_lot_number:=v_allocation_lot.numero_h+1;
      v_allocation_count:=v_allocation_count+1;
    END LOOP;

    IF v_first_lot_id IS DISTINCT FROM NEW.lot_id
       OR abs(v_total-coalesce(NEW.superficie_ha,0))>0.000001 THEN
      RAISE EXCEPTION 'La somme des quotes-parts des lots doit correspondre exactement à la superficie de l’acquisition.';
    END IF;

    SELECT * INTO v_parcelle FROM public.parcelles WHERE id=NEW.parcelle_id;
    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_lot
    FROM public.lots_hectares
   WHERE id=NEW.lot_id;

  IF v_lot.id IS NULL OR v_lot.parcelle_id IS NULL THEN
    RAISE EXCEPTION 'Lot partenaire introuvable ou sans parcelle.';
  END IF;

  v_preassigned :=
    v_lot.client_id = NEW.client_id
    AND v_lot.acquisition_id = NEW.id
    AND lower(coalesce(v_lot.statut,''))='attribue'
    AND NEW.metadata->>'lot_cible_id'=v_lot.id::text;

  IF NOT v_preassigned THEN
    IF v_lot.client_id IS NOT NULL
       OR v_lot.acquisition_id IS NOT NULL
       OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
       OR coalesce(v_lot.surface_disponible_ha,0)<=0 THEN
      RAISE EXCEPTION 'Le lot n’est plus disponible ou est réservé à une autre acquisition.';
    END IF;
    IF coalesce(v_lot.surface_disponible_ha,0)+0.000001 < coalesce(NEW.superficie_ha,0) THEN
      RAISE EXCEPTION 'La superficie disponible du lot est insuffisante.';
    END IF;
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_lot.parcelle_id;
  IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
    RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
     WHERE cf.id=v_lot.convention_id
       AND cf.parcelle_id=v_lot.parcelle_id
       AND cf.statut='active'
  ) THEN
    RAISE EXCEPTION 'Le lot doit dépendre d’une convention foncière active.';
  END IF;

  IF NEW.parcelle_id IS DISTINCT FROM v_lot.parcelle_id THEN
    RAISE EXCEPTION 'La parcelle de l’acquisition ne correspond pas au lot réservé.';
  END IF;

  IF v_family LIKE '%PALMINVEST%'
     AND (abs(coalesce(v_lot.surface_ha,0)-1)>0.000001
          OR abs(coalesce(NEW.superficie_ha,0)-1)>0.000001) THEN
    RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_client_pi_total_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.paiement_initial_montant IS DISTINCT FROM OLD.paiement_initial_montant THEN
    NEW.montant_pi_total := NEW.paiement_initial_montant;
  ELSIF NEW.montant_pi_total IS DISTINCT FROM OLD.montant_pi_total THEN
    NEW.paiement_initial_montant := NEW.montant_pi_total;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_client_pi_total_before_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_b_sync_client_pi_total_before_update
BEFORE UPDATE OF paiement_initial_montant, montant_pi_total ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.sync_client_pi_total_before_update();

CREATE OR REPLACE FUNCTION public.sync_client_contract_terms_to_acquisition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_surface numeric;
  v_allocated numeric := 0;
  v_available numeric;
  v_pi numeric;
  v_total numeric;
  v_monthly numeric;
  v_family text;
  v_metadata jsonb;
  v_snapshot jsonb;
BEGIN
  IF OLD.total_hectares IS NOT DISTINCT FROM NEW.total_hectares
     AND OLD.superficie_ha IS NOT DISTINCT FROM NEW.superficie_ha
     AND OLD.paiement_initial_montant IS NOT DISTINCT FROM NEW.paiement_initial_montant
     AND OLD.montant_pi_total IS NOT DISTINCT FROM NEW.montant_pi_total
     AND OLD.montant_total_contrat IS NOT DISTINCT FROM NEW.montant_total_contrat
     AND OLD.mensualite_montant IS NOT DISTINCT FROM NEW.mensualite_montant
     AND OLD.offre_snapshot IS NOT DISTINCT FROM NEW.offre_snapshot THEN RETURN NEW; END IF;

  IF lower(coalesce(NEW.type_client,'')) IN ('beneficiaire_particulier','proprietaire_foncier','associe','associe_actionnaire','partenaire') THEN
    RETURN NEW;
  END IF;

  v_surface := COALESCE(NULLIF(NEW.total_hectares,0),NULLIF(NEW.superficie_ha,0));
  IF v_surface IS NULL OR v_surface<=0 THEN RETURN NEW; END IF;

  SELECT a.* INTO v_acquisition
  FROM public.acquisitions a
  WHERE a.client_id=NEW.id
    AND lower(coalesce(a.statut,'')) NOT IN ('annulee','annulé','cancelled','rejected','rejetee')
  ORDER BY a.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(al.surface_ha),0) INTO v_allocated
  FROM public.acquisition_lots al WHERE al.acquisition_id=v_acquisition.id;
  IF v_allocated<=0 AND v_acquisition.lot_id IS NOT NULL THEN
    SELECT COALESCE(lh.surface_attribuee_ha,lh.surface_ha,0) INTO v_allocated
    FROM public.lots_hectares lh WHERE lh.id=v_acquisition.lot_id;
  END IF;

  v_pi := COALESCE(NEW.montant_pi_total,NEW.paiement_initial_montant,v_acquisition.montant_pi_total,0);
  v_total := COALESCE(NEW.montant_total_contrat,v_acquisition.montant_total_contrat,0);
  v_monthly := COALESCE(NEW.mensualite_montant,v_acquisition.mensualite_montant,0);
  v_family := upper(coalesce(v_acquisition.famille_offre,'') || ' ' || coalesce(v_acquisition.offre_code,''));
  v_metadata := COALESCE(v_acquisition.metadata,'{}'::jsonb) || jsonb_build_object('surface_contractuelle_ha',v_surface);

  IF v_allocated>0 AND v_allocated+0.000001<v_surface THEN
    IF v_metadata->>'foncier_convention_en_attente'='true' AND v_family LIKE '%PALMINVEST%' THEN
      v_metadata := v_metadata || jsonb_build_object(
        'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
        'surface_fonciere_allouee_ha',v_allocated,'surface_fonciere_restante_ha',v_surface-v_allocated
      );
    ELSE
      RAISE EXCEPTION 'La surface contractuelle (%) depasse la surface fonciere attribuee (%). Completez l''attribution fonciere avant modification.',v_surface,v_allocated;
    END IF;
  ELSIF v_allocated>0 THEN
    v_metadata := v_metadata || jsonb_build_object(
      'surface_fonciere_allouee_ha',v_allocated,
      'surface_fonciere_restante_ha',greatest(v_surface-v_allocated,0)
    );
    IF v_surface<=v_allocated+0.000001 THEN v_metadata := v_metadata - 'foncier_a_attribuer_plus_tard'; END IF;
  ELSIF coalesce((NEW.metadata->>'deferred_land_allocation')::boolean,false) THEN
    v_metadata := v_metadata || jsonb_build_object(
      'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
      'surface_fonciere_allouee_ha',0,'surface_fonciere_restante_ha',v_surface
    );
  END IF;

  IF v_acquisition.parcelle_id IS NOT NULL THEN
    SELECT p.surface_disponible_ha INTO v_available FROM public.parcelles p WHERE p.id=v_acquisition.parcelle_id;
    IF v_available IS NOT NULL THEN v_metadata := v_metadata || jsonb_build_object('surface_disponible_parcelle_ha',v_available); END IF;
  END IF;

  v_snapshot := COALESCE(v_acquisition.offre_snapshot,'{}'::jsonb);
  v_snapshot := jsonb_set(v_snapshot,'{contract,superficie_ha}',to_jsonb(v_surface),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,montant_pi_total}',to_jsonb(v_pi),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,paiement_initial_montant}',to_jsonb(v_pi),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,montant_total_contrat}',to_jsonb(v_total),true);
  v_snapshot := jsonb_set(v_snapshot,'{contract,mensualite_montant}',to_jsonb(v_monthly),true);
  v_snapshot := jsonb_set(v_snapshot,'{snapshot_at}',to_jsonb(now()::text),true);

  UPDATE public.acquisitions
  SET superficie_ha=v_surface,montant_pi_total=v_pi,montant_total_contrat=v_total,
      mensualite_montant=v_monthly,offre_snapshot=v_snapshot,metadata=v_metadata,updated_at=now()
  WHERE id=v_acquisition.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_client_contract_terms_to_acquisition() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sync_client_contract_terms_to_acquisition
AFTER UPDATE OF total_hectares,superficie_ha,paiement_initial_montant,montant_pi_total,
  montant_total_contrat,mensualite_montant,offre_snapshot
ON public.clients FOR EACH ROW EXECUTE FUNCTION public.sync_client_contract_terms_to_acquisition();
