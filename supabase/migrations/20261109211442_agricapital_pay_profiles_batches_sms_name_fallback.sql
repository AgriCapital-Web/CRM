
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
  SELECT pr.user_id,pr.prenoms,pr.nom,pr.nom_complet,pr.telephone,pr.email
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
  recipient_phone:=coalesce(nullif(trim(p.telephone),''),nullif(trim(b.phone),''));
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
  rendered:=replace(rendered,'{prenom}',coalesce(nullif(split_part(recipient_name,' ',1),''),''));
  rendered:=replace(rendered,'{nom}',coalesce(nullif(split_part(recipient_name,' ',-1),''),''));
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
$function$;

CREATE OR REPLACE FUNCTION public.finance_payout_list_profiles()
RETURNS TABLE(id uuid,prenoms text,nom text,nom_complet text,telephone text,email text,poste text,actif boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_view() THEN
    RAISE EXCEPTION 'Permission Finance requise.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT p.id,p.prenoms,p.nom,p.nom_complet,p.telephone,p.email,p.poste,coalesce(p.actif,true)
    FROM public.profiles p
    WHERE p.user_id IS NOT NULL AND coalesce(p.actif,true)=true
    ORDER BY coalesce(nullif(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom));
END;
$function$;

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
  batch_id uuid;
  profile_id uuid;
  profile_row public.profiles;
  beneficiary_id uuid;
  requested_count integer;
  found_count integer;
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
  SELECT count(DISTINCT x) INTO requested_count FROM unnest(coalesce(p_profile_ids,'{}'::uuid[])) x;
  IF requested_count<1 OR requested_count>100 THEN RAISE EXCEPTION 'Un lot doit contenir entre 1 et 100 bénéficiaires.'; END IF;
  SELECT count(*) INTO found_count FROM public.profiles p
   WHERE p.id=ANY(p_profile_ids) AND p.user_id IS NOT NULL AND coalesce(p.actif,true)=true;
  IF found_count<>requested_count THEN RAISE EXCEPTION 'Un ou plusieurs profils sont introuvables ou inactifs.'; END IF;

  INSERT INTO public.finance_payout_batches(status,currency,total_amount,payout_count,metadata)
  VALUES('pending_approval','XOF',p_amount*requested_count,requested_count,
    jsonb_build_object('category',p_category,'reason',trim(p_reason),'provider_code',p_provider_code))
  RETURNING id INTO batch_id;

  FOR profile_id IN SELECT DISTINCT x FROM unnest(p_profile_ids) x LOOP
    SELECT * INTO profile_row FROM public.profiles WHERE id=profile_id;
    INSERT INTO public.finance_payout_beneficiaries(profile_id,beneficiary_type,display_name,active)
    VALUES(profile_id,CASE WHEN p_category='salary' THEN 'employee' ELSE 'crm_user' END,
      coalesce(nullif(trim(profile_row.nom_complet),''),concat_ws(' ',profile_row.prenoms,profile_row.nom)),true)
    ON CONFLICT(profile_id) DO UPDATE SET active=true,updated_at=now()
    RETURNING id INTO beneficiary_id;

    INSERT INTO public.finance_payouts(batch_id,beneficiary_id,profile_id,category,amount,currency,reason,payment_method,provider_code,status,created_by)
    VALUES(batch_id,beneficiary_id,profile_id,p_category,p_amount,'XOF',trim(p_reason),p_payment_method,p_provider_code,'pending_approval',auth.uid());
  END LOOP;
  RETURN batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_payout_list_profiles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_payout_list_profiles() TO authenticated;
REVOKE ALL ON FUNCTION public.finance_payout_create_batch(text,numeric,text,uuid[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_payout_create_batch(text,numeric,text,uuid[],text,text) TO authenticated;
