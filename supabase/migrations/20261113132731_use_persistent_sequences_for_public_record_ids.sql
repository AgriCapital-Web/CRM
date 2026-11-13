create sequence if not exists public.clients_ac_c_public_id_seq;
create sequence if not exists public.clients_ac_b_public_id_seq;
create sequence if not exists public.parcelles_public_id_seq;
create sequence if not exists public.proprietaires_terres_public_id_seq;

do $migration$
declare
  v_max bigint;
begin
  select coalesce(max((regexp_match(x.public_id,'^AC_C([0-9]+)$'))[1]::bigint),0)
    into v_max
    from (
      select id_unique public_id from public.clients
      union all
      select coalesce(ancienne_valeur->>'id_unique',nouvelle_valeur->>'id_unique')
        from public.admin_audit_logs where entite='clients'
    ) x;
  if v_max > 0 then perform setval('public.clients_ac_c_public_id_seq',v_max,true);
  else perform setval('public.clients_ac_c_public_id_seq',1,false); end if;

  select coalesce(max((regexp_match(x.public_id,'^AC_B([0-9]+)$'))[1]::bigint),0)
    into v_max
    from (
      select id_unique public_id from public.clients
      union all
      select coalesce(ancienne_valeur->>'id_unique',nouvelle_valeur->>'id_unique')
        from public.admin_audit_logs where entite='clients'
    ) x;
  if v_max > 0 then perform setval('public.clients_ac_b_public_id_seq',v_max,true);
  else perform setval('public.clients_ac_b_public_id_seq',1,false); end if;

  select coalesce(max((regexp_match(x.public_id,'^PAR-([0-9]+)$'))[1]::bigint),0)
    into v_max
    from (
      select id_unique public_id from public.parcelles
      union all
      select coalesce(ancienne_valeur->>'id_unique',nouvelle_valeur->>'id_unique')
        from public.admin_audit_logs where entite='parcelles'
    ) x;
  if v_max > 0 then perform setval('public.parcelles_public_id_seq',v_max,true);
  else perform setval('public.parcelles_public_id_seq',1,false); end if;

  select coalesce(max((regexp_match(x.public_id,'^AC-P([0-9]+)$'))[1]::bigint),0)
    into v_max
    from (
      select id_unique public_id from public.proprietaires_terres
      union all
      select coalesce(ancienne_valeur->>'id_unique',nouvelle_valeur->>'id_unique')
        from public.admin_audit_logs where entite='proprietaires_terres'
    ) x;
  if v_max > 0 then perform setval('public.proprietaires_terres_public_id_seq',v_max,true);
  else perform setval('public.proprietaires_terres_public_id_seq',1,false); end if;
end
$migration$;

create or replace function public.generate_client_id(p_type_client text)
returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_prefix text;
  v_next bigint;
begin
  v_prefix := case when lower(coalesce(p_type_client,'')) = 'beneficiaire_particulier' then 'AC_B' else 'AC_C' end;
  if v_prefix = 'AC_B' then
    v_next := nextval('public.clients_ac_b_public_id_seq');
  else
    v_next := nextval('public.clients_ac_c_public_id_seq');
  end if;
  return v_prefix || lpad(v_next::text,6,'0');
end;
$function$;

create or replace function public.generate_client_id()
returns text
language sql
security definer
set search_path = 'public'
as $function$
  select 'AC_C' || lpad(nextval('public.clients_ac_c_public_id_seq')::text,6,'0');
$function$;

create or replace function public.generate_parcelle_id()
returns text
language sql
security definer
set search_path = 'public'
as $function$
  select 'PAR-' || lpad(nextval('public.parcelles_public_id_seq')::text,6,'0');
$function$;

create or replace function public.generate_proprietaire_id()
returns text
language sql
security definer
set search_path = 'public'
as $function$
  select 'AC-P' || lpad(nextval('public.proprietaires_terres_public_id_seq')::text,6,'0');
$function$;
