-- CRM identifier prefixes, keeping UUID primary keys/foreign keys stable.
-- Clients: existing generate_client_id() keeps AC_C / AC_B semantics.
-- Landowners: AC-Pxxxxxx. Leads: Lxxxxxx. Prospects: Pxxxxxx.
alter table public.prospects add column if not exists id_unique text;

create or replace function public.generate_lead_id()
returns trigger language plpgsql security definer set search_path=public as $$
declare seq bigint;
begin
  if new.id_unique is null or new.id_unique = '' then
    perform pg_advisory_xact_lock(hashtext('agricapital.leads.id_unique.L'));
    select coalesce(max(substring(id_unique from '^L([0-9]+)$')::bigint),0)+1
      into seq from public.leads where id_unique ~ '^L[0-9]+$';
    new.id_unique := 'L' || lpad(seq::text,6,'0');
  end if;
  return new;
end; $$;

create or replace function public.generate_proprietaire_id()
returns text language plpgsql security definer set search_path=public as $$
declare seq bigint;
begin
  perform pg_advisory_xact_lock(hashtext('agricapital.proprietaires.id_unique.AC-P'));
  select coalesce(max(substring(id_unique from '^AC-P([0-9]+)$')::bigint),0)+1
    into seq from public.proprietaires_terres where id_unique ~ '^AC-P[0-9]+$';
  return 'AC-P' || lpad(seq::text,6,'0');
end; $$;

create or replace function public.generate_prospect_id()
returns trigger language plpgsql security definer set search_path=public as $$
declare seq bigint;
begin
  if new.id_unique is null or new.id_unique = '' then
    perform pg_advisory_xact_lock(hashtext('agricapital.prospects.id_unique.P'));
    select coalesce(max(substring(id_unique from '^P([0-9]+)$')::bigint),0)+1
      into seq from public.prospects where id_unique ~ '^P[0-9]+$';
    new.id_unique := 'P' || lpad(seq::text,6,'0');
  end if;
  return new;
end; $$;

drop trigger if exists trg_prospects_generate_id on public.prospects;
create trigger trg_prospects_generate_id before insert on public.prospects
for each row execute function public.generate_prospect_id();

with ranked as (
  select id, 'L'||lpad(row_number() over(order by created_at,id)::text,6,'0') code
  from public.leads
)
update public.leads l set id_unique=r.code from ranked r
where l.id=r.id and (l.id_unique is null or l.id_unique !~ '^L[0-9]+$');

with ranked as (
  select id, 'AC-P'||lpad(row_number() over(order by created_at,id)::text,6,'0') code
  from public.proprietaires_terres
)
update public.proprietaires_terres o set id_unique=r.code from ranked r
where o.id=r.id and (o.id_unique is null or o.id_unique !~ '^AC-P[0-9]+$');

with ranked as (
  select id, 'P'||lpad(row_number() over(order by created_at,id)::text,6,'0') code
  from public.prospects
)
update public.prospects p set id_unique=r.code from ranked r
where p.id=r.id and (p.id_unique is null or p.id_unique !~ '^P[0-9]+$');

create unique index if not exists prospects_id_unique_uidx on public.prospects(id_unique) where id_unique is not null;
create unique index if not exists leads_id_unique_uidx on public.leads(id_unique) where id_unique is not null;
create unique index if not exists proprietaires_terres_id_unique_uidx on public.proprietaires_terres(id_unique) where id_unique is not null;
