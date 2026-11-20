begin;

CREATE OR REPLACE FUNCTION private.crm_can_manage_commission_payout(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user_id is not null and (
    private.crm_is_global_admin(p_user_id)
    or private.crm_user_has_role_permission(p_user_id,'commissions.manage_payouts')
    or private.crm_user_has_role_permission(p_user_id,'commissions.validate')
    or private.crm_user_has_role_permission(p_user_id,'finance.payouts')
  );
$function$


CREATE OR REPLACE FUNCTION public.decision_center_can_read_proposal(p_target_user_id uuid, p_target_role_code text, p_scope text, p_department text, p_region uuid, p_district uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
 select public.decision_center_is_pdg()
 or (p_target_user_id is not null and p_target_user_id <> auth.uid()
   and lower(coalesce(p_target_role_code,'')) not in ('dg','directeur_general','directeur général')
   and public.can_access_decision_center('view')
   and (p_scope = 'targeted'
     or (p_scope = 'department' and p_department is not null and exists(select 1 from public.profiles me where me.user_id=auth.uid() and me.departement=p_department))
     or (p_scope = 'team' and p_region is not null and exists(select 1 from public.profiles me where me.user_id=auth.uid() and me.region_id=p_region))
     or (p_scope = 'national' and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('manager_commercial_national','mcn','manager_technique_national','mtn','ressources_humaines')))
   )
 );
$function$


CREATE OR REPLACE FUNCTION public.finance_can_manage()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.expenses')
    or private.crm_has_role_permission('finance.associates');
$function$


CREATE OR REPLACE FUNCTION public.finance_generate_commission_payouts(p_period_start date, p_period_end date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_group record;
  v_versement_id uuid;
  v_count integer := 0;
  v_line_count integer;
begin
  if not private.crm_can_manage_commission_payout(auth.uid()) then raise exception 'Vous n’êtes pas autorisé à générer les versements de commissions.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Période de versement invalide.'; end if;
  if exists (
    select 1 from public.portefeuille_versements
    where periode_debut = p_period_start and periode_fin = p_period_end and statut <> 'brouillon'
  ) then
    raise exception 'Cette période contient déjà un versement validé ou payé. Elle ne peut pas être régénérée.';
  end if;

  delete from public.portefeuille_versement_lignes
  where versement_id in (
    select id from public.portefeuille_versements
    where periode_debut = p_period_start and periode_fin = p_period_end and statut = 'brouillon'
  );
  delete from public.portefeuille_versements
  where periode_debut = p_period_start and periode_fin = p_period_end and statut = 'brouillon';

  for v_group in
    select c.profile_id, sum(coalesce(c.montant_commission,0)) as montant
    from public.commissions c
    where c.profile_id is not null
      and c.periode between p_period_start and p_period_end
      and c.statut in ('calculee','validee')
      and not exists (
        select 1 from public.portefeuille_versement_lignes l
        where l.commission_id = c.id
      )
    group by c.profile_id
    having sum(coalesce(c.montant_commission,0)) > 0
  loop
    insert into public.portefeuille_versements(
      profile_id,periode_debut,periode_fin,montant_brut,montant_paye,statut,created_by,updated_at
    ) values (
      v_group.profile_id,p_period_start,p_period_end,v_group.montant,0,'brouillon',auth.uid(),now()
    ) returning id into v_versement_id;

    insert into public.portefeuille_versement_lignes(versement_id,commission_id,montant)
    select v_versement_id,c.id,coalesce(c.montant_commission,0)
    from public.commissions c
    where c.profile_id = v_group.profile_id
      and c.periode between p_period_start and p_period_end
      and c.statut in ('calculee','validee')
      and not exists (select 1 from public.portefeuille_versement_lignes l where l.commission_id = c.id);
    get diagnostics v_line_count = row_count;
    if v_line_count = 0 then raise exception 'Aucune commission admissible n’a pu être rattachée au versement.'; end if;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Aucune commission admissible non déjà rattachée à un versement pour cette période.'; end if;
  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.finance_mark_commission_payout_paid(p_versement_id uuid, p_mode_paiement text, p_reference text, p_preuve_paiement_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payout public.portefeuille_versements%rowtype;
  v_profile_id uuid;
  v_name text;
  v_transaction_id uuid;
  v_lines integer;
begin
  if not private.crm_can_manage_commission_payout(auth.uid()) then raise exception 'Vous n’êtes pas autorisé à enregistrer les paiements de commissions.'; end if;
  if p_mode_paiement not in ('virement','mobile_money','especes','cheque','autre') then raise exception 'Mode de paiement invalide.'; end if;
  if p_mode_paiement <> 'especes' and coalesce(trim(p_reference),'') = '' then raise exception 'La référence réelle du paiement est obligatoire.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  select * into v_payout from public.portefeuille_versements where id = p_versement_id for update;
  if not found or v_payout.statut <> 'valide' then raise exception 'Le versement doit être validé avant paiement.'; end if;
  if coalesce(v_payout.montant_brut,0) <= 0 then raise exception 'Le montant du versement doit être positif.'; end if;
  select count(*) into v_lines from public.portefeuille_versement_lignes where versement_id = p_versement_id;
  if v_lines = 0 then raise exception 'Aucune commission n’est rattachée à ce versement.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l
    join public.commissions c on c.id = l.commission_id
    where l.versement_id = p_versement_id
      and (c.profile_id <> v_payout.profile_id or c.statut <> 'validee')
  ) then raise exception 'Au moins une commission n’est pas validée ou appartient à un autre collaborateur.'; end if;
  if exists (select 1 from public.finance_transactions where source_type='commission_payout' and source_id=p_versement_id) then
    raise exception 'Une écriture financière existe déjà pour ce versement. Vérification requise.';
  end if;
  select nom_complet into v_name from public.profiles where id = v_payout.profile_id;

  insert into public.finance_transactions(
    direction,category,label,amount,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by
  ) values (
    'sortie','COMMISSIONS','Commissions — ' || coalesce(v_name,'Collaborateur'),v_payout.montant_brut,
    p_mode_paiement,nullif(trim(p_reference),''),v_payout.profile_id,'commission_payout',v_payout.id,'valide',
    case when coalesce(trim(p_preuve_paiement_url),'') <> '' then 'Justificatif : ' || p_preuve_paiement_url else 'Versement de commissions' end,
    auth.uid()
  ) returning id into v_transaction_id;

  update public.commissions c set statut = 'payee'
  where c.id in (select l.commission_id from public.portefeuille_versement_lignes l where l.versement_id = p_versement_id);
  update public.portefeuille_versements
  set statut = 'paye', paye_par = v_profile_id, date_paiement = now(),
      montant_paye = montant_brut, mode_paiement = p_mode_paiement,
      reference = nullif(trim(p_reference),''), preuve_paiement_url = nullif(trim(p_preuve_paiement_url),''),
      updated_at = now()
  where id = p_versement_id;

  perform public.recalculer_portefeuilles_commissions();
end;
$function$


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
  IF auth.uid() IS NULL OR NOT public.workspace_can_manage_finance() THEN RAISE EXCEPTION 'Permission finance.manage requise.'; END IF;
  IF p_provider_code NOT IN ('manual','other','kkiapay_push_up') THEN RAISE EXCEPTION 'Le lot de paie Push Up ne peut pas être envoyé en API avant validation officielle.'; END IF;
  IF p_provider_code='kkiapay_push_up' AND p_payment_method NOT IN ('mobile_money','bank_transfer') THEN RAISE EXCEPTION 'Push Up accepte uniquement Mobile Money ou virement bancaire.'; END IF;
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


CREATE OR REPLACE FUNCTION public.finance_record_commission_payment(p_profile_id uuid, p_commission_ids uuid[], p_amount numeric, p_payment_date date, p_payment_method text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_remaining numeric := p_amount;
  v_comm record;
  v_paid numeric;
  v_due numeric;
  v_alloc numeric;
  v_profile_name text;
  v_allocated_count integer := 0;
BEGIN
  IF NOT private.crm_can_manage_commission_payout(auth.uid()) THEN RAISE EXCEPTION 'Permission financière requise'; END IF;
  IF p_profile_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_payment_date IS NULL
     OR coalesce(array_length(p_commission_ids,1),0)=0 THEN
    RAISE EXCEPTION 'Collaborateur, commissions, montant et date sont obligatoires';
  END IF;

  SELECT nom_complet INTO v_profile_name FROM public.profiles WHERE id=p_profile_id;
  INSERT INTO public.finance_transactions
    (transaction_date,direction,category,label,amount,payment_method,reference,profile_id,source_type,status,notes)
  VALUES
    (p_payment_date,'sortie','COMMISSION','PAIEMENT COMMISSIONS — '||coalesce(v_profile_name,'Collaborateur'),
     p_amount,p_payment_method,nullif(trim(coalesce(p_reference,'')),''),p_profile_id,
     'commission_payout','valide',
     'Paiement de commissions lié aux lignes sélectionnées.')
  RETURNING id INTO v_transaction_id;

  FOR v_comm IN
    SELECT c.id,c.montant_commission,c.statut
    FROM public.commissions c
    WHERE c.id=ANY(p_commission_ids)
      AND c.profile_id=p_profile_id
      AND c.statut IN ('validee','payee')
    ORDER BY c.periode,c.created_at,c.id
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(a.amount),0) INTO v_paid
    FROM public.commission_payment_allocations a WHERE a.commission_id=v_comm.id;
    IF v_comm.statut='payee' AND v_paid=0 THEN v_paid:=v_comm.montant_commission; END IF;
    v_due:=greatest(0,coalesce(v_comm.montant_commission,0)-v_paid);
    v_alloc:=least(v_due,v_remaining);
    IF v_alloc>0 THEN
      INSERT INTO public.commission_payment_allocations(commission_id,transaction_id,amount)
      VALUES(v_comm.id,v_transaction_id,v_alloc);
      v_remaining:=v_remaining-v_alloc;
      v_allocated_count:=v_allocated_count+1;
    END IF;
  END LOOP;

  IF v_allocated_count=0 OR v_remaining>0.005 THEN
    RAISE EXCEPTION 'Le montant dépasse le solde des commissions sélectionnées ou aucune ligne payable n’a été sélectionnée';
  END IF;

  INSERT INTO public.finance_expenses
    (transaction_id,expense_category,supplier_name,description,profile_id,is_direct_cost)
  VALUES
    (v_transaction_id,'PRESTATIONS',coalesce(v_profile_name,'Collaborateur'),
     'Paiement de commissions — '||coalesce(v_profile_name,'Collaborateur')||
     CASE WHEN nullif(trim(coalesce(p_reference,'')),'') IS NOT NULL THEN ' — Réf. '||trim(p_reference) ELSE '' END,
     p_profile_id,true)
  ON CONFLICT (transaction_id) DO NOTHING;

  UPDATE public.commissions c SET statut='payee'
  WHERE c.id=ANY(p_commission_ids)
    AND c.profile_id=p_profile_id
    AND c.statut <> 'payee'
    AND (SELECT coalesce(sum(a.amount),0) FROM public.commission_payment_allocations a WHERE a.commission_id=c.id)
        >= c.montant_commission;

  RETURN v_transaction_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.finance_record_commission_payout_payment(p_versement_id uuid, p_montant numeric, p_mode_paiement text, p_reference text, p_preuve_paiement_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payout public.portefeuille_versements%rowtype;
  v_profile_id uuid;
  v_name text;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_remaining numeric;
  v_paid numeric;
  v_status text;
begin
  if not private.crm_can_manage_commission_payout(auth.uid()) then raise exception 'Vous n’êtes pas autorisé à enregistrer les paiements de commissions.' using errcode='42501'; end if;
  if p_mode_paiement not in ('virement','mobile_money','especes','cheque','autre') then raise exception 'Mode de paiement invalide.'; end if;
  if p_mode_paiement <> 'especes' and coalesce(trim(p_reference),'') = '' then raise exception 'La référence réelle du paiement est obligatoire.'; end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Le montant payé doit être positif.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  select * into v_payout from public.portefeuille_versements where id=p_versement_id for update;
  if not found or v_payout.statut not in ('valide','partiellement_paye') then raise exception 'Le versement doit être validé et ne doit pas être soldé.'; end if;
  v_remaining := greatest(0,coalesce(v_payout.montant_brut,0)-coalesce(v_payout.montant_paye,0));
  if p_montant > v_remaining then raise exception 'Le montant dépasse le solde restant de %.',v_remaining; end if;
  if not exists(select 1 from public.portefeuille_versement_lignes where versement_id=p_versement_id) then raise exception 'Aucune commission n’est rattachée à ce versement.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l join public.commissions c on c.id=l.commission_id
    where l.versement_id=p_versement_id and (c.profile_id is distinct from v_payout.profile_id or c.statut not in ('validee','payee'))
  ) then raise exception 'Au moins une commission n’est pas validée ou appartient à un autre collaborateur.'; end if;
  insert into public.portefeuille_versement_paiements(versement_id,montant,mode_paiement,reference,preuve_paiement_url,created_by)
  values(p_versement_id,p_montant,p_mode_paiement,nullif(trim(p_reference),''),nullif(trim(p_preuve_paiement_url),''),auth.uid())
  returning id into v_payment_id;
  select nom_complet into v_name from public.profiles where id=v_payout.profile_id;
  insert into public.finance_transactions(direction,category,label,amount,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by)
  values('sortie','COMMISSIONS','Commissions — '||coalesce(v_name,'Collaborateur'),p_montant,p_mode_paiement,
    nullif(trim(p_reference),''),v_payout.profile_id,'commission_payout_payment',v_payment_id,'valide',
    'Paiement de commissions, versement '||p_versement_id::text||case when nullif(trim(p_preuve_paiement_url),'') is not null then '. Justificatif : '||p_preuve_paiement_url else '' end,
    auth.uid()) returning id into v_transaction_id;
  v_paid := coalesce(v_payout.montant_paye,0)+p_montant;
  v_status := case when v_paid >= coalesce(v_payout.montant_brut,0) then 'paye' else 'partiellement_paye' end;
  update public.portefeuille_versements set statut=v_status,montant_paye=v_paid,
    mode_paiement=p_mode_paiement,reference=nullif(trim(p_reference),''),preuve_paiement_url=nullif(trim(p_preuve_paiement_url),''),
    paye_par=v_profile_id,date_paiement=now(),updated_at=now()
  where id=p_versement_id;
  if v_status='paye' then
    update public.commissions c set statut='payee'
    where c.id in (select l.commission_id from public.portefeuille_versement_lignes l where l.versement_id=p_versement_id);
  end if;
  perform public.recalculer_portefeuilles_commissions();
  return jsonb_build_object('versement_id',p_versement_id,'paiement_id',v_payment_id,'transaction_id',v_transaction_id,
    'montant_paye',v_paid,'solde_restant',greatest(0,coalesce(v_payout.montant_brut,0)-v_paid),'statut',v_status);
end $function$


CREATE OR REPLACE FUNCTION public.finance_validate_commission_payout(p_versement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payout public.portefeuille_versements%rowtype;
  v_profile_id uuid;
  v_lines integer;
begin
  if not private.crm_can_manage_commission_payout(auth.uid()) then raise exception 'Vous n’êtes pas autorisé à valider les commissions.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  select * into v_payout from public.portefeuille_versements where id = p_versement_id for update;
  if not found or v_payout.statut <> 'brouillon' then raise exception 'Le versement est introuvable ou n’est plus un brouillon.'; end if;
  select count(*) into v_lines from public.portefeuille_versement_lignes where versement_id = p_versement_id;
  if v_lines = 0 then raise exception 'Impossible de valider un versement sans lignes de commissions.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l
    join public.commissions c on c.id = l.commission_id
    where l.versement_id = p_versement_id
      and (c.profile_id <> v_payout.profile_id or c.statut not in ('calculee','validee'))
  ) then raise exception 'Au moins une commission n’est plus admissible ou appartient à un autre collaborateur.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l
    join public.portefeuille_versement_lignes other_l on other_l.commission_id = l.commission_id and other_l.versement_id <> l.versement_id
    where l.versement_id = p_versement_id
  ) then raise exception 'Une commission est déjà rattachée à un autre versement.'; end if;

  update public.commissions c
  set statut = 'validee', valide_par = v_profile_id, date_validation = now()
  where c.id in (select l.commission_id from public.portefeuille_versement_lignes l where l.versement_id = p_versement_id);
  update public.portefeuille_versements
  set statut = 'valide', valide_par = v_profile_id, date_validation = now(), updated_at = now()
  where id = p_versement_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.workspace_can_manage_finance()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.payroll')
    or private.crm_has_role_permission('ressources_humaines.manage_payroll');
$function$


CREATE OR REPLACE FUNCTION public.workspace_validate_commission(p_commission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_profile_id uuid;
begin
  if not private.crm_can_manage_commission_payout(auth.uid()) then raise exception 'Vous n’êtes pas autorisé à valider les commissions.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  if v_profile_id is null then raise exception 'Profil CRM actif introuvable.'; end if;
  update public.commissions
  set statut = 'validee', valide_par = v_profile_id, date_validation = now()
  where id = p_commission_id and statut in ('calculee','en_attente') and paiement_id is null;
  if not found then raise exception 'Commission introuvable, déjà traitée ou non éligible à la validation.'; end if;
end;
$function$


drop policy if exists "Technicians insert submitted visible reports v2" on public.rapports_visites_techniques;
create policy technicians_submit_visible_reports_in_scope
  on public.rapports_visites_techniques for insert to authenticated
  with check (
    private.crm_has_role_permission('rapports.view_technique')
    and private.crm_has_role_permission('plantations.update')
    and lower(coalesce(statut,'')) = any(array['soumis','submitted','published','publie','publié'])
    and client_visible=true
    and exists (select 1 from public.profiles p where p.id=rapports_visites_techniques.created_by and p.user_id=(select auth.uid()))
    and (
      (client_id is not null and private.can_access_client((select auth.uid()),client_id))
      or (plantation_id is not null and exists (
        select 1 from public.plantations pl where pl.id=rapports_visites_techniques.plantation_id
          and (private.can_access_client((select auth.uid()),pl.client_id) or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))
      ))
    )
  );

notify pgrst, 'reload schema';
commit;