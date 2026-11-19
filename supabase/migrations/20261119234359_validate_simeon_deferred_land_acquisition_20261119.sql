
UPDATE public.clients c
SET metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
  'deferred_land_allocation',true,'commercial_validation_sans_foncier',true,
  'technical_intervention_pending',true,'foncier_a_attribuer_plus_tard',true,
  'surface_contractuelle_ha',10,'surface_fonciere_allouee_ha',0,'surface_fonciere_restante_ha',10,
  'pi_total_contractuel',907000,'pi_paye_a_la_conversion',303000,'solde_pi_restant',604000
),
updated_at=now()
WHERE c.id_unique='AC_C000012'
  AND c.nom_complet='KOMENAN SIMEON KOUAME';

UPDATE public.acquisitions a
SET validation_statut='valide',
    statut='active',
    validation_at=now(),
    validation_par=(
      SELECT p.user_id
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id=p.user_id
      WHERE p.username='inocent.koffi' AND p.actif=true AND ur.role='pdg'
      ORDER BY ur.is_primary DESC
      LIMIT 1
    ),
    validation_commentaire='Validation de la direction. PI partiel de 303 000 FCFA enregistre sur 907 000 FCFA; solde de 604 000 FCFA a suivre. Affectation fonciere et intervention technique differees.',
    metadata=coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object(
      'validation_commerciale_sans_foncier',true,'foncier_a_attribuer_plus_tard',true,
      'technical_intervention_pending',true,'surface_contractuelle_ha',10,
      'surface_fonciere_allouee_ha',0,'surface_fonciere_restante_ha',10,
      'pi_total_contractuel',907000,'pi_paye_a_la_conversion',303000,'solde_pi_restant',604000
    ),
    updated_at=now()
FROM public.clients c
WHERE a.client_id=c.id AND c.id_unique='AC_C000012'
  AND c.nom_complet='KOMENAN SIMEON KOUAME'
  AND a.validation_statut='a_valider' AND a.statut='souscrite';

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.acquisitions a JOIN public.clients c ON c.id=a.client_id
  WHERE c.id_unique='AC_C000012' AND a.validation_statut='valide'
    AND a.statut='active' AND a.validation_par IS NOT NULL
    AND (a.metadata->>'solde_pi_restant')::numeric=604000
    AND (a.metadata->>'surface_fonciere_restante_ha')::numeric=10;
  IF v_count<>1 THEN RAISE EXCEPTION 'Validation commerciale de Simeon non finalisee.'; END IF;
END;
$$;
