ALTER TABLE public.finance_expenses ADD COLUMN IF NOT EXISTS beneficiary_phone text;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS contact_phone text;

CREATE OR REPLACE FUNCTION public.finance_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.has_role_permission('finance.manage')
    OR private.has_role_permission('finance.expenses')
    OR private.has_role_permission('finance.associates')
    OR private.has_role_permission('finance.payroll')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND lower(trim(ur.role)) IN ('pdg','dg','comptable')
    );
$function$;

CREATE OR REPLACE FUNCTION public.finance_can_view()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.has_role_permission('finance.view')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND lower(trim(ur.role)) IN ('pdg','dg','comptable','responsable_operations','associe_actionnaire')
    );
$function$;

COMMENT ON COLUMN public.finance_expenses.beneficiary_phone IS 'Téléphone du bénéficiaire ou fournisseur de la dépense.';
COMMENT ON COLUMN public.finance_transactions.contact_phone IS 'Téléphone du contact associé à une entrée financière.';