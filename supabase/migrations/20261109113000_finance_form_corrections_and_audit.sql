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
