-- AgriCapital PAY base schema, captured from the deployed schema for reproducible environments.\nCREATE SCHEMA IF NOT EXISTS private;\nCREATE TABLE IF NOT EXISTS public.finance_payout_audit_events (\nid uuid DEFAULT gen_random_uuid() NOT NULL,
payout_id uuid NOT NULL,
actor_id uuid,
event_type text NOT NULL,
from_status text,
to_status text,
details jsonb DEFAULT '{}'::jsonb NOT NULL,
created_at timestamp with time zone DEFAULT now() NOT NULL\n);\nCREATE TABLE IF NOT EXISTS public.finance_payout_batches (\nid uuid DEFAULT gen_random_uuid() NOT NULL,
reference text DEFAULT ((('PAY-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) NOT NULL,
status text DEFAULT 'draft'::text NOT NULL,
currency text DEFAULT 'XOF'::text NOT NULL,
total_amount numeric(14,2) DEFAULT 0 NOT NULL,
payout_count integer DEFAULT 0 NOT NULL,
created_by uuid DEFAULT auth.uid(),
approved_by uuid,
approved_at timestamp with time zone,
metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
created_at timestamp with time zone DEFAULT now() NOT NULL,
updated_at timestamp with time zone DEFAULT now() NOT NULL\n);\nCREATE TABLE IF NOT EXISTS public.finance_payout_beneficiaries (\nid uuid DEFAULT gen_random_uuid() NOT NULL,
profile_id uuid,
beneficiary_type text DEFAULT 'other'::text NOT NULL,
first_names text,
last_name text,
display_name text NOT NULL,
phone text,
email text,
active boolean DEFAULT true NOT NULL,
notes text,
created_by uuid DEFAULT auth.uid(),
created_at timestamp with time zone DEFAULT now() NOT NULL,
updated_at timestamp with time zone DEFAULT now() NOT NULL\n);\nCREATE TABLE IF NOT EXISTS public.finance_payout_sms_templates (\nid uuid DEFAULT gen_random_uuid() NOT NULL,
category text NOT NULL,
name text NOT NULL,
content text NOT NULL,
active boolean DEFAULT true NOT NULL,
max_characters integer DEFAULT 150 NOT NULL,
updated_by uuid,
created_at timestamp with time zone DEFAULT now() NOT NULL,
updated_at timestamp with time zone DEFAULT now() NOT NULL\n);\nCREATE TABLE IF NOT EXISTS public.finance_payouts (\nid uuid DEFAULT gen_random_uuid() NOT NULL,
reference text DEFAULT ((('AGP-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) NOT NULL,
batch_id uuid,
beneficiary_id uuid NOT NULL,
profile_id uuid,
category text NOT NULL,
amount numeric(14,2) NOT NULL,
currency text DEFAULT 'XOF'::text NOT NULL,
reason text NOT NULL,
payment_method text DEFAULT 'mobile_money'::text NOT NULL,
provider_code text DEFAULT 'manual'::text NOT NULL,
provider_reference text,
provider_transaction_id text,
provider_fee numeric(14,2) DEFAULT 0 NOT NULL,
status text DEFAULT 'pending_approval'::text NOT NULL,
idempotency_key text DEFAULT (gen_random_uuid())::text NOT NULL,
failure_reason text,
notification_status text DEFAULT 'not_requested'::text NOT NULL,
notification_error text,
source_kind text,
source_id uuid,
created_by uuid DEFAULT auth.uid(),
approved_by uuid,
approved_at timestamp with time zone,
processed_at timestamp with time zone,
paid_at timestamp with time zone,
cancelled_at timestamp with time zone,
metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
created_at timestamp with time zone DEFAULT now() NOT NULL,
updated_at timestamp with time zone DEFAULT now() NOT NULL\n);\nALTER TABLE public.finance_payout_audit_events ADD CONSTRAINT finance_payout_audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payout_audit_events ADD CONSTRAINT finance_payout_audit_events_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES finance_payouts(id) ON DELETE CASCADE;\nALTER TABLE public.finance_payout_audit_events ADD CONSTRAINT finance_payout_audit_events_pkey PRIMARY KEY (id);\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_currency_check CHECK ((currency = 'XOF'::text));\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_payout_count_check CHECK ((payout_count >= 0));\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_pkey PRIMARY KEY (id);\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_reference_key UNIQUE (reference);\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'processing'::text, 'partially_succeeded'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])));\nALTER TABLE public.finance_payout_batches ADD CONSTRAINT finance_payout_batches_total_amount_check CHECK ((total_amount >= (0)::numeric));\nALTER TABLE public.finance_payout_beneficiaries ADD CONSTRAINT finance_payout_beneficiaries_beneficiary_type_check CHECK ((beneficiary_type = ANY (ARRAY['employee'::text, 'crm_user'::text, 'provider'::text, 'supplier'::text, 'agent'::text, 'partner'::text, 'other'::text])));\nALTER TABLE public.finance_payout_beneficiaries ADD CONSTRAINT finance_payout_beneficiaries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payout_beneficiaries ADD CONSTRAINT finance_payout_beneficiaries_pkey PRIMARY KEY (id);\nALTER TABLE public.finance_payout_beneficiaries ADD CONSTRAINT finance_payout_beneficiaries_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payout_beneficiaries ADD CONSTRAINT finance_payout_beneficiaries_profile_id_key UNIQUE (profile_id);\nALTER TABLE public.finance_payout_beneficiaries ADD CONSTRAINT finance_payout_beneficiary_name_nonempty CHECK ((length(TRIM(BOTH FROM display_name)) > 0));\nALTER TABLE public.finance_payout_sms_templates ADD CONSTRAINT finance_payout_sms_template_valid CHECK ((((length(TRIM(BOTH FROM content)) >= 1) AND (length(TRIM(BOTH FROM content)) <= 150)) AND (content !~ '[^ -~]'::text)));\nALTER TABLE public.finance_payout_sms_templates ADD CONSTRAINT finance_payout_sms_templates_category_check CHECK ((category = ANY (ARRAY['salary'::text, 'commission'::text, 'remuneration'::text, 'indemnity'::text, 'bonus'::text, 'supplier'::text, 'agricultural_labor'::text, 'partner'::text, 'reimbursement'::text, 'advance'::text, 'other'::text])));\nALTER TABLE public.finance_payout_sms_templates ADD CONSTRAINT finance_payout_sms_templates_category_key UNIQUE (category);\nALTER TABLE public.finance_payout_sms_templates ADD CONSTRAINT finance_payout_sms_templates_max_characters_check CHECK ((max_characters = 150));\nALTER TABLE public.finance_payout_sms_templates ADD CONSTRAINT finance_payout_sms_templates_pkey PRIMARY KEY (id);\nALTER TABLE public.finance_payout_sms_templates ADD CONSTRAINT finance_payout_sms_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_amount_check CHECK ((amount > (0)::numeric));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES finance_payout_batches(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_beneficiary_id_fkey FOREIGN KEY (beneficiary_id) REFERENCES finance_payout_beneficiaries(id) ON DELETE RESTRICT;\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_category_check CHECK ((category = ANY (ARRAY['salary'::text, 'commission'::text, 'remuneration'::text, 'indemnity'::text, 'bonus'::text, 'supplier'::text, 'agricultural_labor'::text, 'partner'::text, 'reimbursement'::text, 'advance'::text, 'other'::text])));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_currency_check CHECK ((currency = 'XOF'::text));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_idempotency_key_key UNIQUE (idempotency_key);\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_notification_status_check CHECK ((notification_status = ANY (ARRAY['not_requested'::text, 'queued'::text, 'sent'::text, 'failed'::text, 'blocked_too_long'::text, 'blocked_missing_phone'::text, 'blocked_external_contact'::text])));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_payment_method_check CHECK ((payment_method = ANY (ARRAY['mobile_money'::text, 'bank_transfer'::text, 'cash'::text, 'cheque'::text, 'other'::text])));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_pkey PRIMARY KEY (id);\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_provider_code_check CHECK ((provider_code = ANY (ARRAY['manual'::text, 'kkiapay_push_up'::text, 'other'::text])));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_provider_fee_check CHECK ((provider_fee >= (0)::numeric));\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_reference_key UNIQUE (reference);\nALTER TABLE public.finance_payouts ADD CONSTRAINT finance_payouts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])));\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_audit_events_pkey ON public.finance_payout_audit_events USING btree (id);\nCREATE INDEX IF NOT EXISTS idx_finance_payout_audit_payout ON public.finance_payout_audit_events USING btree (payout_id, created_at DESC);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_batches_pkey ON public.finance_payout_batches USING btree (id);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_batches_reference_key ON public.finance_payout_batches USING btree (reference);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_beneficiaries_pkey ON public.finance_payout_beneficiaries USING btree (id);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_beneficiaries_profile_id_key ON public.finance_payout_beneficiaries USING btree (profile_id);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_sms_templates_category_key ON public.finance_payout_sms_templates USING btree (category);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payout_sms_templates_pkey ON public.finance_payout_sms_templates USING btree (id);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payouts_idempotency_key_key ON public.finance_payouts USING btree (idempotency_key);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payouts_pkey ON public.finance_payouts USING btree (id);\nCREATE UNIQUE INDEX IF NOT EXISTS finance_payouts_reference_key ON public.finance_payouts USING btree (reference);\nCREATE INDEX IF NOT EXISTS idx_finance_payouts_batch ON public.finance_payouts USING btree (batch_id);\nCREATE INDEX IF NOT EXISTS idx_finance_payouts_beneficiary ON public.finance_payouts USING btree (beneficiary_id, created_at DESC);\nCREATE INDEX IF NOT EXISTS idx_finance_payouts_profile ON public.finance_payouts USING btree (profile_id, created_at DESC);\nCREATE INDEX IF NOT EXISTS idx_finance_payouts_status_created ON public.finance_payouts USING btree (status, created_at DESC);\nCREATE OR REPLACE FUNCTION private.finance_payout_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='INSERT' then
  insert into public.finance_payout_audit_events(payout_id,actor_id,event_type,to_status,details)
  values(new.id,coalesce(auth.uid(),new.created_by),'created',new.status,jsonb_build_object('reference',new.reference,'category',new.category,'amount',new.amount,'beneficiary_id',new.beneficiary_id));
 elsif new.status is distinct from old.status then
  insert into public.finance_payout_audit_events(payout_id,actor_id,event_type,from_status,to_status,details)
  values(new.id,coalesce(auth.uid(),new.approved_by,new.created_by),'status_changed',old.status,new.status,jsonb_build_object('reference',new.reference,'provider_reference',new.provider_reference,'failure_reason',new.failure_reason));
 end if;
 return new;
