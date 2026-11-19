
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS surface_plantee_ha numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clients.total_hectares IS
  'Superficie contractuelle du client; ne doit pas etre remplacee par la somme des plantations.';
COMMENT ON COLUMN public.clients.surface_plantee_ha IS
  'Surface effectivement plantee, recalculee a partir des plantations et attributions actives.';

CREATE OR REPLACE FUNCTION public.update_client_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sid uuid;
  v_ids uuid[];
  v_count integer;
  v_total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.client_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_ids := ARRAY[NEW.client_id];
    IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      v_ids := array_append(v_ids, OLD.client_id);
    END IF;
  ELSE
    v_ids := ARRAY[NEW.client_id];
  END IF;

  FOREACH v_sid IN ARRAY v_ids LOOP
    IF v_sid IS NULL THEN CONTINUE; END IF;

    SELECT count(*)::integer, coalesce(sum(stats.surface_ha), 0)
      INTO v_count, v_total
      FROM (
        SELECT p.id, coalesce(p.superficie_ha, 0)::numeric AS surface_ha
          FROM public.plantations p
         WHERE p.client_id = v_sid
           AND NOT EXISTS (
             SELECT 1
               FROM public.beneficiaire_attributions ba
              WHERE ba.client_id = v_sid
                AND ba.plantation_id = p.id
                AND ba.statut = 'active'
           )
        UNION ALL
        SELECT coalesce(ba.plantation_id, ba.id) AS id,
               max(coalesce(ba.surface_attribuee_ha, 0))::numeric AS surface_ha
          FROM public.beneficiaire_attributions ba
         WHERE ba.client_id = v_sid
           AND ba.statut = 'active'
         GROUP BY coalesce(ba.plantation_id, ba.id)
      ) stats;

    UPDATE public.clients
       SET nombre_plantations = v_count,
           surface_plantee_ha = v_total
     WHERE id = v_sid;
  END LOOP;

  RETURN coalesce(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_client_contract_terms_to_acquisition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  UPDATE public.acquisitions AS acq
  SET superficie_ha = CASE
        WHEN v_acquisition.lot_id IS NULL AND v_acquisition.parcelle_id IS NULL THEN v_surface
        ELSE acq.superficie_ha
      END,
      montant_pi_total=v_pi,
      montant_total_contrat=v_total,
      mensualite_montant=v_monthly,
      offre_snapshot=v_snapshot,
      metadata=v_metadata,
      updated_at=now()
  WHERE acq.id=v_acquisition.id;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  v_sid uuid;
  v_count integer;
  v_total numeric;
BEGIN
  FOR v_sid IN
    SELECT DISTINCT p.client_id FROM public.plantations p WHERE p.client_id IS NOT NULL
  LOOP
    SELECT count(*)::integer, coalesce(sum(stats.surface_ha),0)
      INTO v_count, v_total
      FROM (
        SELECT p.id, coalesce(p.superficie_ha,0)::numeric AS surface_ha
        FROM public.plantations p
        WHERE p.client_id=v_sid
          AND NOT EXISTS (
            SELECT 1 FROM public.beneficiaire_attributions ba
            WHERE ba.client_id=v_sid AND ba.plantation_id=p.id AND ba.statut='active'
          )
        UNION ALL
        SELECT coalesce(ba.plantation_id,ba.id) AS id,
               max(coalesce(ba.surface_attribuee_ha,0))::numeric AS surface_ha
        FROM public.beneficiaire_attributions ba
        WHERE ba.client_id=v_sid AND ba.statut='active'
        GROUP BY coalesce(ba.plantation_id,ba.id)
      ) stats;

    UPDATE public.clients
    SET nombre_plantations=v_count, surface_plantee_ha=v_total
    WHERE id=v_sid;
  END LOOP;
END;
$$;

UPDATE public.clients
SET total_hectares=10,
    superficie_ha=10,
    paiement_initial_montant=907000,
    montant_pi_total=907000,
    montant_total_contrat=24679000,
    mensualite_montant=566000,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'surface_contractuelle_ha',10,'surface_fonciere_allouee_ha',1,
      'surface_fonciere_restante_ha',9,'surface_disponible_parcelle_ha',2,
      'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
      'pi_total_contractuel',907000,'pi_paye_a_la_conversion',90700,'solde_pi_restant',816300
    ),
    updated_at=now()
WHERE id_unique='AC_C000008' AND nom_complet='PAULIN LOUKOU';

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.clients c
  WHERE c.id_unique='AC_C000008' AND c.total_hectares=10
    AND c.superficie_ha=10 AND c.surface_plantee_ha=1;
  IF v_count<>1 THEN RAISE EXCEPTION 'Surfaces contractuelle et plantee de Paulin non separees.'; END IF;

  SELECT count(*) INTO v_count
  FROM public.acquisitions a JOIN public.clients c ON c.id=a.client_id
  WHERE c.id_unique='AC_C000008' AND a.superficie_ha=1
    AND a.montant_pi_total=907000 AND a.montant_total_contrat=24679000
    AND a.mensualite_montant=566000
    AND (a.metadata->>'surface_contractuelle_ha')::numeric=10
    AND (a.metadata->>'surface_fonciere_allouee_ha')::numeric=1
    AND (a.metadata->>'surface_fonciere_restante_ha')::numeric=9;
  IF v_count<>1 THEN RAISE EXCEPTION 'Acquisition Paulin non synchronisee avec son contrat de 10 ha.'; END IF;
END;
$$;
