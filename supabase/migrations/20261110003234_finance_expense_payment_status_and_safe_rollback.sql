ALTER TABLE public.finance_expense_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'valide';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.finance_expense_payments'::regclass
      AND conname = 'finance_expense_payments_status_check'
  ) THEN
    ALTER TABLE public.finance_expense_payments
      ADD CONSTRAINT finance_expense_payments_status_check
      CHECK (status IN ('valide', 'annule'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS finance_expense_payments_expense_status_paid_at_idx
  ON public.finance_expense_payments (expense_id, status, paid_at DESC);
