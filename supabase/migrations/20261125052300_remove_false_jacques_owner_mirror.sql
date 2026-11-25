-- Nettoie le faux miroir client du dossier propriétaire Jacques KOUAME.
-- La parcelle de propriété directe et sa fiche de plantation sont conservées,
-- mais ne sont plus rattachées à un propriétaire foncier ni à un client CRM.
BEGIN;

UPDATE public.parcelles
SET proprietaire_id=NULL,
    nom='Parcelle de propriété directe — Zakaria',
    notes='Parcelle en propriété directe, hors partenariat foncier. Références cadastrales et rattachement éventuel à un dossier client à confirmer.',
    updated_at=now()
WHERE id='f9f195ef-b02e-44ab-82a9-b2af20ec52c4'
  AND proprietaire_id='1cf798ac-5940-4961-9f3e-b75145945494'
  AND mode_surface='propriete_client';

UPDATE public.plantations
SET nom='Plantation de propriété directe — Zakaria',
    nom_plantation='Plantation de propriété directe — Zakaria',
    notes='Parcelle de propriété directe, hors partenariat foncier. Mise en terre et date effective à confirmer par l’équipe technique.',
    notes_internes='Bénéficiaire non facturable ; propriété directe ; localisation à Zakaria. Aucun client ni propriétaire foncier associé dans le CRM.',
    updated_at=now()
WHERE parcelle_id='f9f195ef-b02e-44ab-82a9-b2af20ec52c4'
  AND client_id IS NULL;

DELETE FROM public.clients
WHERE id='4d75a6c8-14e8-40d5-9ca1-06af5a7e0ba2'
  AND id_unique='OWNER-AC-P000003'
  AND proprietaire_id='1cf798ac-5940-4961-9f3e-b75145945494';

DELETE FROM public.proprietaires_terres
WHERE id='1cf798ac-5940-4961-9f3e-b75145945494'
  AND id_unique='AC-P000003'
  AND nom_complet='Jacques Kouakou KOUAME';

COMMIT;
