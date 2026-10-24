-- Ne pas exclure les lots déjà inscrits dans acquisition_lots lors du parcours
-- legacy sans acquisition_id : cette table est synchronisée automatiquement à partir
-- du lot attribué et ne doit pas faire disparaître le lot de la sélection.
DO $migration$
DECLARE
  v_def text;
  v_marker text;
BEGIN
  v_def := pg_get_functiondef('public.sync_palminvest_lot_activation()'::regprocedure);
  v_marker := $marker$           AND NOT EXISTS (SELECT 1 FROM public.acquisition_lots al WHERE al.lot_id = lh.id)$marker$;
  IF strpos(v_def, v_marker) = 0 THEN
    RAISE EXCEPTION 'Le filtre legacy d’acquisition_lots est introuvable dans sync_palminvest_lot_activation';
  END IF;
  v_def := replace(v_def, v_marker, '');
  EXECUTE v_def;
END;
$migration$;
