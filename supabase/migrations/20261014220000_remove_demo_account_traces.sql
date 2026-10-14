-- AgriCapital CRM has no demo accounts. Remove demo-only schema, guards and fields.
-- Keep v_client_synthese functional while removing its unused demo_access_code dependency.
do $$
declare
  view_sql text;
  trigger_row record;
begin
  view_sql := pg_get_viewdef('public.v_client_synthese'::regclass, true);
  view_sql := replace(view_sql, E'            c_1.demo_access_code,\n', '');
  if position('demo_access_code' in view_sql) > 0 then
    raise exception 'Unexpected remaining demo_access_code dependency in v_client_synthese';
  end if;
  execute 'create or replace view public.v_client_synthese as ' || view_sql;

  for trigger_row in
    select distinct n.nspname as schema_name, c.relname as table_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'trg_block_demo_writes'
      and not t.tgisinternal
      and n.nspname = 'public'
  loop
    execute format('drop trigger if exists %I on %I.%I', 'trg_block_demo_writes', trigger_row.schema_name, trigger_row.table_name);
  end loop;
end $$;

drop function if exists public.block_demo_writes();
drop function if exists public.is_demo(uuid);

alter table public.clients drop column if exists demo_access_code;
alter table public.clients drop column if exists is_demo;

comment on table public.clients is 'AgriCapital CRM client records; no demo-account classification.';
