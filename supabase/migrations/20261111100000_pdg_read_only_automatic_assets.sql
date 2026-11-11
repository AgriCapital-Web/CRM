-- Les parcelles et plantations sont des actifs métier alimentés par les workflows automatiques.
-- Le PDG conserve la consultation globale, mais ne modifie pas directement ces enregistrements.
-- Les fonctions/triggers SECURITY DEFINER dédiés continuent d'assurer les synchronisations automatiques.

DO $$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['parcelles', 'plantations'] LOOP
    v_policy := 'pdg_read_only_' || v_table || '_insert';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT private.crm_is_global_admin((SELECT auth.uid())))',
      v_policy, v_table
    );

    v_policy := 'pdg_read_only_' || v_table || '_update';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT private.crm_is_global_admin((SELECT auth.uid()))) WITH CHECK (NOT private.crm_is_global_admin((SELECT auth.uid())))',
      v_policy, v_table
    );

    v_policy := 'pdg_read_only_' || v_table || '_delete';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT private.crm_is_global_admin((SELECT auth.uid())))',
      v_policy, v_table
    );
  END LOOP;
END $$;
