-- AgriCapital 360: centralisation des droits et accès global PDG.
-- Les applications AcreMap, Portail Client et Portail Prestataire restent indépendantes.
-- Leurs tables de sessions/jetons et leurs tables AcreMap ne reçoivent pas la politique globale CRM.

CREATE OR REPLACE FUNCTION private.is_global_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND lower(trim(ur.role)) = 'pdg'
    );
$function$;

COMMENT ON FUNCTION private.is_global_admin(uuid) IS
  'Administrateur global CRM : uniquement tout utilisateur auquel le rôle PDG est attribué, indépendamment du rôle principal.';

CREATE OR REPLACE FUNCTION private.has_role_permission(p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.is_global_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_code = ur.role
      WHERE ur.user_id = (SELECT auth.uid())
        AND rp.permission_code = p_permission_code
    );
$function$;

-- Liste effective calculée côté base : le navigateur ne reconstitue plus
-- les droits en combinant des rôles ou des exceptions nominatives.
CREATE OR REPLACE FUNCTION public.current_user_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    array_agg(DISTINCT permission_code ORDER BY permission_code),
    ARRAY[]::text[]
  )
  FROM (
    SELECT ap.code AS permission_code
    FROM public.app_permissions ap
    WHERE ap.actif IS TRUE
      AND private.is_global_admin((SELECT auth.uid()))

    UNION

    SELECT rp.permission_code
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_code = ur.role
    JOIN public.app_permissions ap
      ON ap.code = rp.permission_code
     AND ap.actif IS TRUE
    WHERE ur.user_id = (SELECT auth.uid())

    UNION SELECT 'system.global_admin'
      WHERE private.is_global_admin((SELECT auth.uid()))
    UNION SELECT 'system.dg'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'dg')
    UNION SELECT 'system.can_supervise_leads'
      WHERE private.can_supervise_leads((SELECT auth.uid()))
    UNION SELECT 'system.foncier_role'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('mobilisateur_foncier','superviseur_mobilisation_fonciere'))
    UNION SELECT 'system.service_client'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('service_client','chef_equipe_service_client'))
    UNION SELECT 'system.commercial_assignable'
      WHERE private.is_commercial_assignable((SELECT auth.uid()))
    UNION SELECT 'system.commercial_manager'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('chef_equipe_commercial','responsable_commercial'))
    UNION SELECT 'system.commercial_director'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'responsable_commercial')
    UNION SELECT 'system.technical_role'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'technicien')
    UNION SELECT 'system.technical_manager'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'chef_equipe_technique')
    UNION SELECT 'system.commission_finance'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('comptable','responsable_operations'))
    UNION SELECT 'system.manage_account_requests'
      WHERE public.is_admin((SELECT auth.uid()))
    UNION SELECT 'system.manage_user_credentials'
      WHERE public.is_admin((SELECT auth.uid()))
         OR private.has_role_permission('utilisateurs.reset_password')
    UNION SELECT 'system.client_only'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'user')
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role <> 'user')
    UNION SELECT 'system.transfer_plantation'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','service_client','chef_equipe_service_client'))
    UNION SELECT 'system.independent_service_customers'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations'))
    UNION SELECT 'system.independent_service_proformas'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations','technicien','chef_equipe_technique','manager_technique_national'))
    UNION SELECT 'system.independent_service_items'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations','technicien','chef_equipe_technique','manager_technique_national'))
    UNION SELECT 'system.view_team_commissions'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','dg','comptable','responsable_operations','responsable_commercial','chef_equipe_commercial','chef_equipe_technique'))
    UNION SELECT 'system.commercial_role'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'commercial')
    UNION SELECT 'system.zone_scope_global'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('super_admin','pdg','dg','responsable_operations','responsable_commercial','chef_equipe_commercial','chef_equipe_technique','service_client','chef_equipe_service_client','comptable','assistant_administratif'))
    UNION SELECT 'system.independent_service_write'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','dg','service_client','chef_equipe_service_client'))
    UNION SELECT 'system.independent_service_operations'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pdg','dg','technicien','chef_equipe_technique','manager_technique_national','responsable_operations'))
    UNION SELECT 'system.manage_hr'
      WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général'))
    UNION SELECT 'system.manage_workspace_tasks'
      WHERE EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
          AND (ur.role IN ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général')
            OR ur.role LIKE '%manager%' OR ur.role LIKE '%responsable%' OR ur.role LIKE '%chef%')
      )
  ) effective_permissions
  WHERE (SELECT auth.uid()) IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.current_user_permissions() IS
  'Retourne les permissions effectives et capacités de l''utilisateur connecté, calculées depuis les rôles et permissions en base. system.global_admin est exclusivement accordé au rôle PDG.';

