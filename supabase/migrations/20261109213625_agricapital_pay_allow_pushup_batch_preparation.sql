CREATE OR REPLACE FUNCTION public.finance_payout_create_batch(p_category text, p_amount numeric, p_reason text, p_profile_ids uuid[], p_provider_code text DEFAULT 'manual'::text, p_payment_method text DEFAULT 'mobile_money'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_batch_id uuid;
  v_profile_id uuid;
  v_profile public.profiles;
  v_beneficiary_id uuid;
  v_requested_count integer;
  v_found_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Permission finance.manage requise.'; END IF;
  IF p_category NOT IN ('salary','commission','remuneration','indemnity','bonus','supplier','agricultural_labor','partner','reimbursement','refund','advance','other') THEN
    RAISE EXCEPTION 'Catégorie de décaissement invalide.';
  END IF;
  IF p_amount IS NULL OR p_amount<=0 OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Montant positif et motif obligatoires.'; END IF;
  IF p_provider_code NOT IN ('manual','other','kkiapay_push_up') THEN RAISE EXCEPTION 'Les lots Push Up ne sont pas activés en envoi API.'; END IF;
  IF p_payment_method NOT IN ('mobile_money','bank_transfer','cash','cheque','other') THEN RAISE EXCEPTION 'Mode de paiement invalide.'; END IF;
  SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(coalesce(p_profile_ids,'{}'::uuid[])) x;
  IF v_requested_count<1 OR v_requested_count>100 THEN RAISE EXCEPTION 'Un lot doit contenir entre 1 et 100 bénéficiaires.'; END IF;
  SELECT count(*) INTO v_found_count FROM public.profiles p WHERE p.id=ANY(p_profile_ids) AND p.user_id IS NOT NULL AND coalesce(p.actif,true)=true;
  IF v_found_count<>v_requested_count THEN RAISE EXCEPTION 'Un ou plusieurs profils sont introuvables ou inactifs.'; END IF;
  INSERT INTO public.finance_payout_batches(status,currency,total_amount,payout_count,metadata)
  VALUES('pending_approval','XOF',p_amount*v_requested_count,v_requested_count,jsonb_build_object('category',p_category,'reason',trim(p_reason),'provider_code',p_provider_code))
  RETURNING id INTO v_batch_id;
  FOR v_profile_id IN SELECT DISTINCT x FROM unnest(p_profile_ids) x LOOP
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id=v_profile_id;
    INSERT INTO public.finance_payout_beneficiaries(profile_id,beneficiary_type,display_name,active)
    VALUES(v_profile_id,CASE WHEN p_category='salary' THEN 'employee' ELSE 'crm_user' END,
      coalesce(nullif(trim(v_profile.nom_complet),''),concat_ws(' ',v_profile.prenoms,v_profile.nom)),true)
    ON CONFLICT(profile_id) DO UPDATE SET active=true,updated_at=now()
    RETURNING id INTO v_beneficiary_id;
    INSERT INTO public.finance_payouts(batch_id,beneficiary_id,profile_id,category,amount,currency,reason,payment_method,provider_code,status,created_by)
    VALUES(v_batch_id,v_beneficiary_id,v_profile_id,p_category,p_amount,'XOF',trim(p_reason),p_payment_method,p_provider_code,'pending_approval',auth.uid());
  END LOOP;
  RETURN v_batch_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_payout_create_payroll_batch(p_payroll_run_id uuid, p_provider_code text DEFAULT 'manual'::text, p_payment_method text DEFAULT 'mobile_money'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_run public.finance_payroll_runs;
  v_item public.finance_payroll_items;
  v_batch_id uuid;
  v_beneficiary_id uuid;
  v_count integer;
  v_total numeric;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Permission finance.manage requise.'; END IF;
  IF p_provider_code NOT IN ('manual','other','kkiapay_push_up') THEN RAISE EXCEPTION 'Le lot de paie Push Up ne peut pas être envoyé en API avant validation officielle.'; END IF;
  IF p_payment_method NOT IN ('mobile_money','bank_transfer','cash','cheque','other') THEN RAISE EXCEPTION 'Mode de paiement invalide.'; END IF;
  SELECT * INTO v_run FROM public.finance_payroll_runs WHERE id=p_payroll_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status<>'valide' OR v_run.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Le cycle de paie doit être validé et non payé.'; END IF;
  SELECT count(*),coalesce(sum(net_salary),0) INTO v_count,v_total
    FROM public.finance_payroll_items
    WHERE payroll_run_id=p_payroll_run_id AND status='valide' AND transaction_id IS NULL AND coalesce(net_salary,0)>0;
  IF v_count<1 OR v_count>100 THEN RAISE EXCEPTION 'Le cycle doit contenir entre 1 et 100 lignes de paie validées et non payées.'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.finance_payroll_items i
    WHERE i.payroll_run_id=p_payroll_run_id AND i.status='valide' AND i.transaction_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=i.profile_id AND p.user_id IS NOT NULL AND coalesce(p.actif,true))
  ) THEN RAISE EXCEPTION 'Une ligne de paie ne possède pas de profil CRM actif.'; END IF;

  v_reason:='Paie du '||to_char(v_run.period_start,'DD/MM/YYYY')||' au '||to_char(v_run.period_end,'DD/MM/YYYY');
  INSERT INTO public.finance_payout_batches(status,currency,total_amount,payout_count,metadata)
  VALUES('pending_approval','XOF',v_total,v_count,jsonb_build_object('category','salary','payroll_run_id',p_payroll_run_id,'reason',v_reason))
  RETURNING id INTO v_batch_id;

  FOR v_item IN
    SELECT * FROM public.finance_payroll_items
    WHERE payroll_run_id=p_payroll_run_id AND status='valide' AND transaction_id IS NULL AND coalesce(net_salary,0)>0
    ORDER BY created_at,id
  LOOP
    INSERT INTO public.finance_payout_beneficiaries(profile_id,beneficiary_type,display_name,active)
    SELECT p.id,'employee',coalesce(nullif(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom)),true
    FROM public.profiles p WHERE p.id=v_item.profile_id
    ON CONFLICT(profile_id) DO UPDATE SET active=true,updated_at=now()
    RETURNING id INTO v_beneficiary_id;

    INSERT INTO public.finance_payouts(batch_id,beneficiary_id,profile_id,source_kind,source_id,category,amount,currency,reason,payment_method,provider_code,status,created_by)
    VALUES(v_batch_id,v_beneficiary_id,v_item.profile_id,'payroll_item',v_item.id,'salary',v_item.net_salary,'XOF',v_reason,p_payment_method,p_provider_code,'pending_approval',auth.uid());
  END LOOP;
  RETURN v_batch_id;
END;
$function$
;
