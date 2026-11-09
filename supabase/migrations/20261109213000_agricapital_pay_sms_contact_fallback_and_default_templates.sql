
CREATE OR REPLACE FUNCTION private.finance_payout_fill_beneficiary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE p record;
BEGIN
  IF new.profile_id IS NOT NULL THEN
    SELECT prenoms,nom,nom_complet,telephone,whatsapp,email
      INTO p FROM public.profiles WHERE id=new.profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Profil CRM introuvable pour ce bénéficiaire.'; END IF;
    new.first_names:=coalesce(nullif(trim(p.prenoms),''),new.first_names);
    new.last_name:=coalesce(nullif(trim(p.nom),''),new.last_name);
    new.display_name:=coalesce(
      nullif(trim(concat_ws(' ',nullif(trim(p.prenoms),''),nullif(trim(p.nom),''))),''),
      nullif(trim(p.nom_complet),''),new.display_name
    );
    new.phone:=coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),''),new.phone);
    new.email:=coalesce(nullif(trim(p.email),''),new.email);
    IF new.beneficiary_type NOT IN ('employee','crm_user') THEN new.beneficiary_type:='crm_user'; END IF;
  ELSE
    new.display_name:=nullif(trim(new.display_name),'');
    new.phone:=nullif(trim(new.phone),'');
  END IF;
  IF new.display_name IS NULL THEN RAISE EXCEPTION 'Le nom du bénéficiaire est obligatoire.'; END IF;
  RETURN new;
END;
$function$;

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
    SELECT p.id,p.prenoms,p.nom,p.nom_complet,
      coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),'')),
      p.email,p.poste,coalesce(p.actif,true)
    FROM public.profiles p
    WHERE p.user_id IS NOT NULL AND coalesce(p.actif,true)=true
    ORDER BY coalesce(nullif(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom));
END;
$function$;

UPDATE public.finance_payout_sms_templates SET content =
  CASE category
    WHEN 'salary' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre salaire de {montant} FCFA a ete verse. Merci.'
    WHEN 'commission' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre commission de {montant} FCFA a ete payee. Merci.'
    WHEN 'remuneration' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre remuneration de {montant} FCFA a ete reglee. Merci.'
    WHEN 'indemnity' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre indemnite de {montant} FCFA a ete versee. Merci.'
    WHEN 'bonus' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre prime de {montant} FCFA a ete versee. Merci.'
    WHEN 'supplier' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre paiement de {montant} FCFA a ete effectue. Merci.'
    WHEN 'agricultural_labor' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre prestation de {montant} FCFA a ete reglee. Merci.'
    WHEN 'partner' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre paiement de {montant} FCFA a ete effectue. Merci.'
    WHEN 'reimbursement' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre remboursement de {montant} FCFA a ete effectue. Merci.'
    WHEN 'advance' THEN 'AgriCapital : Bonjour {dernierprenom_nom}, votre avance de {montant} FCFA a ete versee. Merci.'
    ELSE 'AgriCapital : Bonjour {dernierprenom_nom}, votre paiement de {montant} FCFA a ete effectue. Merci.'
  END,
  updated_at=now();
