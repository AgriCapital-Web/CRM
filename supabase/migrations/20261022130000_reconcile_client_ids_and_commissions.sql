
-- Client identifiers: separate commercial clients from individual beneficiaries.
CREATE OR REPLACE FUNCTION public.generate_client_id()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agricapital.clients.id_unique.AC_C'));
  SELECT COALESCE(MAX(substring(id_unique FROM '^AC_C([0-9]+)$')::bigint), 0) + 1
    INTO v_next FROM public.clients WHERE id_unique ~ '^AC_C[0-9]+$';
  RETURN 'AC_C' || lpad(v_next::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_client_id(p_type_client text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_next bigint; v_prefix text;
BEGIN
  v_prefix := CASE WHEN lower(coalesce(p_type_client,'')) = 'beneficiaire_particulier' THEN 'AC_B' ELSE 'AC_C' END;
  PERFORM pg_advisory_xact_lock(hashtext('agricapital.clients.id_unique.' || v_prefix));
  SELECT COALESCE(MAX(substring(id_unique FROM ('^' || v_prefix || '([0-9]+)$'))::bigint), 0) + 1
    INTO v_next FROM public.clients WHERE id_unique ~ ('^' || v_prefix || '[0-9]+$');
  RETURN v_prefix || lpad(v_next::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_generated_ids()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'clients' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    IF coalesce(NEW.is_internal,false) OR lower(coalesce(NEW.nom_complet,NEW.nom,'')) LIKE '%agricapital%' THEN
      NEW.id_unique := 'AC-INTERNAL';
    ELSE
      NEW.id_unique := public.generate_client_id(NEW.type_client);
    END IF;
  ELSIF TG_TABLE_NAME = 'plantations' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    NEW.id_unique := public.generate_plantation_id();
  ELSIF TG_TABLE_NAME = 'parcelles' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    NEW.id_unique := public.generate_parcelle_id();
  ELSIF TG_TABLE_NAME = 'proprietaires_terres' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    NEW.id_unique := public.generate_proprietaire_id();
  END IF;
  RETURN NEW;
END;
$function$;

-- Move current identifiers out of the old namespace before assigning canonical IDs.
UPDATE public.clients
SET id_unique = CASE
  WHEN lower(coalesce(type_client,'')) = 'beneficiaire_particulier' AND nom_complet ILIKE '%EMMANUEL%' THEN 'AC_B000001'
  WHEN lower(coalesce(type_client,'')) = 'beneficiaire_particulier' AND nom_complet ILIKE '%ZAGBLE%' THEN 'AC_B000002'
  WHEN nom_complet ILIKE '%VANIE BI BERTIN%' THEN 'AC_C000001'
  WHEN nom_complet ILIKE '%DADEGOULEHE DARIUS%' THEN 'AC_C000002'
  WHEN nom_complet ILIKE '%TIONON MADOU%' THEN 'AC_C000003'
  WHEN nom_complet ILIKE '%KOUAKOU KOUAME FERDINAND%' THEN 'AC_C000004'
  WHEN nom_complet ILIKE '%KOUAKOU KONAN DONALD%' THEN 'AC_C000005'
  WHEN nom_complet ILIKE '%YAO KOUAKOU GUY LAURENT%' THEN 'AC_C000006'
  WHEN coalesce(is_internal,false) OR nom_complet ILIKE '%AgriCapital%' THEN 'AC-INTERNAL'
  ELSE id_unique
END
WHERE id_unique IS DISTINCT FROM CASE
  WHEN lower(coalesce(type_client,'')) = 'beneficiaire_particulier' AND nom_complet ILIKE '%EMMANUEL%' THEN 'AC_B000001'
  WHEN lower(coalesce(type_client,'')) = 'beneficiaire_particulier' AND nom_complet ILIKE '%ZAGBLE%' THEN 'AC_B000002'
  WHEN nom_complet ILIKE '%VANIE BI BERTIN%' THEN 'AC_C000001'
  WHEN nom_complet ILIKE '%DADEGOULEHE DARIUS%' THEN 'AC_C000002'
  WHEN nom_complet ILIKE '%TIONON MADOU%' THEN 'AC_C000003'
  WHEN nom_complet ILIKE '%KOUAKOU KOUAME FERDINAND%' THEN 'AC_C000004'
  WHEN nom_complet ILIKE '%KOUAKOU KONAN DONALD%' THEN 'AC_C000005'
  WHEN nom_complet ILIKE '%YAO KOUAKOU GUY LAURENT%' THEN 'AC_C000006'
  WHEN coalesce(is_internal,false) OR nom_complet ILIKE '%AgriCapital%' THEN 'AC-INTERNAL'
  ELSE id_unique
END;

-- Record commission payments and partial allocations, so the same payment updates both
-- commission balances and the accounting ledger without duplicating expenses.
CREATE TABLE IF NOT EXISTS public.commission_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL REFERENCES public.finance_transactions(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, commission_id)
);
CREATE INDEX IF NOT EXISTS commission_payment_allocations_commission_idx
  ON public.commission_payment_allocations(commission_id);
ALTER TABLE public.commission_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_payment_allocations_read_scoped ON public.commission_payment_allocations;
CREATE POLICY commission_payment_allocations_read_scoped
  ON public.commission_payment_allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.commissions c
    WHERE c.id = commission_id
      AND private.can_read_commission((SELECT auth.uid()), c.profile_id, c.type_commission)
  ));
