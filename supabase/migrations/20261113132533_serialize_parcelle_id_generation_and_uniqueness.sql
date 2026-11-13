create or replace function public.generate_parcelle_id()
returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('agricapital.parcelles.id_unique'));
  select coalesce(max(substring(id_unique from '^PAR-([0-9]+)$')::integer), 0) + 1
    into v_next
    from public.parcelles
   where id_unique ~ '^PAR-[0-9]+$';
  return 'PAR-' || lpad(v_next::text, 6, '0');
end;
$function$;

create unique index if not exists parcelles_id_unique_key
  on public.parcelles (id_unique)
  where id_unique is not null;