end; $function$
\nCREATE OR REPLACE FUNCTION private.finance_payout_enqueue_notification()
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
\nCREATE OR REPLACE FUNCTION private.finance_payout_fill_beneficiary()
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
$function$
\nCREATE OR REPLACE FUNCTION private.finance_payout_guard_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare jwt_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
begin
 if new.status is distinct from old.status then
  if old.status in ('succeeded','cancelled') then raise exception 'Un décaissement terminé ne peut plus changer de statut.'; end if;
  if new.status in ('processing','succeeded','failed') and jwt_role<>'service_role' then raise exception 'Seul le service de paiement serveur peut confirmer un transfert réel.'; end if;
  if not ((old.status='draft' and new.status in ('pending_approval','cancelled')) or
    (old.status='pending_approval' and new.status in ('approved','cancelled')) or
    (old.status='approved' and new.status in ('processing','cancelled')) or
    (old.status='processing' and new.status in ('succeeded','failed')) or
    (old.status='failed' and new.status in ('approved','cancelled'))) then
    raise exception 'Transition de statut de décaissement non autorisée (% -> %).',old.status,new.status;
  end if;
 end if;
 return new;
end; $function$
\nCREATE OR REPLACE FUNCTION private.finance_payout_refresh_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  total_count integer;
  succeeded_count integer;
  failed_count integer;
  cancelled_count integer;
  processing_count integer;
  approved_count integer;
  pending_count integer;
  next_status text;
