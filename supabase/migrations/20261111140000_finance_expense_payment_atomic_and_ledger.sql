ALTER TABLE public.finance_expense_payments
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS finance_expense_payments_idempotency_key_uidx
  ON public.finance_expense_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finance_register_expense_payment(
  p_expense_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_proof_path text,
  p_proof_name text,
  p_fee_applied boolean,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_expense public.finance_expenses%ROWTYPE;
  v_existing public.finance_expense_payments%ROWTYPE;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_remaining numeric(14,2);
  v_next_paid numeric(14,2);
  v_fee_applied boolean;
  v_fee_amount numeric(14,2);
  v_ledger_amount numeric(14,2);
  v_status text;
  v_paid_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Permission insuffisante pour enregistrer un paiement.'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identifiant de demande obligatoire.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Le montant payé doit être positif.'; END IF;
  IF p_payment_date IS NULL THEN RAISE EXCEPTION 'La date de paiement est obligatoire.'; END IF;
  IF p_payment_method NOT IN ('especes', 'mobile_money', 'virement') THEN RAISE EXCEPTION 'Mode de paiement non pris en charge.'; END IF;

  v_paid_at := (p_payment_date::timestamp + time '12:00') AT TIME ZONE 'Africa/Abidjan';
  SELECT * INTO v_expense FROM public.finance_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dépense introuvable.'; END IF;

  SELECT * INTO v_existing FROM public.finance_expense_payments WHERE idempotency_key = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'expense_id', v_existing.expense_id, 'payment_id', v_existing.id,
      'transaction_id', v_existing.transaction_id, 'amount', v_existing.amount,
      'status', (SELECT e.status FROM public.finance_expenses e WHERE e.id = v_existing.expense_id),
      'paid_amount', (SELECT e.paid_amount FROM public.finance_expenses e WHERE e.id = v_existing.expense_id),
      'remaining_amount', greatest(0, (SELECT e.total_amount - e.paid_amount FROM public.finance_expenses e WHERE e.id = v_existing.expense_id)),
      'idempotent_replay', true
    );
  END IF;
  IF v_expense.status = 'cancelled' THEN RAISE EXCEPTION 'Une dépense annulée ne peut pas être payée.'; END IF;

  v_remaining := greatest(0, v_expense.total_amount - v_expense.paid_amount);
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'Le paiement dépasse le solde restant (%).', v_remaining; END IF;

  v_fee_applied := coalesce(p_fee_applied, false) AND p_payment_method <> 'especes';
  v_fee_amount := CASE WHEN v_fee_applied THEN round(p_amount * 0.01, 2) ELSE 0 END;
  v_ledger_amount := p_amount + v_fee_amount;
  v_next_paid := v_expense.paid_amount + p_amount;
  v_status := CASE WHEN v_next_paid >= v_expense.total_amount THEN 'paid' ELSE 'partial' END;

  INSERT INTO public.finance_transactions (
    direction, category, label, amount, gross_amount, fee_rate, fee_amount, fee_applied,
    transaction_date, payment_method, reference, source_type, source_id, status,
    profile_id, client_id, plantation_id, notes, proof_path, proof_name, created_by
  ) VALUES (
    'sortie', v_expense.expense_category,
    v_expense.expense_category || CASE WHEN nullif(btrim(v_expense.description), '') IS NULL THEN '' ELSE ' — ' || btrim(v_expense.description) END,
    v_ledger_amount, p_amount, CASE WHEN v_fee_applied THEN 1 ELSE 0 END, v_fee_amount, v_fee_applied,
    v_paid_at, p_payment_method, nullif(btrim(p_reference), ''),
    'finance_expense', v_expense.id, 'valide',
    v_expense.profile_id, v_expense.client_id, v_expense.plantation_id,
    coalesce(nullif(btrim(v_expense.description), ''), 'Bénéficiaire : ' || coalesce(v_expense.beneficiary_name, v_expense.supplier_name, '—')),
    p_proof_path, p_proof_name, auth.uid()
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.finance_expense_payments (
    expense_id, transaction_id, amount, gross_amount, status, fee_rate, fee_amount, fee_applied,
    paid_at, payment_method, proof_path, proof_name, created_by, idempotency_key
  ) VALUES (
    v_expense.id, v_transaction_id, p_amount, p_amount, 'valide',
    CASE WHEN v_fee_applied THEN 1 ELSE 0 END, v_fee_amount, v_fee_applied,
    v_paid_at, p_payment_method, p_proof_path, p_proof_name, auth.uid(), p_request_id
  ) RETURNING id INTO v_payment_id;

  UPDATE public.finance_expenses
  SET paid_amount = v_next_paid, status = v_status, transaction_id = v_transaction_id,
      payment_method = p_payment_method
  WHERE id = v_expense.id;

  RETURN jsonb_build_object(
    'expense_id', v_expense.id, 'payment_id', v_payment_id, 'transaction_id', v_transaction_id,
    'amount', p_amount, 'ledger_amount', v_ledger_amount, 'status', v_status,
    'paid_amount', v_next_paid, 'remaining_amount', greatest(0, v_expense.total_amount - v_next_paid),
    'idempotent_replay', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_register_expense_payment(uuid, numeric, date, text, text, text, text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_register_expense_payment(uuid, numeric, date, text, text, text, text, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_register_expense_payment(uuid, numeric, date, text, text, text, text, boolean, uuid) TO authenticated;
