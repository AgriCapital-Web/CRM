-- Contact telephone fields for finance records.
-- Keeps phone numbers on the finance records themselves for reporting and follow-up.
ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS beneficiary_phone text;

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN public.finance_expenses.beneficiary_phone IS 'Telephone du bénéficiaire ou fournisseur lié à la dépense.';
COMMENT ON COLUMN public.finance_transactions.contact_phone IS 'Téléphone du contact lié à une entrée financière.';
