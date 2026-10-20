-- Rétablir l'état historique des clients déjà présents avant le workflow de validation.
-- La migration initiale leur avait attribué par défaut « a_valider » ; aucune date
-- ni identité de validateur n'est fabriquée ici.
UPDATE public.clients
SET validation_statut = 'valide',
    validation_commentaire = NULL,
    validation_demande_at = NULL
WHERE created_at < TIMESTAMPTZ '2026-10-20 22:00:00+00'
  AND validation_statut = 'a_valider'
  AND validation_at IS NULL
  AND validation_par IS NULL;

-- Retirer les alertes fausses générées en masse par le backfill du workflow.
DELETE FROM public.notifications n
WHERE n.type = 'client_validation'
  AND n.created_at >= TIMESTAMPTZ '2026-10-20 21:49:00+00'
  AND n.created_at < TIMESTAMPTZ '2026-10-20 21:50:00+00'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = n.data->>'client_id'
      AND c.created_at < TIMESTAMPTZ '2026-10-20 22:00:00+00'
      AND c.validation_statut = 'valide'
  );
