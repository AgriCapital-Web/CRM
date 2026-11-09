
CREATE OR REPLACE FUNCTION public.finance_payout_create_batch(
  p_category text,
  p_amount numeric,
  p_reason text,
  p_profile_ids uuid[],
  p_provider_code text DEFAULT 'manual',
  p_payment_method text DEFAULT 'mobile_money'
)
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
  IF auth.uid() IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Permission finance.manage requise.';
  END IF;
  IF p_category NOT IN ('salary','commission','remuneration','indemnity','bonus','supplier','agricultural_labor','partner','reimbursement','advance','other') THEN
    RAISE EXCEPTION 'Catégorie de décaissement invalide.';
  END IF;
  IF p_amount IS NULL OR p_amount<=0 OR nullif(trim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'Montant positif et motif obligatoires.';
  END IF;
  IF p_provider_code NOT IN ('manual','other') THEN
    RAISE EXCEPTION 'Les lots Push Up ne sont pas activés en envoi API. Préparez-les individuellement pour rapprochement après validation fournisseur.';
  END IF;
  IF p_payment_method NOT IN ('mobile_money','bank_transfer','cash','cheque','other') THEN
    RAISE EXCEPTION 'Mode de paiement invalide.';
  END IF;
  SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(coalesce(p_profile_ids,'{}'::uuid[])) x;
  IF v_requested_count<1 OR v_requested_count>100 THEN
    RAISE EXCEPTION 'Un lot doit contenir entre 1 et 100 bénéficiaires.';
  END IF;
  SELECT count(*) INTO v_found_count FROM public.profiles p
   WHERE p.id=ANY(p_profile_ids) AND p.user_id IS NOT NULL AND coalesce(p.actif,true)=true;
  IF v_found_count<>v_requested_count THEN
    RAISE EXCEPTION 'Un ou plusieurs profils sont introuvables ou inactifs.';
  END IF;

  INSERT INTO public.finance_payout_batches(status,currency,total_amount,payout_count,metadata)
  VALUES('pending_approval','XOF',p_amount*v_requested_count,v_requested_count,
    jsonb_build_object('category',p_category,'reason',trim(p_reason),'provider_code',p_provider_code))
  RETURNING id INTO v_batch_id;

  FOR v_profile_id IN SELECT DISTINCT x FROM unnest(p_profile_ids) x LOOP
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id=v_profile_id;
    INSERT INTO public.finance_payout_beneficiaries(profile_id,beneficiary_type,display_name,active)
    VALUES(v_profile_id,CASE WHEN p_category='salary' THEN 'employee' ELSE 'crm_user' END,
      coalesce(nullif(trim(v_profile.nom_complet),''),concat_ws(' ',v_profile.prenoms,v_profile.nom)),true)
    ON CONFLICT (profile_id) DO UPDATE SET active=true,updated_at=now()
    RETURNING id INTO v_beneficiary_id;

    INSERT INTO public.finance_payouts(batch_id,beneficiary_id,profile_id,category,amount,currency,reason,payment_method,provider_code,status,created_by)
    VALUES(v_batch_id,v_beneficiary_id,v_profile_id,p_category,p_amount,'XOF',trim(p_reason),p_payment_method,p_provider_code,'pending_approval',auth.uid());
  END LOOP;
  RETURN v_batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_payout_create_batch(text,numeric,text,uuid[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_payout_create_batch(text,numeric,text,uuid[],text,text) TO authenticated;
