-- Autorise l'état intermédiaire utilisé par le parcours de demande de correction foncière.
ALTER TABLE public.proprietaires_terres
  DROP CONSTRAINT IF EXISTS proprietaires_terres_validation_statut_check;

ALTER TABLE public.proprietaires_terres
  ADD CONSTRAINT proprietaires_terres_validation_statut_check
  CHECK (validation_statut = ANY (ARRAY[
    'a_valider'::text,
    'modification_demandee'::text,
    'valide'::text,
    'refuse'::text
  ]));
