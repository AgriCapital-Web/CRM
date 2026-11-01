begin;
do $$ begin
 if to_regclass('public.independent_service_devis') is null and to_regclass('public.independent_service_proformas') is not null then alter table public.independent_service_proformas rename to independent_service_devis; end if;
end $$;
do $$ begin
 if to_regclass('public.independent_service_items') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='independent_service_items' and column_name='proforma_id') and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='independent_service_items' and column_name='devis_id') then alter table public.independent_service_items rename column proforma_id to devis_id; end if;
 if to_regclass('public.independent_service_events') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='independent_service_events' and column_name='proforma_id') and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='independent_service_events' and column_name='devis_id') then alter table public.independent_service_events rename column proforma_id to devis_id; end if;
end $$;
commit;