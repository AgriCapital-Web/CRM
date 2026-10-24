-- Fix portal finance aggregation: the loop consumes duration, offer and area fields.
-- Selecting only a.id left the PL/pgSQL record without those fields and made the
-- client financial sheet fail whenever an acquisition existed.
DO $migration$
DECLARE
  v_definition text;
  v_old text := 'select a.id
        from public.acquisitions a';
  v_new text := 'select a.id, a.duree_paiement_mois, a.offre_nom, a.formule_nom, a.superficie_ha, a.mensualite_montant
        from public.acquisitions a';
BEGIN
  SELECT pg_get_functiondef('public.portal_current_payment_state(uuid)'::regprocedure)
    INTO v_definition;

  IF position(v_new IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected acquisition query not found in portal_current_payment_state(uuid); aborting safely.';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;