CREATE OR REPLACE FUNCTION public.current_user_has_app_permission(required_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND required_code = ANY(public.current_user_permissions());
$function$;

REVOKE ALL ON FUNCTION public.current_user_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_permissions() TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_has_app_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_app_permission(text) TO authenticated;

-- Un PDG peut corriger les fiches de l'ensemble du CRM, y compris celles
-- qui ne relèvent pas de son périmètre de création habituel.
-- Les tables d'AcreMap, des portails séparés, des jetons et les journaux
-- d'audit immuables restent volontairement hors de cette politique.
DO $policy$
DECLARE
  target_table record;
  policy_name constant text := 'pdg_global_business_access';
BEGIN
  FOR target_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relrowsecurity IS TRUE
      AND c.relname NOT LIKE 'acremap_%'
      AND c.relname NOT LIKE 'client_portal_%'
      AND c.relname NOT LIKE 'independent_service_portal_%'
      AND c.relname NOT LIKE 'portail_%'
      AND c.relname NOT LIKE '%_otp%'
      AND c.relname NOT LIKE '%_session%'
      AND c.relname NOT LIKE '%_token%'
      AND c.relname NOT LIKE '%_audit%'
      AND c.relname NOT LIKE '%_history%'
      AND c.relname NOT LIKE '%webhook%'
      AND c.relname NOT LIKE '%provider_event%'
      AND c.relname NOT LIKE '%rate_limit%'
      AND c.relname NOT IN (
        'app_roles','app_permissions','role_permissions','user_roles',
        'client_account_provision_outbox','push_subscriptions','otp_codes','rate_limits',
        'admin_audit_logs','audit_logs','historique_actions','historique_activites',
        'decision_center_audit','strategic_plan_audit','workspace_decision_audit',
        'notification_provider_events','notification_provider_webhook_receipts',
        'kkiapay_events'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (private.is_global_admin((SELECT auth.uid()))) WITH CHECK (private.is_global_admin((SELECT auth.uid())))',
      policy_name,
      target_table.relname
    );
  END LOOP;
END;
$policy$;

-- La suppression d'un brouillon de paie est une opération de gouvernance :
-- seul le rôle PDG peut l'exécuter, même si d'autres rôles gèrent la paie.
CREATE OR REPLACE FUNCTION public.pdg_delete_payroll_draft(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT private.is_global_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Cette opération est réservée au PDG.'
      USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_payroll_runs r
    WHERE r.id = p_run_id
      AND r.status = 'brouillon'
  ) THEN
    RAISE EXCEPTION 'Seuls les brouillons de paie peuvent être supprimés.'
      USING errcode = '22023';
  END IF;

  DELETE FROM public.finance_payroll_items
  WHERE payroll_run_id = p_run_id;

  DELETE FROM public.finance_payroll_runs
  WHERE id = p_run_id
    AND status = 'brouillon';
END;
$function$;

REVOKE ALL ON FUNCTION public.pdg_delete_payroll_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdg_delete_payroll_draft(uuid) TO authenticated;
