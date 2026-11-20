do $migration$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.crm_current_user_permissions()'::regprocedure);
  v_new := replace(
    v_def,
    '''responsable_operations'',''manager_commercial_national'',''manager_technique_national''',
    '''manager_commercial_national'',''manager_technique_national'''
  );
  if v_new = v_def then
    raise exception 'Expected global zone scope role list was not found.';
  end if;
  execute v_new;
end;
$migration$;