CREATE OR REPLACE FUNCTION private.finance_payout_enqueue_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p record;
  b record;
  t public.finance_payout_sms_templates;
  full_name text;
  name_parts text[];
  recipient_name text;
  recipient_phone text;
  linked_user_id uuid;
  rendered text;
  greeting text;
BEGIN
  IF new.status <> 'succeeded' OR old.status = 'succeeded' THEN RETURN new; END IF;
  SELECT pr.user_id,pr.prenoms,pr.nom,pr.nom_complet,pr.telephone,pr.whatsapp,pr.email
    INTO p FROM public.profiles pr WHERE pr.id=new.profile_id;
  SELECT fb.id,fb.display_name,fb.first_names,fb.last_name,fb.phone,fb.email
    INTO b FROM public.finance_payout_beneficiaries fb WHERE fb.id=new.beneficiary_id;
  IF NOT FOUND THEN
    INSERT INTO public.finance_payout_audit_events(payout_id,actor_id,event_type,from_status,to_status,details)
    VALUES(new.id,coalesce(auth.uid(),new.approved_by,new.created_by),'sms_not_queued',old.status,new.status,jsonb_build_object('reason','beneficiary_not_found'));
    RETURN new;
  END IF;
  SELECT * INTO t FROM public.finance_payout_sms_templates WHERE category=new.category AND active=true;
  IF NOT FOUND THEN
    INSERT INTO public.finance_payout_audit_events(payout_id,actor_id,event_type,from_status,to_status,details)
    VALUES(new.id,coalesce(auth.uid(),new.approved_by,new.created_by),'sms_not_queued',old.status,new.status,jsonb_build_object('reason','template_missing_or_inactive'));
    RETURN new;
  END IF;
  full_name:=coalesce(
    nullif(trim(concat_ws(' ',nullif(trim(p.prenoms),''),nullif(trim(p.nom),''))),''),
    nullif(trim(p.nom_complet),''),
    nullif(trim(concat_ws(' ',b.first_names,b.last_name)),''),
    b.display_name,''
  );
  recipient_phone:=coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),''),nullif(trim(b.phone),''));
  linked_user_id:=p.user_id;
  IF recipient_phone IS NULL THEN
    INSERT INTO public.finance_payout_audit_events(payout_id,actor_id,event_type,from_status,to_status,details)
    VALUES(new.id,coalesce(auth.uid(),new.approved_by,new.created_by),'sms_not_queued',old.status,new.status,jsonb_build_object('reason','beneficiary_phone_missing'));
    RETURN new;
  END IF;
  name_parts:=regexp_split_to_array(trim(full_name),'[[:space:]]+');
  IF coalesce(array_length(name_parts,1),0)>1 THEN
    recipient_name:=name_parts[array_length(name_parts,1)-1]||' '||name_parts[array_length(name_parts,1)];
  ELSE
    recipient_name:=coalesce(nullif(trim(full_name),''),'');
  END IF;
  rendered:=t.content;
  greeting:=CASE WHEN recipient_name<>'' THEN 'Bonjour '||recipient_name ELSE 'Bonjour' END;
  rendered:=replace(rendered,'Bonjour {dernier_prenom_nom}',greeting);
  rendered:=replace(rendered,'Bonjour {dernierprenom_nom}',greeting);
  rendered:=replace(rendered,'{dernier_prenom_nom}',recipient_name);
  rendered:=replace(rendered,'{dernierprenom_nom}',recipient_name);
  rendered:=replace(rendered,'{prenom}',coalesce(nullif(name_parts[greatest(array_length(name_parts,1)-1,1)],''),''));
  rendered:=replace(rendered,'{nom}',coalesce(nullif(name_parts[array_length(name_parts,1)],''),''));
  rendered:=replace(rendered,'{nom_complet}',full_name);
  rendered:=replace(rendered,'{montant}',to_char(new.amount,'FM999G999G999G990'));
  rendered:=replace(rendered,'{motif}',new.reason);
  rendered:=replace(rendered,'{date}',to_char(coalesce(new.paid_at,now()) at time zone 'Africa/Abidjan','DD/MM/YYYY'));
  rendered:=replace(rendered,'{reference}',new.reference);
  rendered:=replace(rendered,'{entreprise}','AgriCapital');
  IF char_length(rendered)>150 THEN
    INSERT INTO public.finance_payout_audit_events(payout_id,actor_id,event_type,from_status,to_status,details)
    VALUES(new.id,coalesce(auth.uid(),new.approved_by,new.created_by),'sms_blocked_too_long',old.status,new.status,
      jsonb_build_object('character_count',char_length(rendered),'limit',150,'template_category',new.category));
    UPDATE public.finance_payouts SET notification_status='blocked_too_long',
      notification_error='SMS personnalisé supérieur à 150 caractères.' WHERE id=new.id;
    RETURN new;
  END IF;
  INSERT INTO public.notification_event_outbox(event_code,context,statut)
  VALUES('finance_payout_paid_'||new.category,
    jsonb_build_object('finance_payout_id',new.id,'finance_payout_sms',true,'user_id',linked_user_id,
      'paiement_id',new.id,'montant',to_char(new.amount,'FM999G999G999G990'),'motif',new.reason,
      'date',to_char(coalesce(new.paid_at,now()) at time zone 'Africa/Abidjan','DD/MM/YYYY'),
      'reference',new.reference,'entreprise','AgriCapital'),'en_attente');
  UPDATE public.finance_payouts SET notification_status='queued',notification_error=null WHERE id=new.id;
  RETURN new;
