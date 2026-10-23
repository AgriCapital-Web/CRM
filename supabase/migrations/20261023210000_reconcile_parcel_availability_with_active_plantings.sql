-- Reconcile parcel availability with validated active plantation records.
WITH planted AS (
  SELECT p.parcelle_id,
         LEAST(GREATEST(0::numeric, COALESCE(pa.surface_totale_ha, 0)),
           SUM(GREATEST(0::numeric, COALESCE(p.surface_reellement_plantee, p.superficie_activee, p.superficie_ha, 0)))) AS planted_ha,
         GREATEST(0::numeric, COALESCE(pa.surface_totale_ha, 0)) AS total_ha
  FROM public.plantations p
  JOIN public.parcelles pa ON pa.id = p.parcelle_id
  JOIN public.clients c ON c.id = p.client_id
  WHERE LOWER(COALESCE(p.statut_global, '')) IN ('actif','active','plantee','plantée','en_cours')
    AND LOWER(COALESCE(c.validation_statut, c.statut, '')) IN ('valide','validee','validé','validée','actif','active')
  GROUP BY p.parcelle_id, pa.surface_totale_ha
)
UPDATE public.parcelles pa
SET surface_disponible_ha = GREATEST(0::numeric, planted.total_ha - planted.planted_ha),
    statut = CASE WHEN planted.planted_ha >= planted.total_ha AND planted.total_ha > 0 THEN 'saturee'
                  WHEN planted.planted_ha > 0 THEN 'partiellement_attribuee'
                  ELSE pa.statut END,
    updated_at = NOW()
FROM planted
WHERE pa.id = planted.parcelle_id
  AND (pa.surface_disponible_ha IS DISTINCT FROM GREATEST(0::numeric, planted.total_ha - planted.planted_ha)
       OR (planted.planted_ha >= planted.total_ha AND planted.total_ha > 0 AND pa.statut <> 'saturee'));
