ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_applied boolean NOT NULL DEFAULT false;

UPDATE public.finance_transactions
SET gross_amount = amount
WHERE gross_amount = 0 AND amount <> 0 AND fee_applied = false;

ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS reference text;

ALTER TABLE public.finance_expense_payments
  ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_applied boolean NOT NULL DEFAULT false;

UPDATE public.finance_expense_payments
SET gross_amount = amount
WHERE gross_amount = 0 AND amount <> 0 AND fee_applied = false;

CREATE OR REPLACE FUNCTION private.finance_is_pdg()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND lower(trim(ur.role)) = 'pdg'
  );
$function$;

REVOKE ALL ON FUNCTION private.finance_is_pdg() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.finance_is_pdg() TO authenticated;

DROP POLICY IF EXISTS finance_transactions_manage ON public.finance_transactions;
DROP POLICY IF EXISTS finance_transactions_insert_manage ON public.finance_transactions;
DROP POLICY IF EXISTS finance_transactions_update_manage ON public.finance_transactions;
DROP POLICY IF EXISTS finance_transactions_delete_pdg ON public.finance_transactions;
CREATE POLICY finance_transactions_insert_manage ON public.finance_transactions
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_transactions_update_manage ON public.finance_transactions
  FOR UPDATE TO authenticated USING ((SELECT public.finance_can_manage()))
  WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_transactions_delete_pdg ON public.finance_transactions
  FOR DELETE TO authenticated USING ((SELECT private.finance_is_pdg()));

DROP POLICY IF EXISTS finance_expenses_manage ON public.finance_expenses;
DROP POLICY IF EXISTS finance_expenses_insert_manage ON public.finance_expenses;
DROP POLICY IF EXISTS finance_expenses_update_manage ON public.finance_expenses;
DROP POLICY IF EXISTS finance_expenses_delete_pdg ON public.finance_expenses;
CREATE POLICY finance_expenses_insert_manage ON public.finance_expenses
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_expenses_update_manage ON public.finance_expenses
  FOR UPDATE TO authenticated USING ((SELECT public.finance_can_manage()))
  WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_expenses_delete_pdg ON public.finance_expenses
  FOR DELETE TO authenticated USING ((SELECT private.finance_is_pdg()));

DROP POLICY IF EXISTS finance_associate_transactions_manage ON public.finance_associate_transactions;
DROP POLICY IF EXISTS finance_associate_transactions_insert_manage ON public.finance_associate_transactions;
DROP POLICY IF EXISTS finance_associate_transactions_update_manage ON public.finance_associate_transactions;
DROP POLICY IF EXISTS finance_associate_transactions_delete_pdg ON public.finance_associate_transactions;
CREATE POLICY finance_associate_transactions_insert_manage ON public.finance_associate_transactions
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_associate_transactions_update_manage ON public.finance_associate_transactions
  FOR UPDATE TO authenticated USING ((SELECT public.finance_can_manage()))
  WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_associate_transactions_delete_pdg ON public.finance_associate_transactions
  FOR DELETE TO authenticated USING ((SELECT private.finance_is_pdg()));

DROP POLICY IF EXISTS "Finance can manage expense payments" ON public.finance_expense_payments;
DROP POLICY IF EXISTS finance_expense_payments_insert_manage ON public.finance_expense_payments;
DROP POLICY IF EXISTS finance_expense_payments_update_manage ON public.finance_expense_payments;
DROP POLICY IF EXISTS finance_expense_payments_delete_pdg ON public.finance_expense_payments;
CREATE POLICY finance_expense_payments_insert_manage ON public.finance_expense_payments
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_expense_payments_update_manage ON public.finance_expense_payments
  FOR UPDATE TO authenticated USING ((SELECT public.finance_can_manage()))
  WITH CHECK ((SELECT public.finance_can_manage()));
CREATE POLICY finance_expense_payments_delete_pdg ON public.finance_expense_payments
  FOR DELETE TO authenticated USING ((SELECT private.finance_is_pdg()));
