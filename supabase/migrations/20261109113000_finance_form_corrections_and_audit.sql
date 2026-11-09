-- Finance: corrections atomiques des fiches de sortie et des entrées manuelles.
-- Les contrôles d'autorisation restent dans PostgreSQL/RLS; le navigateur ne
-- synchronise plus lui-même plusieurs écritures financières liées.

CREATE OR REPLACE FUNCTION public.finance_update_expense(
  p_expense_id uuid,
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_description text DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_plantation_id uuid DEFAULT NULL,
  p_is_direct_cost boolean DEFAULT false,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL,
  p_proof_mime_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_transaction_id uuid;
  v_paid_amount numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit de corriger cette sortie.'
      USING errcode = '42501';
  END IF;

  IF p_expense_id IS NULL
     OR NULLIF(trim(p_category), '') IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Catégorie, montant positif et date sont obligatoires.'
      USING errcode = '22023';
  END IF;

  SELECT e.transaction_id, e.paid_amount
    INTO v_transaction_id, v_paid_amount
  FROM public.finance_expenses e
  WHERE e.id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette dépense est introuvable.'
      USING errcode = 'P0002';
  END IF;

  IF p_amount < COALESCE(v_paid_amount, 0) THEN
    RAISE EXCEPTION 'Le montant total ne peut pas être inférieur au montant déjà payé.'
      USING errcode = '22023';
  END IF;

  UPDATE public.finance_expenses
  SET expense_category = trim(p_category),
      profile_id = p_profile_id,
      supplier_name = CASE
        WHEN p_profile_id IS NULL THEN supplier_name
        ELSE (SELECT p.nom_complet FROM public.profiles p WHERE p.id = p_profile_id)
      END,
      description = NULLIF(trim(COALESCE(p_description, '')), ''),
      client_id = p_client_id,
      plantation_id = p_plantation_id,
      is_direct_cost = COALESCE(p_is_direct_cost, false),
      expense_date = p_expense_date,
      total_amount = p_amount,
      proof_path = COALESCE(p_proof_path, proof_path),
      proof_name = COALESCE(p_proof_name, proof_name),
      proof_mime_type = COALESCE(p_proof_mime_type, proof_mime_type)
  WHERE id = p_expense_id;

  IF v_transaction_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.finance_expense_payments p
      WHERE p.expense_id = p_expense_id
    ) THEN
      -- A paid planned expense may aggregate several cash movements.
      -- Preserve each payment amount/date; only synchronize its description.
      UPDATE public.finance_transactions t
      SET label = trim(p_category),
          client_id = p_client_id,
          plantation_id = p_plantation_id,
          profile_id = p_profile_id,
          notes = NULLIF(trim(COALESCE(p_description, '')), ''),
          updated_at = now()
      FROM public.finance_expense_payments p
      WHERE p.expense_id = p_expense_id
        AND p.transaction_id = t.id;
    ELSE
      UPDATE public.finance_transactions
      SET label = trim(p_category),
          amount = p_amount,
          transaction_date = p_expense_date::timestamp AT TIME ZONE 'UTC',
          client_id = p_client_id,
          plantation_id = p_plantation_id,
          profile_id = p_profile_id,
          notes = NULLIF(trim(COALESCE(p_description, '')), ''),
          proof_path = COALESCE(p_proof_path, proof_path),
          proof_name = COALESCE(p_proof_name, proof_name),
          updated_at = now()
      WHERE id = v_transaction_id;
    END IF;
  END IF;

  RETURN p_expense_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_update_expense(uuid,text,numeric,date,text,uuid,uuid,uuid,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_update_expense(uuid,text,numeric,date,text,uuid,uuid,uuid,boolean,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_update_manual_entry(
  p_transaction_id uuid,
  p_source_type text,
  p_label text,
  p_amount numeric,
  p_transaction_date date,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit de corriger cette entrée.'
      USING errcode = '42501';
  END IF;

  IF p_transaction_id IS NULL
     OR NULLIF(trim(p_label), '') IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_transaction_date IS NULL
     OR p_source_type IS NULL
     OR p_source_type NOT IN ('financement','pret','don','vente','autre') THEN
    RAISE EXCEPTION 'Les informations de l’entrée financière sont invalides.'
      USING errcode = '22023';
  END IF;

  SELECT t.source_id
    INTO v_source_id
  FROM public.finance_transactions t
  WHERE t.id = p_transaction_id
    AND t.direction = 'entree'
    AND t.source_type IN ('financement','pret','don','vente','autre')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette entrée n’existe pas ou ne peut pas être corrigée depuis le journal manuel.'
      USING errcode = '42501';
  END IF;

  IF v_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cette entrée est liée à un dossier métier. Corrigez-la depuis sa fiche d’origine.'
      USING errcode = '42501';
  END IF;

  UPDATE public.finance_transactions
  SET source_type = p_source_type,
      label = trim(p_label),
      amount = p_amount,
      transaction_date = p_transaction_date::timestamp AT TIME ZONE 'UTC',
      payment_method = NULLIF(trim(COALESCE(p_payment_method, '')), ''),
      reference = NULLIF(trim(COALESCE(p_reference, '')), ''),
      contact_phone = NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
      notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
      proof_path = COALESCE(p_proof_path, proof_path),
      proof_name = COALESCE(p_proof_name, proof_name),
      updated_at = now()
  WHERE id = p_transaction_id;

  RETURN p_transaction_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_update_manual_entry(uuid,text,text,numeric,date,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_update_manual_entry(uuid,text,text,numeric,date,text,text,text,text,text,text) TO authenticated;

-- Toute correction financière doit rester traçable dans admin_audit_logs.
DROP TRIGGER IF EXISTS trg_audit_finance_transactions ON public.finance_transactions;
CREATE TRIGGER trg_audit_finance_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_finance_expenses ON public.finance_expenses;
CREATE TRIGGER trg_audit_finance_expenses
AFTER INSERT OR UPDATE OR DELETE ON public.finance_expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();


-- Création des entrées et sorties atomiques : les règles de cohérence multi-table
-- ne sont pas réparties entre plusieurs requêtes navigateur.
CREATE OR REPLACE FUNCTION public.finance_create_manual_entry(
  p_source_type text,
  p_source_name text,
  p_amount numeric,
  p_transaction_date date,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_label text;
  v_category text;
  v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit de créer une entrée financière.'
      USING errcode = '42501';
  END IF;

  IF p_source_type IS NULL
     OR p_source_type NOT IN ('financement','pret','don','vente','autre')
     OR NULLIF(trim(p_source_name), '') IS NULL
     OR p_amount IS NULL OR p_amount <= 0
     OR p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Source, nature, montant positif et date sont obligatoires.'
      USING errcode = '22023';
  END IF;

  v_label := CASE p_source_type
    WHEN 'financement' THEN 'Financement'
    WHEN 'pret' THEN 'Prêt reçu'
    WHEN 'don' THEN 'Don reçu'
    WHEN 'vente' THEN 'Vente'
    ELSE 'Autre entrée'
  END;
  v_category := CASE p_source_type
    WHEN 'financement' THEN 'FINANCEMENT'
    WHEN 'pret' THEN 'PRET'
    WHEN 'don' THEN 'DON'
    WHEN 'vente' THEN 'VENTE'
    ELSE 'AUTRE_ENTREE'
  END;

  INSERT INTO public.finance_transactions (
    direction, category, label, amount, transaction_date, payment_method,
    reference, contact_phone, source_type, notes, status, proof_path, proof_name
  ) VALUES (
    'entree', v_category, v_label || ' — ' || trim(p_source_name), p_amount,
    p_transaction_date::timestamp AT TIME ZONE 'UTC',
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    NULLIF(trim(COALESCE(p_reference, '')), ''),
    NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
    p_source_type,
    COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'Source : ' || trim(p_source_name)),
    'valide', p_proof_path, p_proof_name
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_create_manual_entry(text,text,numeric,date,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_create_manual_entry(text,text,numeric,date,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_create_expense(
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_description text DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_plantation_id uuid DEFAULT NULL,
  p_is_direct_cost boolean DEFAULT false,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL,
  p_proof_mime_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_transaction_id uuid;
  v_expense_id uuid;
  v_supplier_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit de créer une sortie financière.'
      USING errcode = '42501';
  END IF;

  IF NULLIF(trim(COALESCE(p_category, '')), '') IS NULL
     OR p_amount IS NULL OR p_amount <= 0
     OR p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Catégorie, montant positif et date sont obligatoires.'
      USING errcode = '22023';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    SELECT p.nom_complet INTO v_supplier_name
    FROM public.profiles p
    WHERE p.id = p_profile_id;
  END IF;

  INSERT INTO public.finance_transactions (
    direction, category, label, amount, transaction_date, status,
    profile_id, client_id, plantation_id, notes, proof_path, proof_name
  ) VALUES (
    'sortie', 'DEPENSE', trim(p_category), p_amount,
    p_expense_date::timestamp AT TIME ZONE 'UTC', 'valide',
    p_profile_id, p_client_id, p_plantation_id,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_proof_path, p_proof_name
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.finance_expenses (
    transaction_id, expense_category, profile_id, supplier_name, description,
    client_id, plantation_id, is_direct_cost, expense_date, total_amount,
    paid_amount, status, proof_path, proof_name, proof_mime_type
  ) VALUES (
    v_transaction_id, trim(p_category), p_profile_id, v_supplier_name,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_client_id, p_plantation_id, COALESCE(p_is_direct_cost, false),
    p_expense_date, p_amount, p_amount, 'paid',
    p_proof_path, p_proof_name, p_proof_mime_type
  )
  RETURNING id INTO v_expense_id;

  RETURN v_expense_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_create_expense(text,numeric,date,text,uuid,uuid,uuid,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_create_expense(text,numeric,date,text,uuid,uuid,uuid,boolean,text,text,text) TO authenticated;


-- Planned expenses remain in the payment queue until their full amount is paid.
CREATE OR REPLACE FUNCTION public.finance_create_planned_expense(
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_due_date date DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL,
  p_beneficiary_name text DEFAULT NULL,
  p_beneficiary_phone text DEFAULT NULL,
  p_is_direct_cost boolean DEFAULT false,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL,
  p_proof_mime_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_supplier_name text;
  v_expense_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit de créer une dépense à payer.'
      USING errcode = '42501';
  END IF;

  IF NULLIF(trim(COALESCE(p_category, '')), '') IS NULL
     OR p_amount IS NULL OR p_amount <= 0
     OR p_expense_date IS NULL
     OR (p_due_date IS NOT NULL AND p_due_date < p_expense_date) THEN
    RAISE EXCEPTION 'Catégorie, montant positif et date d’échéance valide sont obligatoires.'
      USING errcode = '22023';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    SELECT p.nom_complet INTO v_supplier_name
    FROM public.profiles p
    WHERE p.id = p_profile_id;
    IF v_supplier_name IS NULL THEN
      RAISE EXCEPTION 'Le bénéficiaire interne sélectionné est introuvable.'
        USING errcode = '22023';
    END IF;
  ELSE
    v_supplier_name := NULLIF(trim(COALESCE(p_beneficiary_name, '')), '');
  END IF;

  INSERT INTO public.finance_expenses (
    expense_category, supplier_name, description, profile_id, is_direct_cost,
    proof_path, proof_name, proof_mime_type, expense_date, due_date,
    total_amount, paid_amount, status, beneficiary_name, beneficiary_phone, notes
  ) VALUES (
    trim(p_category), v_supplier_name,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_profile_id, COALESCE(p_is_direct_cost, false),
    p_proof_path, p_proof_name, p_proof_mime_type,
    p_expense_date, p_due_date, p_amount, 0, 'unpaid',
    NULLIF(trim(COALESCE(p_beneficiary_name, '')), ''),
    NULLIF(trim(COALESCE(p_beneficiary_phone, '')), ''),
    NULLIF(trim(COALESCE(p_description, '')), '')
  )
  RETURNING id INTO v_expense_id;

  RETURN v_expense_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_create_planned_expense(text,numeric,date,date,text,uuid,text,text,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_create_planned_expense(text,numeric,date,date,text,uuid,text,text,boolean,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_update_planned_expense(
  p_expense_id uuid,
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_due_date date DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL,
  p_beneficiary_name text DEFAULT NULL,
  p_beneficiary_phone text DEFAULT NULL,
  p_is_direct_cost boolean DEFAULT false,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL,
  p_proof_mime_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_paid_amount numeric;
  v_transaction_id uuid;
  v_supplier_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit de corriger cette dépense à payer.'
      USING errcode = '42501';
  END IF;

  IF p_expense_id IS NULL
     OR NULLIF(trim(COALESCE(p_category, '')), '') IS NULL
     OR p_amount IS NULL OR p_amount <= 0
     OR p_expense_date IS NULL
     OR (p_due_date IS NOT NULL AND p_due_date < p_expense_date) THEN
    RAISE EXCEPTION 'Les informations de la dépense sont invalides.'
      USING errcode = '22023';
  END IF;

  SELECT e.paid_amount, e.transaction_id
    INTO v_paid_amount, v_transaction_id
  FROM public.finance_expenses e
  WHERE e.id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette dépense est introuvable.'
      USING errcode = 'P0002';
  END IF;

  IF v_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cette dépense est déjà soldée. Ouvrez sa fiche de sortie enregistrée.'
      USING errcode = '22023';
  END IF;

  IF p_amount < COALESCE(v_paid_amount, 0) THEN
    RAISE EXCEPTION 'Le montant total ne peut pas être inférieur aux paiements déjà effectués.'
      USING errcode = '22023';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    SELECT p.nom_complet INTO v_supplier_name
    FROM public.profiles p
    WHERE p.id = p_profile_id;
    IF v_supplier_name IS NULL THEN
      RAISE EXCEPTION 'Le bénéficiaire interne sélectionné est introuvable.'
        USING errcode = '22023';
    END IF;
  ELSE
    v_supplier_name := NULLIF(trim(COALESCE(p_beneficiary_name, '')), '');
  END IF;

  UPDATE public.finance_expenses
  SET expense_category = trim(p_category),
      supplier_name = v_supplier_name,
      description = NULLIF(trim(COALESCE(p_description, '')), ''),
      profile_id = p_profile_id,
      is_direct_cost = COALESCE(p_is_direct_cost, false),
      proof_path = COALESCE(p_proof_path, proof_path),
      proof_name = COALESCE(p_proof_name, proof_name),
      proof_mime_type = COALESCE(p_proof_mime_type, proof_mime_type),
      expense_date = p_expense_date,
      due_date = p_due_date,
      total_amount = p_amount,
      beneficiary_name = NULLIF(trim(COALESCE(p_beneficiary_name, '')), ''),
      beneficiary_phone = NULLIF(trim(COALESCE(p_beneficiary_phone, '')), ''),
      notes = NULLIF(trim(COALESCE(p_description, '')), ''),
      status = CASE WHEN COALESCE(v_paid_amount,0) >= p_amount THEN 'paid'
                    WHEN COALESCE(v_paid_amount,0) > 0 THEN 'partial'
                    ELSE 'unpaid' END
  WHERE id = p_expense_id;

  RETURN p_expense_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_update_planned_expense(uuid,text,numeric,date,date,text,uuid,text,text,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_update_planned_expense(uuid,text,numeric,date,date,text,uuid,text,text,boolean,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_register_expense_payment(
  p_expense_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  p_proof_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expense public.finance_expenses%ROWTYPE;
  v_next_paid numeric;
  v_transaction_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Vous ne disposez pas du droit d’enregistrer ce paiement.'
      USING errcode = '42501';
  END IF;

  IF p_expense_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Dépense, montant positif et date de paiement sont obligatoires.'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_expense
  FROM public.finance_expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette dépense à payer est introuvable.'
      USING errcode = 'P0002';
  END IF;

  IF v_expense.transaction_id IS NOT NULL OR v_expense.status = 'paid' THEN
    RAISE EXCEPTION 'Cette dépense est déjà soldée.'
      USING errcode = '22023';
  END IF;

  v_next_paid := COALESCE(v_expense.paid_amount, 0) + p_amount;
  IF v_next_paid > v_expense.total_amount THEN
    RAISE EXCEPTION 'Le paiement dépasse le solde restant.'
      USING errcode = '22023';
  END IF;

  INSERT INTO public.finance_transactions (
    direction, category, label, amount, transaction_date, payment_method,
    reference, profile_id, source_type, source_id, status, notes,
    created_by, proof_path, proof_name, client_id, plantation_id
  ) VALUES (
    'sortie', 'DEPENSE', v_expense.expense_category, p_amount, p_paid_at,
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    NULLIF(trim(COALESCE(p_reference, '')), ''),
    v_expense.profile_id, 'expense_payment', p_expense_id, 'valide',
    COALESCE(v_expense.description, v_expense.notes),
    (SELECT auth.uid()), p_proof_path, p_proof_name,
    v_expense.client_id, v_expense.plantation_id
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.finance_expense_payments (
    expense_id, transaction_id, amount, paid_at, payment_method,
    proof_path, proof_name, created_by
  ) VALUES (
    p_expense_id, v_transaction_id, p_amount, p_paid_at,
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_proof_path, p_proof_name, (SELECT auth.uid())
  );

  UPDATE public.finance_expenses
  SET paid_amount = v_next_paid,
      status = CASE WHEN v_next_paid >= total_amount THEN 'paid' ELSE 'partial' END,
      transaction_id = CASE WHEN v_next_paid >= total_amount THEN v_transaction_id ELSE NULL END,
      payment_method = NULLIF(trim(COALESCE(p_payment_method, '')), '')
  WHERE id = p_expense_id;

  RETURN v_transaction_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_register_expense_payment(uuid,numeric,timestamptz,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_register_expense_payment(uuid,numeric,timestamptz,text,text,text,text) TO authenticated;

DROP TRIGGER IF EXISTS trg_audit_finance_expense_payments ON public.finance_expense_payments;
CREATE TRIGGER trg_audit_finance_expense_payments
AFTER INSERT OR UPDATE OR DELETE ON public.finance_expense_payments
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
