ALTER TABLE public.finance_expense_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_expense_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_expense_payments TO authenticated;
GRANT ALL ON public.finance_expense_payments TO service_role;
DROP POLICY IF EXISTS "Finance can view expense payments" ON public.finance_expense_payments;
DROP POLICY IF EXISTS "Finance can manage expense payments" ON public.finance_expense_payments;
CREATE POLICY "Finance can view expense payments" ON public.finance_expense_payments
  FOR SELECT TO authenticated USING (public.finance_can_view() OR created_by = auth.uid());
CREATE POLICY "Finance can manage expense payments" ON public.finance_expense_payments
  FOR ALL TO authenticated USING (public.finance_can_manage()) WITH CHECK (public.finance_can_manage());