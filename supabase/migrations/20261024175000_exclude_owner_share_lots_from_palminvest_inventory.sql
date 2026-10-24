do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.create_client_acquisition(uuid,uuid,text,numeric,text,uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    $find$where l.parcelle_id=v_parcelle.id
             and l.client_id is null$find$,
    $replace$where l.parcelle_id=v_parcelle.id
             and coalesce(l.part_type,'agricapital')='agricapital'
             and l.client_id is null$replace$
  );
  if v_updated = v_definition then
    raise exception 'Le filtre des lots PalmInvest a changé; migration annulée.';
  end if;
  execute v_updated;
end $$;