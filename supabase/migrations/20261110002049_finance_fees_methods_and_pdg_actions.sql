-- Finance: record gross/net amounts and explicit 1% fee metadata.
-- Idempotent source for the already-applied 20261110002049 migration.
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_applied boolean NOT NULL DEFAULT false;

ALTER TABLE public.finance_expense_payments
  ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_applied boolean NOT NULL DEFAULT false;

-- Only the PDG may delete financial records. Update/insert permissions remain
-- governed by the existing finance_can_manage() policies.
DROP POLICY IF EXISTS finance_transactions_delete_pdg ON public.finance_transactions;
CREATE POLICY finance_transactions_delete_pdg
  ON public.finance_transactions FOR DELETE TO authenticated
  USING ((SELECT private.finance_is_pdg()));

DROP POLICY IF EXISTS finance_expenses_delete_pdg ON public.finance_expenses;
CREATE POLICY finance_expenses_delete_pdg
  ON public.finance_expenses FOR DELETE TO authenticated
  USING ((SELECT private.finance_is_pdg()));

DROP POLICY IF EXISTS finance_associate_transactions_delete_pdg ON public.finance_associate_transactions;
CREATE POLICY finance_associate_transactions_delete_pdg
  ON public.finance_associate_transactions FOR DELETE TO authenticated
  USING ((SELECT private.finance_is_pdg()));
