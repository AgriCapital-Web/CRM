ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS validation_comptable_par uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validation_comptable_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejet_motif text;

CREATE OR REPLACE FUNCTION public.paiement_alert_roles(_roles text[], _type text, _title text, _msg text, _data jsonb, _dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id, type, title, message, data, read, dedupe_key)
  SELECT DISTINCT ur.user_id, _type, _title, _msg, _data, false, _dedupe || ':' || ur.user_id
  FROM public.user_roles ur WHERE ur.role::text = ANY(_roles)
    AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.dedupe_key = _dedupe || ':' || ur.user_id);
END $$;
REVOKE ALL ON FUNCTION public.paiement_alert_roles(text[],text,text,text,jsonb,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_paiement_alerte_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nom text;
BEGIN
  IF NEW.statut = 'en_attente' AND (TG_OP = 'INSERT' OR OLD.statut IS DISTINCT FROM 'en_attente') THEN
    SELECT nom_complet INTO v_nom FROM public.clients WHERE id = NEW.client_id;
    PERFORM public.paiement_alert_roles(ARRAY['comptable'], 'paiement_a_valider', 'Paiement à valider',
      coalesce(v_nom,'Client') || ' : ' || to_char(coalesce(NULLIF(NEW.montant_paye,0), NEW.montant),'FM999G999G999') || ' F',
      jsonb_build_object('paiement_id', NEW.id, 'client_id', NEW.client_id), 'paiement_valider:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paiement_alerte_validation ON public.paiements;
CREATE TRIGGER trg_paiement_alerte_validation AFTER INSERT OR UPDATE OF statut ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.trg_paiement_alerte_validation();

CREATE OR REPLACE FUNCTION public.paiement_decider(_paiement_id uuid, _decision text, _motif text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE p public.paiements%ROWTYPE; uid uuid := auth.uid();
  is_pdg boolean := private.has_role(uid,'pdg');
  is_cpt boolean := private.has_role(uid,'comptable');
  v_nom text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Vous devez être connecté.' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.paiements WHERE id = _paiement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable.'; END IF;
  IF p.statut <> 'en_attente' THEN RAISE EXCEPTION 'Ce paiement a déjà été traité.'; END IF;
  SELECT nom_complet INTO v_nom FROM public.clients WHERE id = p.client_id;

  IF _decision = 'rejeter' THEN
    IF NOT (is_pdg OR is_cpt) THEN RAISE EXCEPTION 'Seuls le comptable et le PDG peuvent refuser un paiement.' USING ERRCODE='42501'; END IF;
    IF coalesce(btrim(_motif),'') = '' THEN RAISE EXCEPTION 'Indiquez le motif du refus.'; END IF;
    UPDATE public.paiements SET statut='rejete', rejet_motif=btrim(_motif), cancelled_at=now() WHERE id=p.id;
    IF p.created_by IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,type,title,message,data,read,dedupe_key)
      VALUES (p.created_by,'paiement_rejete','Paiement refusé', coalesce(v_nom,'Client')||' : '||btrim(_motif),
        jsonb_build_object('paiement_id',p.id),false,'paiement_rejete:'||p.id) ON CONFLICT DO NOTHING;
    END IF;
    RETURN 'rejete';
  END IF;

  IF _decision <> 'valider' THEN RAISE EXCEPTION 'Décision inconnue.'; END IF;
  IF p.validation_comptable_at IS NULL THEN
    IF NOT is_cpt THEN RAISE EXCEPTION 'Ce paiement doit d''abord être validé par le comptable.' USING ERRCODE='42501'; END IF;
    UPDATE public.paiements SET validation_comptable_par=uid, validation_comptable_at=now() WHERE id=p.id;
    PERFORM public.paiement_alert_roles(ARRAY['pdg'],'paiement_a_valider','Paiement à valider (PDG)',
      coalesce(v_nom,'Client')||' : validé par le comptable', jsonb_build_object('paiement_id',p.id),'paiement_valider_pdg:'||p.id);
    RETURN 'valide_comptable';
  END IF;
  IF NOT is_pdg THEN RAISE EXCEPTION 'La validation finale revient au PDG.' USING ERRCODE='42501'; END IF;
  UPDATE public.paiements SET statut='valide', valide_par=uid, date_validation=now(),
    date_paiement=coalesce(date_paiement, now()) WHERE id=p.id;
  RETURN 'valide';
END $$;
REVOKE ALL ON FUNCTION public.paiement_decider(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.paiement_decider(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.paiements_emettre_rappels()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT p.id, p.client_id, p.date_echeance, p.montant, c.nom_complet
    FROM public.paiements p LEFT JOIN public.clients c ON c.id=p.client_id
    WHERE p.statut='en_attente' AND p.date_echeance IS NOT NULL AND p.date_echeance <= current_date + 3 LIMIT 5000
  LOOP
    IF r.date_echeance >= current_date THEN
      PERFORM public.notification_emit_event('paiement_echeance', jsonb_build_object('paiement_id',r.id,'client_id',r.client_id,'montant',r.montant,'date_echeance',r.date_echeance,'dedupe_key','paiement_echeance:'||r.id||':'||r.date_echeance));
    ELSE
      PERFORM public.notification_emit_event('paiement_retard', jsonb_build_object('paiement_id',r.id,'client_id',r.client_id,'montant',r.montant,'date_echeance',r.date_echeance,'jours_retard',current_date-r.date_echeance,'dedupe_key','paiement_retard:'||r.id||':'||current_date));
      PERFORM public.paiement_alert_roles(ARRAY['comptable','pdg'],'paiement_retard','Paiement en retard',
        coalesce(r.nom_complet,'Client')||' : '||(current_date-r.date_echeance)||' jour(s) de retard',
        jsonb_build_object('paiement_id',r.id,'client_id',r.client_id),'paiement_retard:'||r.id||':'||current_date);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.paiements_emettre_rappels() FROM public, anon, authenticated;