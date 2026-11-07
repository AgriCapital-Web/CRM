DO $$
DECLARE p record; q text; w text; changed integer := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') ~* 'auth\.(uid|jwt|role)\s*\(' OR coalesce(with_check,'') ~* 'auth\.(uid|jwt|role)\s*\(')
      AND (coalesce(qual,'') !~* '\(\s*select\s+auth\.(uid|jwt|role)' OR coalesce(with_check,'') !~* '\(\s*select\s+auth\.(uid|jwt|role)')
  LOOP
    q := p.qual; w := p.with_check;
    IF q IS NOT NULL THEN
      q := regexp_replace(q, 'auth\.uid\s*\(\s*\)', '(SELECT auth.uid())', 'gi');
      q := regexp_replace(q, 'auth\.jwt\s*\(\s*\)', '(SELECT auth.jwt())', 'gi');
      q := regexp_replace(q, 'auth\.role\s*\(\s*\)', '(SELECT auth.role())', 'gi');
    END IF;
    IF w IS NOT NULL THEN
      w := regexp_replace(w, 'auth\.uid\s*\(\s*\)', '(SELECT auth.uid())', 'gi');
      w := regexp_replace(w, 'auth\.jwt\s*\(\s*\)', '(SELECT auth.jwt())', 'gi');
      w := regexp_replace(w, 'auth\.role\s*\(\s*\)', '(SELECT auth.role())', 'gi');
    END IF;
    IF q IS DISTINCT FROM p.qual OR w IS DISTINCT FROM p.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I%s%s', p.policyname, p.schemaname, p.tablename,
        CASE WHEN q IS NOT NULL THEN format(' USING (%s)', q) ELSE '' END,
        CASE WHEN w IS NOT NULL THEN format(' WITH CHECK (%s)', w) ELSE '' END);
      changed := changed + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Optimized % RLS policies', changed;
END $$;
