CREATE OR REPLACE FUNCTION public.paiements_emettre_rappels()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; d integer;
BEGIN
  FOR r IN SELECT p.id, p.client_id, p.date_echeance, p.montant, c.nom_complet
    FROM public.paiements p LEFT JOIN public.clients c ON c.id=p.client_id
    WHERE p.statut='en_attente' AND p.date_echeance IS NOT NULL
      AND (p.date_echeance = current_date + 3 OR p.date_echeance = current_date - 1 OR p.date_echeance = current_date - 15)
    LIMIT 5000
  LOOP
    d := current_date - r.date_echeance;
    IF d = -3 THEN
      PERFORM public.notification_emit_event('paiement_echeance', jsonb_build_object('paiement_id',r.id,'client_id',r.client_id,'montant',r.montant,'date_echeance',r.date_echeance,'dedupe_key','paiement_echeance:'||r.id||':J-3'));
    ELSE
      PERFORM public.notification_emit_event('paiement_retard', jsonb_build_object('paiement_id',r.id,'client_id',r.client_id,'montant',r.montant,'date_echeance',r.date_echeance,'jours_retard',d,'dedupe_key','paiement_retard:'||r.id||':J+'||d));
      PERFORM public.paiement_alert_roles(ARRAY['comptable','pdg'],'paiement_retard','Paiement en retard',
        coalesce(r.nom_complet,'Client')||' : '||d||' jour(s) de retard',
        jsonb_build_object('paiement_id',r.id,'client_id',r.client_id),'paiement_retard:'||r.id||':J+'||d);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.paiements_emettre_rappels() FROM public, anon, authenticated;