BEGIN
  IF coalesce(new.batch_id,old.batch_id) IS NULL THEN RETURN new; END IF;
  SELECT count(*),
    count(*) FILTER (WHERE status='succeeded'),
    count(*) FILTER (WHERE status='failed'),
    count(*) FILTER (WHERE status='cancelled'),
    count(*) FILTER (WHERE status='processing'),
    count(*) FILTER (WHERE status='approved'),
    count(*) FILTER (WHERE status IN ('pending_approval','draft'))
  INTO total_count,succeeded_count,failed_count,cancelled_count,processing_count,approved_count,pending_count
  FROM public.finance_payouts WHERE batch_id=coalesce(new.batch_id,old.batch_id);

  next_status:=CASE
    WHEN total_count=0 THEN 'draft'
    WHEN succeeded_count=total_count THEN 'succeeded'
    WHEN failed_count=total_count THEN 'failed'
    WHEN cancelled_count=total_count THEN 'cancelled'
    WHEN succeeded_count+failed_count+cancelled_count=total_count AND succeeded_count>0 THEN 'partially_succeeded'
    WHEN processing_count>0 OR succeeded_count>0 THEN 'processing'
    WHEN approved_count>0 THEN 'approved'
    WHEN pending_count>0 THEN 'pending_approval'
    ELSE 'draft'
  END;

  UPDATE public.finance_payout_batches
    SET status=next_status,
        payout_count=total_count,
        total_amount=coalesce((SELECT sum(amount) FROM public.finance_payouts WHERE batch_id=coalesce(new.batch_id,old.batch_id)),0),
        updated_at=now()
    WHERE id=coalesce(new.batch_id,old.batch_id);
  RETURN new;
