create sequence if not exists public.leads_public_id_seq;
create sequence if not exists public.prospects_public_id_seq;

do $migration$
declare v_max bigint;
begin
  select coalesce(max((regexp_match(id,'^L([0-9]+)$'))[1]::bigint),0)
    into v_max
    from (
      select id_unique id from public.leads
      union all
      select coalesce(ancienne_valeur->>'id_unique',nouvelle_valeur->>'id_unique')
        from public.admin_audit_logs where entite='leads'
    ) x;
  if v_max > 0 then perform setval('public.leads_public_id_seq',v_max,true);
  else perform setval('public.leads_public_id_seq',1,false); end if;

  select coalesce(max((regexp_match(id,'^P([0-9]+)$'))[1]::bigint),0)
    into v_max
    from (
      select id_unique id from public.prospects
      union all
      select coalesce(ancienne_valeur->>'id_unique',nouvelle_valeur->>'id_unique')
        from public.admin_audit_logs where entite='prospects'
    ) x;
  if v_max > 0 then perform setval('public.prospects_public_id_seq',v_max,true);
  else perform setval('public.prospects_public_id_seq',1,false); end if;
end
$migration$;

create or replace function public.generate_lead_id()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.id_unique is null or new.id_unique = '' then
    new.id_unique := 'L' || lpad(nextval('public.leads_public_id_seq')::text,6,'0');
  end if;
  return new;
end;
$function$;

create or replace function public.generate_prospect_id()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.id_unique is null or new.id_unique = '' then
    new.id_unique := 'P' || lpad(nextval('public.prospects_public_id_seq')::text,6,'0');
  end if;
  return new;
end;
$function$;
