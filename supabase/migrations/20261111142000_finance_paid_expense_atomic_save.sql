CREATE OR REPLACE FUNCTION public.finance_save_paid_expense(
  p_expense_id uuid,
  p_expense_category text,
  p_amount numeric,
  p_gross_amount numeric,
  p_fee_amount numeric,
  p_fee_applied boolean,
  p_expense_date date,
  p_payment_method text,
  p_reference text,
  p_profile_id uuid,
  p_supplier_name text,
  p_client_id uuid,
  p_plantation_id uuid,
  p_is_direct_cost boolean,
  p_description text,
  p_proof_path text,
  p_proof_name text,
  p_proof_mime_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_expense public.finance_expenses%ROWTYPE;
  v_expense_id uuid;
  v_transaction_id uuid;
  v_transaction_date timestamptz;
  v_reference text;
  v_proof_path text;
  v_proof_name text;
  v_proof_mime_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Permission insuffisante pour enregistrer cette sortie.';
  END IF;
  IF nullif(btrim(p_expense_category), '') IS NULL OR p_amount IS NULL OR p_amount <= 0
     OR p_gross_amount IS NULL OR p_gross_amount <= 0 OR p_fee_amount IS NULL OR p_fee_amount < 0 THEN
    RAISE EXCEPTION 'Catégorie et montants valides obligatoires.';
  END IF;
  IF p_expense_date IS NULL THEN RAISE EXCEPTION 'Date de sortie obligatoire.'; END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('especes','mobile_money','virement') THEN
    RAISE EXCEPTION 'Mode de paiement non pris en charge.';
  END IF;
  IF coalesce(p_fee_applied,false) AND p_payment_method='especes' THEN
    RAISE EXCEPTION 'Les frais ne s’appliquent pas aux paiements en espèces.';
  END IF;
  IF p_amount <> p_gross_amount + p_fee_amount THEN
    RAISE EXCEPTION 'Le montant comptabilisé ne correspond pas au montant et aux frais.';
  END IF;

  v_transaction_date := (p_expense_date::timestamp + time '12:00') AT TIME ZONE 'Africa/Abidjan';
  v_reference := nullif(btrim(p_reference), '');
  v_proof_path := p_proof_path;
  v_proof_name := p_proof_name;
  v_proof_mime_type := p_proof_mime_type;

  IF p_expense_id IS NOT NULL THEN
    IF NOT private.finance_is_pdg() THEN
      RAISE EXCEPTION 'La modification d’une sortie existante est réservée au PDG.';
    END IF;
    SELECT * INTO v_expense FROM public.finance_expenses WHERE id=p_expense_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sortie introuvable.'; END IF;
    IF EXISTS (SELECT 1 FROM public.finance_expense_payments p WHERE p.expense_id=p_expense_id) THEN
      RAISE EXCEPTION 'Une sortie ayant un historique de règlements ne peut pas être modifiée directement.';
    END IF;
    v_expense_id := v_expense.id;
    v_transaction_id := v_expense.transaction_id;
    IF v_transaction_id IS NULL THEN
      INSERT INTO public.finance_transactions (
        direction,category,label,amount,gross_amount,fee_rate,fee_amount,fee_applied,
        transaction_date,payment_method,reference,status,profile_id,client_id,plantation_id,
        source_type,source_id,notes,proof_path,proof_name,created_by
      ) VALUES (
        'sortie','DEPENSE',p_expense_category,p_amount,p_gross_amount,
        CASE WHEN coalesce(p_fee_applied,false) THEN 1 ELSE 0 END,p_fee_amount,coalesce(p_fee_applied,false),
        v_transaction_date,p_payment_method,v_reference,'valide',p_profile_id,p_client_id,p_plantation_id,
        'finance_expense',v_expense_id,nullif(btrim(p_description),''),v_proof_path,v_proof_name,auth.uid()
      ) RETURNING id INTO v_transaction_id;
    ELSE
      UPDATE public.finance_transactions SET
        direction='sortie',category='DEPENSE',label=p_expense_category,amount=p_amount,gross_amount=p_gross_amount,
        fee_rate=CASE WHEN coalesce(p_fee_applied,false) THEN 1 ELSE 0 END,fee_amount=p_fee_amount,
        fee_applied=coalesce(p_fee_applied,false),transaction_date=v_transaction_date,payment_method=p_payment_method,
        reference=v_reference,status='valide',profile_id=p_profile_id,client_id=p_client_id,
        plantation_id=p_plantation_id,source_type='finance_expense',source_id=v_expense_id,
        notes=nullif(btrim(p_description),''),proof_path=v_proof_path,proof_name=v_proof_name
      WHERE id=v_transaction_id;
    END IF;
    UPDATE public.finance_expenses SET
      transaction_id=v_transaction_id,expense_category=p_expense_category,profile_id=p_profile_id,
      supplier_name=p_supplier_name,description=nullif(btrim(p_description),''),client_id=p_client_id,
      plantation_id=p_plantation_id,is_direct_cost=coalesce(p_is_direct_cost,false),
      expense_date=p_expense_date,total_amount=p_amount,paid_amount=p_amount,status='paid',
      payment_method=p_payment_method,reference=v_reference,proof_path=v_proof_path,
      proof_name=v_proof_name,proof_mime_type=v_proof_mime_type
    WHERE id=v_expense_id;
  ELSE
    INSERT INTO public.finance_expenses (
      expense_category,profile_id,supplier_name,description,client_id,plantation_id,is_direct_cost,
      expense_date,total_amount,paid_amount,status,payment_method,reference,
      proof_path,proof_name,proof_mime_type
    ) VALUES (
      p_expense_category,p_profile_id,p_supplier_name,nullif(btrim(p_description),''),p_client_id,p_plantation_id,
      coalesce(p_is_direct_cost,false),p_expense_date,p_amount,p_amount,'paid',p_payment_method,v_reference,
      v_proof_path,v_proof_name,v_proof_mime_type
    ) RETURNING id INTO v_expense_id;

    INSERT INTO public.finance_transactions (
      direction,category,label,amount,gross_amount,fee_rate,fee_amount,fee_applied,
      transaction_date,payment_method,reference,status,profile_id,client_id,plantation_id,
      source_type,source_id,notes,proof_path,proof_name,created_by
    ) VALUES (
      'sortie','DEPENSE',p_expense_category,p_amount,p_gross_amount,
      CASE WHEN coalesce(p_fee_applied,false) THEN 1 ELSE 0 END,p_fee_amount,coalesce(p_fee_applied,false),
      v_transaction_date,p_payment_method,v_reference,'valide',p_profile_id,p_client_id,p_plantation_id,
      'finance_expense',v_expense_id,nullif(btrim(p_description),''),v_proof_path,v_proof_name,auth.uid()
    ) RETURNING id INTO v_transaction_id;

    UPDATE public.finance_expenses SET transaction_id=v_transaction_id WHERE id=v_expense_id;
  END IF;

  RETURN jsonb_build_object('expense_id',v_expense_id,'transaction_id',v_transaction_id,'status','paid','amount',p_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_save_paid_expense(uuid,text,numeric,numeric,numeric,boolean,date,text,text,uuid,text,uuid,uuid,boolean,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_save_paid_expense(uuid,text,numeric,numeric,numeric,boolean,date,text,text,uuid,text,uuid,uuid,boolean,text,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_save_paid_expense(uuid,text,numeric,numeric,numeric,boolean,date,text,text,uuid,text,uuid,uuid,boolean,text,text,text,text) TO authenticated;