END;
$function$


CREATE OR REPLACE FUNCTION public.finance_payout_record_manual_success(p_payout_id uuid, p_provider_reference text, p_provider_transaction_id text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text)
 RETURNS finance_payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  payout public.finance_payouts;
  result public.finance_payouts;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Permission finance.manage requise.';
  END IF;
  IF nullif(trim(p_provider_reference),'') IS NULL THEN
    RAISE EXCEPTION 'La référence de confirmation du paiement est obligatoire.';
  END IF;
  IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('mobile_money','bank_transfer','cash','cheque','other') THEN
    RAISE EXCEPTION 'Mode de paiement invalide.';
  END IF;

  SELECT * INTO payout FROM public.finance_payouts WHERE id=p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Décaissement introuvable.'; END IF;

  IF payout.status='succeeded' THEN
    IF payout.provider_reference=trim(p_provider_reference) THEN RETURN payout; END IF;
    RAISE EXCEPTION 'Ce décaissement est déjà confirmé avec une autre référence.';
  END IF;
  IF payout.status <> 'approved' THEN
    RAISE EXCEPTION 'Seul un décaissement approuvé peut être rapproché.';
  END IF;
  IF payout.provider_code='kkiapay_push_up' AND nullif(trim(p_provider_transaction_id),'') IS NULL THEN
    RAISE EXCEPTION 'La référence de transaction Push Up est obligatoire pour le rapprochement.';
  END IF;

  -- Le déclencheur de sécurité réserve les transitions processing/succeeded au rôle serveur.
  -- Cette fonction ne peut être exécutée que par un utilisateur authentifié finance.manage.
  PERFORM set_config('request.jwt.claim.role','service_role',true);

  UPDATE public.finance_payouts
     SET status='processing', processed_at=now(),
         provider_reference=trim(p_provider_reference),
         provider_transaction_id=nullif(trim(p_provider_transaction_id),''),
         payment_method=coalesce(p_payment_method,payment_method),
         metadata=CASE WHEN provider_code='kkiapay_push_up'
           THEN metadata || jsonb_build_object('reconciliation_source','push_up_dashboard','reconciled_by',auth.uid())
           ELSE metadata || jsonb_build_object('reconciliation_source','manual_confirmation','reconciled_by',auth.uid())
         END
   WHERE id=p_payout_id;

  UPDATE public.finance_payouts
     SET status='succeeded', paid_at=now(), processed_at=coalesce(processed_at,now())
   WHERE id=p_payout_id
   RETURNING * INTO result;

  RETURN result;
END;
$function$


REVOKE ALL ON FUNCTION public.finance_payout_record_manual_success(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_payout_record_manual_success(uuid,text,text,text) TO authenticated;