END;
$function$
\nCREATE OR REPLACE FUNCTION private.finance_payout_sync_sms_template()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare event_name text:='finance_payout_paid_'||new.category;
begin
 update public.notification_automations set nom=new.name,evenement=event_name,canal='sms',sujet='Confirmation de paiement AgriCapital',
 contenu=new.content,criteres=jsonb_build_object('audience','equipe','has_phone',true),conditions='{}'::jsonb,actif=new.active,cooldown_minutes=0,updated_at=now()
 where code='finance_payout_'||new.category;
 if not found then
  insert into public.notification_automations(code,nom,description,evenement,canal,sujet,contenu,criteres,conditions,actif,cooldown_minutes,created_by,updated_by)
  values('finance_payout_'||new.category,new.name,'Notification SMS de confirmation de décaissement AgriCapital',event_name,'sms',
   'Confirmation de paiement AgriCapital',new.content,jsonb_build_object('audience','equipe','has_phone',true),'{}'::jsonb,new.active,0,new.updated_by,new.updated_by);
 end if;
 return new;
end; $function$
\nCREATE OR REPLACE FUNCTION private.finance_payout_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.updated_at:=now(); return new; end; $function$
\nCREATE OR REPLACE FUNCTION public.finance_payout_approve(p_payout_id uuid)
 RETURNS finance_payouts
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result public.finance_payouts;
begin
 if auth.uid() is null or not public.finance_can_manage() then raise exception 'Permission finance.manage requise.'; end if;
 update public.finance_payouts set status='approved',approved_by=auth.uid(),approved_at=now()
 where id=p_payout_id and status='pending_approval' and created_by is distinct from auth.uid() returning * into result;
 if not found then raise exception 'Décaissement introuvable, déjà traité ou auto-validation interdite.'; end if;
 return result;
