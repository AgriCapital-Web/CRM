DO $$
DECLARE
  v_prospect public.prospects%ROWTYPE;
  v_owner public.clients%ROWTYPE;
BEGIN
  SELECT * INTO v_prospect
  FROM public.prospects
  WHERE id = '13464613-ff8d-414a-977e-cb5382d8930e'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect LOUKOU Paulin introuvable; migration annulée.';
  END IF;

  IF v_prospect.telephone <> '+2250749730865' THEN
    RAISE EXCEPTION 'Le téléphone du prospect ne correspond pas au dossier attendu; migration annulée.';
  END IF;

  IF v_prospect.client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Le prospect est déjà lié à un client; réconciliation manuelle requise.';
  END IF;

  UPDATE public.prospects
     SET nom = 'LOUKOU',
         prenoms = 'PAULIN',
         nom_complet = 'PAULIN LOUKOU',
         updated_at = now()
   WHERE id = v_prospect.id;

  UPDATE public.leads
     SET nom = 'LOUKOU',
         prenoms = 'PAULIN',
         nom_complet = 'PAULIN LOUKOU',
         updated_at = now()
   WHERE id = v_prospect.lead_id
     AND telephone = '+2250749730865';

  SELECT * INTO v_owner
  FROM public.clients
  WHERE proprietaire_id = '42a884da-f5b8-43d3-954c-95ff09b7d3a9'
    AND type_client = 'proprietaire_foncier'
  LIMIT 1;

  IF v_owner.id IS NULL THEN
    RAISE EXCEPTION 'La fiche de représentation du propriétaire foncier Zongo Boukary est absente.';
  END IF;

  IF v_owner.offre_id IS NOT NULL OR v_owner.offre_code IS NOT NULL OR v_owner.formule_code IS NOT NULL THEN
    RAISE EXCEPTION 'La fiche du propriétaire contient des données commerciales inattendues; migration annulée.';
  END IF;
END $$;
