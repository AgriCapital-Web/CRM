-- Storage policies referenced public role helpers whose EXECUTE was revoked;
-- one failing permissive policy made every upload/read fail. Point them to private helpers.
DO $$
DECLARE r record; q text; w text; pat text := '(^|[^.a-z_])(?:public\.)?(is_staff|has_role|is_admin|is_rh|is_finance_staff)\(';
BEGIN
  FOR r IN
    SELECT policyname, qual, with_check FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ pat
  LOOP
    q := CASE WHEN r.qual IS NULL THEN NULL ELSE regexp_replace(r.qual, pat, '\1private.\2(', 'g') END;
    w := CASE WHEN r.with_check IS NULL THEN NULL ELSE regexp_replace(r.with_check, pat, '\1private.\2(', 'g') END;
    IF q IS NOT NULL AND w IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON storage.objects USING (%s) WITH CHECK (%s)', r.policyname, q, w);
    ELSIF q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON storage.objects USING (%s)', r.policyname, q);
    ELSE
      EXECUTE format('ALTER POLICY %I ON storage.objects WITH CHECK (%s)', r.policyname, w);
    END IF;
  END LOOP;
END $$;

-- Same fix for every policy in public schema that still calls a revoked public helper.
DO $$
DECLARE r record; q text; w text; pat text := '(^|[^.a-z_])(?:public\.)?(is_staff|has_role|is_admin|is_rh|is_finance_staff)\(';
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check FROM pg_policies
    WHERE schemaname='public'
      AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ pat
  LOOP
    q := CASE WHEN r.qual IS NULL THEN NULL ELSE regexp_replace(r.qual, pat, '\1private.\2(', 'g') END;
    w := CASE WHEN r.with_check IS NULL THEN NULL ELSE regexp_replace(r.with_check, pat, '\1private.\2(', 'g') END;
    IF q IS NOT NULL AND w IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', r.policyname, r.tablename, q, w);
    ELSIF q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, q);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', r.policyname, r.tablename, w);
    END IF;
  END LOOP;
END $$;

-- Invoker trigger called public.is_staff (revoked) => every payment update failed.
CREATE OR REPLACE FUNCTION public.prevent_non_staff_payment_field_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF current_user IN ('service_role', 'postgres')
     OR current_role IN ('service_role', 'postgres')
     OR session_user IN ('service_role', 'postgres')
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.statut IS DISTINCT FROM 'valide' OR OLD.refund_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized payment update' USING ERRCODE = '42501';
  END IF;

  IF NEW.refund_requested_at IS NULL THEN
    RAISE EXCEPTION 'Refund request timestamp is required' USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.plantation_id IS DISTINCT FROM OLD.plantation_id
    OR NEW.montant IS DISTINCT FROM OLD.montant
    OR NEW.montant_paye IS DISTINCT FROM OLD.montant_paye
    OR NEW.type_paiement IS DISTINCT FROM OLD.type_paiement
    OR NEW.mode_paiement IS DISTINCT FROM OLD.mode_paiement
    OR NEW.statut IS DISTINCT FROM OLD.statut
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.date_paiement IS DISTINCT FROM OLD.date_paiement
    OR NEW.date_echeance IS DISTINCT FROM OLD.date_echeance
    OR NEW.preuve_paiement_url IS DISTINCT FROM OLD.preuve_paiement_url
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.valide_par IS DISTINCT FROM OLD.valide_par
    OR NEW.date_validation IS DISTINCT FROM OLD.date_validation
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.kkiapay_transaction_id IS DISTINCT FROM OLD.kkiapay_transaction_id
    OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.montant_theorique IS DISTINCT FROM OLD.montant_theorique
    OR NEW.annee IS DISTINCT FROM OLD.annee
    OR NEW.type_preuve IS DISTINCT FROM OLD.type_preuve
    OR NEW.id_transaction IS DISTINCT FROM OLD.id_transaction
    OR NEW.operateur_mobile_money IS DISTINCT FROM OLD.operateur_mobile_money
    OR NEW.fichier_preuve_url IS DISTINCT FROM OLD.fichier_preuve_url
    OR NEW.date_upload_preuve IS DISTINCT FROM OLD.date_upload_preuve
    OR NEW.observations IS DISTINCT FROM OLD.observations
  THEN
    RAISE EXCEPTION 'Only refund request fields can be updated by clients' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;