end; $function$
\nALTER TABLE public.finance_payout_audit_events ENABLE ROW LEVEL SECURITY;\nGRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_payout_audit_events TO authenticated;\nALTER TABLE public.finance_payout_batches ENABLE ROW LEVEL SECURITY;\nGRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_payout_batches TO authenticated;\nALTER TABLE public.finance_payout_beneficiaries ENABLE ROW LEVEL SECURITY;\nGRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_payout_beneficiaries TO authenticated;\nALTER TABLE public.finance_payout_sms_templates ENABLE ROW LEVEL SECURITY;\nGRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_payout_sms_templates TO authenticated;\nALTER TABLE public.finance_payouts ENABLE ROW LEVEL SECURITY;\nGRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_payouts TO authenticated;\nDROP POLICY IF EXISTS finance_payout_audit_select ON public.finance_payout_audit_events;\nCREATE POLICY finance_payout_audit_select ON public.finance_payout_audit_events FOR SELECT TO authenticated USING (finance_can_view());\nDROP POLICY IF EXISTS finance_payout_batches_manage ON public.finance_payout_batches;\nCREATE POLICY finance_payout_batches_manage ON public.finance_payout_batches FOR ALL TO authenticated USING (finance_can_manage()) WITH CHECK (finance_can_manage());\nDROP POLICY IF EXISTS finance_payout_batches_select ON public.finance_payout_batches;\nCREATE POLICY finance_payout_batches_select ON public.finance_payout_batches FOR SELECT TO authenticated USING (finance_can_view());\nDROP POLICY IF EXISTS finance_payout_beneficiaries_manage ON public.finance_payout_beneficiaries;\nCREATE POLICY finance_payout_beneficiaries_manage ON public.finance_payout_beneficiaries FOR ALL TO authenticated USING (finance_can_manage()) WITH CHECK (finance_can_manage());\nDROP POLICY IF EXISTS finance_payout_beneficiaries_select ON public.finance_payout_beneficiaries;\nCREATE POLICY finance_payout_beneficiaries_select ON public.finance_payout_beneficiaries FOR SELECT TO authenticated USING (finance_can_view());\nDROP POLICY IF EXISTS finance_payout_sms_templates_manage ON public.finance_payout_sms_templates;\nCREATE POLICY finance_payout_sms_templates_manage ON public.finance_payout_sms_templates FOR ALL TO authenticated USING (finance_can_manage()) WITH CHECK (finance_can_manage());\nDROP POLICY IF EXISTS finance_payout_sms_templates_select ON public.finance_payout_sms_templates;\nCREATE POLICY finance_payout_sms_templates_select ON public.finance_payout_sms_templates FOR SELECT TO authenticated USING (finance_can_view());\nDROP POLICY IF EXISTS finance_payouts_insert ON public.finance_payouts;\nCREATE POLICY finance_payouts_insert ON public.finance_payouts FOR INSERT TO authenticated WITH CHECK ((finance_can_manage() AND (created_by = ( SELECT auth.uid() AS uid))));\nDROP POLICY IF EXISTS finance_payouts_select ON public.finance_payouts;\nCREATE POLICY finance_payouts_select ON public.finance_payouts FOR SELECT TO authenticated USING (finance_can_view());\nDROP POLICY IF EXISTS finance_payouts_update ON public.finance_payouts;\nCREATE POLICY finance_payouts_update ON public.finance_payouts FOR UPDATE TO authenticated USING (finance_can_manage()) WITH CHECK (finance_can_manage());\nDROP TRIGGER IF EXISTS trg_finance_payout_batches_updated_at ON public.finance_payout_batches;\nCREATE TRIGGER trg_finance_payout_batches_updated_at BEFORE UPDATE ON public.finance_payout_batches FOR EACH ROW EXECUTE FUNCTION private.finance_payout_touch_updated_at();\nDROP TRIGGER IF EXISTS trg_finance_payout_beneficiaries_updated_at ON public.finance_payout_beneficiaries;\nCREATE TRIGGER trg_finance_payout_beneficiaries_updated_at BEFORE UPDATE ON public.finance_payout_beneficiaries FOR EACH ROW EXECUTE FUNCTION private.finance_payout_touch_updated_at();\nDROP TRIGGER IF EXISTS trg_finance_payout_fill_beneficiary ON public.finance_payout_beneficiaries;\nCREATE TRIGGER trg_finance_payout_fill_beneficiary BEFORE INSERT OR UPDATE ON public.finance_payout_beneficiaries FOR EACH ROW EXECUTE FUNCTION private.finance_payout_fill_beneficiary();\nDROP TRIGGER IF EXISTS trg_finance_payout_sms_templates_updated_at ON public.finance_payout_sms_templates;\nCREATE TRIGGER trg_finance_payout_sms_templates_updated_at BEFORE UPDATE ON public.finance_payout_sms_templates FOR EACH ROW EXECUTE FUNCTION private.finance_payout_touch_updated_at();\nDROP TRIGGER IF EXISTS trg_finance_payout_sync_sms_template ON public.finance_payout_sms_templates;\nCREATE TRIGGER trg_finance_payout_sync_sms_template AFTER INSERT OR UPDATE ON public.finance_payout_sms_templates FOR EACH ROW EXECUTE FUNCTION private.finance_payout_sync_sms_template();\nDROP TRIGGER IF EXISTS trg_finance_payout_audit ON public.finance_payouts;\nCREATE TRIGGER trg_finance_payout_audit AFTER INSERT OR UPDATE ON public.finance_payouts FOR EACH ROW EXECUTE FUNCTION private.finance_payout_audit();\nDROP TRIGGER IF EXISTS trg_finance_payout_enqueue_notification ON public.finance_payouts;\nCREATE TRIGGER trg_finance_payout_enqueue_notification AFTER UPDATE OF status ON public.finance_payouts FOR EACH ROW EXECUTE FUNCTION private.finance_payout_enqueue_notification();\nDROP TRIGGER IF EXISTS trg_finance_payout_guard_transition ON public.finance_payouts;\nCREATE TRIGGER trg_finance_payout_guard_transition BEFORE UPDATE OF status ON public.finance_payouts FOR EACH ROW EXECUTE FUNCTION private.finance_payout_guard_transition();\nDROP TRIGGER IF EXISTS trg_finance_payout_refresh_batch ON public.finance_payouts;\nCREATE TRIGGER trg_finance_payout_refresh_batch AFTER INSERT OR UPDATE OF status ON public.finance_payouts FOR EACH ROW EXECUTE FUNCTION private.finance_payout_refresh_batch();\nDROP TRIGGER IF EXISTS trg_finance_payouts_updated_at ON public.finance_payouts;\nCREATE TRIGGER trg_finance_payouts_updated_at BEFORE UPDATE ON public.finance_payouts FOR EACH ROW EXECUTE FUNCTION private.finance_payout_touch_updated_at();\nINSERT INTO public.finance_payout_sms_templates(category,name,content,active,max_characters) VALUES\n('advance','Confirmation avance','AgriCapital : Bonjour {dernierprenom_nom}, votre avance de {montant} FCFA a ete versee. Merci.',true,150),\n('agricultural_labor','Paiement prestation agricole','AgriCapital : Bonjour {dernierprenom_nom}, votre prestation de {montant} FCFA a ete reglee. Merci.',true,150),\n('bonus','Confirmation de prime','AgriCapital : Bonjour {dernierprenom_nom}, votre prime de {montant} FCFA a ete versee. Merci.',true,150),\n('commission','Confirmation de commission','AgriCapital : Bonjour {dernierprenom_nom}, votre commission de {montant} FCFA a ete payee. Merci.',true,150),\n('indemnity','Confirmation d indemnite','AgriCapital : Bonjour {dernierprenom_nom}, votre indemnite de {montant} FCFA a ete versee. Merci.',true,150),\n('other','Confirmation de paiement','AgriCapital : Bonjour {dernierprenom_nom}, votre paiement de {montant} FCFA a ete effectue. Merci.',true,150),\n('partner','Confirmation partenaire','AgriCapital : Bonjour {dernierprenom_nom}, votre paiement de {montant} FCFA a ete effectue. Merci.',true,150),\n('reimbursement','Confirmation remboursement','AgriCapital : Bonjour {dernierprenom_nom}, votre remboursement de {montant} FCFA a ete effectue. Merci.',true,150),\n('remuneration','Confirmation de remuneration','AgriCapital : Bonjour {dernierprenom_nom}, votre remuneration de {montant} FCFA a ete reglee. Merci.',true,150),\n('salary','Confirmation de salaire','AgriCapital : Bonjour {dernierprenom_nom}, votre salaire de {montant} FCFA a ete verse. Merci.',true,150),\n('supplier','Confirmation fournisseur','AgriCapital : Bonjour {dernierprenom_nom}, votre paiement de {montant} FCFA a ete effectue. Merci.',true,150)\nON CONFLICT(category) DO UPDATE SET name=excluded.name,content=excluded.content,active=excluded.active,max_characters=excluded.max_characters,updated_at=now();\nREVOKE ALL ON FUNCTION public.finance_payout_approve(uuid) FROM PUBLIC,anon;\nGRANT EXECUTE ON FUNCTION public.finance_payout_approve(uuid) TO authenticated;\n