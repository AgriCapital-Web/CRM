do $migration$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef(
    (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='crm_current_user_permissions' and p.pronargs=0)
  );
  v_new := replace(
    v_def,
    '''responsable_operations'',''manager_commercial_national'',''manager_technique_national''',
    '''manager_commercial_national'',''manager_technique_national'''
  );
  if v_new <> v_def then execute v_new; end if;
end;
$migration$;