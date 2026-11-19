CREATE OR REPLACE FUNCTION public.finance_payroll_mark_paid(
  p_run_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_payment_proof_url text DEFAULT NULL,
  p_payment_proof_name text DEFAULT NULL,
  p_payment_proof_mime_type text DEFAULT NULL,
  p_fee_applied boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_run public.finance_payroll_runs%rowtype;
  v_item record;
  v_amount numeric;
  v_fee_amount numeric;
  v_total_amount numeric;
  v_fee_applied boolean;
  v_transaction_id uuid;
BEGIN
  IF NOT public.workspace_can_manage_finance() THEN
    RAISE EXCEPTION 'Vous n’êtes pas autorisé à enregistrer le paiement de la paie.';
  END IF;

  IF p_payment_method NOT IN ('virement','mobile_money','especes','cheque','autre') THEN
    RAISE EXCEPTION 'Mode de paiement invalide.';
  END IF;

  IF coalesce(trim(p_payment_reference),'') = ''
     AND coalesce(trim(p_payment_proof_url),'') = ''
     AND p_payment_method <> 'especes' THEN
    RAISE EXCEPTION 'Une référence ou un justificatif de paiement est obligatoire pour ce mode de paiement.';
  END IF;

  SELECT * INTO v_run
  FROM public.finance_payroll_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND OR v_run.status <> 'valide' THEN
    RAISE EXCEPTION 'Le lot doit être validé avant paiement.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_payroll_items
    WHERE payroll_run_id = p_run_id AND transaction_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Au moins une ligne possède déjà une transaction financière; vérification manuelle requise.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.finance_payroll_items
    WHERE payroll_run_id = p_run_id AND status = 'valide'
  ) THEN
    RAISE EXCEPTION 'Aucune ligne de paie validée à payer.';
  END IF;

  v_fee_applied := coalesce(p_fee_applied,false) AND p_payment_method <> 'especes';

  FOR v_item IN
    SELECT i.*, p.nom_complet
    FROM public.finance_payroll_items i
    JOIN public.profiles p ON p.id = i.profile_id
    WHERE i.payroll_run_id = p_run_id AND i.status = 'valide'
    FOR UPDATE OF i
  LOOP
    v_amount := greatest(0, coalesce(v_item.base_salary,0) + coalesce(v_item.bonuses,0) - coalesce(v_item.deductions,0));
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Montant net nul ou négatif pour %.', v_item.nom_complet;
    END IF;

    v_fee_amount := CASE WHEN v_fee_applied THEN round(v_amount * 0.01) ELSE 0 END;
    v_total_amount := v_amount + v_fee_amount;

    INSERT INTO public.finance_transactions(
      direction,category,label,amount,gross_amount,fee_rate,fee_amount,fee_applied,
      payment_method,reference,proof_path,proof_name,proof_mime_type,
      profile_id,source_type,source_id,status,notes,created_by
    ) VALUES (
      'sortie','SALAIRES','Salaire — ' || v_item.nom_complet,
      v_total_amount,v_amount,CASE WHEN v_fee_applied THEN 1 ELSE 0 END,v_fee_amount,v_fee_applied,
      p_payment_method,nullif(trim(p_payment_reference),''),
      nullif(trim(p_payment_proof_url),''),nullif(trim(p_payment_proof_name),''),
      nullif(trim(p_payment_proof_mime_type),''),v_item.profile_id,'paie_salaire',v_item.id,'valide',
      'Lot de paie ' || to_char(v_run.period_start,'YYYY-MM'),auth.uid()
    )
    RETURNING id INTO v_transaction_id;

    UPDATE public.finance_payroll_items
    SET transaction_id = v_transaction_id,
        net_salary = v_amount,
        status = 'paye'
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.finance_payroll_runs
  SET status = 'paye',
      paid_at = now(),
      payment_method = p_payment_method,
      payment_reference = nullif(trim(p_payment_reference),''),
      payment_proof_url = nullif(trim(p_payment_proof_url),'')
  WHERE id = p_run_id;
END;
$function$;