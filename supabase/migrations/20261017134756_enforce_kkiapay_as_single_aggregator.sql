BEGIN;
ALTER TABLE public.paiements ADD COLUMN aggregateur_paiement text;
ALTER TABLE public.paiements ADD CONSTRAINT paiements_aggregateur_paiement_only_kkiapay
  CHECK (aggregateur_paiement IS NULL OR upper(btrim(aggregateur_paiement)) = 'KKIAPAY');
CREATE INDEX idx_paiements_aggregateur_paiement ON public.paiements(aggregateur_paiement);
UPDATE public.paiements
SET aggregateur_paiement = 'KKiaPay'
WHERE kkiapay_transaction_id IS NOT NULL OR lower(coalesce(metadata->>'payment_provider','')) = 'kkiapay';
UPDATE public.paiements
SET aggregateur_paiement = 'KKiaPay',
    mode_paiement = NULL,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('legacy_payment_channel_unknown', true)
WHERE lower(btrim(coalesce(mode_paiement,''))) = 'kkiapay';
CREATE OR REPLACE FUNCTION public.finalize_portal_payment(_paiement_id uuid, _transaction_id text DEFAULT NULL::text, _provider_amount numeric DEFAULT NULL::numeric, _metadata jsonb DEFAULT '{}'::jsonb, _validated_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.paiements%ROWTYPE;
  v_plantation public.plantations%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_paid numeric;
  v_was_valid boolean;
  v_days integer := 0;
  v_new_days integer;
  v_activation_date date := _validated_at::date;
  v_expected_provider_amount numeric;
BEGIN
  SELECT * INTO v_payment FROM public.paiements WHERE id = _paiement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = v_payment.client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client du paiement introuvable'; END IF;

  v_expected_provider_amount :=
    COALESCE(NULLIF(v_payment.metadata->>'kkiapay_widget_amount', '')::numeric, v_payment.montant);
  IF _provider_amount IS NOT NULL
     AND ABS(_provider_amount - COALESCE(v_expected_provider_amount, 0)) > 1 THEN
    RAISE EXCEPTION 'Montant fournisseur incohérent';
  END IF;

  IF _transaction_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.paiements WHERE kkiapay_transaction_id = _transaction_id AND id <> v_payment.id) THEN
    RAISE EXCEPTION 'Transaction déjà rattachée à un autre paiement';
  END IF;

  v_was_valid := v_payment.statut = 'valide';
  v_paid := COALESCE(v_payment.montant_paye, v_payment.montant, 0);

  IF NOT v_was_valid THEN
    UPDATE public.paiements
    SET statut = 'valide',
        montant_paye = v_paid,
        date_paiement = COALESCE(date_paiement, _validated_at),
        date_validation = COALESCE(date_validation, _validated_at),
        kkiapay_transaction_id = COALESCE(_transaction_id, kkiapay_transaction_id),
        aggregateur_paiement = CASE WHEN _transaction_id IS NOT NULL THEN 'KKiaPay' ELSE aggregateur_paiement END,
        mode_paiement = COALESCE(NULLIF(_metadata->>'kkiapay_method', ''), NULLIF(_metadata->>'method', ''), mode_paiement),
        metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(_metadata, '{}'::jsonb)
          || jsonb_build_object('provider_amount', _provider_amount, 'client_amount', v_payment.montant, 'validated_at', _validated_at),
        updated_at = NOW()
    WHERE id = v_payment.id;
  ELSE
    UPDATE public.paiements
    SET kkiapay_transaction_id = COALESCE(_transaction_id, kkiapay_transaction_id),
        aggregateur_paiement = CASE WHEN _transaction_id IS NOT NULL THEN 'KKiaPay' ELSE aggregateur_paiement END,
        mode_paiement = COALESCE(NULLIF(_metadata->>'kkiapay_method', ''), NULLIF(_metadata->>'method', ''), mode_paiement),
        metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(_metadata, '{}'::jsonb)
          || jsonb_build_object('provider_amount', _provider_amount, 'client_amount', v_payment.montant),
        updated_at = NOW()
    WHERE id = v_payment.id;
  END IF;

  -- Paiement initial du contrat principal : activer sa plantation et son dossier.
  IF COALESCE(v_payment.est_paiement_initial, false)
     AND v_payment.acquisition_id IS NULL
     AND v_payment.plantation_id IS NOT NULL THEN
    SELECT * INTO v_plantation
    FROM public.plantations
    WHERE id = v_payment.plantation_id AND client_id = v_payment.client_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plantation du paiement introuvable'; END IF;

    UPDATE public.plantations
    SET superficie_activee = superficie_ha,
        montant_pi_paye = GREATEST(COALESCE(montant_pi_paye, 0), v_paid),
        date_activation = COALESCE(date_activation, v_activation_date),
        statut = 'actif',
        statut_global = 'actif',
        updated_at = NOW()
    WHERE id = v_plantation.id;

    IF v_plantation.parcelle_id IS NOT NULL THEN
      UPDATE public.parcelles
      SET plantation_partagee_activee = true,
          plantation_date_activation = COALESCE(plantation_date_activation, v_activation_date),
          statut = CASE WHEN COALESCE(statut, '') IN ('', 'en_attente', 'reservee', 'bloquee') THEN 'active' ELSE statut END,
          updated_at = NOW()
      WHERE id = v_plantation.parcelle_id;
    END IF;

    UPDATE public.clients
    SET compte_actif = true,
        statut = CASE WHEN COALESCE(statut, '') IN ('', 'en_attente_pi', 'en_attente') THEN 'actif' ELSE statut END,
        statut_global = 'actif',
        paiement_initial_paye_at = COALESCE(paiement_initial_paye_at, _validated_at),
        pi_paye_at = COALESCE(pi_paye_at, _validated_at),
        updated_at = NOW()
    WHERE id = v_payment.client_id;

  -- Mensualité du contrat principal uniquement : créditer ses jours.
  ELSIF NOT v_was_valid
        AND v_payment.acquisition_id IS NULL
        AND v_payment.plantation_id IS NOT NULL
        AND v_paid > 0 THEN
    v_days := public.portal_days_for_amount(v_payment.client_id, v_payment.plantation_id, v_paid);
    v_new_days := LEAST(
      COALESCE(v_client.jours_contrat_total, 2147483647),
      COALESCE(v_client.jours_payes, 0) + v_days
    );
    UPDATE public.clients
    SET jours_payes = v_new_days,
        taux_journalier_ha = public.portal_client_daily_rate(v_payment.client_id, _validated_at::date),
        jours_retard = CASE
          WHEN contrat_debut_at IS NOT NULL THEN GREATEST(0, CURRENT_DATE - (contrat_debut_at + v_new_days)::date)
          ELSE jours_retard
        END,
        updated_at = NOW()
    WHERE id = v_payment.client_id;
  END IF;

  IF NOT v_was_valid THEN
    INSERT INTO public.historique_activites(table_name, record_id, action, details, nouvelles_valeurs)
    VALUES (
      'paiements',
      v_payment.id::text,
      CASE WHEN COALESCE(v_payment.est_paiement_initial, false) THEN 'PORTAL_PI_VALIDATED' ELSE 'PORTAL_MONTHLY_PAYMENT_VALIDATED' END,
      CASE
        WHEN COALESCE(v_payment.est_paiement_initial, false)
          THEN 'Paiement initial validé; activation propagée au contrat principal ou à la acquisition concernée.'
        WHEN v_payment.acquisition_id IS NOT NULL
          THEN 'Paiement mensuel de acquisition validé et rattaché à son échéancier; aucun jour du contrat principal crédité.'
        ELSE 'Paiement mensuel validé et couverture réelle créditée au contrat principal.'
      END,
      jsonb_build_object(
        'reference', v_payment.reference,
        'transaction_id', _transaction_id,
        'montant_paye', v_paid,
        'provider_amount', _provider_amount,
        'client_amount', v_payment.montant,
        'jours_credites', v_days,
        'jours_payes_apres', CASE
          WHEN COALESCE(v_payment.est_paiement_initial, false) THEN v_client.jours_payes
          ELSE COALESCE(v_new_days, v_client.jours_payes)
        END,
        'validated_at', _validated_at,
        'client_id', v_payment.client_id,
        'acquisition_id', v_payment.acquisition_id,
        'plantation_id', v_payment.plantation_id,
        'parcelle_id', CASE
          WHEN COALESCE(v_payment.est_paiement_initial, false)
               AND v_payment.acquisition_id IS NULL
               AND v_payment.plantation_id IS NOT NULL
            THEN v_plantation.parcelle_id
          ELSE NULL
        END
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_validated', v_was_valid,
    'paiement_id', v_payment.id,
    'client_id', v_payment.client_id,
    'acquisition_id', v_payment.acquisition_id,
    'plantation_id', v_payment.plantation_id,
    'parcelle_id', CASE
      WHEN COALESCE(v_payment.est_paiement_initial, false)
           AND v_payment.acquisition_id IS NULL
           AND v_payment.plantation_id IS NOT NULL
        THEN v_plantation.parcelle_id
      ELSE NULL
    END,
    'montant_paye', v_paid,
    'provider_amount', _provider_amount,
    'jours_credites', v_days,
    'jours_payes', CASE
      WHEN COALESCE(v_payment.est_paiement_initial, false) THEN v_client.jours_payes
      ELSE COALESCE(v_new_days, v_client.jours_payes)
    END,
    'activated', CASE
      WHEN NOT COALESCE(v_payment.est_paiement_initial, false) THEN false
      WHEN v_payment.acquisition_id IS NULL THEN true
      ELSE EXISTS (SELECT 1 FROM public.acquisitions s WHERE s.id = v_payment.acquisition_id AND s.statut = 'active')
    END,
    'plantation_activee', CASE
      WHEN NOT COALESCE(v_payment.est_paiement_initial, false) THEN false
      WHEN v_payment.acquisition_id IS NULL THEN v_payment.plantation_id IS NOT NULL
      ELSE EXISTS (SELECT 1 FROM public.plantations p WHERE p.acquisition_id = v_payment.acquisition_id AND p.statut_global = 'actif')
    END,
    'foncier_active', CASE
      WHEN COALESCE(v_payment.est_paiement_initial, false)
           AND v_payment.acquisition_id IS NULL
           AND v_payment.plantation_id IS NOT NULL
        THEN COALESCE(v_plantation.parcelle_id IS NOT NULL, false)
      WHEN COALESCE(v_payment.est_paiement_initial, false)
           AND v_payment.acquisition_id IS NOT NULL
        THEN EXISTS (
          SELECT 1 FROM public.plantations p
          WHERE p.acquisition_id = v_payment.acquisition_id
            AND p.parcelle_id IS NOT NULL
            AND p.statut_global = 'actif'
        )
      ELSE false
    END
  );
END;
$function$
;
COMMIT;
