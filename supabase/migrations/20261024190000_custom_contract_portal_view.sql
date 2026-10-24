-- Keep custom client contracts visible in the portal without attaching them to a catalog offer.
-- Prefer the client's custom formula label and custom duration when no catalog offer is linked.
DO $migration$
DECLARE
  view_definition text;
BEGIN
  view_definition := pg_get_viewdef('public.v_client_synthese'::regclass, true);
  view_definition := replace(
    view_definition,
    'o.nom AS offre_nom',
    $$CASE WHEN c.offre_id IS NULL THEN COALESCE(NULLIF(c.formule_nom, ''), 'Offre personnalisée') ELSE o.nom END AS offre_nom$$
  );
  view_definition := replace(
    view_definition,
    'COALESCE(o.duree_paiement_mois, 34) AS duree_paiement_mois',
    'COALESCE(c.duree_paiement_mois, o.duree_paiement_mois, 34) AS duree_paiement_mois'
  );
  EXECUTE 'CREATE OR REPLACE VIEW public.v_client_synthese AS ' || view_definition;
END
$migration$;