DROP POLICY IF EXISTS commission_payment_allocations_manage_finance ON public.commission_payment_allocations;
CREATE POLICY commission_payment_allocations_manage_finance
  ON public.commission_payment_allocations FOR ALL TO authenticated
  USING (public.finance_can_manage())
  WITH CHECK (public.finance_can_manage());

CREATE OR REPLACE FUNCTION public.finance_sync_commission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_transaction_id uuid; v_profile_name text; v_client_name text; v_expense_category text;
BEGIN
  IF lower(coalesce(NEW.statut,'')) = 'payee' AND coalesce(NEW.montant_commission,0) > 0 THEN
    -- A payment allocated through the payout workflow is already in the ledger as one
    -- aggregate transaction. Never create a second full-amount transaction for it.
    IF EXISTS (SELECT 1 FROM public.commission_payment_allocations a WHERE a.commission_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.finance_transactions
      (transaction_date,direction,category,label,amount,client_id,plantation_id,profile_id,source_type,source_id,status)
    VALUES
      (coalesce(NEW.date_validation,NEW.date_calcul,NEW.created_at,now()),
       'sortie','COMMISSION','COMMISSION '||upper(coalesce(NEW.type_commission,'')),
       NEW.montant_commission,NEW.client_id,NEW.plantation_id,NEW.profile_id,
       'commission',NEW.id,'valide')
    ON CONFLICT (source_type,source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET amount=excluded.amount,status='valide',updated_at=now()
    RETURNING id INTO v_transaction_id;

    SELECT nom_complet INTO v_profile_name FROM public.profiles WHERE id=NEW.profile_id;
    SELECT nom_complet INTO v_client_name FROM public.clients WHERE id=NEW.client_id;
    v_expense_category := CASE WHEN NEW.type_commission='technique' THEN 'PRESTATIONS' ELSE 'HONORAIRES' END;
    INSERT INTO public.finance_expenses
      (transaction_id,expense_category,supplier_name,description,client_id,plantation_id,profile_id,is_direct_cost)
    VALUES
      (v_transaction_id,v_expense_category,coalesce(v_profile_name,'Collaborateur'),
       'Commission '||coalesce(NEW.type_commission,'')||
       CASE WHEN v_client_name IS NOT NULL THEN ' — '||v_client_name ELSE '' END,
       NEW.client_id,NEW.plantation_id,NEW.profile_id,true)
    ON CONFLICT (transaction_id) DO UPDATE
      SET expense_category=excluded.expense_category,
          supplier_name=excluded.supplier_name,
          description=excluded.description,
          client_id=excluded.client_id,
          plantation_id=excluded.plantation_id,
          profile_id=excluded.profile_id,
          is_direct_cost=true;
  ELSE
    -- A commission that is not fully paid must not remain as a valid cash expense.
    DELETE FROM public.finance_expenses
      WHERE transaction_id IN (SELECT t.id FROM public.finance_transactions t
        WHERE t.source_type='commission' AND t.source_id=NEW.id);
    DELETE FROM public.finance_transactions WHERE source_type='commission' AND source_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Retire duplicate Jean-Marie technical rows while preserving one auditable row per
-- intervention. Paid rows are preferred when duplicates exist.
CREATE TEMP TABLE _duplicate_jeanmarie_commissions ON COMMIT DROP AS
SELECT id FROM (
  SELECT c.id, c.client_id,
         row_number() OVER (
           PARTITION BY c.client_id
           ORDER BY (c.statut='payee') DESC, c.created_at ASC, c.id ASC
         ) AS rn
  FROM public.commissions c
  WHERE c.type_commission='technique'
    AND c.profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1)
    AND c.client_id IS NOT NULL
) ranked WHERE rn > 1;
INSERT INTO _duplicate_jeanmarie_commissions(id)
SELECT c.id FROM public.commissions c
WHERE c.type_commission='technique'
  AND c.profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1)
  AND c.client_id IS NULL
ON CONFLICT DO NOTHING;

