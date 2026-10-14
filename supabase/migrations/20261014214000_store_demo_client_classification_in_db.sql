-- Store demo-record classification as data instead of coupling business metrics to a hard-coded client code.
alter table public.clients
  add column if not exists is_demo boolean not null default false;

update public.clients
set is_demo = true
where id_unique = 'AC-DEMO'
  and is_demo is distinct from true;

comment on column public.clients.is_demo is
  'True only for synthetic/demo client records; excluded from production business KPIs.';
