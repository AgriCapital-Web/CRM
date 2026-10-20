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
