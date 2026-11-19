
UPDATE public.clients c
SET total_hectares=10,
    superficie_ha=10,
    paiement_initial_montant=907000,
    montant_pi_total=907000,
    montant_total_contrat=24679000,
    mensualite_montant=566000,
    offre_snapshot=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(c.offre_snapshot,'{}'::jsonb),
            '{contract,superficie_ha}',to_jsonb(10::numeric),true),
          '{contract,paiement_initial_montant}',to_jsonb(907000::numeric),true),
        '{contract,montant_total_contrat}',to_jsonb(24679000::numeric),true),
      '{contract,mensualite_montant}',to_jsonb(566000::numeric),true),
    metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
      'surface_contractuelle_ha',10,'surface_fonciere_allouee_ha',1,'surface_fonciere_restante_ha',9,
      'surface_disponible_parcelle_ha',2,'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
      'pi_total_contractuel',907000,'pi_paye_a_la_conversion',90700,'solde_pi_restant',816300,
      'land_allocation_note','1 ha deja attribue sur PAR-000008-L01. 9 ha restent a affecter. 2 ha disponibles sur la parcelle actuelle; aucune attribution supplementaire effectuee.')
WHERE c.id_unique='AC_C000008' AND c.nom_complet='PAULIN LOUKOU';

UPDATE public.acquisitions a
SET superficie_ha=10,montant_pi_total=907000,montant_total_contrat=24679000,mensualite_montant=566000,
    offre_snapshot=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(a.offre_snapshot,'{}'::jsonb),'{contract,superficie_ha}',to_jsonb(10::numeric),true),
          '{contract,montant_pi_total}',to_jsonb(907000::numeric),true),
        '{contract,montant_total_contrat}',to_jsonb(24679000::numeric),true),
      '{contract,mensualite_montant}',to_jsonb(566000::numeric),true),
    metadata=coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object(
      'surface_contractuelle_ha',10,'surface_fonciere_allouee_ha',1,'surface_fonciere_restante_ha',9,
      'surface_disponible_parcelle_ha',2,'foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true,
      'pi_total_contractuel',907000,'pi_paye_a_la_conversion',90700,'solde_pi_restant',816300,
      'land_allocation_note','1 ha deja attribue sur PAR-000008-L01. 9 ha restent a affecter. 2 ha disponibles sur la parcelle actuelle; aucune attribution supplementaire effectuee.')
FROM public.clients c
WHERE a.client_id=c.id AND c.id_unique='AC_C000008' AND c.nom_complet='PAULIN LOUKOU';

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.clients c JOIN public.acquisitions a ON a.client_id=c.id
  WHERE c.id_unique='AC_C000008'
    AND c.total_hectares=10 AND c.superficie_ha=10
    AND c.montant_pi_total=907000 AND c.montant_total_contrat=24679000
    AND c.mensualite_montant=566000
    AND a.superficie_ha=10 AND a.montant_pi_total=907000
    AND a.montant_total_contrat=24679000 AND a.mensualite_montant=566000
    AND (a.metadata->>'surface_fonciere_allouee_ha')::numeric=1
    AND (a.metadata->>'surface_fonciere_restante_ha')::numeric=9;
  IF v_count<>1 THEN RAISE EXCEPTION 'Mise a jour contractuelle de Paulin non confirmee.'; END IF;
END;
$$;
