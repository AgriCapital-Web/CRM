CREATE OR REPLACE FUNCTION private.finance_payout_sync_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_method text;
  v_item public.finance_payroll_items;
  v_commission public.commissions;
  v_expense public.finance_expenses;
  v_versement public.portefeuille_versements;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_paid numeric;
  v_remaining numeric;
  v_status text;
  v_alloc_remaining numeric;
  v_line record;
  v_alloc numeric;
  v_profile_id uuid;
BEGIN
  IF new.status <> 'succeeded' OR old.status = 'succeeded' THEN RETURN new; END IF;
  v_method := CASE new.payment_method WHEN 'bank_transfer' THEN 'virement' WHEN 'cash' THEN 'especes' WHEN 'other' THEN 'autre' ELSE new.payment_method END;
  IF new.source_kind IS NULL THEN
    INSERT INTO public.finance_transactions(direction,category,label,amount,transaction_date,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by)
    VALUES(
      'sortie',
      CASE new.category WHEN 'salary' THEN 'SALAIRES' WHEN 'commission' THEN 'COMMISSIONS'
        WHEN 'supplier' THEN 'FOURNISSEURS' WHEN 'refund' THEN 'REMBOURSEMENTS'
        WHEN 'reimbursement' THEN 'REMBOURSEMENTS' WHEN 'indemnity' THEN 'INDEMNITES'
        WHEN 'bonus' THEN 'PRIMES' ELSE upper(new.category) END,
      new.reason,new.amount,coalesce(new.paid_at,now()),v_method,new.provider_reference,new.profile_id,
      'finance_payout',new.id,'valide','Décaissement AgriCapital PAY '||new.reference||' — '||new.reason,auth.uid()
    ) RETURNING id INTO v_transaction_id;
    UPDATE public.finance_payouts
      SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source_transaction_id',v_transaction_id,'source_synced_at',now(),'source_kind',null,'source_id',null)
      WHERE id=new.id;
    RETURN new;
  END IF;

  CASE new.source_kind
    WHEN 'payroll_item' THEN
      SELECT * INTO v_item FROM public.finance_payroll_items WHERE id=new.source_id FOR UPDATE;
      IF NOT FOUND OR v_item.profile_id IS DISTINCT FROM new.profile_id THEN RAISE EXCEPTION 'Ligne de paie introuvable ou bénéficiaire différent.'; END IF;
      IF v_item.status<>'valide' OR v_item.transaction_id IS NOT NULL THEN RAISE EXCEPTION 'La ligne de paie doit être validée et non encore payée.'; END IF;
      IF abs(coalesce(v_item.net_salary,0)-new.amount)>0.01 THEN RAISE EXCEPTION 'Le montant doit correspondre au net de la ligne de paie.'; END IF;
      UPDATE public.finance_payroll_items SET status='paye',net_salary=new.amount WHERE id=new.source_id;
      SELECT transaction_id INTO v_transaction_id FROM public.finance_payroll_items WHERE id=new.source_id;
      IF NOT EXISTS(SELECT 1 FROM public.finance_payroll_items WHERE payroll_run_id=v_item.payroll_run_id AND status<>'paye') THEN
        UPDATE public.finance_payroll_runs SET status='paye',paid_at=now(),payment_method=v_method,payment_reference=new.provider_reference WHERE id=v_item.payroll_run_id;
      END IF;

    WHEN 'commission' THEN
      SELECT * INTO v_commission FROM public.commissions WHERE id=new.source_id FOR UPDATE;
      IF NOT FOUND OR v_commission.profile_id IS DISTINCT FROM new.profile_id THEN RAISE EXCEPTION 'Commission introuvable ou bénéficiaire différent.'; END IF;
      IF v_commission.statut<>'validee' OR coalesce(v_commission.montant_commission,0)<=0 THEN RAISE EXCEPTION 'Seule une commission validée et positive peut être payée.'; END IF;
      IF abs(v_commission.montant_commission-new.amount)>0.01 THEN RAISE EXCEPTION 'Le montant doit correspondre au montant de la commission.'; END IF;
      IF EXISTS(SELECT 1 FROM public.commission_payment_allocations WHERE commission_id=new.source_id) THEN
        RAISE EXCEPTION 'Cette commission est déjà affectée à un versement groupé. Utilisez le versement groupé.';
      END IF;
      UPDATE public.commissions SET statut='payee' WHERE id=new.source_id;
      SELECT id INTO v_transaction_id FROM public.finance_transactions WHERE source_type='commission' AND source_id=new.source_id LIMIT 1;

    WHEN 'commission_payout' THEN
      SELECT * INTO v_versement FROM public.portefeuille_versements WHERE id=new.source_id FOR UPDATE;
      IF NOT FOUND OR v_versement.statut NOT IN ('valide','partiellement_paye') THEN RAISE EXCEPTION 'Le versement de commissions doit être validé et non soldé.'; END IF;
      IF v_versement.profile_id IS DISTINCT FROM new.profile_id THEN RAISE EXCEPTION 'Le bénéficiaire ne correspond pas au versement de commissions.'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.portefeuille_versement_lignes WHERE versement_id=new.source_id) THEN RAISE EXCEPTION 'Aucune commission n’est rattachée à ce versement.'; END IF;
      IF EXISTS (
        SELECT 1 FROM public.portefeuille_versement_lignes l JOIN public.commissions c ON c.id=l.commission_id
        WHERE l.versement_id=new.source_id AND (c.profile_id IS DISTINCT FROM v_versement.profile_id OR c.statut NOT IN ('validee','payee'))
      ) THEN RAISE EXCEPTION 'Au moins une commission n’est pas validée ou appartient à un autre collaborateur.'; END IF;
      v_remaining:=greatest(0,coalesce(v_versement.montant_brut,0)-coalesce(v_versement.montant_paye,0));
      IF new.amount<=0 OR new.amount>v_remaining+0.01 THEN RAISE EXCEPTION 'Le montant dépasse le solde restant du versement (%).',v_remaining; END IF;
      v_payment_id:=gen_random_uuid();
      INSERT INTO public.portefeuille_versement_paiements(id,versement_id,montant,mode_paiement,reference,created_by)
      VALUES(v_payment_id,new.source_id,new.amount,v_method,new.provider_reference,auth.uid());
      INSERT INTO public.finance_transactions(
        direction,category,label,amount,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by
      ) VALUES(
        'sortie','COMMISSIONS','Commissions — '||coalesce((SELECT nom_complet FROM public.profiles WHERE id=v_versement.profile_id),'Collaborateur'),
        new.amount,v_method,new.provider_reference,v_versement.profile_id,'commission_payout_payment',v_payment_id,'valide',
        'Paiement AgriCapital PAY du versement de commissions '||new.source_id::text,auth.uid()
      ) RETURNING id INTO v_transaction_id;

      v_alloc_remaining:=new.amount;
      FOR v_line IN
        SELECT l.commission_id,l.montant,
          greatest(0,l.montant-coalesce((SELECT sum(a.amount) FROM public.commission_payment_allocations a WHERE a.commission_id=l.commission_id),0)) AS remaining
        FROM public.portefeuille_versement_lignes l
        JOIN public.commissions c ON c.id=l.commission_id
        WHERE l.versement_id=new.source_id
        ORDER BY l.created_at,l.commission_id
      LOOP
        EXIT WHEN v_alloc_remaining<=0.01;
        v_alloc:=least(v_alloc_remaining,v_line.remaining);
        IF v_alloc>0 THEN
          INSERT INTO public.commission_payment_allocations(transaction_id,commission_id,amount)
          VALUES(v_transaction_id,v_line.commission_id,v_alloc);
          v_alloc_remaining:=v_alloc_remaining-v_alloc;
        END IF;
      END LOOP;
      IF v_alloc_remaining>0.01 THEN RAISE EXCEPTION 'Le montant du paiement ne peut pas être affecté aux commissions restantes.'; END IF;

      v_paid:=coalesce(v_versement.montant_paye,0)+new.amount;
      v_status:=CASE WHEN v_paid+0.01>=coalesce(v_versement.montant_brut,0) THEN 'paye' ELSE 'partiellement_paye' END;
      v_profile_id:=public.workspace_current_profile_id();
      UPDATE public.portefeuille_versements SET statut=v_status,montant_paye=v_paid,mode_paiement=v_method,
        reference=new.provider_reference,paye_par=v_profile_id,date_paiement=now(),updated_at=now()
      WHERE id=new.source_id;
      IF v_status='paye' THEN
        UPDATE public.commissions c SET statut='payee'
        WHERE c.id IN (SELECT l.commission_id FROM public.portefeuille_versement_lignes l WHERE l.versement_id=new.source_id)
          AND coalesce((SELECT sum(a.amount) FROM public.commission_payment_allocations a WHERE a.commission_id=c.id),0)+0.01>=c.montant_commission;
      END IF;
      PERFORM public.recalculer_portefeuilles_commissions();

    WHEN 'finance_expense' THEN
      SELECT * INTO v_expense FROM public.finance_expenses WHERE id=new.source_id FOR UPDATE;
      IF NOT FOUND OR v_expense.profile_id IS DISTINCT FROM new.profile_id THEN RAISE EXCEPTION 'Dépense à payer introuvable ou bénéficiaire différent.'; END IF;
      IF v_expense.status NOT IN ('unpaid','partial') THEN RAISE EXCEPTION 'La dépense n’est plus payable.'; END IF;
      v_remaining:=greatest(0,coalesce(v_expense.total_amount,0)-coalesce(v_expense.paid_amount,0));
      IF v_remaining<=0 OR new.amount>v_remaining+0.01 THEN RAISE EXCEPTION 'Le montant dépasse le solde restant de la dépense (%).',v_remaining; END IF;
      v_payment_id:=gen_random_uuid();
      INSERT INTO public.finance_transactions(
        id,direction,category,label,amount,transaction_date,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by
      ) VALUES(
        gen_random_uuid(),'sortie',v_expense.expense_category,
        coalesce(nullif(v_expense.description,''),v_expense.expense_category)||' — '||coalesce(v_expense.beneficiary_name,v_expense.supplier_name,'Bénéficiaire'),
        new.amount,coalesce(new.paid_at,now()),v_method,new.provider_reference,v_expense.profile_id,
        'finance_expense_payment',v_payment_id,'valide',
        coalesce(v_expense.description,'Paiement de dépense')||' · Référence AgriCapital PAY '||new.reference,auth.uid()
      ) RETURNING id INTO v_transaction_id;
      INSERT INTO public.finance_expense_payments(id,expense_id,transaction_id,amount,paid_at,payment_method,created_by)
      VALUES(v_payment_id,new.source_id,v_transaction_id,new.amount,coalesce(new.paid_at,now()),v_method,auth.uid());
      v_paid:=coalesce(v_expense.paid_amount,0)+new.amount;
      v_status:=CASE WHEN v_paid+0.01>=coalesce(v_expense.total_amount,0) THEN 'paid' ELSE 'partial' END;
      UPDATE public.finance_expenses SET paid_amount=v_paid,status=v_status,transaction_id=v_transaction_id,payment_method=v_method WHERE id=new.source_id;

    ELSE
      RAISE EXCEPTION 'Type de source de décaissement non pris en charge : %.',new.source_kind;
  END CASE;

  UPDATE public.finance_payouts
    SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source_transaction_id',v_transaction_id,'source_synced_at',now(),'source_kind',new.source_kind,'source_id',new.source_id)
    WHERE id=new.id;
  RETURN new;
END;
$function$