-- Fix the historic 6,000 FCFA technical commission payment and link it to Jean-Marie.
UPDATE public.finance_transactions
SET transaction_date='2026-10-19 00:00:00+00',
    category='COMMISSION',
    label='COMMISSION TECHNIQUE — ACOMPTE JEAN-MARIE',
    profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1),
    source_type='commission_payout',
    source_id=NULL,
    notes='Acompte partiel de 6 000 FCFA payé le 19/10/2026 pour les interventions techniques chez Guy Laurent, Tionon Madou et Ferdinand.',
    updated_at=now()
WHERE id='1339db9c-4a89-4fea-9a05-30eafa59e9bf'
  AND amount=6000 AND direction='sortie';

UPDATE public.finance_expenses
SET expense_category='PRESTATIONS',
    supplier_name='YAO KONAN JEAN-MARIE',
    description='Commission technique — acompte partiel de 6 000 FCFA payé le 19/10/2026 pour Guy Laurent, Tionon Madou et Ferdinand.',
    profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1)
WHERE transaction_id='1339db9c-4a89-4fea-9a05-30eafa59e9bf';

-- Remove invalid duplicate commission transactions before recalculating statuses.
DELETE FROM public.finance_expenses e
USING public.finance_transactions t
WHERE e.transaction_id=t.id
  AND t.source_type='commission'
  AND t.source_id IN (SELECT id FROM _duplicate_jeanmarie_commissions);
DELETE FROM public.finance_transactions
WHERE source_type='commission'
  AND source_id IN (SELECT id FROM _duplicate_jeanmarie_commissions);

UPDATE public.commissions
SET statut='annule'
WHERE id IN (SELECT id FROM _duplicate_jeanmarie_commissions)
  AND statut <> 'annule';

-- The three technical interventions still outstanding are 5,000 each. The 6,000
-- payment is allocated 2,000 to each, leaving exactly 3,000 x 3 = 9,000 FCFA.
UPDATE public.commissions c
SET statut='validee'
WHERE c.type_commission='technique'
  AND c.profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1)
  AND c.client_id IN (
    SELECT id FROM public.clients
    WHERE upper(trim(nom_complet)) IN ('YAO KOUAKOU GUY LAURENT','TIONON MADOU','KOUAKOU KOUAME FERDINAND')
  )
  AND c.statut <> 'annule';

UPDATE public.commissions c
SET statut='payee'
WHERE c.type_commission='technique'
  AND c.profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1)
  AND c.client_id IN (
    SELECT id FROM public.clients
    WHERE upper(trim(nom_complet)) IN ('DADEGOULEHE DARIUS','KOUAKOU KONAN DONALD','YAO KONAN EMMANUEL','ZAGBLE BOLOU JEAN-JACQUES')
  )
  AND c.statut <> 'annule';

-- Commercial acquisition commissions are paid except Guy Laurent, whose commission
-- remains outstanding to Larissa. The old 7,000 amount was an erroneous duplicate.
UPDATE public.commissions c
SET montant_commission=15000, statut='validee'
WHERE c.type_commission='acquisition'
  AND c.client_id=(SELECT id FROM public.clients WHERE upper(trim(nom_complet))='YAO KOUAKOU GUY LAURENT' LIMIT 1);

UPDATE public.commissions c
SET statut='payee'
WHERE c.type_commission='acquisition'
  AND c.client_id IN (
    SELECT id FROM public.clients
    WHERE upper(trim(nom_complet)) IN (
      'VANIE BI BERTIN','DADEGOULEHE DARIUS','TIONON MADOU',
      'KOUAKOU KOUAME FERDINAND','KOUAKOU KONAN DONALD'
    )
  )
  AND c.statut <> 'annule';

-- Link the existing 6,000 payment to the three outstanding technical commissions.
INSERT INTO public.commission_payment_allocations(commission_id,transaction_id,amount)
SELECT c.id, '1339db9c-4a89-4fea-9a05-30eafa59e9bf'::uuid, 2000
FROM public.commissions c
JOIN public.clients cl ON cl.id=c.client_id
WHERE c.type_commission='technique'
  AND c.profile_id=(SELECT id FROM public.profiles WHERE upper(trim(nom_complet))='YAO KONAN JEAN-MARIE' LIMIT 1)
  AND upper(trim(cl.nom_complet)) IN ('YAO KOUAKOU GUY LAURENT','TIONON MADOU','KOUAKOU KOUAME FERDINAND')
  AND c.statut='validee'
ON CONFLICT (transaction_id,commission_id) DO UPDATE SET amount=excluded.amount;

CREATE OR REPLACE FUNCTION public.finance_record_commission_payment(
  p_profile_id uuid,
  p_commission_ids uuid[],
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
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
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Permission financière requise'; END IF;
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
$function$;
GRANT EXECUTE ON FUNCTION public.finance_record_commission_payment(uuid,uuid[],numeric,date,text,text) TO authenticated;
